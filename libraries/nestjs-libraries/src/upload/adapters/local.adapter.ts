import { Logger } from '@nestjs/common';
import { StorageProviderType } from '@prisma/client';
import { IStorageAdapter, StorageFileEntry } from '../upload.interface';
import {
  mkdirSync,
  unlink,
  writeFileSync,
  readdirSync,
  statSync,
  readFileSync,
  copyFileSync,
} from 'fs';
import { randomBytes } from 'crypto';
import { safeFetch } from '@gitroom/nestjs-libraries/dtos/webhooks/safe.fetch';
import { parseDataUrl } from '@gitroom/nestjs-libraries/upload/data.url';
import { fromBuffer, fromFile } from 'file-type';
import path from 'path';

const LOCAL_STORAGE_ALLOWED_MIME = new Set<string>([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/avif',
  'image/bmp',
  'image/tiff',
  'video/mp4',
  'audio/mpeg',
  'audio/mp4',
  'audio/wav',
  'audio/ogg',
]);

export class LocalAdapter implements IStorageAdapter {
  readonly type = StorageProviderType.LOCAL;
  private readonly _logger = new Logger(LocalAdapter.name);

  constructor(private uploadDirectory: string) {}

  async testConnection(): Promise<{ ok: boolean; error?: string }> {
    try {
      mkdirSync(this.uploadDirectory, { recursive: true });
      const testFile = path.join(this.uploadDirectory, '.test-write');
      writeFileSync(testFile, '');
      unlink(testFile, () => {});
      return { ok: true };
    } catch (err: any) {
      return { ok: false, error: err.message };
    }
  }

  async listFiles(prefix?: string): Promise<StorageFileEntry[]> {
    const dir = prefix
      ? path.join(this.uploadDirectory, prefix)
      : this.uploadDirectory;
    const entries: StorageFileEntry[] = [];

    const walk = (dirPath: string, relativePrefix: string) => {
      let files: string[];
      try {
        files = readdirSync(dirPath);
      } catch {
        return;
      }

      for (const file of files) {
        const fullPath = path.join(dirPath, file);
        let stat: ReturnType<typeof statSync>;
        try {
          stat = statSync(fullPath);
        } catch {
          continue;
        }

        if (stat.isDirectory()) {
          walk(fullPath, path.join(relativePrefix, file));
        } else {
          entries.push({
            key: path.join(relativePrefix, file),
            name: file,
            size: stat.size,
            mimeType: '',
            lastModified: stat.mtime,
          });
        }
      }
    };

    walk(dir, prefix || '');
    return entries;
  }

  getFileUrl(key: string): string {
    return (
      (process.env.FRONTEND_URL || '') + '/uploads/' + key.replace(/^\//, '')
    );
  }

  async deleteFile(key: string): Promise<void> {
    const filePath = path.join(this.uploadDirectory, key.replace(/^\//, ''));
    return new Promise((resolve, reject) => {
      unlink(filePath, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  async getUsageBytes(): Promise<bigint | null> {
    try {
      let total = BigInt(0);
      const walk = (dirPath: string) => {
        let files: string[];
        try {
          files = readdirSync(dirPath);
        } catch {
          return;
        }
        for (const file of files) {
          const fullPath = path.join(dirPath, file);
          let stat: ReturnType<typeof statSync>;
          try {
            stat = statSync(fullPath);
          } catch {
            continue;
          }
          if (stat.isDirectory()) {
            walk(fullPath);
          } else {
            total += BigInt(stat.size);
          }
        }
      };
      walk(this.uploadDirectory);
      return total;
    } catch {
      return null;
    }
  }

  async uploadSimple(path: string) {
    const dataUrl = path.startsWith('data:') ? parseDataUrl(path) : null;

    let body: Buffer;
    if (dataUrl) {
      body = dataUrl.buffer;
    } else {
      const loadImage = await safeFetch(path);
      body = Buffer.from(await loadImage.arrayBuffer());
    }

    const detected = await fromBuffer(body);
    if (!detected || !LOCAL_STORAGE_ALLOWED_MIME.has(detected.mime)) {
      throw new Error('Unsupported file type.');
    }
    const findExtension = detected.ext;

    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');

    const innerPath = `/${year}/${month}/${day}`;
    const dir = `${this.uploadDirectory}${innerPath}`;
    mkdirSync(dir, { recursive: true });

    const randomName = randomBytes(16).toString('hex');

    const filePath = `${dir}/${randomName}.${findExtension}`;
    const publicPath = `${innerPath}/${randomName}.${findExtension}`;
    writeFileSync(filePath, body);

    return process.env.FRONTEND_URL + '/uploads' + publicPath;
  }

  async uploadFile(file: Express.Multer.File): Promise<any> {
    try {
      let detected: { ext: string; mime: string } | undefined;
      let isBufferPath = true;

      if (file.buffer && Buffer.isBuffer(file.buffer)) {
        detected = await fromBuffer(file.buffer);
      } else if (file.path) {
        detected = (await fromFile(file.path)) as any;
        isBufferPath = false;
      } else {
        throw new Error('Invalid file upload.');
      }

      if (!detected || !LOCAL_STORAGE_ALLOWED_MIME.has(detected.mime)) {
        throw new Error('Unsupported file type.');
      }
      const safeExt = `.${detected.ext}`;
      const safeMime = detected.mime;

      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');

      const innerPath = `/${year}/${month}/${day}`;
      const dir = `${this.uploadDirectory}${innerPath}`;
      mkdirSync(dir, { recursive: true });

      const randomName = randomBytes(16).toString('hex');

      const filePath = `${dir}/${randomName}${safeExt}`;
      const publicPath = `${innerPath}/${randomName}${safeExt}`;

      if (isBufferPath) {
        writeFileSync(filePath, file.buffer);
      } else {
        copyFileSync(file.path!, filePath);
      }

      return {
        filename: `${randomName}${safeExt}`,
        path: process.env.FRONTEND_URL + '/uploads' + publicPath,
        mimetype: safeMime,
        originalname: `${randomName}${safeExt}`,
      };
    } catch (err) {
      this._logger.warn(`Local storage upload failed: ${(err as Error).message}`);
      throw err;
    }
  }

  async removeFile(filePath: string): Promise<void> {
    let targetPath = filePath;
    const frontendUrl = process.env.FRONTEND_URL || '';
    if (targetPath.startsWith(frontendUrl + '/uploads/')) {
      targetPath = path.join(
        this.uploadDirectory,
        targetPath.slice((frontendUrl + '/uploads/').length)
      );
    } else if (targetPath.startsWith('/uploads/')) {
      targetPath = path.join(
        this.uploadDirectory,
        targetPath.slice('/uploads/'.length)
      );
    }
    return new Promise((resolve, reject) => {
      unlink(targetPath, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  async readFile(pathOrKey: string): Promise<Buffer> {
    let targetPath = pathOrKey;
    const frontendUrl = process.env.FRONTEND_URL || '';
    if (targetPath.startsWith(frontendUrl + '/uploads/')) {
      targetPath = path.join(
        this.uploadDirectory,
        targetPath.slice((frontendUrl + '/uploads/').length)
      );
    } else if (targetPath.startsWith('/uploads/')) {
      targetPath = path.join(
        this.uploadDirectory,
        targetPath.slice('/uploads/'.length)
      );
    } else if (!path.isAbsolute(targetPath)) {
      targetPath = path.join(this.uploadDirectory, targetPath.replace(/^\//, ''));
    }
    return readFileSync(targetPath);
  }

  async writeBuffer(buffer: Buffer, contentType?: string): Promise<string> {
    const detected = await fromBuffer(buffer);
    const ext = detected?.ext || 'bin';
    const mime = detected?.mime || contentType || 'application/octet-stream';

    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');

    const innerPath = `/${year}/${month}/${day}`;
    const dir = `${this.uploadDirectory}${innerPath}`;
    mkdirSync(dir, { recursive: true });

    const randomName = randomBytes(16).toString('hex');
    const filePath = `${dir}/${randomName}.${ext}`;
    writeFileSync(filePath, buffer);

    const publicPath = `${innerPath}/${randomName}.${ext}`;
    return (process.env.FRONTEND_URL || '') + '/uploads' + publicPath;
  }
}
