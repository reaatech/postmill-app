import { StorageProviderConfig, StorageProviderType } from '@prisma/client';
import { IStorageAdapter } from '../upload.interface';
import { LocalAdapter } from './local.adapter';
import { S3Adapter } from './s3.adapter';
import { R2Adapter } from './r2.adapter';
import { B2Adapter } from './b2.adapter';
import { IdriveE2Adapter } from './idrive-e2.adapter';

const CREDENTIAL_SCHEMAS: Record<StorageProviderType, { key: string; label: string }[]> = {
  LOCAL: [],
  S3: [
    { key: 'accessKeyId', label: 'Access Key ID' },
    { key: 'secretAccessKey', label: 'Secret Access Key' },
  ],
  CLOUDFLARE_R2: [
    { key: 'accessKeyId', label: 'Access Key ID' },
    { key: 'secretAccessKey', label: 'Secret Access Key' },
  ],
  BACKBLAZE_B2: [
    { key: 'keyId', label: 'Key ID' },
    { key: 'applicationKey', label: 'Application Key' },
  ],
  IDRIVE_E2: [
    { key: 'accessKeyId', label: 'Access Key ID' },
    { key: 'secretAccessKey', label: 'Secret Access Key' },
  ],
};

function validateCredentials(type: StorageProviderType, creds: Record<string, string>): void {
  const schema = CREDENTIAL_SCHEMAS[type];
  if (!schema) return;
  for (const field of schema) {
    const value = creds[field.key];
    if (!value || typeof value !== 'string' || value.trim().length === 0) {
      throw new Error(
        `Missing or invalid credential "${field.label}" (${field.key}) for ${type}`
      );
    }
  }
}

export class StorageAdapterFactory {
  static createFromConfig(config: StorageProviderConfig): IStorageAdapter {
    const creds = config.credentials
      ? (typeof config.credentials === 'string'
          ? JSON.parse(config.credentials)
          : config.credentials)
      : {};

    if (config.type !== 'LOCAL') {
      validateCredentials(config.type, creds);
    }

    switch (config.type) {
      case 'LOCAL':
        return new LocalAdapter(
          process.env.UPLOAD_DIRECTORY || './uploads'
        );
      case 'S3':
        return new S3Adapter(
          config.region!,
          creds,
          config.bucket!,
          config.endpoint || undefined,
          config.publicUrl || undefined
        );
      case 'CLOUDFLARE_R2':
        return new R2Adapter(
          creds,
          config.bucket!,
          config.endpoint || undefined,
          config.publicUrl || undefined
        );
      case 'BACKBLAZE_B2':
        return new B2Adapter(
          config.region!,
          creds,
          config.bucket!,
          config.endpoint || undefined,
          config.publicUrl || undefined
        );
      case 'IDRIVE_E2':
        return new IdriveE2Adapter(
          config.region!,
          creds,
          config.bucket!,
          config.endpoint || undefined,
          config.publicUrl || undefined
        );
      default:
        throw new Error(`Unknown storage type: ${config.type}`);
    }
  }

  static createLocal(): IStorageAdapter {
    return new LocalAdapter(
      process.env.UPLOAD_DIRECTORY || './uploads'
    );
  }
}
