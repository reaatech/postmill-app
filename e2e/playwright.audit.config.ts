import { defineConfig, devices } from '@playwright/test';
import base from './playwright.config';

/**
 * Full-surface audit config: runs the crawl / exercise / a11y specs against the LOCAL
 * host dev servers (frontend :4200, backend :3000) as three personas.
 *
 * Usage:
 *   npx playwright test --config playwright.audit.config.ts                 # all personas
 *   npx playwright test --config playwright.audit.config.ts --project=admin # one persona
 *
 * workers:1 (inherited) avoids the 429 throttle the crawler flags. Each persona reuses the
 * storageState saved by auth.setup.ts. Only the audit specs run here (40/46/92); the older
 * numbered specs are left to their own configs.
 */
const AUDIT_SPECS = [
  '**/40-crawl-all-routes.spec.ts',
  '**/46-exercise-interactions.spec.ts',
  '**/92-a11y.spec.ts',
  '**/93-metadata-titles.spec.ts',
  '**/94-setup-rbac.spec.ts',
  '**/95-contrast.spec.ts',
];

export default defineConfig({
  ...base,
  use: {
    ...base.use,
    baseURL: process.env.E2E_BASE || 'http://localhost:4200',
  },
  projects: [
    { name: 'setup', testMatch: '**/auth.setup.ts' },
    {
      name: 'admin',
      testMatch: AUDIT_SPECS,
      use: { ...devices['Desktop Chrome'], storageState: '.auth/admin.json' },
    },
    {
      name: 'member',
      testMatch: AUDIT_SPECS,
      use: { ...devices['Desktop Chrome'], storageState: '.auth/member.json' },
    },
    {
      name: 'free',
      testMatch: AUDIT_SPECS,
      use: { ...devices['Desktop Chrome'], storageState: '.auth/free.json' },
    },
  ],
});
