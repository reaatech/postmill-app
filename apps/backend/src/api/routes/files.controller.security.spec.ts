import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Organization } from '@prisma/client';
import { HttpException } from '@nestjs/common';
import { ContentPackDailyCapError } from '@gitroom/nestjs-libraries/media/stock/content-packs/content-pack.interface';

import { FilesController } from './files.controller';

const org: Organization = { id: 'org-1' } as any;

function makeController() {
  const fileService = {
    getFolder: vi.fn().mockResolvedValue({ id: 'f1', organizationId: 'org-1' }),
    getFolderContents: vi.fn().mockResolvedValue({ count: 3 }),
    getByIds: vi.fn().mockResolvedValue([]),
    bulkMove: vi.fn().mockResolvedValue({ count: 0 }),
    importFromUrl: vi.fn().mockResolvedValue({ id: 'file-1' }),
  };
  const storageService = {};
  const stockMediaService = {
    resolveContentPackDownload: vi.fn().mockResolvedValue('https://cdn/licensed.jpg'),
    triggerDownload: vi.fn().mockResolvedValue(undefined),
  };
  const resolution = {
    listManifests: vi.fn().mockReturnValue([{ providerId: 'magnific' }]),
  };
  const ctrl = new FilesController(
    fileService as any,
    storageService as any,
    stockMediaService as any,
    resolution as any,
  );
  return { ctrl, fileService, stockMediaService, resolution };
}

beforeEach(() => vi.clearAllMocks());

describe('FilesController — tenant isolation & content-pack mint', () => {
  describe('1.1 getFolderContents is org-scoped', () => {
    it('validates folder ownership before returning contents', async () => {
      const { ctrl, fileService } = makeController();

      const result = await ctrl.getFolderContents(org, 'folder-b');

      expect(fileService.getFolder).toHaveBeenCalledWith('org-1', 'folder-b');
      expect(fileService.getFolderContents).toHaveBeenCalledWith('folder-b');
      expect(result).toEqual({ count: 3 });
    });

    it('propagates the 404 for a folder the org does not own', async () => {
      const { ctrl, fileService } = makeController();
      fileService.getFolder.mockRejectedValue(new HttpException('Folder not found', 404));

      await expect(ctrl.getFolderContents(org, 'folder-b')).rejects.toThrow('Folder not found');
      expect(fileService.getFolderContents).not.toHaveBeenCalled();
    });
  });

  describe('1.2 bulkMove restricts to owned ids', () => {
    it('moves only ids the org owns (foreign ids drop out → 0 rows)', async () => {
      const { ctrl, fileService } = makeController();
      // requested [own-1, foreign-1]; org only owns own-1
      fileService.getByIds.mockResolvedValue([{ id: 'own-1' }]);

      await ctrl.bulkMove(org, { ids: ['own-1', 'foreign-1'], folderId: 'dest' } as any);

      expect(fileService.getByIds).toHaveBeenCalledWith('org-1', ['own-1', 'foreign-1']);
      expect(fileService.bulkMove).toHaveBeenCalledWith('org-1', ['own-1'], 'dest');
    });

    it('passes an empty id set (0 rows) when none are owned', async () => {
      const { ctrl, fileService } = makeController();
      fileService.getByIds.mockResolvedValue([]);

      await ctrl.bulkMove(org, { ids: ['foreign-1'], folderId: null } as any);

      expect(fileService.bulkMove).toHaveBeenCalledWith('org-1', [], null);
    });
  });

  describe('0.4 content-pack singular→plural capability mapping', () => {
    const body = (type: string) => ({
      url: '',
      name: 'x',
      source: 'magnific',
      downloadLocation: 'item-123',
      type,
    });

    it.each([
      ['photo', 'photos'],
      ['image', 'photos'],
      ['vector', 'vectors'],
      ['video', 'videos'],
      ['sticker', 'stickers'],
      ['icon', 'icons'],
      ['audio', 'audio'],
    ])('maps client type "%s" → capability "%s"', async (clientType, expected) => {
      const { ctrl, stockMediaService } = makeController();

      await ctrl.importFromUrl(org, body(clientType) as any);

      expect(stockMediaService.resolveContentPackDownload).toHaveBeenCalledWith(
        'org-1',
        'item-123',
        expected,
      );
    });

    it('rejects an unknown type with 400 (no silent default)', async () => {
      const { ctrl, stockMediaService } = makeController();

      await expect(ctrl.importFromUrl(org, body('bogus') as any)).rejects.toMatchObject({
        status: 400,
      });
      expect(stockMediaService.resolveContentPackDownload).not.toHaveBeenCalled();
    });

    it('maps a daily-cap error to 402', async () => {
      const { ctrl, stockMediaService } = makeController();
      stockMediaService.resolveContentPackDownload.mockRejectedValue(
        new ContentPackDailyCapError('cap reached'),
      );

      await expect(ctrl.importFromUrl(org, body('photo') as any)).rejects.toMatchObject({
        status: 402,
      });
    });

    it('returns a generic 502 (not raw provider text) on a mint failure', async () => {
      const { ctrl, stockMediaService } = makeController();
      stockMediaService.resolveContentPackDownload.mockRejectedValue(
        new Error('upstream 500 <html>secret</html>'),
      );

      await expect(ctrl.importFromUrl(org, body('photo') as any)).rejects.toMatchObject({
        status: 502,
        message: 'Could not retrieve the licensed asset',
      });
    });
  });
});
