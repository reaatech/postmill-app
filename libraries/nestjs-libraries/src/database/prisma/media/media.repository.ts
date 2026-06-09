import { PrismaRepository } from '@gitroom/nestjs-libraries/database/prisma/prisma.service';
import { Injectable } from '@nestjs/common';
import { SaveMediaInformationDto } from '@gitroom/nestjs-libraries/dtos/media/save.media.information.dto';

@Injectable()
export class MediaRepository {
  constructor(
    private _media: PrismaRepository<'media'>,
    private _mediaFolder: PrismaRepository<'mediaFolder'>
  ) {}

  saveFile(org: string, fileName: string, filePath: string, originalName?: string, folderId?: string) {
    const data: any = {
      organization: {
        connect: {
          id: org,
        },
      },
      name: fileName,
      path: filePath,
      originalName: originalName || null,
    };

    if (folderId) {
      data.folderId = folderId;
    }

    return this._media.model.media.create({
      data,
      select: {
        id: true,
        name: true,
        originalName: true,
        path: true,
        thumbnail: true,
        alt: true,
        folderId: true,
      },
    });
  }

  getMediaById(id: string) {
    return this._media.model.media.findUnique({
      where: {
        id,
      },
      include: {
        folder: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });
  }

  deleteMedia(org: string, id: string) {
    return this._media.model.media.update({
      where: {
        id,
        organizationId: org,
      },
      data: {
        deletedAt: new Date(),
      },
    });
  }

  saveMediaInformation(org: string, data: SaveMediaInformationDto) {
    return this._media.model.media.update({
      where: {
        id: data.id,
        organizationId: org,
      },
      data: {
        alt: data.alt,
        thumbnail: data.thumbnail,
        thumbnailTimestamp: data.thumbnailTimestamp,
      },
      select: {
        id: true,
        name: true,
        originalName: true,
        alt: true,
        thumbnail: true,
        path: true,
        thumbnailTimestamp: true,
      },
    });
  }

  async getMedia(
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
    const pageNum = (page || 1) - 1;
    const pageSize = limit || 18;
    const trimmedSearch = search?.trim();

    const where: any = {
      organizationId: org,
      deletedAt: null as null,
    };

    if (trimmedSearch) {
      where.OR = [
        { originalName: { contains: trimmedSearch, mode: 'insensitive' } },
        { name: { contains: trimmedSearch, mode: 'insensitive' } },
      ];
    }

    if (folderId !== undefined) {
      where.folderId = folderId === 'null' ? null : folderId;
    }

    if (type) {
      where.type = type;
    }

    if (tag) {
      where.tags = { contains: tag, mode: 'insensitive' };
    }

    const orderBy: any = {};
    if (sort === 'name') {
      orderBy.name = order === 'asc' ? 'asc' : 'desc';
    } else if (sort === 'size') {
      orderBy.fileSize = order === 'asc' ? 'asc' : 'desc';
    } else if (sort === 'type') {
      orderBy.type = order === 'asc' ? 'asc' : 'desc';
    } else {
      orderBy.createdAt = order === 'asc' ? 'asc' : 'desc';
    }

    const query = { where };

    const pages = Math.ceil((await this._media.model.media.count(query)) / pageSize);
    const results = await this._media.model.media.findMany({
      where,
      orderBy,
      select: {
        id: true,
        name: true,
        originalName: true,
        path: true,
        thumbnail: true,
        alt: true,
        thumbnailTimestamp: true,
        fileSize: true,
        type: true,
        tags: true,
        description: true,
        folderId: true,
        createdAt: true,
        folder: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      skip: pageNum * pageSize,
      take: pageSize,
    });

    return { pages, results };
  }

  // ── Folder CRUD ──────────────────────────────────────────────

  createFolder(org: string, data: {
    name: string;
    parentId?: string;
    description?: string;
    tags?: string[];
    color?: string;
    storageProviderId?: string;
  }) {
    return this._mediaFolder.model.mediaFolder.create({
      data: {
        organizationId: org,
        name: data.name,
        parentId: data.parentId || null,
        description: data.description || null,
        tags: data.tags ? JSON.stringify(data.tags) : null,
        color: data.color || null,
        storageProviderId: data.storageProviderId || null,
      },
    });
  }

  getFolder(id: string) {
    return this._mediaFolder.model.mediaFolder.findUnique({
      where: { id },
      include: {
        _count: {
          select: { media: true, children: true },
        },
      },
    });
  }

  updateFolder(id: string, data: {
    name?: string;
    description?: string;
    tags?: string[];
    color?: string;
  }) {
    return this._mediaFolder.model.mediaFolder.update({
      where: { id },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.description !== undefined ? { description: data.description } : {}),
        ...(data.tags !== undefined ? { tags: JSON.stringify(data.tags) } : {}),
        ...(data.color !== undefined ? { color: data.color } : {}),
      },
    });
  }

  async deleteFolder(id: string) {
    const folder = await this._mediaFolder.model.mediaFolder.findUnique({
      where: { id },
      include: { _count: { select: { media: true, children: true } } },
    });

    if (!folder) {
      return null;
    }

    if (folder._count.media > 0 || folder._count.children > 0) {
      throw new Error('Folder is not empty');
    }

    return this._mediaFolder.model.mediaFolder.delete({ where: { id } });
  }

  async getFolderTree(org: string) {
    const folders = await this._mediaFolder.model.mediaFolder.findMany({
      where: { organizationId: org },
      include: {
        _count: {
          select: { media: true, children: true },
        },
      },
      orderBy: { name: 'asc' },
    });

    return this._buildTree(folders);
  }

  private _buildTree(folders: any[], parentId: string | null = null): any[] {
    return folders
      .filter((f) => f.parentId === parentId)
      .map((f) => ({
        ...f,
        children: this._buildTree(folders, f.id),
      }));
  }

  // ── Media Operations ─────────────────────────────────────────

  moveMedia(mediaId: string, folderId: string | null) {
    return this._media.model.media.update({
      where: { id: mediaId },
      data: { folderId },
    });
  }

  async bulkDelete(org: string, ids: string[]) {
    await this._media.model.media.updateMany({
      where: {
        id: { in: ids },
        organizationId: org,
      },
      data: { deletedAt: new Date() },
    });
    return { success: true };
  }

  bulkMove(ids: string[], folderId: string | null) {
    return this._media.model.media.updateMany({
      where: { id: { in: ids } },
      data: { folderId },
    });
  }

  async searchMedia(org: string, query: string, folderId?: string) {
    const where: any = {
      organizationId: org,
      deletedAt: null as null,
      OR: [
        { name: { contains: query, mode: 'insensitive' } },
        { originalName: { contains: query, mode: 'insensitive' } },
        { tags: { contains: query, mode: 'insensitive' } },
        { description: { contains: query, mode: 'insensitive' } },
      ],
    };

    if (folderId) {
      where.folderId = folderId;
    }

    return this._media.model.media.findMany({
      where,
      select: {
        id: true,
        name: true,
        originalName: true,
        path: true,
        thumbnail: true,
        alt: true,
        fileSize: true,
        type: true,
        tags: true,
        description: true,
        folderId: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async getMediaByFolder(org: string, folderId: string, page: number, limit: number = 18) {
    const pageNum = (page || 1) - 1;

    const where = {
      organizationId: org,
      deletedAt: null as null,
      folderId,
    };

    const pages = Math.ceil((await this._media.model.media.count({ where })) / limit);
    const results = await this._media.model.media.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        originalName: true,
        path: true,
        thumbnail: true,
        alt: true,
        thumbnailTimestamp: true,
        fileSize: true,
        type: true,
        tags: true,
        description: true,
        folderId: true,
        createdAt: true,
      },
      skip: pageNum * limit,
      take: limit,
    });

    return { pages, results };
  }

  async getFolderContents(folderId: string) {
    const [mediaCount, childFolders] = await Promise.all([
      this._media.model.media.count({
        where: { folderId, deletedAt: null as null },
      }),
      this._mediaFolder.model.mediaFolder.findMany({
        where: { parentId: folderId },
        select: { id: true, name: true, _count: { select: { media: true } } },
      }),
    ]);

    return { mediaCount, childFolders };
  }

  updateMediaTags(mediaId: string, tags: string[]) {
    return this._media.model.media.update({
      where: { id: mediaId },
      data: { tags: JSON.stringify(tags) },
    });
  }

  updateMediaDescription(mediaId: string, description: string) {
    return this._media.model.media.update({
      where: { id: mediaId },
      data: { description },
    });
  }

  renameMedia(mediaId: string, name: string) {
    return this._media.model.media.update({
      where: { id: mediaId },
      data: { name },
    });
  }

  softDeleteMedia(mediaId: string) {
    return this._media.model.media.update({
      where: { id: mediaId },
      data: { deletedAt: new Date() },
    });
  }

  restoreMedia(mediaId: string) {
    return this._media.model.media.update({
      where: { id: mediaId },
      data: { deletedAt: null },
    });
  }

  getTrashedMedia(org: string) {
    return this._media.model.media.findMany({
      where: {
        organizationId: org,
        deletedAt: { not: null },
      },
      orderBy: { deletedAt: 'desc' },
    });
  }
}
