import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Organization, User } from '@prisma/client';
import { HttpException } from '@nestjs/common';

const storageMock = {
  uploadFile: vi.fn(),
};

const storageSvcMock = {
  assertWithinQuota: vi.fn(),
};

const mediaSvcMock = {
  saveFile: vi.fn(),
};

vi.mock('@gitroom/nestjs-libraries/upload/upload.factory', () => ({
  UploadFactory: {
    createStorage: () => storageMock,
  },
}));

vi.mock('@gitroom/nestjs-libraries/database/prisma/storage/storage.service', () => ({
  StorageService: class {
    assertWithinQuota = storageSvcMock.assertWithinQuota;
  },
}));

import { MediaController } from './media.controller';

const org: Organization = { id: 'org-1' } as any;

function makeController() {
  const ctrl = new MediaController(
    mediaSvcMock as any,
    {} as any,
    {} as any,
    storageSvcMock as any
  );
  // Override the private storage field with our mock
  (ctrl as any).storage = storageMock;
  return ctrl;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('MediaController — quota enforcement (#57)', () => {
  describe('uploadServer', () => {
    it('enforces quota before uploading', async () => {
      storageSvcMock.assertWithinQuota.mockRejectedValue(
        new HttpException('Storage quota exceeded', 413)
      );
      const controller = makeController();

      const file = {
        originalname: 'test.png',
        size: 1000,
        buffer: Buffer.from('data'),
      } as any;

      await expect(
        controller.uploadServer(org, file)
      ).rejects.toThrow('Storage quota exceeded');

      expect(storageSvcMock.assertWithinQuota).toHaveBeenCalledWith('org-1', 1000);
    });

    it('allows upload when within quota', async () => {
      storageSvcMock.assertWithinQuota.mockResolvedValue(undefined);
      storageMock.uploadFile.mockResolvedValue({
        originalname: 'test.png',
        path: 'http://localhost/uploads/test.png',
      });
      mediaSvcMock.saveFile.mockResolvedValue({
        id: 'media-1',
        path: 'http://localhost/uploads/test.png',
      });
      const controller = makeController();

      const file = {
        originalname: 'test.png',
        size: 100,
        buffer: Buffer.from('data'),
      } as any;

      const result = await controller.uploadServer(org, file);

      expect(storageSvcMock.assertWithinQuota).toHaveBeenCalledWith('org-1', 100);
      expect(storageMock.uploadFile).toHaveBeenCalled();
      expect(result).toBeDefined();
    });
  });

  describe('uploadSimple', () => {
    it('enforces quota before uploading', async () => {
      storageSvcMock.assertWithinQuota.mockRejectedValue(
        new HttpException('Over quota', 413)
      );
      const controller = makeController();

      const file = {
        originalname: 'image.png',
        size: 2000,
        buffer: Buffer.from('data'),
      } as any;

      await expect(
        controller.uploadSimple(org, file)
      ).rejects.toThrow('Over quota');

      expect(storageSvcMock.assertWithinQuota).toHaveBeenCalledWith('org-1', 2000);
    });

    it('skips saving when preventSave is true', async () => {
      storageSvcMock.assertWithinQuota.mockResolvedValue(undefined);
      storageMock.uploadFile.mockResolvedValue({
        originalname: 'test.png',
        path: 'http://localhost/uploads/test.png',
      });
      const controller = makeController();

      const file = {
        originalname: 'test.png',
        size: 100,
        buffer: Buffer.from('data'),
      } as any;

      const result = await controller.uploadSimple(org, file, 'true');

      expect(result).toHaveProperty('path');
      expect(mediaSvcMock.saveFile).not.toHaveBeenCalled();
    });
  });
});
