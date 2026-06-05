import { Injectable } from '@nestjs/common';
import { ProviderConfigRepository } from './provider-config.repository';
import { AuthService } from '@gitroom/helpers/auth/auth.service';
import { ProviderConfiguration } from '@prisma/client';

@Injectable()
export class ProviderConfigService {
  constructor(private _repository: ProviderConfigRepository) {}

  getAll() {
    return this._repository.getAll();
  }

  getByIdentifier(identifier: string) {
    return this._repository.getByIdentifier(identifier);
  }

  getEnabled() {
    return this._repository.getEnabled();
  }

  async upsert(
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
    const encryptedClientId =
      data.clientId !== undefined && data.clientId !== null && data.clientId !== ''
        ? AuthService.fixedEncryption(data.clientId)
        : (data.clientId === null || data.clientId === '') ? null : undefined;
    const encryptedClientSecret =
      data.clientSecret !== undefined && data.clientSecret !== null && data.clientSecret !== ''
        ? AuthService.fixedEncryption(data.clientSecret)
        : (data.clientSecret === null || data.clientSecret === '') ? null : undefined;

    return this._repository.upsert(identifier, {
      ...data,
      clientId: encryptedClientId,
      clientSecret: encryptedClientSecret,
    });
  }

  delete(identifier: string) {
    return this._repository.delete(identifier);
  }

  decryptConfig(config: ProviderConfiguration): {
    clientId?: string;
    clientSecret?: string;
  } {
    return {
      clientId: config.clientId
        ? AuthService.fixedDecryption(config.clientId)
        : undefined,
      clientSecret: config.clientSecret
        ? AuthService.fixedDecryption(config.clientSecret)
        : undefined,
    };
  }
}
