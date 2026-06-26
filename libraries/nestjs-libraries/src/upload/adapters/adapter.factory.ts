import { StorageProviderConfig, StorageProviderType } from '@prisma/client';
import { IStorageAdapter } from '../upload.interface';
import { LocalAdapter } from './local.adapter';
import { S3Adapter } from './s3.adapter';
import { R2Adapter } from './r2.adapter';
import { B2Adapter } from './b2.adapter';
import { IdriveE2Adapter } from './idrive-e2.adapter';
import { WasabiAdapter } from './wasabi.adapter';
import { DigitalOceanSpacesAdapter } from './digitalocean.adapter';
import { HetznerAdapter } from './hetzner.adapter';
import { StorjAdapter } from './storj.adapter';
import { ScalewayAdapter } from './scaleway.adapter';
import { VultrAdapter } from './vultr.adapter';
import { LinodeAdapter } from './linode.adapter';
import { S3CompatibleAdapter } from './s3-compatible.adapter';

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
  WASABI: [
    { key: 'accessKeyId', label: 'Access Key ID' },
    { key: 'secretAccessKey', label: 'Secret Access Key' },
  ],
  DIGITALOCEAN_SPACES: [
    { key: 'accessKeyId', label: 'Access Key ID' },
    { key: 'secretAccessKey', label: 'Secret Access Key' },
  ],
  HETZNER: [
    { key: 'accessKeyId', label: 'Access Key ID' },
    { key: 'secretAccessKey', label: 'Secret Access Key' },
  ],
  STORJ: [
    { key: 'accessKeyId', label: 'Access Key ID' },
    { key: 'secretAccessKey', label: 'Secret Access Key' },
  ],
  SCALEWAY: [
    { key: 'accessKeyId', label: 'Access Key ID' },
    { key: 'secretAccessKey', label: 'Secret Access Key' },
  ],
  VULTR: [
    { key: 'accessKeyId', label: 'Access Key ID' },
    { key: 'secretAccessKey', label: 'Secret Access Key' },
  ],
  LINODE: [
    { key: 'accessKeyId', label: 'Access Key ID' },
    { key: 'secretAccessKey', label: 'Secret Access Key' },
  ],
  S3_COMPATIBLE: [
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
          process.env.UPLOAD_DIRECTORY || './uploads',
          config.organizationId
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
      case 'WASABI':
        return new WasabiAdapter(
          config.region!,
          creds,
          config.bucket!,
          config.endpoint || undefined,
          config.publicUrl || undefined
        );
      case 'DIGITALOCEAN_SPACES':
        return new DigitalOceanSpacesAdapter(
          config.region!,
          creds,
          config.bucket!,
          config.endpoint || undefined,
          config.publicUrl || undefined
        );
      case 'HETZNER':
        return new HetznerAdapter(
          config.region!,
          creds,
          config.bucket!,
          config.endpoint || undefined,
          config.publicUrl || undefined
        );
      case 'STORJ':
        return new StorjAdapter(
          config.region!,
          creds,
          config.bucket!,
          config.endpoint || undefined,
          config.publicUrl || undefined
        );
      case 'SCALEWAY':
        return new ScalewayAdapter(
          config.region!,
          creds,
          config.bucket!,
          config.endpoint || undefined,
          config.publicUrl || undefined
        );
      case 'VULTR':
        return new VultrAdapter(
          config.region!,
          creds,
          config.bucket!,
          config.endpoint || undefined,
          config.publicUrl || undefined
        );
      case 'LINODE':
        return new LinodeAdapter(
          config.region!,
          creds,
          config.bucket!,
          config.endpoint || undefined,
          config.publicUrl || undefined
        );
      case 'S3_COMPATIBLE':
        return new S3CompatibleAdapter(
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

  static createLocal(tenantId?: string): IStorageAdapter {
    return new LocalAdapter(
      process.env.UPLOAD_DIRECTORY || './uploads',
      tenantId
    );
  }
}
