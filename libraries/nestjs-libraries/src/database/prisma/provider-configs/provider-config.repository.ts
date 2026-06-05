import { PrismaRepository } from '@gitroom/nestjs-libraries/database/prisma/prisma.service';
import { Injectable } from '@nestjs/common';

@Injectable()
export class ProviderConfigRepository {
  constructor(
    private _providerConfig: PrismaRepository<'providerConfiguration'>
  ) {}

  getAll() {
    return this._providerConfig.model.providerConfiguration.findMany({
      orderBy: { name: 'asc' },
    });
  }

  getByIdentifier(identifier: string) {
    return this._providerConfig.model.providerConfiguration.findUnique({
      where: { identifier },
    });
  }

  getEnabled() {
    return this._providerConfig.model.providerConfiguration.findMany({
      where: { enabled: true },
      orderBy: { name: 'asc' },
    });
  }

  upsert(
    identifier: string,
    data: {
      name: string;
      enabled: boolean;
      clientId?: string;
      clientSecret?: string;
      redirectUri?: string;
      scopes?: string;
      additionalConfig?: string;
      setupInstructions?: string;
    }
  ) {
    return this._providerConfig.model.providerConfiguration.upsert({
      where: { identifier },
      create: {
        identifier,
        ...data,
      },
      update: data,
    });
  }

  delete(identifier: string) {
    return this._providerConfig.model.providerConfiguration.delete({
      where: { identifier },
    });
  }

  setEnabled(identifier: string, enabled: boolean) {
    return this._providerConfig.model.providerConfiguration.update({
      where: { identifier },
      data: { enabled },
    });
  }
}
