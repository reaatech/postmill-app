import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Organization } from '@prisma/client';

const storageMock = {
  uploadFile: vi.fn(),
};

const storageSvcMock = {
  assertWithinQuota: vi.fn(),
  getLocalAdapterForOrg: vi.fn().mockResolvedValue(storageMock),
};

const mediaSvcMock = {
  saveFile: vi.fn(),
};

vi.mock('@gitroom/nestjs-libraries/database/prisma/storage/storage.service', () => ({
  StorageService: class {
    assertWithinQuota = storageSvcMock.assertWithinQuota;
    getLocalAdapterForOrg = storageSvcMock.getLocalAdapterForOrg;
  },
}));

import { MediaController } from './media.controller';

const org: Organization = { id: 'org-1' } as any;

function makeController() {
  const ctrl = new MediaController(
    mediaSvcMock as any,
    {} as any,
    storageSvcMock as any,
  );
  return ctrl;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('MediaController — uploadServer temp file cleanup', () => {
  it('unlinks temp file after successful upload', async () => {
    storageSvcMock.assertWithinQuota.mockResolvedValue(undefined);
    storageMock.uploadFile.mockResolvedValue({
      originalname: 'abc123.png',
      path: 'http://localhost/uploads/abc123.png',
    });
    mediaSvcMock.saveFile.mockResolvedValue({ id: 'media-1' });

    const controller = makeController();
    const file = {
      originalname: 'test.png',
      size: 100,
      path: '/tmp/postmill-uploads/test123.png',
    } as any;

    const fs = await import('fs');
    const unlinkSpy = vi.spyOn(fs.promises, 'unlink').mockResolvedValue(undefined);

    await controller.uploadServer(org, file);

    expect(unlinkSpy).toHaveBeenCalledWith('/tmp/postmill-uploads/test123.png');

    unlinkSpy.mockRestore();
  });

  it('unlinks temp file when uploadFile throws', async () => {
    storageSvcMock.assertWithinQuota.mockResolvedValue(undefined);
    storageMock.uploadFile.mockRejectedValue(new Error('Upload failed'));

    const controller = makeController();
    const file = {
      originalname: 'test.png',
      size: 100,
      path: '/tmp/postmill-uploads/test123.png',
    } as any;

    const fs = await import('fs');
    const unlinkSpy = vi.spyOn(fs.promises, 'unlink').mockResolvedValue(undefined);

    await expect(controller.uploadServer(org, file)).rejects.toThrow('Upload failed');
    expect(unlinkSpy).toHaveBeenCalledWith('/tmp/postmill-uploads/test123.png');

    unlinkSpy.mockRestore();
  });

  it('unlinks temp file when saveFile throws', async () => {
    storageSvcMock.assertWithinQuota.mockResolvedValue(undefined);
    storageMock.uploadFile.mockResolvedValue({
      originalname: 'abc123.png',
      path: 'http://localhost/uploads/abc123.png',
    });
    mediaSvcMock.saveFile.mockRejectedValue(new Error('Save failed'));

    const controller = makeController();
    const file = {
      originalname: 'test.png',
      size: 100,
      path: '/tmp/postmill-uploads/test123.png',
    } as any;

    const fs = await import('fs');
    const unlinkSpy = vi.spyOn(fs.promises, 'unlink').mockResolvedValue(undefined);

    await expect(controller.uploadServer(org, file)).rejects.toThrow('Save failed');
    expect(unlinkSpy).toHaveBeenCalledWith('/tmp/postmill-uploads/test123.png');

    unlinkSpy.mockRestore();
  });

  it('does not call unlink when file has no path', async () => {
    storageSvcMock.assertWithinQuota.mockResolvedValue(undefined);
    storageMock.uploadFile.mockResolvedValue({
      originalname: 'abc123.png',
      path: 'http://localhost/uploads/abc123.png',
    });
    mediaSvcMock.saveFile.mockResolvedValue({ id: 'media-1' });

    const controller = makeController();
    const file = {
      originalname: 'test.png',
      size: 100,
    } as any;

    const fs = await import('fs');
    const unlinkSpy = vi.spyOn(fs.promises, 'unlink').mockResolvedValue(undefined);

    await controller.uploadServer(org, file);

    expect(unlinkSpy).not.toHaveBeenCalled();

    unlinkSpy.mockRestore();
  });
});
