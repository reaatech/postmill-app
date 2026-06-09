import { StorageProviderType } from '@prisma/client';
import { S3Adapter } from './s3.adapter';

export class IdriveE2Adapter extends S3Adapter {
  override get type(): StorageProviderType {
    return StorageProviderType.IDRIVE_E2;
  }

  constructor(
    region: string,
    credentials: { accessKeyId: string; secretAccessKey: string },
    bucket: string,
    endpoint?: string,
    publicUrl?: string
  ) {
    const resolvedEndpoint =
      endpoint || `https://${region}.cloudstorage.ide.com`;
    super(region, credentials, bucket, resolvedEndpoint, publicUrl);
  }
}
