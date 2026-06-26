import { StorageProviderType } from '@prisma/client';
import { S3Adapter } from './s3.adapter';

export class StorjAdapter extends S3Adapter {
  override get type(): StorageProviderType {
    return StorageProviderType.STORJ;
  }

  constructor(
    region: string,
    credentials: { accessKeyId: string; secretAccessKey: string },
    bucket: string,
    endpoint?: string,
    publicUrl?: string
  ) {
    // Storj's S3-compatible gateway is a single global host; the region is a
    // placeholder the gateway ignores.
    const resolvedRegion = region || 'us-1';
    const resolvedEndpoint = endpoint || 'https://gateway.storjshare.io';
    super(resolvedRegion, credentials, bucket, resolvedEndpoint, publicUrl);
  }
}
