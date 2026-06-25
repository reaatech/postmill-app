import {
  Body,
  Controller,
  Get,
  Param,
  Post,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiTags } from '@nestjs/swagger';
import { CheckPolicies } from '@gitroom/backend/services/auth/permissions/permissions.ability';
import { AuthorizationActions, Sections, SubscriptionException } from '@gitroom/backend/services/auth/permissions/permission.exception.class';
import { RequirePermission } from '@gitroom/backend/services/auth/rbac/require-permission.decorator';
import { GetOrgFromRequest } from '@gitroom/nestjs-libraries/user/org.from.request';
import { Organization } from '@prisma/client';
import { ReplicateRunnerService } from '@gitroom/nestjs-libraries/media/replicate-studio/replicate-runner.service';
import { ReplicateCatalogService } from '@gitroom/nestjs-libraries/media/replicate-studio/replicate-catalog.service';
import { FileService } from '@gitroom/nestjs-libraries/database/prisma/file/file.service';
import { SubscriptionService } from '@gitroom/nestjs-libraries/database/prisma/subscriptions/subscription.service';
import { EstimateDto, RunSyncDto, RunAsyncDto, SaveUrlDto, MergeDto } from '@gitroom/nestjs-libraries/dtos/replicate';

@ApiTags('Replicate Studio')
@Controller('/media/replicate')
export class ReplicateStudioController {
  constructor(
    private readonly _runner: ReplicateRunnerService,
    private readonly _catalog: ReplicateCatalogService,
    private readonly _fileService: FileService,
    private readonly _subscription: SubscriptionService,
  ) {}

  @Get('/status')
  @CheckPolicies([AuthorizationActions.Read, Sections.MEDIA])
  @RequirePermission('media', 'read')
  async getStatus(@GetOrgFromRequest() org: Organization) {
    try {
      await this._catalog.getReplicateKey(org.id);
      return { configured: true };
    } catch {
      return { configured: false };
    }
  }

  @Get('/categories')
  @CheckPolicies([AuthorizationActions.Read, Sections.MEDIA])
  @RequirePermission('media', 'read')
  async getCategories() {
    return this._catalog.getCategories();
  }

  @Get('/categories/:category/models')
  @CheckPolicies([AuthorizationActions.Read, Sections.MEDIA])
  @RequirePermission('media', 'read')
  async getModels(
    @Param('category') category: string,
    @GetOrgFromRequest() org: Organization,
  ) {
    return this._catalog.listModels(category, org.id);
  }

  @Get('/models/:owner/:name')
  @CheckPolicies([AuthorizationActions.Read, Sections.MEDIA])
  @RequirePermission('media', 'read')
  async getModel(
    @Param('owner') owner: string,
    @Param('name') name: string,
    @GetOrgFromRequest() org: Organization,
  ) {
    return this._catalog.getModel(owner, name, org.id);
  }

  @Post('/estimate')
  @CheckPolicies([AuthorizationActions.Read, Sections.MEDIA])
  @RequirePermission('media', 'read')
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  async estimate(
    @Body() body: EstimateDto,
  ) {
    const { estimate } = await import('@gitroom/nestjs-libraries/media/replicate-studio/replicate-cost');
    return estimate(body.modelId, body.input);
  }

  @Post('/run/sync')
  @CheckPolicies([AuthorizationActions.Create, Sections.MEDIA])
  @RequirePermission('media', 'create')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async runSync(
    @Body() body: RunSyncDto,
    @GetOrgFromRequest() org: Organization,
  ) {
    // Image ops: read-only credit gate; actual consumption happens in the runner.
    if (body.operation === 'image') {
      if (process.env.STRIPE_PUBLISHABLE_KEY) {
        const { credits } = await this._subscription.checkCredits(org, 'ai_images');
        if (credits <= 0) {
          throw new SubscriptionException({
            section: Sections.MEDIA,
            action: AuthorizationActions.Create,
          });
        }
      }
      return this._runner.runSync(
        org.id,
        '',
        {
          modelId: body.modelId,
          input: body.input,
          operation: body.operation,
        },
        { creditType: 'ai_images' },
      );
    }

    // STT: no credit gate, no credit consumption
    return this._runner.runSync(org.id, '', {
      modelId: body.modelId,
      input: body.input,
      operation: body.operation,
    });
  }

  @Post('/run/async')
  @CheckPolicies([AuthorizationActions.Create, Sections.MEDIA])
  @RequirePermission('media', 'create')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async runAsync(
    @Body() body: RunAsyncDto,
    @GetOrgFromRequest() org: Organization,
  ) {
    // Video/image ops: read-only credit gate; actual consumption happens in the runner.
    if (body.operation === 'video') {
      if (process.env.STRIPE_PUBLISHABLE_KEY) {
        const { credits } = await this._subscription.checkCredits(org, 'ai_videos');
        if (credits <= 0) {
          throw new SubscriptionException({
            section: Sections.VIDEOS_PER_MONTH,
            action: AuthorizationActions.Create,
          });
        }
      }
      return this._runner.runAsync(
        org.id,
        '',
        {
          modelId: body.modelId,
          versionId: body.versionId,
          input: body.input,
          folderId: body.folderId,
          operation: body.operation,
        },
        { creditType: 'ai_videos' },
      );
    }

    if (body.operation === 'image') {
      if (process.env.STRIPE_PUBLISHABLE_KEY) {
        const { credits } = await this._subscription.checkCredits(org, 'ai_images');
        if (credits <= 0) {
          throw new SubscriptionException({
            section: Sections.MEDIA,
            action: AuthorizationActions.Create,
          });
        }
      }
      return this._runner.runAsync(
        org.id,
        '',
        {
          modelId: body.modelId,
          versionId: body.versionId,
          input: body.input,
          folderId: body.folderId,
          operation: body.operation,
        },
        { creditType: 'ai_images' },
      );
    }

    // Audio: no gate, no credit consumption
    return this._runner.runAsync(org.id, '', {
      modelId: body.modelId,
      versionId: body.versionId,
      input: body.input,
      folderId: body.folderId,
      operation: body.operation,
    });
  }

  @Get('/jobs/:id')
  @CheckPolicies([AuthorizationActions.Read, Sections.MEDIA])
  @RequirePermission('media', 'read')
  async getJob(
    @Param('id') id: string,
    @GetOrgFromRequest() org: Organization,
  ) {
    return this._runner.getJob(org.id, id);
  }

  @Post('/save-url')
  @CheckPolicies([AuthorizationActions.Create, Sections.MEDIA])
  @RequirePermission('media', 'create')
  async saveUrl(
    @Body() body: SaveUrlDto,
    @GetOrgFromRequest() org: Organization,
  ) {
    return this._fileService.importFromUrl(org.id, {
      url: body.url,
      name: body.name,
      folderId: body.folderId,
    });
  }

  @Post('/merge')
  @CheckPolicies([AuthorizationActions.Create, Sections.MEDIA])
  @RequirePermission('media', 'create')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async merge(
    @Body() body: MergeDto,
    @GetOrgFromRequest() org: Organization,
  ) {
    return this._runner.runMerge(org.id, '', {
      clips: body.clips,
      transitions: body.transitions,
      folderId: body.folderId,
    });
  }
}
