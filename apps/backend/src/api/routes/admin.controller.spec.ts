import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ForbiddenException } from '@nestjs/common';
import { Provider, User } from '@prisma/client';

vi.mock(
  '@gitroom/nestjs-libraries/database/prisma/auth-providers/auth-provider.repository',
  () => ({
    AuthProviderRepository: class {},
  })
);

vi.mock('@gitroom/nestjs-libraries/encryption/encryption.service', () => ({
  EncryptionService: class {},
}));

import { AdminController } from './admin.controller';
import type { AuthProviderRepository } from '@gitroom/nestjs-libraries/database/prisma/auth-providers/auth-provider.repository';
import type { EncryptionService } from '@gitroom/nestjs-libraries/encryption/encryption.service';
import type { UpsertAuthProviderDto } from '@gitroom/nestjs-libraries/dtos/auth/upsert-auth-provider.dto';

const superAdmin = { id: 'admin-1', isSuperAdmin: true } as unknown as User;
const regularUser = { id: 'user-1', isSuperAdmin: false } as unknown as User;

describe('AdminController', () => {
  let repo: {
    list: ReturnType<typeof vi.fn>;
    upsert: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
  };
  let encryption: { encrypt: ReturnType<typeof vi.fn> };
  let controller: AdminController;

  beforeEach(() => {
    repo = {
      list: vi.fn(),
      upsert: vi.fn(),
      delete: vi.fn(),
    };
    encryption = {
      encrypt: vi.fn((value: string) => `enc:${value}`),
    };
    controller = new AdminController(
      repo as unknown as AuthProviderRepository,
      encryption as unknown as EncryptionService
    );
  });

  describe('super-admin gating', () => {
    it('forbids a non-super-admin on every route', async () => {
      await expect(controller.listAuthProviders(regularUser)).rejects.toThrow(
        ForbiddenException
      );
      await expect(
        controller.upsertAuthProvider(regularUser, {
          provider: Provider.GITHUB,
        } as UpsertAuthProviderDto)
      ).rejects.toThrow(ForbiddenException);
      await expect(
        controller.deleteAuthProvider(regularUser, 'GITHUB')
      ).rejects.toThrow(ForbiddenException);

      expect(repo.list).not.toHaveBeenCalled();
      expect(repo.upsert).not.toHaveBeenCalled();
      expect(repo.delete).not.toHaveBeenCalled();
    });

    it('forbids a missing user', async () => {
      await expect(
        controller.listAuthProviders(undefined as unknown as User)
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('listAuthProviders', () => {
    it('lists configs with secrets masked, preserving null secrets', async () => {
      repo.list.mockResolvedValue([
        {
          provider: Provider.GITHUB,
          enabled: true,
          clientId: 'enc:github-id',
          clientSecret: 'enc:github-secret',
        },
        {
          provider: Provider.GENERIC,
          enabled: false,
          clientId: null,
          clientSecret: null,
        },
      ]);

      const result = await controller.listAuthProviders(superAdmin);

      expect(result).toEqual([
        {
          provider: Provider.GITHUB,
          enabled: true,
          clientId: '[ENCRYPTED]',
          clientSecret: '[ENCRYPTED]',
        },
        {
          provider: Provider.GENERIC,
          enabled: false,
          clientId: null,
          clientSecret: null,
        },
      ]);
      // No ciphertext (let alone plaintext) ever leaves the API.
      expect(JSON.stringify(result)).not.toContain('enc:');
    });
  });

  describe('upsertAuthProvider', () => {
    it('encrypts clientId/clientSecret before persisting and masks the response', async () => {
      repo.upsert.mockImplementation(
        async (provider: Provider, data: Record<string, unknown>) => ({
          provider,
          ...data,
        })
      );

      const result = await controller.upsertAuthProvider(superAdmin, {
        provider: Provider.GITHUB,
        clientId: 'plain-id',
        clientSecret: 'plain-secret',
        enabled: true,
      } as UpsertAuthProviderDto);

      expect(encryption.encrypt).toHaveBeenCalledWith('plain-id');
      expect(encryption.encrypt).toHaveBeenCalledWith('plain-secret');
      expect(repo.upsert).toHaveBeenCalledWith(Provider.GITHUB, {
        enabled: true,
        clientId: 'enc:plain-id',
        clientSecret: 'enc:plain-secret',
      });

      // Secrets never returned, neither plaintext nor ciphertext.
      expect(result.clientId).toBe('[ENCRYPTED]');
      expect(result.clientSecret).toBe('[ENCRYPTED]');
      expect(JSON.stringify(result)).not.toContain('plain-id');
      expect(JSON.stringify(result)).not.toContain('enc:');
    });

    it('passes through OIDC fields and skips encryption when no secrets are sent', async () => {
      repo.upsert.mockResolvedValue({ provider: Provider.GENERIC });

      await controller.upsertAuthProvider(superAdmin, {
        provider: Provider.GENERIC,
        enabled: false,
        authUrl: 'https://idp.example.com/auth',
        tokenUrl: 'https://idp.example.com/token',
        userInfoUrl: 'https://idp.example.com/userinfo',
        scopes: 'openid email',
        displayName: 'Company SSO',
      } as UpsertAuthProviderDto);

      expect(encryption.encrypt).not.toHaveBeenCalled();
      expect(repo.upsert).toHaveBeenCalledWith(Provider.GENERIC, {
        enabled: false,
        authUrl: 'https://idp.example.com/auth',
        tokenUrl: 'https://idp.example.com/token',
        userInfoUrl: 'https://idp.example.com/userinfo',
        scopes: 'openid email',
        displayName: 'Company SSO',
      });
    });

    it('omits fields that were not provided', async () => {
      repo.upsert.mockResolvedValue({ provider: Provider.GOOGLE });

      await controller.upsertAuthProvider(superAdmin, {
        provider: Provider.GOOGLE,
      } as UpsertAuthProviderDto);

      expect(repo.upsert).toHaveBeenCalledWith(Provider.GOOGLE, {});
    });
  });

  describe('deleteAuthProvider', () => {
    it('deletes the provider config and reports success', async () => {
      repo.delete.mockResolvedValue({ provider: Provider.GITHUB });

      const result = await controller.deleteAuthProvider(superAdmin, 'GITHUB');

      expect(repo.delete).toHaveBeenCalledWith('GITHUB');
      expect(result).toEqual({ success: true });
    });
  });
});
