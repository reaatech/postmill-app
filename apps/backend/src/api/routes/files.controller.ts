import {
  Body,
  Controller,
  Delete,
  Get,
  HttpException,
  Param,
  Post,
  Put,
  Query,
  UploadedFile,
  UseInterceptors,
  UsePipes,
} from '@nestjs/common';
import { GetOrgFromRequest } from '@gitroom/nestjs-libraries/user/org.from.request';
import { Organization } from '@prisma/client';
import { FileService } from '@gitroom/nestjs-libraries/database/prisma/file/file.service';
import { CheckPolicies } from '@gitroom/backend/services/auth/permissions/permissions.ability';
import { AuthorizationActions, Sections } from '@gitroom/backend/services/auth/permissions/permission.exception.class';
import { ApiTags } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { CustomFileValidationPipe } from '@gitroom/nestjs-libraries/upload/custom.upload.validation';
import { StorageService } from '@gitroom/nestjs-libraries/database/prisma/storage/storage.service';
import { StockMediaService } from '@gitroom/nestjs-libraries/media/stock/stock-media.service';
import { MagnificDailyCapError } from '@gitroom/nestjs-libraries/media/stock/content-packs/magnific.content-pack';
import { RequirePermission } from '@gitroom/backend/services/auth/rbac/require-permission.decorator';
import { SaveMediaInformationDto } from '@gitroom/nestjs-libraries/dtos/file/save.media.information.dto';
import { CreateFolderDto } from '@gitroom/nestjs-libraries/dtos/file/create.folder.dto';
import { UpdateFolderDto } from '@gitroom/nestjs-libraries/dtos/file/update.folder.dto';
import { MoveMediaDto } from '@gitroom/nestjs-libraries/dtos/file/move.media.dto';
import { RenameMediaDto } from '@gitroom/nestjs-libraries/dtos/file/rename.media.dto';
import { UpdateMediaTagsDto } from '@gitroom/nestjs-libraries/dtos/file/update.media.tags.dto';
import { UpdateMediaDescriptionDto } from '@gitroom/nestjs-libraries/dtos/file/update.media.description.dto';
import { BulkDeleteMediaDto } from '@gitroom/nestjs-libraries/dtos/file/bulk.delete.media.dto';
import { BulkMoveMediaDto } from '@gitroom/nestjs-libraries/dtos/file/bulk.move.media.dto';
import { diskStorage } from 'multer';
import { tmpdir } from 'os';
import { mkdirSync } from 'fs';
import fs from 'fs';
import * as path from 'path';

const TMP_UPLOAD_DIR = path.join(tmpdir(), 'postmill-uploads');
try { mkdirSync(TMP_UPLOAD_DIR, { recursive: true }); } catch {}

@ApiTags('Files')
@Controller('/files')
export class FilesController {
  constructor(
    private _fileService: FileService,
    private _storageService: StorageService,
    private _stockMediaService: StockMediaService
  ) {}

  // ── File CRUD ────────────────────────────────────────────

  @Get('/')
  @CheckPolicies([AuthorizationActions.Read, Sections.MEDIA])
  @RequirePermission('media', 'read')
  getFiles(
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
    return this._fileService.getFiles(
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

  @Post('/upload-server')
  @CheckPolicies([AuthorizationActions.Create, Sections.MEDIA])
  @RequirePermission('media', 'create')
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
      const adapter = await this._storageService.resolveAdapterForFolder(folderId, org.id);
      await this._storageService.assertWithinProviderQuota(adapter, org.id, file?.size || 0);
      const originalName = file?.originalname || '';
      const uploadedFile = await adapter.uploadFile(file);
      return this._fileService.saveFile(
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

  @Post('/upload-simple')
  @CheckPolicies([AuthorizationActions.Create, Sections.MEDIA])
  @RequirePermission('media', 'create')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 50 * 1024 * 1024 } }))
  @UsePipes(new CustomFileValidationPipe())
  async uploadSimple(
    @GetOrgFromRequest() org: Organization,
    @UploadedFile('file') file: Express.Multer.File,
    @Body('preventSave') preventSave: string = 'false',
    @Body('folderId') folderId?: string
  ) {
    const adapter = await this._storageService.resolveAdapterForFolder(folderId, org.id);
    await this._storageService.assertWithinProviderQuota(adapter, org.id, file?.size || 0);
    const originalName = file.originalname;
    const getFile = await adapter.uploadFile(file);

    if (preventSave === 'true') {
      const { path } = getFile;
      return { path };
    }

    return this._fileService.saveFile(
      org.id,
      getFile.originalname,
      getFile.path,
      originalName,
      folderId
    );
  }

  @Post('/save-media')
  @CheckPolicies([AuthorizationActions.Create, Sections.MEDIA])
  @RequirePermission('media', 'create')
  async saveMedia(
    @GetOrgFromRequest() org: Organization,
    @Body('name') name: string,
    @Body('path') path: string,
    @Body('originalName') originalName: string,
    @Body('folderId') folderId?: string
  ) {
    if (!name) {
      return false;
    }
    return this._fileService.saveFile(
      org.id,
      name,
      path,
      originalName || undefined,
      folderId
    );
  }

  @Delete('/:id')
  @CheckPolicies([AuthorizationActions.Delete, Sections.MEDIA])
  @RequirePermission('media', 'delete')
  deleteFile(@GetOrgFromRequest() org: Organization, @Param('id') id: string) {
    return this._fileService.deleteFile(org.id, id);
  }

  @Post('/information')
  @CheckPolicies([AuthorizationActions.Update, Sections.MEDIA])
  @RequirePermission('media', 'update')
  saveMediaInformation(
    @GetOrgFromRequest() org: Organization,
    @Body() body: SaveMediaInformationDto
  ) {
    return this._fileService.saveMediaInformation(org.id, body);
  }

  // ── Folder Endpoints ─────────────────────────────────────────

  @Get('/folders')
  @CheckPolicies([AuthorizationActions.Read, Sections.MEDIA])
  @RequirePermission('media', 'read')
  getFolderTree(@GetOrgFromRequest() org: Organization) {
    return this._fileService.getFolderTree(org.id);
  }

  @Post('/folders')
  @CheckPolicies([AuthorizationActions.Create, Sections.MEDIA])
  @RequirePermission('media', 'create')
  createFolder(
    @GetOrgFromRequest() org: Organization,
    @Body() body: CreateFolderDto
  ) {
    return this._fileService.createFolder(org.id, body);
  }

  @Put('/folders/:id')
  @CheckPolicies([AuthorizationActions.Update, Sections.MEDIA])
  @RequirePermission('media', 'update')
  updateFolder(
    @GetOrgFromRequest() org: Organization,
    @Param('id') id: string,
    @Body() body: UpdateFolderDto
  ) {
    return this._fileService.updateFolder(org.id, id, body);
  }

  @Delete('/folders/:id')
  @CheckPolicies([AuthorizationActions.Delete, Sections.MEDIA])
  @RequirePermission('media', 'delete')
  deleteFolder(
    @GetOrgFromRequest() org: Organization,
    @Param('id') id: string
  ) {
    return this._fileService.deleteFolder(org.id, id);
  }

  // ── File Management ────────────────────────────────────

  @Put('/:id/move')
  @CheckPolicies([AuthorizationActions.Update, Sections.MEDIA])
  @RequirePermission('media', 'update')
  moveFile(
    @GetOrgFromRequest() org: Organization,
    @Param('id') id: string,
    @Body() body: MoveMediaDto
  ) {
    return this._fileService.moveFile(org.id, id, body.folderId || null);
  }

  @Put('/:id/rename')
  @CheckPolicies([AuthorizationActions.Update, Sections.MEDIA])
  @RequirePermission('media', 'update')
  renameFile(
    @GetOrgFromRequest() org: Organization,
    @Param('id') id: string,
    @Body() body: RenameMediaDto
  ) {
    return this._fileService.renameFile(org.id, id, body.name);
  }

  @Put('/:id/tags')
  @CheckPolicies([AuthorizationActions.Update, Sections.MEDIA])
  @RequirePermission('media', 'update')
  updateFileTags(
    @GetOrgFromRequest() org: Organization,
    @Param('id') id: string,
    @Body() body: UpdateMediaTagsDto
  ) {
    return this._fileService.updateFileTags(org.id, id, body.tags);
  }

  @Put('/:id/description')
  @CheckPolicies([AuthorizationActions.Update, Sections.MEDIA])
  @RequirePermission('media', 'update')
  updateFileDescription(
    @GetOrgFromRequest() org: Organization,
    @Param('id') id: string,
    @Body() body: UpdateMediaDescriptionDto
  ) {
    return this._fileService.updateFileDescription(org.id, id, body.description || '');
  }

  @Post('/bulk/delete')
  @CheckPolicies([AuthorizationActions.Delete, Sections.MEDIA])
  @RequirePermission('media', 'delete')
  bulkDelete(
    @GetOrgFromRequest() org: Organization,
    @Body() body: BulkDeleteMediaDto
  ) {
    return this._fileService.bulkDelete(org.id, body.ids);
  }

  @Post('/bulk/move')
  @CheckPolicies([AuthorizationActions.Update, Sections.MEDIA])
  @RequirePermission('media', 'update')
  bulkMove(
    @GetOrgFromRequest() org: Organization,
    @Body() body: BulkMoveMediaDto
  ) {
    return this._fileService.bulkMove(org.id, body.ids, body.folderId || null);
  }

  @Get('/search')
  @CheckPolicies([AuthorizationActions.Read, Sections.MEDIA])
  @RequirePermission('media', 'read')
  searchFiles(
    @GetOrgFromRequest() org: Organization,
    @Query('q') query: string,
    @Query('folderId') folderId?: string
  ) {
    return this._fileService.searchFiles(org.id, query, folderId);
  }

  @Get('/folder/:folderId')
  @CheckPolicies([AuthorizationActions.Read, Sections.MEDIA])
  @RequirePermission('media', 'read')
  getFilesByFolder(
    @GetOrgFromRequest() org: Organization,
    @Param('folderId') folderId: string,
    @Query('page') page: number
  ) {
    return this._fileService.getFilesByFolder(org.id, folderId, page);
  }

  @Get('/folder/:folderId/contents')
  @CheckPolicies([AuthorizationActions.Read, Sections.MEDIA])
  @RequirePermission('media', 'read')
  getFolderContents(
    @GetOrgFromRequest() org: Organization,
    @Param('folderId') folderId: string
  ) {
    return this._fileService.getFolderContents(folderId);
  }

  @Post('/bulk/save')
  @CheckPolicies([AuthorizationActions.Create, Sections.MEDIA])
  @RequirePermission('media', 'create')
  bulkSaveFiles(
    @GetOrgFromRequest() org: Organization,
    @Body() body: { items: Array<{ name: string; path: string; originalName?: string }> }
  ) {
    return this._fileService.bulkSave(org.id, body.items);
  }

  @Post('/:id/trash')
  @CheckPolicies([AuthorizationActions.Delete, Sections.MEDIA])
  @RequirePermission('media', 'delete')
  async softDelete(@GetOrgFromRequest() org: Organization, @Param('id') id: string) {
    await this._fileService.softDelete(id, org.id);
    return { success: true };
  }

  @Post('/:id/restore')
  @CheckPolicies([AuthorizationActions.Update, Sections.MEDIA])
  @RequirePermission('media', 'update')
  async restore(@GetOrgFromRequest() org: Organization, @Param('id') id: string) {
    await this._fileService.restore(id, org.id);
    return { success: true };
  }

  @Get('/trash')
  @CheckPolicies([AuthorizationActions.Read, Sections.MEDIA])
  @RequirePermission('media', 'read')
  async getTrash(@GetOrgFromRequest() org: Organization) {
    const trashed = await this._fileService.getTrashed(org.id);
    return trashed;
  }

  // ── Import from URL ────────────────────────────────────

  @Post('/import')
  @CheckPolicies([AuthorizationActions.Create, Sections.MEDIA])
  @RequirePermission('media', 'create')
  async importFromUrl(
    @GetOrgFromRequest() org: Organization,
    @Body() body: { url: string; name: string; folderId?: string; source?: string; downloadLocation?: string; attribution?: Record<string, unknown>; type?: string }
  ) {
    if (body.source === 'magnific' && body.downloadLocation) {
      try {
        const licensedUrl = await this._stockMediaService.resolveMagnificDownload(
          org.id,
          body.downloadLocation,
          (body.type as any) || 'photos'
        );
        return this._fileService.importFromUrl(org.id, { ...body, url: licensedUrl });
      } catch (err) {
        if (err instanceof MagnificDailyCapError) {
          throw new HttpException(err.message, 402);
        }
        throw new HttpException((err as Error).message, 500);
      }
    }

    const result = await this._fileService.importFromUrl(org.id, body);
    if (body.source === 'unsplash' && body.downloadLocation) {
      await this._stockMediaService.triggerDownload(body.downloadLocation);
    }
    return result;
  }
}
