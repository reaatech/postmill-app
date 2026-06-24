import { HttpException, Injectable } from '@nestjs/common';
import { FileRepository } from '@gitroom/nestjs-libraries/database/prisma/file/file.repository';
import { Organization } from '@prisma/client';
import { SaveMediaInformationDto } from '@gitroom/nestjs-libraries/dtos/file/save.media.information.dto';
import { StorageService } from '@gitroom/nestjs-libraries/database/prisma/storage/storage.service';
import { safeFetch } from '@gitroom/nestjs-libraries/dtos/webhooks/safe.fetch';
import { IStorageAdapter } from '@gitroom/nestjs-libraries/upload/upload.interface';

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/avif',
  'image/bmp', 'image/tiff', 'video/mp4',
  'audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/ogg',
]);

const MAX_IMPORT_SIZE = 512 * 1024 * 1024; // 512 MB

@Injectable()
export class FileService {
  constructor(
    private _fileRepository: FileRepository,
    private _storageService: StorageService
  ) {}

  async deleteFile(org: string, id: string) {
    return this._fileRepository.deleteFile(org, id);
  }

  getFileById(id: string) {
    return this._fileRepository.getFileById(id);
  }

  getFileByPath(org: string, filePath: string) {
    return this._fileRepository.getFileByPath(org, filePath);
  }

  saveFile(org: string, fileName: string, filePath: string, originalName?: string, folderId?: string) {
    return this._fileRepository.saveFile(org, fileName, filePath, originalName, folderId);
  }

  getFiles(
    org: string,
    page: number,
    search?: string,
    folderId?: string,
    type?: string,
    tag?: string,
    sort?: string,
    order?: string,
    limit?: number
  ) {
    return this._fileRepository.getFiles(org, page, search, folderId, type, tag, sort, order, limit);
  }

  saveMediaInformation(org: string, data: SaveMediaInformationDto) {
    return this._fileRepository.saveMediaInformation(org, data);
  }

  // ── Folder Operations ────────────────────────────────────────

  async createFolder(org: string, data: {
    name: string;
    parentId?: string;
    description?: string;
    tags?: string[];
    color?: string;
    storageProviderId?: string;
  }) {
    if (data.parentId) {
      const parent = await this._fileRepository.getFolder(data.parentId);
      if (!parent || parent.organizationId !== org) {
        throw new HttpException('Parent folder not found', 404);
      }
    }

    return this._fileRepository.createFolder(org, data);
  }

  async getFolder(org: string, id: string) {
    const folder = await this._fileRepository.getFolder(id);
    if (!folder || folder.organizationId !== org) {
      throw new HttpException('Folder not found', 404);
    }
    return folder;
  }

  async updateFolder(org: string, id: string, data: {
    name?: string;
    description?: string;
    tags?: string[];
    color?: string;
  }) {
    const folder = await this._fileRepository.getFolder(id);
    if (!folder || folder.organizationId !== org) {
      throw new HttpException('Folder not found', 404);
    }
    return this._fileRepository.updateFolder(id, data);
  }

  async deleteFolder(org: string, id: string) {
    const folder = await this._fileRepository.getFolder(id);
    if (!folder || folder.organizationId !== org) {
      throw new HttpException('Folder not found', 404);
    }
    return this._fileRepository.deleteFolder(id);
  }

  async getFolderTree(org: string) {
    return this._fileRepository.getFolderTree(org);
  }

  // ── File Operations ────────────────────────────────────

  async moveFile(org: string, fileId: string, folderId: string | null) {
    const file = await this._fileRepository.getFileById(fileId);
    if (!file || file.organizationId !== org) {
      throw new HttpException('File not found', 404);
    }

    if (folderId) {
      const folder = await this._fileRepository.getFolder(folderId);
      if (!folder || folder.organizationId !== org) {
        throw new HttpException('Folder not found', 404);
      }
    }

    return this._fileRepository.moveFile(fileId, folderId);
  }

  async bulkDelete(org: string, ids: string[]) {
    return this._fileRepository.bulkDelete(org, ids);
  }

  async bulkMove(org: string, ids: string[], folderId: string | null) {
    if (folderId) {
      const folder = await this._fileRepository.getFolder(folderId);
      if (!folder || folder.organizationId !== org) {
        throw new HttpException('Folder not found', 404);
      }
    }
    return this._fileRepository.bulkMove(ids, folderId);
  }

  searchFiles(org: string, query: string, folderId?: string) {
    return this._fileRepository.searchFiles(org, query, folderId);
  }

  async getFilesByFolder(org: string, folderId: string, page: number) {
    const folder = await this._fileRepository.getFolder(folderId);
    if (!folder || folder.organizationId !== org) {
      throw new HttpException('Folder not found', 404);
    }
    return this._fileRepository.getFilesByFolder(org, folderId, page);
  }

  getFolderContents(folderId: string) {
    return this._fileRepository.getFolderContents(folderId);
  }

  async updateFileTags(org: string, fileId: string, tags: string[]) {
    const file = await this._fileRepository.getFileById(fileId);
    if (!file || file.organizationId !== org) {
      throw new HttpException('File not found', 404);
    }
    return this._fileRepository.updateFileTags(fileId, tags);
  }

  async updateFileDescription(org: string, fileId: string, description: string) {
    const file = await this._fileRepository.getFileById(fileId);
    if (!file || file.organizationId !== org) {
      throw new HttpException('File not found', 404);
    }
    return this._fileRepository.updateFileDescription(fileId, description);
  }

  async renameFile(org: string, fileId: string, name: string) {
    const file = await this._fileRepository.getFileById(fileId);
    if (!file || file.organizationId !== org) {
      throw new HttpException('File not found', 404);
    }
    return this._fileRepository.renameFile(fileId, name);
  }

  async bulkSave(org: string, items: Array<{ name: string; path: string; originalName?: string }>) {
    return Promise.all(
      items.map((item) =>
        this._fileRepository.saveFile(org, item.name, item.path, item.originalName)
      )
    );
  }

  async softDelete(fileId: string, org: string) {
    const file = await this._fileRepository.getFileById(fileId);
    if (!file || file.organizationId !== org) {
      throw new HttpException('File not found', 404);
    }
    return this._fileRepository.softDeleteFile(fileId);
  }

  async restore(fileId: string, org: string) {
    const file = await this._fileRepository.getFileById(fileId);
    if (!file || file.organizationId !== org) {
      throw new HttpException('File not found', 404);
    }
    return this._fileRepository.restoreFile(fileId);
  }

  async getTrashed(org: string) {
    return this._fileRepository.getTrashedFiles(org);
  }

  // ── Import from URL ──────────────────────────────────────────

  async importFromUrl(
    orgId: string,
    data: {
      url: string;
      name: string;
      folderId?: string | null;
      type?: string;
      source?: string;
      attribution?: Record<string, unknown>;
    }
  ) {
    const adapter = await this._storageService.resolveAdapterForFolder(data.folderId, orgId);

    const response = await safeFetch(data.url);

    const contentLength = response.headers.get('content-length');
    if (contentLength) {
      const size = parseInt(contentLength, 10);
      if (size > MAX_IMPORT_SIZE) {
        throw new HttpException('File too large (max 512 MB)', 413);
      }
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > MAX_IMPORT_SIZE) {
      throw new HttpException('File too large (max 512 MB)', 413);
    }

    await this._storageService.assertWithinProviderQuota(adapter, orgId, buffer.length);

    const contentType = data.type || response.headers.get('content-type') || 'application/octet-stream';
    if (!ALLOWED_MIME_TYPES.has(contentType)) {
      throw new HttpException(`File type not allowed: ${contentType}`, 415);
    }

    const path = await adapter.writeBuffer(buffer, contentType);

    const fileSize = buffer.length;

    return this._fileRepository.saveGeneratedMedia(orgId, {
      name: data.name,
      path,
      type: contentType.startsWith('video/') ? 'video' : 'image',
      folderId: data.folderId,
      fileSize,
      metadata: {
        ...(data.source ? { source: data.source } : {}),
        ...(data.attribution ? { attribution: data.attribution } : {}),
      },
    });
  }
}
