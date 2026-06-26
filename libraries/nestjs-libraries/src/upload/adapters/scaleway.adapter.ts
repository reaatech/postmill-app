import { StorageProviderType } from '@prisma/client';
import { S3Adapter } from './s3.adapter';

export class ScalewayAdapter extends S3Adapter {
  override get type(): StorageProviderType {
    return StorageProviderType.SCALEWAY;
  }

  constructor(
    region: string,
    credentials: { accessKeyId: string; secretAccessKey: string },
    bucket: string,
    endpoint?: string,
    publicUrl?: string
  ) {
    const resolvedRegion = region || 'fr-par';
    const resolvedEndpoint =
      endpoint || `https://s3.${resolvedRegion}.scw.cloud`;
    super(resolvedRegion, credentials, bucket, resolvedEndpoint, publicUrl);
  }
}
