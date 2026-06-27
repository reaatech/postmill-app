import { timer } from '@gitroom/helpers/utils/timer';
import { Integration } from '@prisma/client';
import { readOrFetch } from '@gitroom/helpers/utils/read.or.fetch';
import sharp from 'sharp';
import { ssrfSafeDispatcher } from '@gitroom/nestjs-libraries/dtos/webhooks/ssrf.safe.dispatcher';
import { isSafePublicHttpsUrl } from '@gitroom/nestjs-libraries/dtos/webhooks/webhook.url.validator';
import { getVpnDispatcher } from '@gitroom/nestjs-libraries/vpn/vpn.context';
import {
  RefreshTokenError,
  BadBodyError,
} from '@gitroom/nestjs-libraries/inngest/errors';
// undici's own fetch — the global fetch is Node's built-in undici (v6) and throws
// `invalid onRequestStart method` when handed an Agent from npm undici (v8), breaking
// every outbound provider call (publish/refresh/analytics). Same version = dispatcher works.
import { fetch as undiciFetch } from 'undici';

export type ValidityMedia = {
  path: string;
  thumbnail?: string;
};

/**
 * Retryable error thrown when a provider access token needs to be refreshed.
 * @deprecated Use `RefreshTokenError` from `@gitroom/nestjs-libraries/inngest/errors`.
 */
export const RefreshToken = RefreshTokenError;

/**
 * Non-retryable error thrown when a provider rejects the request body.
 * @deprecated Use `BadBodyError` from `@gitroom/nestjs-libraries/inngest/errors`.
 */
export const BadBody = BadBodyError;

export class NotEnoughScopes {
  constructor(
    public message = 'Not enough scopes, when choosing a provider, please add all the scopes'
  ) {}
}

function safeStringify(obj: any) {
  const seen = new WeakSet();

  return JSON.stringify(obj, (key, value) => {
    if (typeof value === 'object' && value !== null) {
      if (seen.has(value)) {
        return '[Circular]';
      }
      seen.add(value);
    }
    return value;
  });
}

export abstract class SocialAbstract {
  abstract identifier: string;
  maxConcurrentJob = 1;

  get commentsCapabilities() {
    return { read: false, reply: false, like: false };
  }

  public handleErrors(
    body: string,
    status: number
  ):
    | { type: 'refresh-token' | 'bad-body' | 'retry'; value: string }
    | undefined {
    return undefined;
  }

  /**
   * Server-side replacement for the old client-side `checkValidity`.
   * Validates the media attached to a post (and its comments) against the
   * provider rules. Returns `true` when valid, or an error message string.
   *
   * `posts` mirrors the client shape: the outer array is the main post followed
   * by each comment, the inner array is the media items for that entry.
   *
   * Note: video-duration validations that used to run in the browser are not
   * re-implemented here (no ffmpeg dependency). Image-dimension checks use sharp.
   */
  async checkValidity(
    posts: Array<ValidityMedia[]>,
    settings: any,
    additionalSettings: any[]
  ): Promise<string | true> {
    return true;
  }

  /** Reads the pixel dimensions of an image via sharp (works for http or local paths). */
  protected async getImageDimensions(
    path: string
  ): Promise<{ width: number; height: number }> {
    // Stored media paths are relative (e.g. "uploads/x.png"); resolve them to a
    // fetchable URL the same way posts.service.updateMedia does.
    const url =
      path?.indexOf('http') === -1
        ? `${process.env.FRONTEND_URL}/${path}`
        : path;
    const { width = 0, height = 0 } = await sharp(
      await readOrFetch(url)
    ).metadata();
    return { width, height };
  }

  public async mention(
    token: string,
    d: { query: string },
    id: string,
    integration: Integration
  ): Promise<
    | { id: string; label: string; image: string; doNotCache?: boolean }[]
    | { none: true }
  > {
    return { none: true };
  }

  async runInConcurrent<T>(
    func: (...args: any[]) => Promise<T>,
    ignoreConcurrency?: boolean
  ) {
    let globalErr = {};
    let value: any;
    try {
      value = await func();
    } catch (err) {
      const handle = this.handleErrors(safeStringify(err), 200);
      value = { err: true, value: 'Unknown Error', ...(handle || {}) };
      globalErr = err;
    }

    if (value && value?.err && value?.value) {
      if (value.type === 'refresh-token') {
        throw new RefreshToken(
          '',
          safeStringify({}),
          {} as any,
          value.value || ''
        );
      }
      throw new BadBody('', safeStringify(globalErr), {} as any, value.value || '');
    }

    return value;
  }

  async fetch(
    url: string,
    options: RequestInit = {},
    identifier = '',
    totalRetries = 0,
    ignoreConcurrency = false,
    message = '',
  ): Promise<Response> {
    // 1H defense-in-depth: every integration call gets connect-time SSRF
    // protection (private-IP blocking, incl. redirect hops) via the undici
    // dispatcher. Callers may override `dispatcher` for trusted first-party
    // hosts. The heavier `safeFetch` (HTTPS + isSafePublicHttpsUrl pre-check +
    // per-hop re-validation) is reserved for the dedicated user-URL paths
    // (mastodon `uploadFile`, bluesky `downloadVideo`, provider connect flows).
    //
    // When a per-channel VPN dispatcher is active (set by PostActivity for a
    // VPN-enabled channel), it replaces the SSRF Agent for this leg. Proxying
    // bypasses the connect-time DNS pin, so restore the guarantee the proxy
    // stripped by pre-validating the destination is public HTTPS before dispatch.
    const vpnDispatcher = (options as any).dispatcher ? undefined : getVpnDispatcher();
    if (vpnDispatcher && !(await isSafePublicHttpsUrl(url))) {
      throw new BadBody(identifier, '{}', options.body || '{}', 'Blocked non-public destination over VPN');
    }
    const request = (await undiciFetch(url, {
      ...(options as any),
      // dispatcher is an undici-only RequestInit option, absorbed by the cast below
      dispatcher: (options as any).dispatcher ?? vpnDispatcher ?? ssrfSafeDispatcher,
    } as any)) as unknown as Response;

    if (request.status === 200 || request.status === 201) {
      return request;
    }

    if (totalRetries > 2) {
      throw new BadBody(identifier, '{}', options.body || '{}', message);
    }

    let json = '{}';
    try {
      json = await request.text();
    } catch (err) {
      json = '{}';
    }

    const handleError = this.handleErrors(json || '{}', request.status);

    if (
      request.status === 429 ||
      (request.status === 500 && !handleError) ||
      json.includes('rate_limit_exceeded') ||
      json.includes('Rate limit')
    ) {
      await timer(5000);
      return this.fetch(
        url,
        options,
        identifier,
        totalRetries + 1,
        ignoreConcurrency,
        handleError?.value || 'Unknown Error'
      );
    }

    if (handleError?.type === 'retry') {
      await timer(5000);
      return this.fetch(
        url,
        options,
        identifier,
        totalRetries + 1,
        ignoreConcurrency,
        handleError?.value || 'Unknown Error'
      );
    }

    if (
      (request.status === 401 &&
        (handleError?.type === 'refresh-token' || !handleError)) ||
      handleError?.type === 'refresh-token'
    ) {
      throw new RefreshToken(
        identifier,
        json,
        options.body!,
        handleError?.value
      );
    }

    throw new BadBody(
      identifier,
      json,
      options.body!,
      handleError?.value || 'Unknown Error'
    );
  }

  checkScopes(required: string[], got: string | string[]) {
    if (Array.isArray(got)) {
      if (!required.every((scope) => got.includes(scope))) {
        throw new NotEnoughScopes();
      }

      return true;
    }

    const newGot = decodeURIComponent(got);

    const splitType = newGot.indexOf(',') > -1 ? ',' : ' ';
    const gotArray = newGot.split(splitType);
    if (!required.every((scope) => gotArray.includes(scope))) {
      throw new NotEnoughScopes();
    }

    return true;
  }
}
