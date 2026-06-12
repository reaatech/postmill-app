import { PrismaRepository } from '@gitroom/nestjs-libraries/database/prisma/prisma.service';
import { Injectable } from '@nestjs/common';
import { Provider } from '@prisma/client';

@Injectable()
export class AuthProviderRepository {
  constructor(
    private _authProviderConfig: PrismaRepository<'authProviderConfig'>
  ) {}

  list() {
    return this._authProviderConfig.model.authProviderConfig.findMany({
      orderBy: { provider: 'asc' },
    });
  }

  findByProvider(provider: Provider) {
    return this._authProviderConfig.model.authProviderConfig.findUnique({
      where: { provider },
    });
  }

  upsert(provider: Provider, data: {
    enabled?: boolean;
    clientId?: string;
    clientSecret?: string;
    authUrl?: string;
    tokenUrl?: string;
    userInfoUrl?: string;
    scopes?: string;
    displayName?: string;
  }) {
    return this._authProviderConfig.model.authProviderConfig.upsert({
      where: { provider },
      create: { provider, ...data },
      update: data,
    });
  }

  delete(provider: Provider) {
    return this._authProviderConfig.model.authProviderConfig.delete({
      where: { provider },
    });
  }
}
