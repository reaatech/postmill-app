import { StorageProviderType } from '@prisma/client';
import { S3Adapter } from './s3.adapter';

export class WasabiAdapter extends S3Adapter {
  override get type(): StorageProviderType {
    return StorageProviderType.WASABI;
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
      endpoint || `https://s3.${resolvedRegion}.wasabisys.com`;
    super(resolvedRegion, credentials, bucket, resolvedEndpoint, publicUrl);
  }
}
