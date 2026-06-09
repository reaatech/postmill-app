import { Global, Module } from '@nestjs/common';
import { UploadFactory } from './upload.factory';
import { CustomFileValidationPipe } from '@gitroom/nestjs-libraries/upload/custom.upload.validation';
import { StorageAdapterFactory } from './adapters/adapter.factory';
import { StorageService } from '@gitroom/nestjs-libraries/database/prisma/storage/storage.service';
import { StorageRepository } from '@gitroom/nestjs-libraries/database/prisma/storage/storage.repository';

@Global()
@Module({
  providers: [
    UploadFactory,
    CustomFileValidationPipe,
    StorageAdapterFactory,
    StorageService,
    StorageRepository,
  ],
  exports: [
    UploadFactory,
    CustomFileValidationPipe,
    StorageAdapterFactory,
    StorageService,
    StorageRepository,
  ],
})
export class UploadModule {}
