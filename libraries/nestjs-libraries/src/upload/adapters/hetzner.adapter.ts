import { StorageProviderType } from '@prisma/client';
import { S3Adapter } from './s3.adapter';

export class HetznerAdapter extends S3Adapter {
  override get type(): StorageProviderType {
    return StorageProviderType.HETZNER;
  }

  constructor(
    region: string,
    credentials: { accessKeyId: string; secretAccessKey: string },
    bucket: string,
    endpoint?: string,
    publicUrl?: string
  ) {
    const resolvedRegion = region || 'fsn1';
    const resolvedEndpoint =
      endpoint || `https://${resolvedRegion}.your-objectstorage.com`;
    super(resolvedRegion, credentials, bucket, resolvedEndpoint, publicUrl);
  }
}
