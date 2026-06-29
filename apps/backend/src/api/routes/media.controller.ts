import {
  Body,
  Controller,
  Delete,
  Get,
  HttpException,
  HttpStatus,
  Param,
  Post,
  Req,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { Request } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { GetOrgFromRequest } from '@gitroom/nestjs-libraries/user/org.from.request';
import { Organization } from '@prisma/client';
import { CheckPolicies } from '@gitroom/backend/services/auth/permissions/permissions.ability';
import { AuthorizationActions, Sections } from '@gitroom/backend/services/auth/permissions/permission.exception.class';
import { ApiTags } from '@nestjs/swagger';
import { SubscriptionService } from '@gitroom/nestjs-libraries/database/prisma/subscriptions/subscription.service';
import { StorageService } from '@gitroom/nestjs-libraries/database/prisma/storage/storage.service';
import { VideoDto } from '@gitroom/nestjs-libraries/dtos/videos/video.dto';
import { VideoFunctionDto } from '@gitroom/nestjs-libraries/dtos/videos/video.function.dto';
import { StockMediaService } from '@gitroom/nestjs-libraries/media/stock/stock-media.service';
import { RequirePermission } from '@gitroom/backend/services/auth/rbac/require-permission.decorator';
import { RemoveBackgroundDto } from '@gitroom/nestjs-libraries/dtos/ai/remove.background.dto';
import { DetectFocalPointDto } from '@gitroom/nestjs-libraries/dtos/ai/detect-focal-point.dto';
import { UpscaleImageDto } from '@gitroom/nestjs-libraries/dtos/ai/upscale.image.dto';
import { InpaintImageDto } from '@gitroom/nestjs-libraries/dtos/ai/inpaint.image.dto';
import { BrandsService } from '@gitroom/nestjs-libraries/brands/brands.service';
import { BadRequestException } from '@nestjs/common';
import { AiMediaGenerationService } from '@gitroom/nestjs-libraries/ai/ai-media-generation.service';
import { FileService } from '@gitroom/nestjs-libraries/database/prisma/file/file.service';
import { BudgetService } from '@gitroom/nestjs-libraries/ai/governance/budget.service';

@ApiTags('Media')
@Controller('/media')
export class MediaController {
  constructor(
    private _aiGeneration: AiMediaGenerationService,
    private _fileService: FileService,
    private _subscriptionService: SubscriptionService,
    private _storageService: StorageService,
    private _stockMediaService: StockMediaService,
    private _brandsService: BrandsService,
    private _budgetService: BudgetService
  ) {}

  // Spend-budget gate (C3): in addition to the tier-credit check, deny generation
  // when the org/global AI spend cap is exhausted. No-op when no caps are configured.
  private async _assertBudget(orgId: string) {
    const budgetCheck = await this._budgetService.checkBudget('media', orgId);
    if (!budgetCheck.allowed) {
      throw new HttpException(
        { error: 'AI budget exceeded', detail: budgetCheck.reason },
        HttpStatus.TOO_MANY_REQUESTS
      );
    }
  }

  @Post('/generate-video')
  @CheckPolicies([AuthorizationActions.Create, Sections.MEDIA])
  generateVideo(
    @GetOrgFromRequest() org: Organization,
    @Body() body: VideoDto
  ) {
    return this._aiGeneration.generateVideo(org, body);
  }

  @Post('/generate-image')
  @CheckPolicies([AuthorizationActions.Create, Sections.MEDIA])
  async generateImage(
    @GetOrgFromRequest() org: Organization,
    @Req() req: Request,
    @Body('prompt') prompt: string,
    isPicturePrompt = false
  ) {
    await this._assertBudget(org.id);
    const total = await this._subscriptionService.checkCredits(org);
    if (process.env.STRIPE_PUBLISHABLE_KEY && total.credits <= 0) {
      return false;
    }

    return {
      output:
        'data:image/png;base64,' +
        (await this._aiGeneration.generateImage(prompt, org, isPicturePrompt)),
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

    return this._fileService.saveFile(org.id, file.split('/').pop(), file);
  }

  @Get('/video-options')
  @CheckPolicies([AuthorizationActions.Read, Sections.MEDIA])
  getVideos() {
    return this._aiGeneration.getVideoOptions();
  }

  @Post('/video/function')
  @CheckPolicies([AuthorizationActions.Read, Sections.MEDIA])
  videoFunction(
    @Body() body: VideoFunctionDto
  ) {
    return this._aiGeneration.videoFunction(body.identifier, body.functionName, body.params);
  }

  @Get('/generate-video/:type/allowed')
  @CheckPolicies([AuthorizationActions.Read, Sections.MEDIA])
  generateVideoAllowed(
    @GetOrgFromRequest() org: Organization,
    @Param('type') type: string
  ) {
    return this._aiGeneration.generateVideoAllowed(org, type);
  }

  @Post('/remove-background')
  @CheckPolicies([AuthorizationActions.Create, Sections.MEDIA])
  @RequirePermission('media', 'create')
  async removeBackground(
    @GetOrgFromRequest() org: Organization,
    @Body() body: RemoveBackgroundDto
  ) {
    await this._assertBudget(org.id);
    await this._subscriptionService.checkCredits(org);
    return { url: await this._aiGeneration.removeBackground(org, body.imageUrl) };
  }

  @Post('/inpaint')
  @CheckPolicies([AuthorizationActions.Create, Sections.MEDIA])
  @RequirePermission('media', 'create')
  async inpaint(
    @GetOrgFromRequest() org: Organization,
    @Body() body: InpaintImageDto
  ) {
    await this._assertBudget(org.id);
    await this._subscriptionService.checkCredits(org);
    return {
      url: await this._aiGeneration.inpaintImage(
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
    await this._assertBudget(org.id);
    await this._subscriptionService.checkCredits(org);
    return { url: await this._aiGeneration.upscaleImage(org, body.imageUrl, body.scale) };
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

  @Get('/fonts')
  @CheckPolicies([AuthorizationActions.Read, Sections.MEDIA])
  async listFonts(@GetOrgFromRequest() org: Organization) {
    return this._brandsService.getCustomFonts(org.id);
  }

  @Post('/fonts/upload')
  @CheckPolicies([AuthorizationActions.Update, Sections.MEDIA])
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }))
  async uploadFont(
    @GetOrgFromRequest() org: Organization,
    @UploadedFile() file: Express.Multer.File
  ) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    const ext = file.originalname.split('.').pop()?.toLowerCase();
    const allowedExts = new Set(['ttf', 'otf', 'woff2']);
    if (!ext || !allowedExts.has(ext)) {
      throw new BadRequestException('Invalid font file. Accepted: .ttf, .otf, .woff2');
    }

    const adapter = await this._storageService.getLocalAdapterForOrg(org.id, true);
    const uploaded = await adapter.uploadFile(file);

    const fontEntry = {
      family: file.originalname.replace(/\.[^./\\]*$/, ''),
      fileId: uploaded.filename || uploaded.originalname,
      path: uploaded.path,
      weights: [400],
    };

    const fonts = await this._brandsService.addCustomFont(org.id, fontEntry);
    return { fonts, uploaded: fontEntry };
  }

  @Delete('/fonts/:fileId')
  @CheckPolicies([AuthorizationActions.Update, Sections.MEDIA])
  async deleteFont(
    @GetOrgFromRequest() org: Organization,
    @Param('fileId') fileId: string
  ) {
    return this._brandsService.removeCustomFont(org.id, fileId);
  }

  @Post('/text-to-speech')
  @CheckPolicies([AuthorizationActions.Create, Sections.MEDIA])
  @RequirePermission('media', 'create')
  async textToSpeech(
    @GetOrgFromRequest() org: Organization,
    @Body('text') text: string,
    @Body('voice') voice?: string,
  ) {
    if (!text?.trim()) {
      throw new BadRequestException('Text is required');
    }
    return this._aiGeneration.textToSpeech(org, text, voice);
  }

  @Post('/speech-to-text')
  @CheckPolicies([AuthorizationActions.Create, Sections.MEDIA])
  @RequirePermission('media', 'create')
  async speechToText(
    @GetOrgFromRequest() org: Organization,
    @Body('audioUrl') audioUrl: string,
  ) {
    if (!audioUrl?.trim()) {
      throw new BadRequestException('audioUrl is required');
    }
    return this._aiGeneration.speechToText(org, audioUrl);
  }

  @Post('/speech-to-text-words')
  @CheckPolicies([AuthorizationActions.Create, Sections.MEDIA])
  @RequirePermission('media', 'create')
  async speechToTextWords(
    @GetOrgFromRequest() org: Organization,
    @Body('audioUrl') audioUrl: string,
  ) {
    if (!audioUrl?.trim()) {
      throw new BadRequestException('audioUrl is required');
    }
    return this._aiGeneration.speechToTextWords(org, audioUrl);
  }

  @Post('/detect-focal-point')
  @CheckPolicies([AuthorizationActions.Create, Sections.MEDIA])
  @RequirePermission('media', 'create')
  async detectFocalPoint(
    @GetOrgFromRequest() org: Organization,
    @Body() body: DetectFocalPointDto,
  ) {
    return this._aiGeneration.detectFocalPoint(org, body.imageUrl);
  }
}
