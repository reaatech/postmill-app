import { Controller, Get, Param, Query } from '@nestjs/common';
import { GetOrgFromRequest } from '@gitroom/nestjs-libraries/user/org.from.request';
import { Organization } from '@prisma/client';
import { StockMediaService } from '@gitroom/nestjs-libraries/media/stock/stock-media.service';
import { CheckPolicies } from '@gitroom/backend/services/auth/permissions/permissions.ability';
import { AuthorizationActions, Sections } from '@gitroom/backend/services/auth/permissions/permission.exception.class';
import { RequirePermission } from '@gitroom/backend/services/auth/rbac/require-permission.decorator';
import { ApiTags } from '@nestjs/swagger';

@ApiTags('Stock Media')
@Controller('/media/stock')
export class StockMediaController {
  constructor(private _stockMediaService: StockMediaService) {}

  @Get('/photos')
  @CheckPolicies([AuthorizationActions.Read, Sections.MEDIA])
  @RequirePermission('media', 'read')
  async searchPhotos(
    @GetOrgFromRequest() org: Organization,
    @Query('query') query: string,
    @Query('page') page: string,
    @Query('orientation') orientation: string,
    @Query('color') color: string
  ) {
    return this._stockMediaService.searchPhotos(query || '', parseInt(page || '1', 10), orientation || undefined, color || undefined);
  }

  @Get('/photos/:id/related')
  @CheckPolicies([AuthorizationActions.Read, Sections.MEDIA])
  @RequirePermission('media', 'read')
  async getRelatedPhotos(
    @GetOrgFromRequest() org: Organization,
    @Param('id') id: string
  ) {
    return this._stockMediaService.getRelatedPhotos(id);
  }

  @Get('/videos')
  @CheckPolicies([AuthorizationActions.Read, Sections.MEDIA])
  @RequirePermission('media', 'read')
  async searchVideos(
    @GetOrgFromRequest() org: Organization,
    @Query('query') query: string,
    @Query('page') page: string,
    @Query('orientation') orientation: string,
    @Query('size') size: string
  ) {
    return this._stockMediaService.searchVideos(query || '', parseInt(page || '1', 10), orientation || undefined, size || undefined);
  }

  @Get('/videos/:id/related')
  @CheckPolicies([AuthorizationActions.Read, Sections.MEDIA])
  @RequirePermission('media', 'read')
  async getRelatedVideos(
    @GetOrgFromRequest() org: Organization,
    @Param('id') id: string
  ) {
    return this._stockMediaService.getRelatedVideos(id);
  }

  @Get('/audio')
  @CheckPolicies([AuthorizationActions.Read, Sections.MEDIA])
  @RequirePermission('media', 'read')
  async searchAudio(
    @GetOrgFromRequest() org: Organization,
    @Query('query') query: string,
    @Query('page') page: string
  ) {
    return this._stockMediaService.searchAudio(query || '', parseInt(page || '1', 10));
  }
}
