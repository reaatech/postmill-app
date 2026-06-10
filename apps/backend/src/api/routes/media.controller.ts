import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  Req,
  Res,
  UploadedFile,
  UseInterceptors,
  UsePipes,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { GetOrgFromRequest } from '@gitroom/nestjs-libraries/user/org.from.request';
import { Organization } from '@prisma/client';
import { MediaService } from '@gitroom/nestjs-libraries/database/prisma/media/media.service';
import { CheckPolicies } from '@gitroom/backend/services/auth/permissions/permissions.ability';
import { AuthorizationActions, Sections } from '@gitroom/backend/services/auth/permissions/permission.exception.class';
import { ApiTags } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { CustomFileValidationPipe } from '@gitroom/nestjs-libraries/upload/custom.upload.validation';
import { SubscriptionService } from '@gitroom/nestjs-libraries/database/prisma/subscriptions/subscription.service';
import { StorageService } from '@gitroom/nestjs-libraries/database/prisma/storage/storage.service';
import { SaveMediaInformationDto } from '@gitroom/nestjs-libraries/dtos/media/save.media.information.dto';
import { VideoDto } from '@gitroom/nestjs-libraries/dtos/videos/video.dto';
import { VideoFunctionDto } from '@gitroom/nestjs-libraries/dtos/videos/video.function.dto';
import { CreateFolderDto } from '@gitroom/nestjs-libraries/dtos/media/create.folder.dto';
import { UpdateFolderDto } from '@gitroom/nestjs-libraries/dtos/media/update.folder.dto';
import { MoveMediaDto } from '@gitroom/nestjs-libraries/dtos/media/move.media.dto';
import { RenameMediaDto } from '@gitroom/nestjs-libraries/dtos/media/rename.media.dto';
import { UpdateMediaTagsDto } from '@gitroom/nestjs-libraries/dtos/media/update.media.tags.dto';
import { UpdateMediaDescriptionDto } from '@gitroom/nestjs-libraries/dtos/media/update.media.description.dto';
import { BulkDeleteMediaDto } from '@gitroom/nestjs-libraries/dtos/media/bulk.delete.media.dto';
import { BulkMoveMediaDto } from '@gitroom/nestjs-libraries/dtos/media/bulk.move.media.dto';
import { diskStorage } from 'multer';
import { tmpdir } from 'os';
import { mkdirSync } from 'fs';
import fs from 'fs';
import * as path from 'path';

const TMP_UPLOAD_DIR = path.join(tmpdir(), 'postmill-uploads');
try { mkdirSync(TMP_UPLOAD_DIR, { recursive: true }); } catch {}

@ApiTags('Media')
@Controller('/media')
export class MediaController {
  constructor(
    private _mediaService: MediaService,
    private _subscriptionService: SubscriptionService,
    private _storageService: StorageService
  ) {}

  @Delete('/:id')
  @CheckPolicies([AuthorizationActions.Delete, Sections.MEDIA])
  deleteMedia(@GetOrgFromRequest() org: Organization, @Param('id') id: string) {
    return this._mediaService.deleteMedia(org.id, id);
  }

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

  @Post('/upload-server')
  @CheckPolicies([AuthorizationActions.Create, Sections.MEDIA])
  @UseInterceptors(FileInterceptor('file', {
      storage: diskStorage({
          destination: TMP_UPLOAD_DIR,
      }),
      limits: { fileSize: parseInt(process.env.MEDIA_UPLOAD_MAX_BYTES || String(1024 * 1024 * 1024), 10) }
  }))
  @UsePipes(new CustomFileValidationPipe())
  async uploadServer(
    @GetOrgFromRequest() org: Organization,
    @UploadedFile() file: Express.Multer.File,
    @Body('folderId') folderId?: string
  ) {
    try {
      await this._storageService.assertWithinQuota(org.id, file?.size || 0);
      const originalName = file?.originalname || '';
      const adapter = await this._storageService.getLocalAdapterForOrg(org.id);
      const uploadedFile = await adapter.uploadFile(file);
      return this._mediaService.saveFile(
        org.id,
        uploadedFile.originalname,
        uploadedFile.path,
        originalName,
        folderId
      );
    } finally {
      if (file?.path) { try { await fs.promises.unlink(file.path); } catch { /* best-effort */ } }
    }
  }

  @Post('/save-media')
  @CheckPolicies([AuthorizationActions.Create, Sections.MEDIA])
  async saveMedia(
    @GetOrgFromRequest() org: Organization,
    @Req() req: Request,
    @Body('name') name: string,
    @Body('path') path: string,
    @Body('originalName') originalName: string,
    @Body('folderId') folderId?: string
  ) {
    if (!name) {
      return false;
    }
    return this._mediaService.saveFile(
      org.id,
      name,
      path,
      originalName || undefined,
      folderId
    );
  }

  @Post('/information')
  @CheckPolicies([AuthorizationActions.Update, Sections.MEDIA])
  saveMediaInformation(
    @GetOrgFromRequest() org: Organization,
    @Body() body: SaveMediaInformationDto
  ) {
    return this._mediaService.saveMediaInformation(org.id, body);
  }

  @Post('/upload-simple')
  @CheckPolicies([AuthorizationActions.Create, Sections.MEDIA])
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }))
  @UsePipes(new CustomFileValidationPipe())
  async uploadSimple(
    @GetOrgFromRequest() org: Organization,
    @UploadedFile('file') file: Express.Multer.File,
    @Body('preventSave') preventSave: string = 'false',
    @Body('folderId') folderId?: string
  ) {
    await this._storageService.assertWithinQuota(org.id, file?.size || 0);
    const originalName = file.originalname;
    const adapter = await this._storageService.getLocalAdapterForOrg(org.id);
    const getFile = await adapter.uploadFile(file);

    if (preventSave === 'true') {
      const { path } = getFile;
      return { path };
    }

    return this._mediaService.saveFile(
      org.id,
      getFile.originalname,
      getFile.path,
      originalName,
      folderId
    );
  }

  @Get('/')
  @CheckPolicies([AuthorizationActions.Read, Sections.MEDIA])
  getMedia(
    @GetOrgFromRequest() org: Organization,
    @Query('page') page: number,
    @Query('search') search?: string,
    @Query('folderId') folderId?: string,
    @Query('type') type?: string,
    @Query('tag') tag?: string,
    @Query('sort') sort?: string,
    @Query('order') order?: string,
    @Query('limit') limit?: string
  ) {
    return this._mediaService.getMedia(
      org.id,
      page,
      search,
      folderId,
      type,
      tag,
      sort,
      order,
      limit ? parseInt(limit, 10) : undefined
    );
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

  // ── Folder Endpoints ─────────────────────────────────────────

  @Get('/folders')
  @CheckPolicies([AuthorizationActions.Read, Sections.MEDIA])
  getFolderTree(@GetOrgFromRequest() org: Organization) {
    return this._mediaService.getFolderTree(org.id);
  }

  @Post('/folders')
  @CheckPolicies([AuthorizationActions.Create, Sections.MEDIA])
  createFolder(
    @GetOrgFromRequest() org: Organization,
    @Body() body: CreateFolderDto
  ) {
    return this._mediaService.createFolder(org.id, body);
  }

  @Put('/folders/:id')
  @CheckPolicies([AuthorizationActions.Update, Sections.MEDIA])
  updateFolder(
    @GetOrgFromRequest() org: Organization,
    @Param('id') id: string,
    @Body() body: UpdateFolderDto
  ) {
    return this._mediaService.updateFolder(org.id, id, body);
  }

  @Delete('/folders/:id')
  @CheckPolicies([AuthorizationActions.Delete, Sections.MEDIA])
  deleteFolder(
    @GetOrgFromRequest() org: Organization,
    @Param('id') id: string
  ) {
    return this._mediaService.deleteFolder(org.id, id);
  }

  // ── Media File Management ────────────────────────────────────

  @Put('/:id/move')
  @CheckPolicies([AuthorizationActions.Update, Sections.MEDIA])
  moveMedia(
    @GetOrgFromRequest() org: Organization,
    @Param('id') id: string,
    @Body() body: MoveMediaDto
  ) {
    return this._mediaService.moveMedia(org.id, id, body.folderId || null);
  }

  @Put('/:id/rename')
  @CheckPolicies([AuthorizationActions.Update, Sections.MEDIA])
  renameMedia(
    @GetOrgFromRequest() org: Organization,
    @Param('id') id: string,
    @Body() body: RenameMediaDto
  ) {
    return this._mediaService.renameMedia(org.id, id, body.name);
  }

  @Put('/:id/tags')
  @CheckPolicies([AuthorizationActions.Update, Sections.MEDIA])
  updateMediaTags(
    @GetOrgFromRequest() org: Organization,
    @Param('id') id: string,
    @Body() body: UpdateMediaTagsDto
  ) {
    return this._mediaService.updateMediaTags(org.id, id, body.tags);
  }

  @Put('/:id/description')
  @CheckPolicies([AuthorizationActions.Update, Sections.MEDIA])
  updateMediaDescription(
    @GetOrgFromRequest() org: Organization,
    @Param('id') id: string,
    @Body() body: UpdateMediaDescriptionDto
  ) {
    return this._mediaService.updateMediaDescription(org.id, id, body.description || '');
  }

  @Post('/bulk/delete')
  @CheckPolicies([AuthorizationActions.Delete, Sections.MEDIA])
  bulkDelete(
    @GetOrgFromRequest() org: Organization,
    @Body() body: BulkDeleteMediaDto
  ) {
    return this._mediaService.bulkDelete(org.id, body.ids);
  }

  @Post('/bulk/move')
  @CheckPolicies([AuthorizationActions.Update, Sections.MEDIA])
  bulkMove(
    @GetOrgFromRequest() org: Organization,
    @Body() body: BulkMoveMediaDto
  ) {
    return this._mediaService.bulkMove(org.id, body.ids, body.folderId || null);
  }

  @Get('/search')
  @CheckPolicies([AuthorizationActions.Read, Sections.MEDIA])
  searchMedia(
    @GetOrgFromRequest() org: Organization,
    @Query('q') query: string,
    @Query('folderId') folderId?: string
  ) {
    return this._mediaService.searchMedia(org.id, query, folderId);
  }

  @Get('/folder/:folderId')
  @CheckPolicies([AuthorizationActions.Read, Sections.MEDIA])
  getMediaByFolder(
    @GetOrgFromRequest() org: Organization,
    @Param('folderId') folderId: string,
    @Query('page') page: number
  ) {
    return this._mediaService.getMediaByFolder(org.id, folderId, page);
  }

  @Get('/folder/:folderId/contents')
  @CheckPolicies([AuthorizationActions.Read, Sections.MEDIA])
  getFolderContents(
    @GetOrgFromRequest() org: Organization,
    @Param('folderId') folderId: string
  ) {
    return this._mediaService.getFolderContents(folderId);
  }

  @Post('/bulk/save')
  @CheckPolicies([AuthorizationActions.Create, Sections.MEDIA])
  bulkSaveMedia(
    @GetOrgFromRequest() org: Organization,
    @Body() body: { items: Array<{ name: string; path: string; originalName?: string }> }
  ) {
    return this._mediaService.bulkSave(org.id, body.items);
  }

  @Post('/:id/trash')
  @CheckPolicies([AuthorizationActions.Delete, Sections.MEDIA])
  async softDelete(@GetOrgFromRequest() org: Organization, @Param('id') id: string) {
    await this._mediaService.softDelete(id, org.id);
    return { success: true };
  }

  @Post('/:id/restore')
  @CheckPolicies([AuthorizationActions.Update, Sections.MEDIA])
  async restore(@GetOrgFromRequest() org: Organization, @Param('id') id: string) {
    await this._mediaService.restore(id, org.id);
    return { success: true };
  }

  @Get('/trash')
  @CheckPolicies([AuthorizationActions.Read, Sections.MEDIA])
  async getTrash(@GetOrgFromRequest() org: Organization) {
    const trashed = await this._mediaService.getTrashed(org.id);
    return trashed;
  }

}
