import type { Page, Request, Response, ConsoleMessage } from '@playwright/test';

const BASE = 'https://postiz.reaatech.com';

export interface ApiCall {
  method: string;
  url: string; // path only, query stripped
  status: number;
  query?: string;
}

export interface AuditSnapshot {
  apiErrors: ApiCall[]; // status >= 400
  apiCalls: ApiCall[]; // all /api/* calls
  consoleErrors: string[];
  pageErrors: string[];
  failedRequests: string[]; // network-level failures (not HTTP status)
}

/**
 * Attaches to a Page and records everything that matters for diagnosing "what's broken":
 * every /api/* call + status, console errors, uncaught page errors, and network failures.
 * Call snapshot() to read the accumulated findings; reset() to clear between routes.
 *
 * This is selector-free: it observes real traffic/errors, so it can't produce the
 * false-positives that guessed locators do.
 */
export class PageAuditor {
  private apiCalls: ApiCall[] = [];
  private consoleErrors: string[] = [];
  private pageErrors: string[] = [];
  private failedRequests: string[] = [];

  private onResponse = (res: Response) => {
    const url = res.url();
    if (!url.includes('/api/')) return;
    const u = new URL(url);
    this.apiCalls.push({
      method: res.request().method(),
      url: u.pathname.replace(/^.*\/api\//, '/api/'),
      status: res.status(),
      query: u.search ? u.search.slice(1, 200) : undefined,
    });
  };

  private onConsole = (m: ConsoleMessage) => {
    if (m.type() === 'error') this.consoleErrors.push(m.text().slice(0, 200));
  };

  private onPageError = (e: Error) => {
    this.pageErrors.push(String(e.message).slice(0, 200));
  };

  private onRequestFailed = (req: Request) => {
    const u = req.url();
    const sameOrigin =
      (u.startsWith('http://') || u.startsWith('https://')) &&
      new URL(u).origin === new URL(BASE).origin;
    if (sameOrigin || u.includes('/api/')) {
      this.failedRequests.push(`${req.method()} ${u.replace(BASE, '')} (${req.failure()?.errorText || 'failed'})`);
    }
  };

  constructor(private page: Page) {}

  attach() {
    this.page.on('response', this.onResponse);
    this.page.on('console', this.onConsole);
    this.page.on('pageerror', this.onPageError);
    this.page.on('requestfailed', this.onRequestFailed);
    return this;
  }

  detach() {
    this.page.off('response', this.onResponse);
    this.page.off('console', this.onConsole);
    this.page.off('pageerror', this.onPageError);
    this.page.off('requestfailed', this.onRequestFailed);
  }

  reset() {
    this.apiCalls = [];
    this.consoleErrors = [];
    this.pageErrors = [];
    this.failedRequests = [];
  }

  snapshot(): AuditSnapshot {
    const dedupe = <T>(a: T[]) => [...new Set(a.map((x) => JSON.stringify(x)))].map((s) => JSON.parse(s) as T);
    return {
      apiCalls: dedupe(this.apiCalls),
      apiErrors: dedupe(this.apiCalls.filter((c) => c.status >= 400)),
      consoleErrors: [...new Set(this.consoleErrors)],
      pageErrors: [...new Set(this.pageErrors)],
      failedRequests: [...new Set(this.failedRequests)],
    };
  }

  /** Throttle (429) detection — if true, the run is contaminated and findings are unreliable. */
  hadThrottle(): boolean {
    return this.apiCalls.some((c) => c.status === 429);
  }
}
