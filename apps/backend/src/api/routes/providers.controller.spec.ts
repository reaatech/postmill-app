import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';

import {
  ProvidersController,
  AdminProvidersController,
  FeaturedProviderDto,
} from './providers.controller';
import { SuperAdminGuard } from '@gitroom/backend/services/auth/rbac/super-admin.guard';

const GUARDS_METADATA = '__guards__';

function makeKernel(overrides: Record<string, any> = {}) {
  return {
    listManifests: vi.fn().mockReturnValue([]),
    getHealth: vi.fn(),
    get: vi.fn(),
    ...overrides,
  };
}

function makeFeatured(overrides: Record<string, any> = {}) {
  return {
    getFeaturedKeyed: vi.fn().mockResolvedValue(new Map()),
    list: vi.fn(),
    ...overrides,
  };
}

const superAdmin = { id: 'a1', isSuperAdmin: true } as any;

describe('ProvidersController', () => {
  let kernel: ReturnType<typeof makeKernel>;
  let featured: ReturnType<typeof makeFeatured>;
  let controller: ProvidersController;

  beforeEach(() => {
    kernel = makeKernel();
    featured = makeFeatured();
    controller = new ProvidersController(kernel as any, featured as any);
  });

  // PROVIDER_REMEDIATION 3.3: invalid ?domain= must fail closed with 400, not fall
  // open to the full cross-domain catalog.
  describe('catalog domain validation (3.3)', () => {
    it('throws BadRequestException for an unknown domain', async () => {
      await expect(controller.catalog('bogus')).rejects.toThrow(BadRequestException);
      expect(kernel.listManifests).not.toHaveBeenCalled();
    });

    it('accepts a valid domain and scopes the kernel call', async () => {
      await controller.catalog('ai');
      expect(kernel.listManifests).toHaveBeenCalledWith('ai');
      expect(featured.getFeaturedKeyed).toHaveBeenCalledWith('ai');
    });

    it('accepts an omitted domain (full catalog)', async () => {
      await controller.catalog(undefined);
      expect(kernel.listManifests).toHaveBeenCalledWith(undefined);
    });
  });
});

describe('AdminProvidersController', () => {
  // PROVIDER_REMEDIATION 4.6: health is kernel-owned; the handler must read
  // kernel.getHealth, NOT a `.health` field mutated onto the provider module.
  it('reads per-version health from kernel.getHealth (4.6)', () => {
    const sentinel = { successCount: 7, errorCount: 1, consecutiveErrors: 0 };
    const kernel = makeKernel({
      listManifests: vi
        .fn()
        .mockReturnValue([{ domain: 'ai', providerId: 'openai', version: 'v1', status: 'active' }]),
      getHealth: vi.fn().mockReturnValue(sentinel),
      // If the handler wrongly used `mod.health`, this decoy would surface instead.
      get: vi.fn().mockReturnValue({ health: { successCount: -999 } }),
    });
    const controller = new AdminProvidersController(kernel as any, makeFeatured() as any);

    const result = controller.health(superAdmin, undefined);

    expect(kernel.getHealth).toHaveBeenCalledWith('ai', 'openai', 'v1');
    expect(result[0].health).toBe(sentinel);
    expect(kernel.get).not.toHaveBeenCalled();
  });

  it('validates ?domain= on health too (3.3)', () => {
    const controller = new AdminProvidersController(makeKernel() as any, makeFeatured() as any);
    expect(() => controller.health(superAdmin, 'bogus')).toThrow(BadRequestException);
  });

  // PROVIDER_REMEDIATION 3.2 + 6.2: SuperAdminGuard is the class-level guard; the
  // redundant PoliciesGuard (a global APP_GUARD) was removed.
  it('is guarded by SuperAdminGuard at class level (3.2)', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, AdminProvidersController) || [];
    expect(guards).toContain(SuperAdminGuard);
  });

  it('no longer carries a redundant class-level PoliciesGuard (6.2)', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, AdminProvidersController) || [];
    const names = guards.map((g: any) => (typeof g === 'function' ? g.name : ''));
    expect(names).not.toContain('PoliciesGuard');
  });
});

// PROVIDER_REMEDIATION 3.8: sortOrder is a 32-bit Prisma Int — cap it so an oversize
// value is rejected at validation, not surfaced as an unhandled 500 at the DB layer.
describe('FeaturedProviderDto sortOrder bound (3.8)', () => {
  it('rejects a sortOrder above the 32-bit signed max', async () => {
    const dto = plainToInstance(FeaturedProviderDto, {
      domain: 'ai',
      providerId: 'openai',
      sortOrder: 3000000000,
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'sortOrder')).toBe(true);
  });

  it('accepts a sortOrder within range', async () => {
    const dto = plainToInstance(FeaturedProviderDto, {
      domain: 'ai',
      providerId: 'openai',
      sortOrder: 5,
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });
});
