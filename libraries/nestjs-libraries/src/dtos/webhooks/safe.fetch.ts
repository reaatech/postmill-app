import { createHmac } from 'crypto';
import { isSafePublicHttpsUrl } from './webhook.url.validator';
import { ssrfSafeDispatcher } from './ssrf.safe.dispatcher';
import {
  fetch as undiciFetch,
  type RequestInit as UndiciRequestInit,
} from 'undici';

const MAX_REDIRECTS = 5;

// D1: default outbound HTTP timeout (ms). Bounded but generous so a slow
// provider can't starve the publish concurrency pool indefinitely.
export const DEFAULT_OUTBOUND_TIMEOUT_MS = 30_000;
// D1: tighter budget for webhook dispatch specifically.
export const DEFAULT_WEBHOOK_TIMEOUT_MS = 10_000;

export function outboundTimeoutMs(): number {
  const v = Number(process.env.OUTBOUND_HTTP_TIMEOUT_MS);
  return Number.isFinite(v) && v > 0 ? v : DEFAULT_OUTBOUND_TIMEOUT_MS;
}

export function webhookTimeoutMs(): number {
  const v = Number(process.env.WEBHOOK_TIMEOUT_MS);
  return Number.isFinite(v) && v > 0 ? v : DEFAULT_WEBHOOK_TIMEOUT_MS;
}

// Merge a caller-supplied AbortSignal (if any) with a fresh timeout signal so
// whichever fires first aborts the request.
function withTimeoutSignal(
  caller: AbortSignal | undefined,
  ms: number,
): AbortSignal {
  const timeout = AbortSignal.timeout(ms);
  return caller ? AbortSignal.any([caller, timeout]) : timeout;
}

// D4: HMAC-SHA256 signature for an outbound webhook body. Secret is the
// deployment-wide WEBHOOK_SIGNING_SECRET; when unset it falls back to
// JWT_SECRET (mirroring EncryptionService's key-derivation) so signing is
// always on. Returns the `sha256=<hex>` value for the X-Postmill-Signature header.
export function webhookSignature(rawBody: string): string {
  const secret =
    process.env.WEBHOOK_SIGNING_SECRET || process.env.JWT_SECRET || '';
  return 'sha256=' + createHmac('sha256', secret).update(rawBody).digest('hex');
}

// Use undici's own fetch (not the global one). The global fetch is backed by Node's
// BUILT-IN undici (v6 on Node 22), but `ssrfSafeDispatcher` is an Agent from the npm
// `undici` (v8). Dispatching a built-in-undici request handler through a v8 Agent throws
// `invalid onRequestStart method` (the handler API changed in undici 7/8) and every
// outbound provider/webhook publish fails. undici.fetch + undici.Agent are the same
// version, so the dispatcher is honoured (SSRF DNS-pinning preserved).
export async function safeFetch(url: string, init?: RequestInit): Promise<Response> {
  let currentUrl = url;
  let response: Response | undefined;

  // D1: bound the whole operation (across redirect hops) by a timeout, merged
  // with any caller-supplied signal. Webhook dispatch passes a tighter
  // WEBHOOK_TIMEOUT_MS signal via `init.signal`, which wins via AbortSignal.any.
  const timeoutMs = outboundTimeoutMs();
  const signal = withTimeoutSignal(
    (init as { signal?: AbortSignal } | undefined)?.signal,
    timeoutMs,
  );

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (!(await isSafePublicHttpsUrl(currentUrl))) {
      throw new Error('Blocked URL');
    }

    try {
      response = (await undiciFetch(currentUrl, {
        ...(init as unknown as UndiciRequestInit),
        signal,
        redirect: 'manual',
        dispatcher: ssrfSafeDispatcher,
      })) as unknown as Response;
    } catch (err) {
      const name = (err as { name?: string })?.name;
      if (name === 'TimeoutError' || name === 'AbortError') {
        throw new Error(`safeFetch request timed out after ${timeoutMs}ms`);
      }
      throw err;
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location) {
        throw new Error('Redirect without Location');
      }
      try {
        currentUrl = new URL(location, currentUrl).toString();
      } catch {
        throw new Error('Invalid redirect target');
      }
      continue;
    }

    return response;
  }

  if (!response) {
    throw new Error('No upstream response');
  }

  throw new Error('Too many redirects');
}
