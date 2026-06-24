import {
  BadRequestException,
  Injectable,
  PipeTransform,
} from '@nestjs/common';
import { fromBuffer, fromFile } from './file-type.compat';
import { statSync } from 'fs';
import { promises as fs } from 'fs';

const ALLOWED_MIME_TYPES = new Set<string>([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/avif',
  'image/bmp',
  'image/tiff',
  'video/mp4',
]);

@Injectable()
export class CustomFileValidationPipe implements PipeTransform {
  async transform(value: any) {
    try {
      if (!value || typeof value !== 'object') {
        return value;
      }

      // Skip non-file parameters (org, body, query, etc.)
      if (!('buffer' in value) && !('mimetype' in value) && !('fieldname' in value)) {
        return value;
      }

      const detected = value.buffer && Buffer.isBuffer(value.buffer)
        ? await fromBuffer(value.buffer)
        : value.path
          ? await fromFile(value.path)
          : null;

      if (!detected) {
        throw new BadRequestException('Invalid file upload.');
      }
      if (!detected || !ALLOWED_MIME_TYPES.has(detected.mime)) {
        throw new BadRequestException('Unsupported file type.');
      }

      if (!value.size && value.path) {
        try { value.size = statSync(value.path).size; } catch {}
      }

      const maxSize = this.getMaxSize(detected.mime);
      if (value.size > maxSize) {
        throw new BadRequestException(
          `File size exceeds the maximum allowed size of ${maxSize} bytes.`
        );
      }

      value.mimetype = detected.mime;
      const safeBase = (value.originalname || 'upload')
        .replace(/\.[^./\\]*$/, '')
        .replace(/[\\/]/g, '_')
        .slice(0, 100) || 'upload';
      value.originalname = `${safeBase}.${detected.ext}`;

      return value;
    } catch (e) {
      if (value?.path) { try { await fs.unlink(value.path); } catch {} }
      throw e;
    }
  }

  private getMaxSize(mimeType: string): number {
    if (mimeType.startsWith('image/')) {
      return 10 * 1024 * 1024; // 10 MB
    } else if (mimeType.startsWith('video/')) {
      return 1024 * 1024 * 1024; // 1 GB
    } else {
      throw new BadRequestException('Unsupported file type.');
    }
  }
}
