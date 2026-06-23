import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import { Request } from 'express';
import { GetOrgFromRequest } from '@gitroom/nestjs-libraries/user/org.from.request';
import { Organization } from '@prisma/client';
import { MediaService } from '@gitroom/nestjs-libraries/database/prisma/media/media.service';
import { CheckPolicies } from '@gitroom/backend/services/auth/permissions/permissions.ability';
import { AuthorizationActions, Sections } from '@gitroom/backend/services/auth/permissions/permission.exception.class';
import { ApiTags } from '@nestjs/swagger';
import { SubscriptionService } from '@gitroom/nestjs-libraries/database/prisma/subscriptions/subscription.service';
import { StorageService } from '@gitroom/nestjs-libraries/database/prisma/storage/storage.service';
import { VideoDto } from '@gitroom/nestjs-libraries/dtos/videos/video.dto';
import { VideoFunctionDto } from '@gitroom/nestjs-libraries/dtos/videos/video.function.dto';
import { StockMediaService } from '@gitroom/nestjs-libraries/media/stock/stock-media.service';
import { RequirePermission } from '@gitroom/backend/services/auth/rbac/require-permission.decorator';
import { RemoveBackgroundDto } from '@gitroom/nestjs-libraries/dtos/media/remove.background.dto';
import { UpscaleImageDto } from '@gitroom/nestjs-libraries/dtos/media/upscale.image.dto';
import { InpaintImageDto } from '@gitroom/nestjs-libraries/dtos/media/inpaint.image.dto';

@ApiTags('Media')
@Controller('/media')
export class MediaController {
  constructor(
    private _mediaService: MediaService,
    private _subscriptionService: SubscriptionService,
    private _storageService: StorageService,
    private _stockMediaService: StockMediaService
  ) {}

  @Post('/generate-video')
  @CheckPolicies([AuthorizationActions.Create, Sections.MEDIA])
  generateVideo(
    @GetOrgFromRequest() org: Organization,
    @Body() body: VideoDto
  ) {
    return this._mediaService.generateVideo(org, body);
  }

  @Post('/generate-image')
  @CheckPolicies([AuthorizationActions.Create, Sections.MEDIA])
  async generateImage(
    @GetOrgFromRequest() org: Organization,
    @Req() req: Request,
    @Body('prompt') prompt: string,
    isPicturePrompt = false
  ) {
    const total = await this._subscriptionService.checkCredits(org);
    if (process.env.STRIPE_PUBLISHABLE_KEY && total.credits <= 0) {
      return false;
    }

    return {
      output:
        'data:image/png;base64,' +
        (await this._mediaService.generateImage(prompt, org, isPicturePrompt)),
    };
  }

  @Post('/generate-image-with-prompt')
  @CheckPolicies([AuthorizationActions.Create, Sections.MEDIA])
  async generateImageFromText(
    @GetOrgFromRequest() org: Organization,
    @Req() req: Request,
    @Body('prompt') prompt: string
  ) {
    const image = await this.generateImage(org, req, prompt, true);
    if (!image) {
      return false;
    }

    const adapter = await this._storageService.getLocalAdapterForOrg(org.id);
    const file = await adapter.uploadSimple(image.output);

    return this._mediaService.saveFile(org.id, file.split('/').pop(), file);
  }

  @Get('/video-options')
  @CheckPolicies([AuthorizationActions.Read, Sections.MEDIA])
  getVideos() {
    return this._mediaService.getVideoOptions();
  }

  @Post('/video/function')
  @CheckPolicies([AuthorizationActions.Read, Sections.MEDIA])
  videoFunction(
    @Body() body: VideoFunctionDto
  ) {
    return this._mediaService.videoFunction(body.identifier, body.functionName, body.params);
  }

  @Get('/generate-video/:type/allowed')
  @CheckPolicies([AuthorizationActions.Read, Sections.MEDIA])
  generateVideoAllowed(
    @GetOrgFromRequest() org: Organization,
    @Param('type') type: string
  ) {
    return this._mediaService.generateVideoAllowed(org, type);
  }

  @Post('/remove-background')
  @CheckPolicies([AuthorizationActions.Create, Sections.MEDIA])
  @RequirePermission('media', 'create')
  async removeBackground(
    @GetOrgFromRequest() org: Organization,
    @Body() body: RemoveBackgroundDto
  ) {
    await this._subscriptionService.checkCredits(org);
    return { url: await this._mediaService.removeBackground(org, body.imageUrl) };
  }

  @Post('/inpaint')
  @CheckPolicies([AuthorizationActions.Create, Sections.MEDIA])
  @RequirePermission('media', 'create')
  async inpaint(
    @GetOrgFromRequest() org: Organization,
    @Body() body: InpaintImageDto
  ) {
    await this._subscriptionService.checkCredits(org);
    return {
      url: await this._mediaService.inpaintImage(
        org,
        body.imageUrl,
        body.maskUrl,
        body.prompt
      ),
    };
  }

  @Post('/upscale')
  @CheckPolicies([AuthorizationActions.Create, Sections.MEDIA])
  @RequirePermission('media', 'create')
  async upscale(
    @GetOrgFromRequest() org: Organization,
    @Body() body: UpscaleImageDto
  ) {
    await this._subscriptionService.checkCredits(org);
    return { url: await this._mediaService.upscaleImage(org, body.imageUrl, body.scale) };
  }

  @Post('/stock/download')
  @CheckPolicies([AuthorizationActions.Create, Sections.MEDIA])
  @RequirePermission('media', 'create')
  async triggerStockDownload(
    @GetOrgFromRequest() org: Organization,
    @Body('downloadLocation') downloadLocation: string
  ) {
    await this._stockMediaService.triggerDownload(downloadLocation);
    return { success: true };
  }
}
