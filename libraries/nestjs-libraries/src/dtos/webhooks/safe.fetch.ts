import { isSafePublicHttpsUrl } from './webhook.url.validator';
import { ssrfSafeDispatcher } from './ssrf.safe.dispatcher';
import {
  fetch as undiciFetch,
  type RequestInit as UndiciRequestInit,
} from 'undici';

const MAX_REDIRECTS = 5;

// Use undici's own fetch (not the global one). The global fetch is backed by Node's
// BUILT-IN undici (v6 on Node 22), but `ssrfSafeDispatcher` is an Agent from the npm
// `undici` (v8). Dispatching a built-in-undici request handler through a v8 Agent throws
// `invalid onRequestStart method` (the handler API changed in undici 7/8) and every
// outbound provider/webhook publish fails. undici.fetch + undici.Agent are the same
// version, so the dispatcher is honoured (SSRF DNS-pinning preserved).
export async function safeFetch(url: string, init?: RequestInit): Promise<Response> {
  let currentUrl = url;
  let response: Response | undefined;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (!(await isSafePublicHttpsUrl(currentUrl))) {
      throw new Error('Blocked URL');
    }

    response = (await undiciFetch(currentUrl, {
      ...(init as unknown as UndiciRequestInit),
      redirect: 'manual',
      dispatcher: ssrfSafeDispatcher,
    })) as unknown as Response;

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
