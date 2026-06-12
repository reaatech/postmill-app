import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { GetUserFromRequest } from '@gitroom/nestjs-libraries/user/user.from.request';
import { Provider, User } from '@prisma/client';
import { AuthProviderRepository } from '@gitroom/nestjs-libraries/database/prisma/auth-providers/auth-provider.repository';
import { EncryptionService } from '@gitroom/nestjs-libraries/encryption/encryption.service';
import { UpsertAuthProviderDto } from '@gitroom/nestjs-libraries/dtos/auth/upsert-auth-provider.dto';
import { Throttle } from '@nestjs/throttler';
import { OrgRbacGuard } from '@gitroom/backend/services/auth/rbac/org-rbac.guard';

@ApiTags('Admin')
@Controller('/admin')
@UseGuards(OrgRbacGuard)
export class AdminController {
  constructor(
    private _authProviderRepo: AuthProviderRepository,
    private _encryptionService: EncryptionService
  ) {}

  private assertSuperAdmin(user: User) {
    if (!user?.isSuperAdmin) {
      throw new ForbiddenException('Forbidden');
    }
  }

  @Get('/auth-providers')
  async listAuthProviders(@GetUserFromRequest() user: User) {
    this.assertSuperAdmin(user);
    const configs = await this._authProviderRepo.list();

    return configs.map((c) => ({
      ...c,
      clientId: c.clientId ? '[ENCRYPTED]' : null,
      clientSecret: c.clientSecret ? '[ENCRYPTED]' : null,
    }));
  }

  @Post('/auth-providers')
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  async upsertAuthProvider(
    @GetUserFromRequest() user: User,
    @Body() body: UpsertAuthProviderDto
  ) {
    this.assertSuperAdmin(user);

    const data: Parameters<AuthProviderRepository['upsert']>[1] = {};

    if (body.enabled !== undefined) data.enabled = body.enabled;
    if (body.clientId) data.clientId = this._encryptionService.encrypt(body.clientId);
    if (body.clientSecret) data.clientSecret = this._encryptionService.encrypt(body.clientSecret);
    if (body.authUrl !== undefined) data.authUrl = body.authUrl;
    if (body.tokenUrl !== undefined) data.tokenUrl = body.tokenUrl;
    if (body.userInfoUrl !== undefined) data.userInfoUrl = body.userInfoUrl;
    if (body.scopes !== undefined) data.scopes = body.scopes;
    if (body.displayName !== undefined) data.displayName = body.displayName;

    const config = await this._authProviderRepo.upsert(body.provider, data);

    return {
      ...config,
      clientId: '[ENCRYPTED]',
      clientSecret: '[ENCRYPTED]',
    };
  }

  @Delete('/auth-providers/:provider')
  async deleteAuthProvider(
    @GetUserFromRequest() user: User,
    @Param('provider') provider: string
  ) {
    this.assertSuperAdmin(user);
    await this._authProviderRepo.delete(provider as Provider);
    return { success: true };
  }
}
