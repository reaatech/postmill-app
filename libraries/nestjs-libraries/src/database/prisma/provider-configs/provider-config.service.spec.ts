import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProviderConfigService } from './provider-config.service';
import { AuthService } from '@gitroom/helpers/auth/auth.service';

const mockRepo = {
  getAll: vi.fn(),
  getByIdentifier: vi.fn(),
  getEnabled: vi.fn(),
  upsert: vi.fn(),
  delete: vi.fn(),
};

vi.mock('./provider-config.repository', () => ({
  ProviderConfigRepository: vi.fn(() => mockRepo),
}));

describe('ProviderConfigService', () => {
  let service: ProviderConfigService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new ProviderConfigService(mockRepo as any);
  });

  describe('getAll', () => {
    it('delegates to repository', () => {
      const expected = [{ identifier: 'test' }];
      mockRepo.getAll.mockReturnValue(expected);
      expect(service.getAll()).toBe(expected);
      expect(mockRepo.getAll).toHaveBeenCalledOnce();
    });
  });

  describe('getByIdentifier', () => {
    it('delegates to repository', () => {
      const expected = { identifier: 'test1', name: 'Test' };
      mockRepo.getByIdentifier.mockReturnValue(expected);
      expect(service.getByIdentifier('test1')).toBe(expected);
      expect(mockRepo.getByIdentifier).toHaveBeenCalledWith('test1');
    });
  });

  describe('getEnabled', () => {
    it('delegates to repository', () => {
      const expected = [{ identifier: 'test', enabled: true }];
      mockRepo.getEnabled.mockReturnValue(expected);
      expect(service.getEnabled()).toBe(expected);
      expect(mockRepo.getEnabled).toHaveBeenCalledOnce();
    });
  });

  describe('delete', () => {
    it('delegates to repository', () => {
      const expected = { identifier: 'test' };
      mockRepo.delete.mockReturnValue(expected);
      expect(service.delete('test')).toBe(expected);
      expect(mockRepo.delete).toHaveBeenCalledWith('test');
    });
  });

  describe('upsert', () => {
    beforeEach(() => {
      mockRepo.upsert.mockResolvedValue({ identifier: 'test' });
    });

    it('encrypts clientId and clientSecret when truthy', async () => {
      const encryptSpy = vi.spyOn(AuthService, 'fixedEncryption');

      await service.upsert('test', {
        name: 'Test',
        enabled: true,
        clientId: 'my-id',
        clientSecret: 'my-secret',
      });

      expect(encryptSpy).toHaveBeenCalledTimes(2);
      expect(encryptSpy).toHaveBeenCalledWith('my-id');
      expect(encryptSpy).toHaveBeenCalledWith('my-secret');
      expect(mockRepo.upsert).toHaveBeenCalledWith(
        'test',
        expect.objectContaining({
          clientId: expect.stringMatching(/^v2:/),
          clientSecret: expect.stringMatching(/^v2:/),
        })
      );
    });

    it('stores null when clientId is null', async () => {
      const encryptSpy = vi.spyOn(AuthService, 'fixedEncryption');

      await service.upsert('test', {
        name: 'Test',
        enabled: true,
        clientId: null as any,
        clientSecret: 'my-secret',
      });

      expect(encryptSpy).toHaveBeenCalledTimes(1);
      expect(encryptSpy).toHaveBeenCalledWith('my-secret');
      expect(mockRepo.upsert).toHaveBeenCalledWith(
        'test',
        expect.objectContaining({ clientId: null })
      );
    });

    it('stores null when clientId is empty string', async () => {
      const encryptSpy = vi.spyOn(AuthService, 'fixedEncryption');

      await service.upsert('test', {
        name: 'Test',
        enabled: true,
        clientId: '',
        clientSecret: 'my-secret',
      });

      expect(encryptSpy).toHaveBeenCalledTimes(1);
      expect(mockRepo.upsert).toHaveBeenCalledWith(
        'test',
        expect.objectContaining({ clientId: null })
      );
    });

    it('skips clientId when undefined (not in data)', async () => {
      const encryptSpy = vi.spyOn(AuthService, 'fixedEncryption');

      await service.upsert('test', {
        name: 'Test',
        enabled: true,
        clientSecret: 'my-secret',
      });

      expect(encryptSpy).toHaveBeenCalledTimes(1);
      expect(encryptSpy).toHaveBeenCalledWith('my-secret');
    });

    it('stores null when clientSecret is null', async () => {
      const encryptSpy = vi.spyOn(AuthService, 'fixedEncryption');

      await service.upsert('test', {
        name: 'Test',
        enabled: true,
        clientId: 'my-id',
        clientSecret: null as any,
      });

      expect(encryptSpy).toHaveBeenCalledTimes(1);
      expect(encryptSpy).toHaveBeenCalledWith('my-id');
      expect(mockRepo.upsert).toHaveBeenCalledWith(
        'test',
        expect.objectContaining({ clientSecret: null })
      );
    });

    it('stores null when clientSecret is empty string', async () => {
      const encryptSpy = vi.spyOn(AuthService, 'fixedEncryption');

      await service.upsert('test', {
        name: 'Test',
        enabled: true,
        clientId: 'my-id',
        clientSecret: '',
      });

      expect(encryptSpy).toHaveBeenCalledTimes(1);
      expect(encryptSpy).toHaveBeenCalledWith('my-id');
      expect(mockRepo.upsert).toHaveBeenCalledWith(
        'test',
        expect.objectContaining({ clientSecret: null })
      );
    });

    it('skips clientSecret when undefined (not in data)', async () => {
      const encryptSpy = vi.spyOn(AuthService, 'fixedEncryption');

      await service.upsert('test', {
        name: 'Test',
        enabled: true,
        clientId: 'my-id',
      });

      expect(encryptSpy).toHaveBeenCalledTimes(1);
      expect(encryptSpy).toHaveBeenCalledWith('my-id');
    });

    it('handles mixed: undefined clientId, null clientSecret, truthy clientId+secret', async () => {
      const encryptSpy = vi.spyOn(AuthService, 'fixedEncryption');

      await service.upsert('test', {
        name: 'Test',
        enabled: true,
        clientSecret: 'secret-1',
      });

      expect(encryptSpy).toHaveBeenCalledTimes(1);
      expect(encryptSpy).toHaveBeenCalledWith('secret-1');
      expect(mockRepo.upsert).toHaveBeenCalledWith(
        'test',
        expect.not.objectContaining({ clientId: expect.anything() })
      );

      encryptSpy.mockClear();
      mockRepo.upsert.mockClear();

      await service.upsert('test2', {
        name: 'Test2',
        enabled: true,
        clientId: 'id-2',
        clientSecret: null as any,
      });

      expect(encryptSpy).toHaveBeenCalledTimes(1);
      expect(encryptSpy).toHaveBeenCalledWith('id-2');
      expect(mockRepo.upsert).toHaveBeenCalledWith(
        'test2',
        expect.objectContaining({ clientSecret: null })
      );
    });
  });

  describe('decryptConfig', () => {
    it('decrypts both clientId and clientSecret when truthy', () => {
      const encryptedId = AuthService.fixedEncryption('secret-id');
      const encryptedSecret = AuthService.fixedEncryption('secret-secret');
      const config = {
        clientId: encryptedId,
        clientSecret: encryptedSecret,
      } as any;

      const result = service.decryptConfig(config);

      expect(result).toEqual({
        clientId: 'secret-id',
        clientSecret: 'secret-secret',
      });
    });

    it('returns undefined for clientSecret when only clientId is set', () => {
      const encryptedId = AuthService.fixedEncryption('my-id');
      const config = {
        clientId: encryptedId,
        clientSecret: null,
      } as any;

      const result = service.decryptConfig(config);

      expect(result.clientId).toBe('my-id');
      expect(result.clientSecret).toBeUndefined();
    });

    it('returns undefined for clientId when only clientSecret is set', () => {
      const encryptedSecret = AuthService.fixedEncryption('my-secret');
      const config = {
        clientId: null,
        clientSecret: encryptedSecret,
      } as any;

      const result = service.decryptConfig(config);

      expect(result.clientId).toBeUndefined();
      expect(result.clientSecret).toBe('my-secret');
    });

    it('returns undefined for both when both are null', () => {
      const config = {
        clientId: null,
        clientSecret: null,
      } as any;

      const result = service.decryptConfig(config);

      expect(result.clientId).toBeUndefined();
      expect(result.clientSecret).toBeUndefined();
    });

    it('returns undefined for clientId when clientId is empty string', () => {
      const encryptedSecret = AuthService.fixedEncryption('my-secret');
      const config = {
        clientId: '',
        clientSecret: encryptedSecret,
      } as any;

      const result = service.decryptConfig(config);

      expect(result.clientId).toBeUndefined();
      expect(result.clientSecret).toBe('my-secret');
    });
  });
});
