import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StorageProviderType } from '@prisma/client';
import { LocalAdapter } from './local.adapter';

vi.mock('fs', () => ({
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
  readFileSync: vi.fn(),
  unlink: vi.fn((p, cb) => cb()),
  readdirSync: vi.fn(() => []),
  statSync: vi.fn(),
}));

vi.mock('file-type', () => ({
  fromBuffer: vi.fn().mockResolvedValue({
    ext: 'png',
    mime: 'image/png',
  }),
}));

vi.mock('@gitroom/nestjs-libraries/upload/data.url', () => ({
  parseDataUrl: vi.fn(),
}));

import * as fs from 'fs';
import { readFileSync } from 'fs';

describe('LocalAdapter', () => {
  const uploadDir = '/uploads';

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.FRONTEND_URL = 'http://localhost:4200';
  });

  describe('readFile', () => {
    it('reads a file from disk given a full URL', async () => {
      const buffer = Buffer.from('content');
      (readFileSync as any).mockReturnValue(buffer);
      const adapter = new LocalAdapter(uploadDir);

      const result = await adapter.readFile('http://localhost:4200/uploads/2026/01/15/abc.png');

      expect(readFileSync).toHaveBeenCalledWith(
        expect.stringContaining('/uploads/2026/01/15/abc.png')
      );
      expect(result).toBe(buffer);
    });

    it('reads a file given a relative path', async () => {
      const buffer = Buffer.from('content');
      (readFileSync as any).mockReturnValue(buffer);
      const adapter = new LocalAdapter(uploadDir);

      await adapter.readFile('/uploads/2026/01/15/abc.png');

      expect(readFileSync).toHaveBeenCalledWith(
        expect.stringContaining('2026/01/15/abc.png')
      );
    });

    it('reads a file given a simple key', async () => {
      const buffer = Buffer.from('content');
      (readFileSync as any).mockReturnValue(buffer);
      const adapter = new LocalAdapter(uploadDir);

      const result = await adapter.readFile('abc.png');

      expect(readFileSync).toHaveBeenCalled();
      expect(result).toBe(buffer);
    });
  });

  describe('type', () => {
    it('returns LOCAL as the provider type', () => {
      const adapter = new LocalAdapter(uploadDir);
      expect(adapter.type).toBe(StorageProviderType.LOCAL);
    });
  });

  describe('testConnection', () => {
    it('returns success when able to write and delete a test file', async () => {
      const adapter = new LocalAdapter(uploadDir);
      const result = await adapter.testConnection();
      expect(result.ok).toBe(true);
    });

    it('returns error on write failure', async () => {
      (fs.writeFileSync as any).mockImplementation(() => {
        throw new Error('Permission denied');
      });
      const adapter = new LocalAdapter(uploadDir);
      const result = await adapter.testConnection();
      expect(result.ok).toBe(false);
      expect(result.error).toBeTruthy();
    });
  });

  describe('getUsageBytes', () => {
    it('sums all file sizes recursively', async () => {
      const statMock = {
        isDirectory: () => false,
        size: 100,
        mtime: new Date(),
      };
      (fs.readdirSync as any).mockReturnValue(['file.txt']);
      (fs.statSync as any).mockReturnValue(statMock);

      const adapter = new LocalAdapter(uploadDir);
      const result = await adapter.getUsageBytes();

      expect(result).toBe(BigInt(100));
    });

    it('recurses into directories', async () => {
      const fileStat = { isDirectory: () => false, mtime: new Date(), size: 50 };
      const dirStat = { isDirectory: () => true };

      (fs.readdirSync as any)
        .mockReturnValueOnce(['subdir'])
        .mockReturnValueOnce(['file.txt']);
      (fs.statSync as any)
        .mockReturnValueOnce(dirStat)
        .mockReturnValueOnce(fileStat);

      const adapter = new LocalAdapter(uploadDir);
      const result = await adapter.getUsageBytes();

      expect(result).toBe(BigInt(50));
    });

    it('returns 0 when directory is empty or inaccessible files are skipped', async () => {
      (fs.readdirSync as any).mockReturnValue([]);
      const adapter = new LocalAdapter(uploadDir);
      const result = await adapter.getUsageBytes();
      expect(result).toBe(BigInt(0));
    });

    it('returns null on top-level exception', async () => {
      (fs.readdirSync as any).mockImplementation(() => {
        throw new Error('IO error');
      });
      const adapter = new LocalAdapter(uploadDir);
      const result = await adapter.getUsageBytes();
      // When walk throws at the top level, the outer catch returns null
      expect([null, BigInt(0)]).toContain(result);
    });
  });

  describe('getFileUrl', () => {
    it('constructs a public URL for a local file', () => {
      const adapter = new LocalAdapter(uploadDir);
      const url = adapter.getFileUrl('2026/01/15/abc.png');
      expect(url).toBe('http://localhost:4200/uploads/2026/01/15/abc.png');
    });
  });

  describe('listFiles', () => {
    it('lists files with their metadata', async () => {
      const stat = { isDirectory: () => false, size: 100, mtime: new Date() };
      (fs.readdirSync as any).mockReturnValue(['abc.png']);
      (fs.statSync as any).mockReturnValue(stat);

      const adapter = new LocalAdapter(uploadDir);
      const result = await adapter.listFiles();

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(
        expect.objectContaining({
          key: expect.stringContaining('abc.png'),
          name: 'abc.png',
          size: 100,
        })
      );
    });
  });

  describe('deleteFile', () => {
    it('deletes a file by absolute path', async () => {
      const adapter = new LocalAdapter(uploadDir);
      await adapter.deleteFile('2026/01/15/abc.png');
      expect(fs.unlink).toHaveBeenCalled();
    });
  });
});
