import { isSafePublicHttpsUrl } from './webhook.url.validator';
import { ssrfSafeDispatcher } from './ssrf.safe.dispatcher';

const MAX_REDIRECTS = 5;

export async function safeFetch(url: string, init?: RequestInit): Promise<Response> {
  let currentUrl = url;
  let response: Response | undefined;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (!(await isSafePublicHttpsUrl(currentUrl))) {
      throw new Error('Blocked URL');
    }

    response = await fetch(currentUrl, {
      ...init,
      redirect: 'manual',
      // @ts-ignore — undici option
      dispatcher: ssrfSafeDispatcher,
    });

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
