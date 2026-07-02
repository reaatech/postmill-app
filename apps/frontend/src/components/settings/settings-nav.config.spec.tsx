import { describe, it, expect } from 'vitest';
import {
  SETTINGS_NAV,
  type SettingsGateCtx,
} from '@gitroom/frontend/components/settings/settings-nav.config';
import {
  LEGACY_TAB_TO_PATH,
  SETTINGS_DEFAULT_PATH,
} from '@gitroom/frontend/components/settings/settings-paths';

// Guards the settings nav config: the legacy ?tab= compat map must cover every old tab key,
// hrefs must be unique routes, and the tier/permission gates must mirror the old SettingsPopup
// render-guards (so a deep-linked unentitled user is gated, not exposed).

const item = (key: string) => {
  const found = SETTINGS_NAV.find((i) => i.key === key);
  if (!found) throw new Error(`nav item '${key}' not found`);
  return found;
};

const ctx = (over: Partial<SettingsGateCtx>): SettingsGateCtx => ({
  user: undefined,
  permissions: { hasPermission: () => false },
  isGeneral: true,
  showLogout: true,
  ...over,
});

describe('settings nav config', () => {
  it('every href is unique and under /settings/', () => {
    const hrefs = SETTINGS_NAV.map((i) => i.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
    for (const h of hrefs) expect(h.startsWith('/settings/')).toBe(true);
  });

  it('has no standalone roles item (folded into Team)', () => {
    expect(SETTINGS_NAV.some((i) => i.key === 'roles')).toBe(false);
    expect(SETTINGS_NAV.some((i) => i.key === 'team')).toBe(true);
  });

  it('legacy ?tab= map covers every old top-level tab + content alias', () => {
    const oldKeys = [
      'teams', 'roles', 'broadcast', 'channels', 'ai', 'shortlinks', 'content',
      'vpn', 'storage', 'webhooks', 'autopost', 'api', 'approved_apps',
      'media_providers', 'content_packs', 'sets', 'signatures',
    ];
    for (const k of oldKeys) {
      expect(LEGACY_TAB_TO_PATH[k], `missing legacy mapping for '${k}'`).toBeDefined();
      expect(LEGACY_TAB_TO_PATH[k].startsWith('/settings/')).toBe(true);
    }
    // roles + teams both fold into the Team page.
    expect(LEGACY_TAB_TO_PATH.roles).toBe('/settings/team');
    expect(LEGACY_TAB_TO_PATH.teams).toBe('/settings/team');
    expect(SETTINGS_DEFAULT_PATH).toBe('/settings/channels');
  });

  it('ungated items are always visible', () => {
    for (const key of ['channels', 'ai', 'shortlinks', 'content', 'vpn', 'storage', 'approved-apps']) {
      expect(item(key).gate).toBeUndefined();
    }
  });

  it('team gate requires the team_members tier and isGeneral', () => {
    const gate = item('team').gate!;
    expect(gate(ctx({ user: { tier: { team_members: true } }, isGeneral: true }))).toBe(true);
    expect(gate(ctx({ user: { tier: { team_members: true } }, isGeneral: false }))).toBe(false);
    expect(gate(ctx({ user: { tier: {} } }))).toBe(false);
    expect(gate(ctx({ user: undefined }))).toBe(false);
  });

  it('webhooks/autopost gates require their tier flags', () => {
    expect(item('webhooks').gate!(ctx({ user: { tier: { webhooks: true } } }))).toBe(true);
    expect(item('webhooks').gate!(ctx({ user: { tier: {} } }))).toBe(false);
    expect(item('autopost').gate!(ctx({ user: { tier: { autoPost: true } } }))).toBe(true);
    expect(item('autopost').gate!(ctx({ user: { tier: {} } }))).toBe(false);
  });

  it('broadcast gate requires notifications:manage', () => {
    const gate = item('broadcast').gate!;
    expect(gate(ctx({ permissions: { hasPermission: (r, a) => r === 'notifications' && a === 'manage' } }))).toBe(true);
    expect(gate(ctx({ permissions: { hasPermission: () => false } }))).toBe(false);
  });

  it('developers gate requires public_api + isGeneral + showLogout', () => {
    const gate = item('developers').gate!;
    expect(gate(ctx({ user: { tier: { public_api: true } }, isGeneral: true, showLogout: true }))).toBe(true);
    expect(gate(ctx({ user: { tier: { public_api: true } }, isGeneral: true, showLogout: false }))).toBe(false);
    expect(gate(ctx({ user: { tier: { public_api: true } }, isGeneral: false, showLogout: true }))).toBe(false);
    expect(gate(ctx({ user: { tier: {} }, isGeneral: true, showLogout: true }))).toBe(false);
  });
});
