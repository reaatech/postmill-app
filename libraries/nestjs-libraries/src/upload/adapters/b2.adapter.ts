import { StorageProviderType } from '@prisma/client';
import { S3Adapter } from './s3.adapter';

export class B2Adapter extends S3Adapter {
  override get type(): StorageProviderType {
    return StorageProviderType.BACKBLAZE_B2;
  }

  constructor(
    region: string,
    credentials: { accessKeyId: string; secretAccessKey: string },
    bucket: string,
    endpoint?: string,
    publicUrl?: string
  ) {
    const resolvedEndpoint =
      endpoint || `https://s3.${region}.backblazeb2.com`;
    super(region, credentials, bucket, resolvedEndpoint, publicUrl);
  }
}
