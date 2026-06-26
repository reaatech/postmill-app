import { StorageProviderType } from '@prisma/client';
import { S3Adapter } from './s3.adapter';

export class S3CompatibleAdapter extends S3Adapter {
  override get type(): StorageProviderType {
    return StorageProviderType.S3_COMPATIBLE;
  }

  constructor(
    region: string,
    credentials: { accessKeyId: string; secretAccessKey: string },
    bucket: string,
    endpoint?: string,
    publicUrl?: string
  ) {
    if (!endpoint) {
      throw new Error(
        'A generic S3-compatible provider requires a custom endpoint URL ' +
          '(e.g. https://s3.example.com).'
      );
    }
    const resolvedRegion = region || 'us-east-1';
    super(resolvedRegion, credentials, bucket, endpoint, publicUrl);
  }
}
