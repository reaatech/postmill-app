export interface RouteDef {
  name: string;
  path: string;
  adminOnly?: boolean;
  /** We expect this page to render meaningful content (not near-empty). */
  expectsContent?: boolean;
  /** We expect at least one data row/card/item (flag if empty when it shouldn't be). */
  expectsData?: boolean;
  /** Minimum number of visible actionable buttons/links we'd expect a working page to have. */
  minActionables?: number;
}

/**
 * Real routes verified against apps/frontend/src/app (App Router; (app)/(site) groups don't
 * affect the URL). /analytics redirects to /analytics/v2. There is NO top-level /channels,
 * /ai-settings or /admin landing page — admin lives under /admin/*.
 */
export const ROUTES: RouteDef[] = [
  { name: 'Calendar', path: '/launches', expectsContent: true, minActionables: 3 },
  { name: 'Analytics', path: '/analytics/v2', expectsContent: true, minActionables: 4 },
  { name: 'Media', path: '/media', expectsContent: true, minActionables: 1 },
  { name: 'Comments', path: '/comments', expectsContent: true, minActionables: 1 },
  { name: 'Campaigns', path: '/campaigns', expectsContent: true, minActionables: 1 },
  { name: 'Plugs', path: '/plugs', expectsContent: true, minActionables: 1 },
  { name: 'Agents', path: '/agents', expectsContent: true, minActionables: 1 },
  { name: 'Integrations', path: '/third-party', expectsContent: true, minActionables: 1 },
  { name: 'Billing', path: '/billing', expectsContent: true, minActionables: 1 },
  { name: 'Settings', path: '/settings', expectsContent: true, minActionables: 2 },
];

/** Main sidebar nav labels → destination (from top.menu.tsx). */
export const NAV_LINKS: { label: RegExp; path: string }[] = [
  { label: /^calendar$|^launches$/i, path: '/launches' },
  { label: /^agent$/i, path: '/agents' },
  { label: /^comments$/i, path: '/comments' },
  { label: /^analytics$/i, path: '/analytics' },
  { label: /^media$/i, path: '/media' },
  { label: /^plugs$/i, path: '/plugs' },
  { label: /^campaigns$/i, path: '/campaigns' },
  { label: /^integrations$/i, path: '/third-party' },
  { label: /^billing$|^lifetime$/i, path: '/billing' },
  { label: /^settings$/i, path: '/settings' },
];

export const BASE = 'https://postiz.reaatech.com';
