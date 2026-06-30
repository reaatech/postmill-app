import {
  Body,
  Controller,
  Delete,
  Get,
  HttpException,
  HttpStatus,
  Param,
  Post,
  Query,
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
import { StockMediaService } from '@gitroom/nestjs-libraries/media/stock/stock-media.service';
import { RequirePermission } from '@gitroom/backend/services/auth/rbac/require-permission.decorator';
import { RemoveBackgroundDto } from '@gitroom/nestjs-libraries/dtos/ai/remove.background.dto';
import { DetectFocalPointDto } from '@gitroom/nestjs-libraries/dtos/ai/detect-focal-point.dto';
import { UpscaleImageDto } from '@gitroom/nestjs-libraries/dtos/ai/upscale.image.dto';
import { InpaintImageDto } from '@gitroom/nestjs-libraries/dtos/ai/inpaint.image.dto';
import { BrandsService } from '@gitroom/nestjs-libraries/brands/brands.service';
import { BadRequestException } from '@nestjs/common';
import { FileService } from '@gitroom/nestjs-libraries/database/prisma/file/file.service';
import { BudgetService } from '@gitroom/nestjs-libraries/ai/governance/budget.service';
import { ioRedis } from '@gitroom/nestjs-libraries/redis/redis.service';
import { AiDefaultsService, DefaultNotConfiguredError } from '@gitroom/nestjs-libraries/ai/defaults/ai-defaults.service';
import { DefaultsResolutionService } from '@gitroom/nestjs-libraries/ai/defaults/defaults-resolution.service';
import { AiMediaService } from '@gitroom/nestjs-libraries/ai/governance/media.service';
import { safeFetch } from '@gitroom/nestjs-libraries/dtos/webhooks/safe.fetch';
import { UseFilters } from '@nestjs/common';
import { MediaCapabilityFilter } from '@gitroom/backend/api/routes/media-capability.filter';

@ApiTags('Media')
@Controller('/media')
@UseFilters(MediaCapabilityFilter)
export class MediaController {
  constructor(
    private _aiDefaults: AiDefaultsService,
    private _aiMediaService: AiMediaService,
    private _defaultsResolution: DefaultsResolutionService,
    private _fileService: FileService,
    private _subscriptionService: SubscriptionService,
    private _storageService: StorageService,
    private _stockMediaService: StockMediaService,
    private _brandsService: BrandsService,
    private _budgetService: BudgetService
  ) {}

  private async _assertBudget(orgId: string) {
    const budgetCheck = await this._budgetService.checkBudget('media', orgId);
    if (!budgetCheck.allowed) {
      throw new HttpException(
        { error: 'AI budget exceeded', detail: budgetCheck.reason },
        HttpStatus.TOO_MANY_REQUESTS
      );
    }
  }

  private async _urlToBase64Image(url: string): Promise<string> {
    if (url.startsWith('data:image/')) return url;
    const res = await safeFetch(url);
    if (!res.ok) throw new Error(`Image download failed (${res.status})`);
    const buffer = Buffer.from(await res.arrayBuffer());
    const mime = res.headers.get('content-type')?.split(';')[0] || 'image/png';
    return `data:${mime};base64,${buffer.toString('base64')}`;
  }

  private async _saveUrlToFile(orgId: string, url: string, namePrefix: string): Promise<{ id: string; path: string; name: string }> {
    const adapter = await this._storageService.getLocalAdapterForOrg(orgId, true);
    let buffer: Buffer;
    let ext = 'png';
    if (url.startsWith('data:')) {
      const commaIdx = url.indexOf(',');
      const header = url.slice(5, commaIdx);
      const payload = url.slice(commaIdx + 1);
      const isBase64 = header.endsWith(';base64');
      const mime = isBase64 ? header.slice(0, -7) : header;
      buffer = isBase64 ? Buffer.from(payload, 'base64') : Buffer.from(decodeURIComponent(payload), 'utf-8');
      ext = mime === 'image/jpeg' ? 'jpg' : mime === 'image/webp' ? 'webp' : 'png';
    } else {
      const res = await safeFetch(url);
      if (!res.ok) throw new Error(`Download failed (${res.status})`);
      buffer = Buffer.from(await res.arrayBuffer());
      const ct = res.headers.get('content-type')?.split(';')[0] || '';
      ext = ct === 'image/jpeg' ? 'jpg' : ct === 'image/webp' ? 'webp' : 'png';
    }
    const path = await adapter.writeBuffer(buffer, `image/${ext === 'png' ? 'png' : ext === 'jpg' ? 'jpeg' : 'webp'}`);
    const fileName = `${namePrefix}-${Date.now()}.${ext}`;
    const saved = await this._fileService.saveFile(orgId, fileName, path, fileName);
    return { id: saved.id, path: saved.path, name: saved.name };
  }

  @Post('/generate-video')
  @CheckPolicies([AuthorizationActions.Create, Sections.MEDIA])
  async generateVideo(
    @GetOrgFromRequest() org: Organization,
    @Body() body: { prompt?: string; imageUrl?: string; type?: string; output?: string }
  ) {
    await this._assertBudget(org.id);
    const total = await this._subscriptionService.checkCredits(org);
    if (process.env.STRIPE_PUBLISHABLE_KEY && total.credits <= 0) {
      return false;
    }

    try {
      let artifact: string;
      const prompt = body.output && body.prompt
        ? `[${body.output}] ${body.prompt}`
        : body.prompt || '';
      if (body.imageUrl) {
        artifact = await this._aiDefaults.imageToVideo(org.id, prompt, body.imageUrl);
      } else {
        artifact = await this._aiDefaults.textToVideo(org.id, prompt);
      }
      return { id: artifact, status: 'pending' };
    } catch (err) {
      if (err instanceof DefaultNotConfiguredError) {
        throw new HttpException({ error: err.message, category: err.category }, HttpStatus.CONFLICT);
      }
      throw err;
    }
  }

  @Get('/jobs/:id')
  @CheckPolicies([AuthorizationActions.Read, Sections.MEDIA])
  async getMediaJob(
    @GetOrgFromRequest() org: Organization,
    @Param('id') id: string
  ) {
    const job = await this._aiMediaService.getJob(id);
    if (!job || job.organizationId !== org.id) {
      throw new HttpException('Job not found', HttpStatus.NOT_FOUND);
    }
    return {
      id: job.id,
      status: job.status,
      artifactUrl: job.artifactUrl,
      error: job.error,
    };
  }

  @Get('/video-options')
  @CheckPolicies([AuthorizationActions.Read, Sections.MEDIA])
  async getVideoOptions(@GetOrgFromRequest() org: Organization) {
    const categories = ['text-to-video', 'image-to-video', 'video-to-video', 'video-upscale', 'video-background', 'video-avatar'];
    const options: Record<string, any> = {};
    for (const category of categories) {
      try {
        // Use the media defaults resolver to list candidates for the category.
        // The frontend can decide which video generators are available.
        const resolved = await this._defaultsResolution.resolve('media', category, org.id);
        options[category] = { available: !!resolved };
      } catch {
        options[category] = { available: false };
      }
    }
    return options;
  }

  // Single source of truth for "which media tools can this org actually use". Consumed by
  // Settings (disable), the composer, and the Designer. Guarded with READ/MEDIA only (no
  // @RequirePermission) so it is never stricter than the generate endpoints it gates —
  // Sections.MEDIA is not paywalled, so this won't 402 a user who can otherwise generate.
  @Get('/tools/status')
  @CheckPolicies([AuthorizationActions.Read, Sections.MEDIA])
  async getToolStatus(@GetOrgFromRequest() org: Organization) {
    return this._aiMediaService.getToolStatus(org.id);
  }

  @Post('/video/function')
  @CheckPolicies([AuthorizationActions.Read, Sections.MEDIA])
  async videoFunction(
    @GetOrgFromRequest() org: Organization,
    @Body() body: { identifier?: string; functionName?: string; params?: any }
  ) {
    if (body.functionName !== 'loadVoices') {
      throw new BadRequestException('Only loadVoices is supported');
    }
    const voices = await this._aiMediaService.listVoices(org.id, { provider: body.identifier });
    return {
      voices: voices.map((v) => ({
        id: v.id,
        name: v.label,
        preview_url: v.previewUrl,
      })),
    };
  }

  @Get('/generate-video/:type/allowed')
  @CheckPolicies([AuthorizationActions.Read, Sections.MEDIA])
  async generateVideoAllowed(
    @GetOrgFromRequest() org: Organization,
    @Param('type') type: string
  ) {
    const categoryMap: Record<string, string> = {
      'text-to-video': 'text-to-video',
      'image-to-video': 'image-to-video',
      'video-to-video': 'video-to-video',
    };
    const category = categoryMap[type];
    if (!category) {
      throw new BadRequestException(`Unknown video type: ${type}`);
    }
    try {
      const resolved = await this._defaultsResolution.resolve('media', category, org.id);
      return { allowed: !!resolved };
    } catch {
      return { allowed: false };
    }
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

    try {
      let finalPrompt = prompt;
      if (isPicturePrompt) {
        finalPrompt = await this._aiDefaults.lowReasoningText(
          org.id,
          `Create a concise, vivid image-generation prompt from this idea: ${prompt}`
        );
      }
      const url = await this._aiDefaults.textToImage(org.id, finalPrompt);
      const dataUrl = await this._urlToBase64Image(url);
      return { output: dataUrl };
    } catch (err) {
      if (err instanceof DefaultNotConfiguredError) {
        throw new HttpException({ error: err.message, category: err.category }, HttpStatus.CONFLICT);
      }
      throw err;
    }
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
    const output = (image as { output: string }).output;
    return this._saveUrlToFile(org.id, output, 'generated');
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
    return { url: await this._aiMediaService.removeBackground(body.imageUrl, { orgId: org.id }) };
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
      url: await this._aiMediaService.inpaintImage(
        body.imageUrl,
        body.maskUrl,
        body.prompt,
        { orgId: org.id }
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
    return { url: await this._aiMediaService.upscaleImage(body.imageUrl, { orgId: org.id, scale: body.scale }) };
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

  @Get('/voices')
  @CheckPolicies([AuthorizationActions.Read, Sections.MEDIA])
  @RequirePermission('media', 'create')
  async listVoices(
    @GetOrgFromRequest() org: Organization,
    @Query('provider') provider?: string,
  ) {
    const cacheKey = `media:voices:${org.id}:${provider || '_default'}`;
    const cached = await ioRedis.get(cacheKey);
    if (cached) {
      try {
        return JSON.parse(cached);
      } catch {
        // Fall through to fresh fetch if cache value is corrupt.
      }
    }

    const voices = await this._aiMediaService.listVoices(org.id, { provider });
    await ioRedis.set(cacheKey, JSON.stringify(voices), 'EX', 60);
    return voices;
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
    await this._assertBudget(org.id);
    const buffer = await this._aiMediaService.textToSpeech(text, { orgId: org.id, voice });
    const adapter = await this._storageService.getLocalAdapterForOrg(org.id, true);
    const fileName = `voiceover-${Date.now()}.mp3`;
    const path = await adapter.writeBuffer(Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer, 'base64'), 'audio/mpeg');
    const saved = await this._fileService.saveFile(org.id, fileName, path, fileName);
    return { id: saved.id, path: saved.path, name: saved.name };
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
    const res = await safeFetch(audioUrl);
    if (!res.ok) {
      throw new HttpException('Could not fetch audio for transcription', 400);
    }
    const arrayBuffer = await res.arrayBuffer();
    const text = await this._aiMediaService.speechToText(Buffer.from(arrayBuffer), { orgId: org.id });
    return { text };
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
    const res = await safeFetch(audioUrl);
    if (!res.ok) {
      throw new HttpException('Could not fetch audio for transcription', 400);
    }
    const arrayBuffer = await res.arrayBuffer();
    return this._aiMediaService.speechToTextWords(Buffer.from(arrayBuffer), { orgId: org.id });
  }

  @Post('/detect-focal-point')
  @CheckPolicies([AuthorizationActions.Create, Sections.MEDIA])
  @RequirePermission('media', 'create')
  async detectFocalPoint(
    @GetOrgFromRequest() org: Organization,
    @Body() body: DetectFocalPointDto,
  ) {
    return this._aiMediaService.detectFocalPoint(body.imageUrl, { orgId: org.id });
  }
}
