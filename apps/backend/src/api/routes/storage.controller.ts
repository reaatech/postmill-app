import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  HttpException,
  Query,
  UseGuards,
  ForbiddenException,
} from '@nestjs/common';
import { GetOrgFromRequest } from '@gitroom/nestjs-libraries/user/org.from.request';
import { GetUserFromRequest } from '@gitroom/nestjs-libraries/user/user.from.request';
import { Organization, StorageProviderType, User } from '@prisma/client';
import { ApiTags } from '@nestjs/swagger';
import { StorageService } from '@gitroom/nestjs-libraries/database/prisma/storage/storage.service';
import { AuditService } from '@gitroom/nestjs-libraries/database/prisma/audit/audit.service';
import { CheckPolicies } from '@gitroom/backend/services/auth/permissions/permissions.ability';
import { AuthorizationActions, Sections } from '@gitroom/backend/services/auth/permissions/permission.exception.class';
import { OrgRbacGuard } from '@gitroom/backend/services/auth/rbac/org-rbac.guard';
import { RequirePermission } from '@gitroom/backend/services/auth/rbac/require-permission.decorator';

@ApiTags('Storage Settings')
@Controller('/settings/storage')
@UseGuards(OrgRbacGuard)
export class StorageController {
  constructor(
    private _storageService: StorageService,
    private _auditService: AuditService
  ) {}

  @Get('/')
  @RequirePermission('storage-config', 'manage')
  @CheckPolicies([AuthorizationActions.Create, Sections.ADMIN])
  async listProviders(@GetOrgFromRequest() org: Organization) {
    return this._storageService.getProviderConfigs(org.id);
  }

  @Post('/')
  @RequirePermission('storage-config', 'manage')
  @CheckPolicies([AuthorizationActions.Create, Sections.ADMIN])
  async createProvider(
    @GetOrgFromRequest() org: Organization,
    @GetUserFromRequest() user: User,
    @Body()
    body: {
      type: StorageProviderType;
      name: string;
      credentials?: Record<string, string>;
      region?: string;
      bucket?: string;
      endpoint?: string;
      publicUrl?: string;
      quotaBytes?: number;
      version?: string;
    }
  ) {
    const created = await this._storageService.createConfig(
      org.id,
      {
        type: body.type,
        name: body.name,
        credentials: body.credentials,
        region: body.region,
        bucket: body.bucket,
        endpoint: body.endpoint,
        publicUrl: body.publicUrl,
        quotaBytes:
          body.quotaBytes !== undefined ? BigInt(body.quotaBytes) : undefined,
        version: body.version,
      },
      user.id
    );

    const testResult = await this._storageService.testConnection(created.id, org.id);
    if (!testResult.ok) {
      await this._storageService.deleteConfig(created.id, org.id);
      throw new HttpException(
        `Connection test failed: ${testResult.error}`,
        400
      );
    }

    return this.#stripBigInts(created);
  }

  @Put('/:id')
  @RequirePermission('storage-config', 'manage')
  @CheckPolicies([AuthorizationActions.Create, Sections.ADMIN])
  async updateProvider(
    @GetOrgFromRequest() org: Organization,
    @GetUserFromRequest() user: User,
    @Param('id') id: string,
    @Body()
    body: {
      name?: string;
      credentials?: Record<string, string>;
      region?: string;
      bucket?: string;
      endpoint?: string;
      publicUrl?: string;
      quotaBytes?: number;
      version?: string;
    }
  ) {
    return this.#stripBigInts(
      await this._storageService.updateConfig(
        id,
        org.id,
        {
          name: body.name,
          credentials: body.credentials,
          region: body.region,
          bucket: body.bucket,
          endpoint: body.endpoint,
          publicUrl: body.publicUrl,
          quotaBytes:
            body.quotaBytes !== undefined ? BigInt(body.quotaBytes) : undefined,
          version: body.version,
        },
        user.id
      )
    );
  }

  @Delete('/:id')
  @RequirePermission('storage-config', 'manage')
  @CheckPolicies([AuthorizationActions.Create, Sections.ADMIN])
  async deleteProvider(
    @GetOrgFromRequest() org: Organization,
    @GetUserFromRequest() user: User,
    @Param('id') id: string
  ) {
    await this._storageService.deleteConfig(id, org.id, user.id);
    return { success: true };
  }

  @Post('/:id/test')
  @RequirePermission('storage-config', 'manage')
  @CheckPolicies([AuthorizationActions.Create, Sections.ADMIN])
  async testConnection(
    @GetOrgFromRequest() org: Organization,
    @Param('id') id: string
  ) {
    return this._storageService.testConnection(id, org.id);
  }

  @Post('/:id/mount')
  @RequirePermission('storage-config', 'manage')
  @CheckPolicies([AuthorizationActions.Create, Sections.ADMIN])
  async mountProvider(
    @GetOrgFromRequest() org: Organization,
    @Param('id') id: string
  ) {
    return this.#stripBigInts(
      await this._storageService.mount(id, org.id)
    );
  }

  @Post('/:id/unmount')
  @RequirePermission('storage-config', 'manage')
  @CheckPolicies([AuthorizationActions.Create, Sections.ADMIN])
  async unmountProvider(
    @GetOrgFromRequest() org: Organization,
    @Param('id') id: string
  ) {
    return this.#stripBigInts(
      await this._storageService.unmount(id, org.id)
    );
  }

  @Get('/:sourceId/migrate-preview')
  @RequirePermission('storage-config', 'manage')
  @CheckPolicies([AuthorizationActions.Create, Sections.ADMIN])
  async migratePreview(
    @GetOrgFromRequest() org: Organization,
    @Param('sourceId') sourceId: string
  ) {
    return this._storageService.getMigrationPreview(sourceId, org.id);
  }

  @Post('/:sourceId/migrate/:targetId')
  @RequirePermission('storage-config', 'manage')
  @CheckPolicies([AuthorizationActions.Create, Sections.ADMIN])
  async migrateStorage(
    @GetOrgFromRequest() org: Organization,
    @Param('sourceId') sourceId: string,
    @Param('targetId') targetId: string,
    @Body() body: { cursor?: string; limit?: number }
  ) {
    const limit = body?.limit
      ? Math.min(100, Math.max(1, Math.floor(body.limit)))
      : 25;
    return this._storageService.migrate(
      sourceId,
      targetId,
      org.id,
      body?.cursor,
      limit
    );
  }

  @Get('/usage')
  @RequirePermission('storage-config', 'manage')
  @CheckPolicies([AuthorizationActions.Create, Sections.ADMIN])
  async getUsage(@GetOrgFromRequest() org: Organization) {
    const usage = await this._storageService.getUsage(org.id);
    return {
      totalBytes: Number(usage.totalBytes),
      quotaBytes: Number(usage.quotaBytes),
      providers: usage.providers.map((p) => ({
        ...p,
        usageBytes: p.usageBytes !== null ? Number(p.usageBytes) : null,
      })),
    };
  }

  @Get('/quota-status')
  @RequirePermission('storage-config', 'manage')
  @CheckPolicies([AuthorizationActions.Create, Sections.ADMIN])
  async getQuotaStatus(@GetOrgFromRequest() org: Organization) {
    const status = await this._storageService.getQuotaStatus(org.id);
    return {
      usedBytes: Number(status.usedBytes),
      quotaBytes: Number(status.quotaBytes),
      percentUsed: status.percentUsed,
      warning: status.warning,
    };
  }

  @Put('/quota/:orgId')
  async setOrgQuota(
    @GetUserFromRequest() user: User,
    @Param('orgId') orgId: string,
    @Body() body: { quotaBytes: number }
  ) {
    if (!user.isSuperAdmin) {
      throw new ForbiddenException('Super-admin required');
    }
    await this._storageService.setOrgQuota(orgId, BigInt(body.quotaBytes));
    return { orgId, quotaBytes: body.quotaBytes };
  }

  @Get('/usage-breakdown')
  @RequirePermission('storage-config', 'manage')
  @CheckPolicies([AuthorizationActions.Create, Sections.ADMIN])
  async getUsageBreakdown(@GetOrgFromRequest() org: Organization) {
    const breakdown = await this._storageService.getUsageBreakdown(org.id);
    return {
      byFolder: breakdown.byFolder.map((f) => ({
        ...f,
        totalBytes: Number(f.totalBytes),
      })),
      byProvider: breakdown.byProvider.map((p) => ({
        ...p,
        totalBytes: Number(p.totalBytes),
      })),
    };
  }

  @Get('/audit-log')
  @RequirePermission('storage-config', 'manage')
  @CheckPolicies([AuthorizationActions.Create, Sections.ADMIN])
  async getAuditLog(
    @GetOrgFromRequest() org: Organization,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string
  ) {
    const logs = await this._auditService.findByOrg(org.id, {
      limit: limit ? Math.min(parseInt(limit), 100) : 50,
      offset: offset ? parseInt(offset) : 0,
    });
    const total = await this._auditService.countByOrg(org.id);
    return {
      logs: logs.map((log) => ({
        id: log.id,
        action: log.action,
        entity: log.entity,
        entityId: log.entityId,
        entityName: log.entityName,
        userId: log.userId,
        createdAt: log.createdAt,
      })),
      total,
    };
  }

  @Post('/:id/set-default-folder')
  @RequirePermission('storage-config', 'manage')
  @CheckPolicies([AuthorizationActions.Create, Sections.ADMIN])
  async setDefaultFolder(
    @GetOrgFromRequest() org: Organization,
    @GetUserFromRequest() user: User,
    @Param('id') id: string,
    @Body() body: { folderId?: string | null }
  ) {
    return this._storageService.setDefaultFolderForProvider(
      id,
      body.folderId || null,
      org.id,
      user.id
    );
  }

  #stripBigInts(obj: any): any {
    if (obj === null || obj === undefined) return obj;
    if (typeof obj === 'bigint') return Number(obj);
    if (Array.isArray(obj)) return obj.map((v) => this.#stripBigInts(v));
    if (typeof obj === 'object') {
      const stripped: any = {};
      for (const [k, v] of Object.entries(obj)) {
        stripped[k] = this.#stripBigInts(v);
      }
      return stripped;
    }
    return obj;
  }
}
