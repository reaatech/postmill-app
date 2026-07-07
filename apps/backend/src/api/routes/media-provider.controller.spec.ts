import { describe, it, expect } from 'vitest';
import 'reflect-metadata';
import { REQUIRE_PERMISSION_KEY } from '@gitroom/backend/services/auth/rbac/require-permission.decorator';
import { MediaProviderController } from './media-provider.controller';

// Every /settings/media route must carry the media-config:manage RBAC gate.
// The legacy CASL Sections.ADMIN billing-policy grant was removed (AUTH-01); the
// RBAC metadata is the real gate, so without it any org member could configure
// media providers.
describe('MediaProviderController RBAC gating', () => {
  const routes = [
    'listProviders',
    'getConfig',
    'upsertConfig',
    'setStorage',
    'setActive',
    'testConnection',
    'deleteConfig',
  ] as const;

  it('exposes the expected route handlers', () => {
    for (const route of routes) {
      expect(
        typeof MediaProviderController.prototype[
          route as keyof MediaProviderController
        ]
      ).toBe('function');
    }
  });

  it.each(routes)('%s requires media-config:manage', (route) => {
    const metadata = Reflect.getMetadata(
      REQUIRE_PERMISSION_KEY,
      MediaProviderController.prototype[route as keyof MediaProviderController]
    );
    expect(metadata).toEqual({ resource: 'media-config', action: 'manage' });
  });
});
