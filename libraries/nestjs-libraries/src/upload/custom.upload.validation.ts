import {
  BadRequestException,
  Injectable,
  PipeTransform,
} from '@nestjs/common';
import { fromBuffer, fromFile } from './file-type.compat';
import { statSync } from 'fs';
import { promises as fs } from 'fs';
import { resolve, sep } from 'path';
import { tmpdir } from 'os';
import {
  checkUploadLimit,
  UPLOAD_ALLOWED_MIME_TYPES,
} from './upload-limits';

const ALLOWED_MIME_TYPES = UPLOAD_ALLOWED_MIME_TYPES;

const isInsideTmp = (p: string) => {
  const r = resolve(p);
  return r === resolve(tmpdir()) || r.startsWith(resolve(tmpdir()) + sep);
};

@Injectable()
export class CustomFileValidationPipe implements PipeTransform {
  async transform(value: any) {
    try {
      if (!value || typeof value !== 'object') {
        throw new BadRequestException('Invalid file upload.');
      }

      // Skip non-file parameters (org, body, query, etc.)
      if (!('buffer' in value) && !('mimetype' in value) && !('fieldname' in value)) {
        throw new BadRequestException('Invalid file upload.');
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

      if (!value.size && value.path && isInsideTmp(value.path)) {
        try { value.size = statSync(value.path).size; } catch {}
      }

      const limitCheck = checkUploadLimit(
        { size: value.size, mimetype: detected.mime },
      );
      if (!limitCheck.ok) {
        throw new BadRequestException(limitCheck.reason);
      }

      value.mimetype = detected.mime;
      const safeBase = (value.originalname || 'upload')
        .replace(/\.[^./\\]*$/, '')
        .replace(/[\\/]/g, '_')
        .slice(0, 100) || 'upload';
      value.originalname = `${safeBase}.${detected.ext}`;

      return value;
    } catch (e) {
      if (value?.path && isInsideTmp(value.path)) { try { await fs.unlink(value.path); } catch {} }
      throw e;
    }
  }
}
