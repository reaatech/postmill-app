import { Injectable } from '@nestjs/common';
import { ErrorsRepository } from '@gitroom/nestjs-libraries/database/prisma/errors/errors.repository';

@Injectable()
export class ErrorsService {
  constructor(private _errorsRepository: ErrorsRepository) {}

  listErrors(params: {
    page?: number;
    limit?: number;
    platform?: string;
    email?: string;
    unknownFirst?: boolean;
  }) {
    return this._errorsRepository.listErrors(params);
  }

  listPlatforms() {
    return this._errorsRepository.listPlatforms();
  }

  getError(id: string) {
    return this._errorsRepository.getError(id);
  }

  // Resolve = dismiss the error from the admin log (it's been handled/acknowledged).
  resolveError(id: string) {
    return this._errorsRepository.deleteError(id);
  }
}
