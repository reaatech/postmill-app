import { test } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { PageAuditor } from './lib/audit';
import { inventory, safeClickByLabel, dismissModal } from './lib/crawl';

/**
 * Channels / Integrations (/third-party) deep probe.
 *
 * Source of UI facts: third-parties/third-party.component.tsx — route /third-party
 * (nav label "Integrations"), lists connected channels + an add/connect flow for 28+
 * providers. API: GET /api/integrations/list (or /api/integrations) returns the
 * connected channels. Per-channel actions: rename, disconnect, test/refresh, settings.
 *
 * RULES enforced here:
 *  - Locate ONLY via getByRole/getByText/getByPlaceholder/.filter({hasText}).
 *  - NEVER place a regex inside a page.locator() CSS string (it throws).
 *  - Every interaction is wrapped in try/catch + timeouts; this test always PASSES and
 *    records findings — it never throws. 429 marks the run as contaminated.
 *  - DESTRUCTIVE actions (disconnect) are only probed for presence, never invoked.
 *
 * Output: e2e/results-channels.json + console summary.
 */

const ROUTE = '/third-party';

test('channels / integrations management probe', async ({ page }) => {
  test.setTimeout(120_000);
  const auditor = new PageAuditor(page).attach();

  const findings: any = {
    route: ROUTE,
    load: { status: 0, textLen: 0, redirectedToAuth: false },
    integrationsApi: [],          // GET /api/integrations* calls seen
    connectedCount: 0,
    addChannel: { present: false, enabled: false },
    providerModalOpened: false,
    providerOptionsVisible: 0,
    managementActions: [],        // which per-channel actions exist
    gaps: [],
    apiErrors: [],
    consoleErrors: [],
    contaminated: false,          // true if a 429 was observed
    notes: [],
  };

  // ---- Step 1: load the page -------------------------------------------------
  try {
    const resp = await page.goto(ROUTE, { timeout: 30000 });
    findings.load.status = resp?.status() ?? 0;
    await page.waitForLoadState('networkidle', { timeout: 12000 }).catch(() => {});
    await page.waitForTimeout(1500);

    findings.load.redirectedToAuth = /\/auth\//.test(page.url());
    if (findings.load.redirectedToAuth) findings.notes.push('REDIRECTED_TO_AUTH');

    findings.load.textLen = await page
      .locator('main, [role="main"], body')
      .first()
      .innerText()
      .then((t) => t.replace(/\s+/g, ' ').trim().length)
      .catch(() => 0);
  } catch (e: any) {
    findings.notes.push('LOAD_ERROR: ' + String(e.message).slice(0, 100));
  }

  // Record the integrations-list API call status from the auditor.
  try {
    const snap = auditor.snapshot();
    findings.integrationsApi = snap.apiCalls
      .filter((c) => /\/api\/integrations/.test(c.url))
      .map((c) => `${c.method} ${c.status} ${c.url}`);
    if (findings.integrationsApi.length === 0) findings.notes.push('no /api/integrations* call observed');
  } catch {
    /* noop */
  }

  // ---- Step 2: catalog connected channels -----------------------------------
  // Don't guess fragile CSS: count images (avatars) + reuse the role inventory.
  let items: any[] = [];
  try {
    items = await inventory(page);
  } catch (e: any) {
    findings.notes.push('inventory-failed: ' + String(e.message).slice(0, 60));
  }

  try {
    const imgCount = await page.getByRole('img').count().catch(() => 0);
    // Heuristic: connected channels render an avatar image each. Use the image count
    // as the primary signal, but never let a stray decorative image inflate to a huge
    // number unchecked — record raw count for transparency.
    findings.connectedCount = imgCount;
    findings.notes.push(`avatar/img count = ${imgCount}`);
  } catch (e: any) {
    findings.notes.push('img-count-failed: ' + String(e.message).slice(0, 60));
  }

  // ---- Step 3: find the add / connect control -------------------------------
  try {
    // Each provider card renders a nested <button> with text "Add" (many of them);
    // the first one is a fine representative. Anchor to exactly "Add" so we don't
    // match unrelated "add member"/"connect"-style buttons elsewhere on the page.
    const addBtn = page
      .getByRole('button', { name: /^add$/i })
      .first();
    const visible = await addBtn.isVisible({ timeout: 4000 }).catch(() => false);
    findings.addChannel.present = visible;
    if (visible) {
      findings.addChannel.enabled = await addBtn.isEnabled().catch(() => true);

      if (findings.addChannel.enabled) {
        // baseline visible-image count before opening, so new provider options stand out
        const before = await page.getByRole('img').count().catch(() => 0);
        await addBtn.click({ timeout: 5000 }).catch(() => {});
        await page.waitForTimeout(1500);

        // A provider-selection modal/list should appear. Detect via dialog role or a
        // jump in visible provider options (buttons/links/images).
        const dialogVisible = await page
          .getByRole('dialog')
          .first()
          .isVisible({ timeout: 3000 })
          .catch(() => false);

        const after = await page.getByRole('img').count().catch(() => 0);
        const providerButtons = await page
          .getByRole('button', { name: /facebook|instagram|linkedin|twitter|x|youtube|tiktok|mastodon|bluesky|discord|telegram|slack|reddit|pinterest|threads|nostr|warpcast|wordpress|dribbble|lemmy/i })
          .count()
          .catch(() => 0);

        const grew = Math.max(0, after - before);
        findings.providerOptionsVisible = Math.max(grew, providerButtons);
        findings.providerModalOpened = dialogVisible || findings.providerOptionsVisible > 0;

        if (!findings.providerModalOpened) {
          findings.notes.push('add-channel clicked but no provider list/modal detected');
        }

        await dismissModal(page).catch(() => {});
        await page.waitForTimeout(500);
      } else {
        findings.notes.push('add-channel control present but disabled');
      }
    }
  } catch (e: any) {
    findings.notes.push('add-channel-probe-error: ' + String(e.message).slice(0, 80));
  }

  // ---- Step 4: per-channel management actions (presence only, non-destructive)
  // Only meaningful if at least one channel is connected.
  try {
    if (findings.connectedCount > 0) {
      const actionPatterns: Array<{ name: string; rx: RegExp }> = [
        { name: 'settings', rx: /setting/i },
        { name: 'manage', rx: /manage/i },
        { name: 'rename', rx: /rename/i },
        { name: 'disconnect', rx: /disconnect/i },
        { name: 'refresh', rx: /refresh/i },
        { name: 'reconnect', rx: /reconnect/i },
      ];

      for (const ap of actionPatterns) {
        // Probe both button and link roles; record presence + enabled state. Never click
        // disconnect (destructive) — presence is all we assert.
        let present = false;
        let enabled = false;
        for (const role of ['button', 'link'] as const) {
          const el = page.getByRole(role, { name: ap.rx }).first();
          if (await el.isVisible({ timeout: 1200 }).catch(() => false)) {
            present = true;
            enabled = await el.isEnabled().catch(() => true);
            break;
          }
        }
        if (present) {
          findings.managementActions.push(`${ap.name}${enabled ? '' : ' (disabled)'}`);
        }
      }

      // Some UIs hide actions behind a hover/kebab menu. As a non-destructive fallback,
      // note any aria-label hints from the inventory that look like management controls.
      const hinted = items
        .filter((i: any) => i.visible && /setting|rename|disconnect|refresh|reconnect|manage/i.test(i.label || ''))
        .map((i: any) => i.label)
        .filter(Boolean);
      if (hinted.length && findings.managementActions.length === 0) {
        findings.notes.push('inventory hints at actions: ' + hinted.slice(0, 6).join(', '));
      }
    } else {
      findings.notes.push('no connected channels — skipped management-action probe');
    }
  } catch (e: any) {
    findings.notes.push('management-probe-error: ' + String(e.message).slice(0, 80));
  }

  // ---- Step 5: flag GAPs -----------------------------------------------------
  try {
    const snap = auditor.snapshot();
    findings.contaminated = auditor.hadThrottle();
    if (findings.contaminated) findings.notes.push('THROTTLED_429 — results contaminated');

    findings.apiErrors = snap.apiErrors
      .filter((e) => e.status !== 429)
      .map((e) => `${e.status} ${e.method} ${e.url}`);
    findings.consoleErrors = snap.consoleErrors.slice(0, 20);

    const integrationsApiError = snap.apiErrors.some(
      (e) => e.status !== 429 && e.status >= 400 && /\/api\/integrations/.test(e.url)
    );

    if (findings.connectedCount > 0 && findings.managementActions.length === 0) {
      findings.gaps.push('GAP: channels connected but zero per-channel management actions found');
    }
    if (!findings.addChannel.present) {
      findings.gaps.push('GAP: add/connect channel control missing');
    } else if (!findings.addChannel.enabled) {
      findings.gaps.push('GAP: add/connect channel control present but disabled');
    }
    if (findings.addChannel.present && findings.addChannel.enabled && !findings.providerModalOpened) {
      findings.gaps.push('GAP: add-channel control does not open a provider selection list/modal');
    }
    if (integrationsApiError) {
      findings.gaps.push('GAP: /api/integrations* returned 4xx/5xx');
    }
    if (findings.load.redirectedToAuth) {
      findings.gaps.push('GAP: /third-party redirected to auth (not reachable while authenticated)');
    }
  } catch (e: any) {
    findings.notes.push('gap-flagging-error: ' + String(e.message).slice(0, 80));
  }

  auditor.detach();

  // ---- Step 6: summarize -----------------------------------------------------
  findings.summary = {
    connectedCount: findings.connectedCount,
    addChannelPresent: findings.addChannel.present,
    providerModalOpened: findings.providerModalOpened,
    managementActions: findings.managementActions,
    gaps: findings.gaps,
    apiErrors: findings.apiErrors,
    consoleErrors: findings.consoleErrors.length,
    contaminated: findings.contaminated,
  };

  try {
    fs.writeFileSync(
      path.join(__dirname, '../results-channels.json'),
      JSON.stringify(findings, null, 2)
    );
  } catch (e: any) {
    findings.notes.push('write-results-error: ' + String(e.message).slice(0, 80));
  }

  console.log('\n================ CHANNELS / INTEGRATIONS PROBE ================');
  if (findings.contaminated) {
    console.log('⚠️  THROTTLE (429) HIT — results are CONTAMINATED; re-run after raising API_LIMIT.\n');
  }
  console.log(`Route ${ROUTE}: HTTP ${findings.load.status} | textLen ${findings.load.textLen}` +
    `${findings.load.redirectedToAuth ? ' | ⚠ redirected-to-auth' : ''}`);
  console.log(`Integrations API: ${findings.integrationsApi.join(' | ') || '(none observed)'}`);
  console.log(`Connected channels (img/avatar count): ${findings.connectedCount}`);
  console.log(`Add-channel control: ${findings.addChannel.present ? 'present' : 'MISSING'}` +
    `${findings.addChannel.present ? (findings.addChannel.enabled ? ' (enabled)' : ' (DISABLED)') : ''}`);
  console.log(`Provider modal opened: ${findings.providerModalOpened ? 'yes' : 'no'}` +
    ` (provider options visible: ${findings.providerOptionsVisible})`);
  console.log(`Management actions: ${findings.managementActions.join(', ') || '(none found)'}`);
  if (findings.gaps.length) {
    console.log('\nGAPS:');
    for (const g of findings.gaps) console.log(`  🔴 ${g}`);
  } else {
    console.log('\nGaps: none');
  }
  if (findings.apiErrors.length) console.log(`API errors: ${findings.apiErrors.join(', ')}`);
  if (findings.consoleErrors.length) console.log(`Console errors: ${findings.consoleErrors.length}`);
  if (findings.notes.length) console.log(`Notes: ${findings.notes.join(' · ')}`);
  console.log('\nFull data: e2e/results-channels.json');

  // This test must always pass — findings are recorded, not asserted.
});
