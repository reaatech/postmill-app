import { StorageProviderType } from '@prisma/client';
import { S3Adapter } from './s3.adapter';

export class VultrAdapter extends S3Adapter {
  override get type(): StorageProviderType {
    return StorageProviderType.VULTR;
  }

  constructor(
    region: string,
    credentials: { accessKeyId: string; secretAccessKey: string },
    bucket: string,
    endpoint?: string,
    publicUrl?: string
  ) {
    const resolvedRegion = region || 'ewr1';
    const resolvedEndpoint =
      endpoint || `https://${resolvedRegion}.vultrobjects.com`;
    super(resolvedRegion, credentials, bucket, resolvedEndpoint, publicUrl);
  }
}
