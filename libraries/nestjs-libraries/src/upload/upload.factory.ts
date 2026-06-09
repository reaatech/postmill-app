import { IUploadProvider } from './upload.interface';
import { StorageAdapterFactory } from './adapters/adapter.factory';

export class UploadFactory {
  static createStorage(): IUploadProvider {
    const storageProvider = process.env.STORAGE_PROVIDER || 'local';

    console.warn(
      '[DEPRECATED] UploadFactory.createStorage() is deprecated. Use StorageAdapterFactory.createFromConfig() or StorageService instead.'
    );

    switch (storageProvider) {
      case 'local':
        return StorageAdapterFactory.createLocal();
      case 'cloudflare':
        return StorageAdapterFactory.createFromConfig({
          type: 'CLOUDFLARE_R2',
          credentials: JSON.stringify({
            accessKeyId: process.env.CLOUDFLARE_ACCESS_KEY!,
            secretAccessKey: process.env.CLOUDFLARE_SECRET_ACCESS_KEY!,
          }),
          bucket: process.env.CLOUDFLARE_BUCKETNAME!,
          endpoint: `https://${process.env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`,
          publicUrl: process.env.CLOUDFLARE_BUCKET_URL!,
          name: 'Legacy Cloudflare',
          region: process.env.CLOUDFLARE_REGION || 'auto',
          mounted: true,
          id: 'legacy',
          organizationId: '',
          quotaBytes: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          folders: [],
        } as any);
      default:
        throw new Error(`Invalid storage type ${storageProvider}`);
    }
  }
}
