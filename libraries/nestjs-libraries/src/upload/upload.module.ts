import { Global, Module } from '@nestjs/common';
import { CustomFileValidationPipe } from '@gitroom/nestjs-libraries/upload/custom.upload.validation';
import { StorageAdapterFactory } from './adapters/adapter.factory';
import { StorageService } from '@gitroom/nestjs-libraries/database/prisma/storage/storage.service';
import { StorageRepository } from '@gitroom/nestjs-libraries/database/prisma/storage/storage.repository';

@Global()
@Module({
  providers: [
    CustomFileValidationPipe,
    StorageAdapterFactory,
    StorageService,
    StorageRepository,
  ],
  exports: [
    CustomFileValidationPipe,
    StorageAdapterFactory,
    StorageService,
    StorageRepository,
  ],
})
export class UploadModule {}
