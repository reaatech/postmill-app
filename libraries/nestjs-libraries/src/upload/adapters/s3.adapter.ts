import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
  HeadBucketCommand,
} from '@aws-sdk/client-s3';
import { StorageProviderType } from '@prisma/client';
import { IStorageAdapter, StorageFileEntry } from '../upload.interface';
import { randomBytes } from 'crypto';
import { safeFetch } from '@gitroom/nestjs-libraries/dtos/webhooks/safe.fetch';
import { parseDataUrl } from '@gitroom/nestjs-libraries/upload/data.url';
import { fromBuffer } from '@gitroom/nestjs-libraries/upload/file-type.compat';

const ALLOWED_MIME_TYPES = new Set<string>([
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
  'font/ttf',
  'font/otf',
  'font/woff2',
]);

export class S3Adapter implements IStorageAdapter {
  get type(): StorageProviderType {
    return StorageProviderType.S3;
  }
  private client: S3Client;

  constructor(
    private region: string,
    private credentials: { accessKeyId: string; secretAccessKey: string },
    private bucket: string,
    private endpoint?: string,
    private publicUrl?: string
  ) {
    this.client = new S3Client({
      region,
      credentials: {
        accessKeyId: credentials.accessKeyId,
        secretAccessKey: credentials.secretAccessKey,
      },
      endpoint,
      requestChecksumCalculation: 'WHEN_REQUIRED',
    });
  }

  async testConnection(): Promise<{ ok: boolean; error?: string }> {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
      return { ok: true };
    } catch (err: any) {
      return { ok: false, error: err.message || 'Connection failed' };
    }
  }

  async listFiles(prefix?: string): Promise<StorageFileEntry[]> {
    const entries: StorageFileEntry[] = [];
    let continuationToken: string | undefined;

    do {
      const response = await this.client.send(
        new ListObjectsV2Command({
          Bucket: this.bucket,
          Prefix: prefix,
          ContinuationToken: continuationToken,
        })
      );

      if (response.Contents) {
        for (const obj of response.Contents) {
          if (obj.Key && !obj.Key.endsWith('/')) {
            entries.push({
              key: obj.Key,
              name: obj.Key.split('/').pop() || obj.Key,
              size: obj.Size || 0,
              mimeType: '',
              lastModified: obj.LastModified || new Date(),
            });
          }
        }
      }

      continuationToken = response.NextContinuationToken;
    } while (continuationToken);

    return entries;
  }

  getFileUrl(key: string): string {
    if (this.publicUrl) {
      return `${this.publicUrl}/${key}`;
    }
    return `https://${this.bucket}.s3.${this.region}.amazonaws.com/${key}`;
  }

  async deleteFile(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: key,
      })
    );
  }

  async getUsageBytes(): Promise<bigint | null> {
    try {
      let total = BigInt(0);
      let continuationToken: string | undefined;

      do {
        const response = await this.client.send(
          new ListObjectsV2Command({
            Bucket: this.bucket,
            ContinuationToken: continuationToken,
          })
        );

        if (response.Contents) {
          for (const obj of response.Contents) {
            if (obj.Size) {
              total += BigInt(obj.Size);
            }
          }
        }

        continuationToken = response.NextContinuationToken;
      } while (continuationToken);

      return total;
    } catch {
      return null;
    }
  }

  async uploadSimple(path: string): Promise<string> {
    const dataUrl = path.startsWith('data:') ? parseDataUrl(path) : null;

    let body: Buffer;
    if (dataUrl) {
      body = dataUrl.buffer;
    } else {
      const loadImage = await safeFetch(path);
      body = Buffer.from(await loadImage.arrayBuffer());
    }

    const detected = await fromBuffer(body);
    if (!detected || !ALLOWED_MIME_TYPES.has(detected.mime)) {
      throw new Error('Unsupported file type.');
    }
    const extension = detected.ext;
    const safeContentType = detected.mime;
    const id = randomBytes(8).toString('hex');

    const key = `${id}.${extension}`;

    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: safeContentType,
      })
    );

    return this.getFileUrl(key);
  }

  async uploadFile(file: Express.Multer.File): Promise<any> {
    try {
      const detected = await fromBuffer(file.buffer);
      if (!detected || !ALLOWED_MIME_TYPES.has(detected.mime)) {
        throw new Error('Unsupported file type.');
      }
      const id = randomBytes(8).toString('hex');
      const extension = detected.ext;
      const safeContentType = detected.mime;
      const key = `${id}.${extension}`;

      await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: file.buffer,
          ContentType: safeContentType,
        })
      );

      return {
        filename: `${id}.${extension}`,
        mimetype: safeContentType,
        size: file.size,
        buffer: file.buffer,
        originalname: `${id}.${extension}`,
        fieldname: 'file',
        path: this.getFileUrl(key),
        destination: this.getFileUrl(key),
        encoding: '7bit',
        stream: file.buffer as any,
      };
    } catch (err) {
      console.error('Error uploading file to S3:', err);
      throw err;
    }
  }

  async removeFile(filePath: string): Promise<void> {
    const key = filePath.split('/').pop();
    if (!key) return;
    await this.deleteFile(key);
  }

  async readFile(pathOrKey: string): Promise<Buffer> {
    const key = pathOrKey.includes('/') ? pathOrKey.split('/').pop() : pathOrKey;
    if (!key) throw new Error('Invalid object key');
    const response = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key })
    );
    const byteArray = await response.Body!.transformToByteArray();
    return Buffer.from(byteArray);
  }

  async writeBuffer(buffer: Buffer, contentType?: string): Promise<string> {
    const detected = await fromBuffer(buffer);
    const ext = detected?.ext || 'bin';
    const mime = detected?.mime || contentType || 'application/octet-stream';
    const id = randomBytes(8).toString('hex');
    const key = `${id}.${ext}`;

    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: buffer,
        ContentType: mime,
      })
    );

    return this.getFileUrl(key);
  }
}
