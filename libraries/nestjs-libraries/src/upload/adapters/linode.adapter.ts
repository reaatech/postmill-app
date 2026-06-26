import { StorageProviderType } from '@prisma/client';
import { S3Adapter } from './s3.adapter';

export class LinodeAdapter extends S3Adapter {
  override get type(): StorageProviderType {
    return StorageProviderType.LINODE;
  }

  constructor(
    region: string,
    credentials: { accessKeyId: string; secretAccessKey: string },
    bucket: string,
    endpoint?: string,
    publicUrl?: string
  ) {
    const resolvedRegion = region || 'us-east-1';
    const resolvedEndpoint =
      endpoint || `https://${resolvedRegion}.linodeobjects.com`;
    super(resolvedRegion, credentials, bucket, resolvedEndpoint, publicUrl);
  }
}
