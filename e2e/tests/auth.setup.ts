import { test as setup, expect } from '@playwright/test';
import * as path from 'path';

const AUTH_FILE = path.join(__dirname, '../.auth/state.json');

// Credentials come from the environment — never hard-code them.
// Set E2E_EMAIL / E2E_PASSWORD before running (E2E_PASSWORD is required).
const EMAIL = process.env.E2E_EMAIL || 'claude@reaatech.com';
const PASSWORD = process.env.E2E_PASSWORD || '';

setup('authenticate', async ({ page }) => {
  if (!PASSWORD) {
    throw new Error('E2E_PASSWORD env var is required to authenticate the e2e suite.');
  }
  await page.goto('/auth/login');
  await page.waitForLoadState('networkidle');

  // Fill form (placeholder values from login.tsx)
  await page.getByPlaceholder('Email Address').fill(EMAIL);
  await page.getByPlaceholder('Password').fill(PASSWORD);

  // Submit — backend replies with reload:true header → window.location.reload() → redirect
  await Promise.all([
    page.waitForURL(url => !url.toString().includes('/auth/login'), { timeout: 20_000 }),
    page.getByRole('button', { name: /sign in/i }).click(),
  ]);

  await page.waitForLoadState('networkidle');
  console.log('Logged in, final URL:', page.url());

  await page.context().storageState({ path: AUTH_FILE });
  console.log('Auth state saved');
});
