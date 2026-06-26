import { StorageProviderType } from '@prisma/client';
import { S3Adapter } from './s3.adapter';

export class DigitalOceanSpacesAdapter extends S3Adapter {
  override get type(): StorageProviderType {
    return StorageProviderType.DIGITALOCEAN_SPACES;
  }

  constructor(
    region: string,
    credentials: { accessKeyId: string; secretAccessKey: string },
    bucket: string,
    endpoint?: string,
    publicUrl?: string
  ) {
    const resolvedRegion = region || 'nyc3';
    const resolvedEndpoint =
      endpoint || `https://${resolvedRegion}.digitaloceanspaces.com`;
    super(resolvedRegion, credentials, bucket, resolvedEndpoint, publicUrl);
  }
}
