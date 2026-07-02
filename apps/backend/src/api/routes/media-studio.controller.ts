import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiTags } from '@nestjs/swagger';
import { CheckPolicies } from '@gitroom/backend/services/auth/permissions/permissions.ability';
import { AuthorizationActions, Sections } from '@gitroom/backend/services/auth/permissions/permission.exception.class';
import { RequirePermission } from '@gitroom/backend/services/auth/rbac/require-permission.decorator';
import { GetOrgFromRequest } from '@gitroom/nestjs-libraries/user/org.from.request';
import { GetUserFromRequest } from '@gitroom/nestjs-libraries/user/user.from.request';
import { Organization, User } from '@prisma/client';
import { MediaStudioService } from '@gitroom/nestjs-libraries/media/studio/media-studio.service';
import { MediaStudioGenerateDto } from '@gitroom/nestjs-libraries/dtos/media-studio/media-studio.generate.dto';

// Generic studio endpoint shared by every descriptor-driven provider studio (Runway,
// Luma, MiniMax, Kling, …). No provider-specific code — the adapter + descriptor carry
// all differences.
@ApiTags('Media Studio')
@Controller('/media/studio')
export class MediaStudioController {
  constructor(private readonly _studio: MediaStudioService) {}

  @Get('/:provider/status')
  @CheckPolicies([AuthorizationActions.Read, Sections.MEDIA])
  @RequirePermission('media', 'read')
  getStatus(
    @Param('provider') provider: string,
    @GetOrgFromRequest() org: Organization,
    @Query('version') version?: string,
  ) {
    return this._studio.getStatus(org.id, provider, version);
  }

  @Get('/:provider/jobs')
  @CheckPolicies([AuthorizationActions.Read, Sections.MEDIA])
  @RequirePermission('media', 'read')
  getJobs(
    @Param('provider') provider: string,
    @GetOrgFromRequest() org: Organization,
    @Query('version') version?: string,
  ) {
    return this._studio.listJobs(org.id, provider, version);
  }

  // Runtime model catalog for the studio's dynamic model dropdown.
  @Get('/:provider/models')
  @CheckPolicies([AuthorizationActions.Read, Sections.MEDIA])
  @RequirePermission('media', 'read')
  getModels(
    @Param('provider') provider: string,
    @Query('operation') operation: string,
    @GetOrgFromRequest() org: Organization,
    @Query('version') version?: string,
  ) {
    const op = operation === 'video' || operation === 'audio' ? operation : 'image';
    return this._studio.listModels(org.id, provider, op, version);
  }

  @Post('/:provider/generate')
  @CheckPolicies([AuthorizationActions.Create, Sections.MEDIA])
  @RequirePermission('media', 'create')
  @Throttle({ default: { limit: 15, ttl: 60000 } })
  generate(
    @Param('provider') provider: string,
    @Body() body: MediaStudioGenerateDto,
    @GetOrgFromRequest() org: Organization,
    @GetUserFromRequest() user: User,
    @Query('version') version?: string,
  ) {
    return this._studio.generate(org.id, user.id, provider, {
      operation: body.operation,
      model: body.model,
      input: body.input,
      mediaInputs: body.mediaInputs,
      folderId: body.folderId,
      version,
    });
  }
}
