import { test } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Integrations/Channels testing:
 * - Page loads
 * - Lists available integrations
 * - Can view connected channels
 * - Connect/disconnect flows (if clickable)
 * - Settings per channel
 */
test('integrations and channels management', async ({ page }) => {
  const findings: any = {
    pageLoad: { status: 0, hasContent: false },
    integrations: [],
    connectedChannels: 0,
    actions: [],
    apiCalls: [],
    errors: [],
  };

  const apiCalls: string[] = [];
  page.on('response', (r) => {
    const u = r.url();
    if (u.includes('/api/') && (u.includes('integration') || u.includes('channel') || u.includes('connect'))) {
      apiCalls.push(`${r.status()} ${u.split('?')[0].replace('https://postiz.reaatech.com/api/', '')}`);
    }
  });

  try {
    // Load integrations page
    const r = await page.goto('/third-party', { timeout: 20000 });
    findings.pageLoad.status = r?.status() ?? 0;

    if (page.url().includes('/auth/')) {
      findings.errors.push('REDIRECT_TO_AUTH');
    }

    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(1500);

    const content = await page.locator('main, body').first().innerText();
    findings.pageLoad.hasContent = content.length > 50;

    // List all provider cards/items
    const providerCards = await page.locator(
      '[class*="provider"], [class*="integration"], [class*="channel"]'
    ).count();
    findings.integrations.push(`${providerCards}-provider-cards-found`);

    // Look for connected status indicators. NOTE: do not mix Playwright pseudo (text=, :has-text(/regex/))
    // inside a CSS locator() string — it throws "Unexpected token". Use getByText for text matching.
    const connectedByClass = await page.locator('[class*="connected"], [aria-label*="connected" i]').count();
    const connectedByText = await page.getByText(/connected/i).count();
    findings.connectedChannels = connectedByClass + connectedByText;

    // Count action buttons (Connect, Configure, Disconnect, etc.) — getByRole avoids selector-parse errors
    const connectBtns = await page.getByRole('button', { name: /connect|configure/i }).count();
    findings.actions.push(`${connectBtns}-connect-buttons`);

    const settingsBtns = await page.getByRole('button', { name: /setting|manage/i }).count();
    findings.actions.push(`${settingsBtns}-settings-buttons`);

    // Try to find and read provider names
    const providerNames = await page.locator('[class*="provider"] [class*="name"], [class*="provider"] h2, [class*="provider"] h3').allTextContents();
    findings.integrations = providerNames.filter(Boolean).slice(0, 15);

    // Look for a channel list if present
    const channelList = page.locator('[class*="channel"], li:has([class*="avatar"])').first();
    if (await channelList.count()) {
      findings.actions.push('channel-list-found');

      // Try clicking first channel
      await channelList.click({ timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(1500);
      findings.actions.push('clicked-first-channel');
    }

    // Look for search/filter
    const searchInput = page.locator('input[placeholder*="search" i], input[placeholder*="filter" i]').first();
    if (await searchInput.count()) {
      findings.actions.push('search-available');
    }

    await page.screenshot({ path: 'ui-integrations.png' });
  } catch (e: any) {
    findings.errors.push(e.message.slice(0, 100));
  }

  findings.apiCalls = apiCalls;
  findings.summary = {
    pageLoaded: findings.pageLoad.status === 200,
    hasContent: findings.pageLoad.hasContent,
    hasIntegrations: findings.integrations.length > 0,
    hasConnectedChannels: findings.connectedChannels > 0,
  };

  fs.writeFileSync(path.join(__dirname, '../results-integrations.json'), JSON.stringify(findings, null, 2));

  console.log('\n===== INTEGRATIONS & CHANNELS TEST =====');
  console.log(`Page: HTTP ${findings.pageLoad.status} | ${findings.pageLoad.hasContent ? '✓ content' : '✗ empty'}`);
  console.log(`Integrations found: ${findings.integrations.length}`);
  if (findings.integrations.length > 0) {
    console.log(`  ${findings.integrations.slice(0, 5).join(', ')}`);
  }
  console.log(`Connected channels: ${findings.connectedChannels}`);
  console.log(`Actions: ${findings.actions.join(' | ')}`);
  if (findings.apiCalls.length) {
    console.log(`API calls: ${findings.apiCalls.slice(0, 3).join(' | ')}`);
  }
  if (findings.errors.length) console.log(`Errors: ${findings.errors.join(', ')}`);
});
