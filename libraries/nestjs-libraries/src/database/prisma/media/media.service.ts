import { HttpException, Injectable } from '@nestjs/common';
import { MediaRepository } from '@gitroom/nestjs-libraries/database/prisma/media/media.repository';
import { OpenaiService } from '@gitroom/nestjs-libraries/openai/openai.service';
import { SubscriptionService } from '@gitroom/nestjs-libraries/database/prisma/subscriptions/subscription.service';
import { Organization } from '@prisma/client';
import { SaveMediaInformationDto } from '@gitroom/nestjs-libraries/dtos/media/save.media.information.dto';
import { VideoManager } from '@gitroom/nestjs-libraries/videos/video.manager';
import { VideoDto } from '@gitroom/nestjs-libraries/dtos/videos/video.dto';
import { StorageService } from '@gitroom/nestjs-libraries/database/prisma/storage/storage.service';
import {
  AuthorizationActions,
  Sections,
  SubscriptionException,
} from '@gitroom/backend/services/auth/permissions/permission.exception.class';

@Injectable()
export class MediaService {
  constructor(
    private _mediaRepository: MediaRepository,
    private _openAi: OpenaiService,
    private _subscriptionService: SubscriptionService,
    private _videoManager: VideoManager,
    private _storageService: StorageService
  ) {}

  async deleteMedia(org: string, id: string) {
    return this._mediaRepository.deleteMedia(org, id);
  }

  getMediaById(id: string) {
    return this._mediaRepository.getMediaById(id);
  }

  async generateImage(
    prompt: string,
    org: Organization,
    generatePromptFirst?: boolean
  ) {
    const generating = await this._subscriptionService.useCredit(
      org,
      'ai_images',
      async () => {
        if (generatePromptFirst) {
          prompt = await this._openAi.generatePromptForPicture(prompt);
          console.log('Prompt:', prompt);
        }
        return this._openAi.generateImage(prompt);
      }
    );

    return generating;
  }

  saveFile(org: string, fileName: string, filePath: string, originalName?: string, folderId?: string) {
    return this._mediaRepository.saveFile(org, fileName, filePath, originalName, folderId);
  }

  getMedia(
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
    return this._mediaRepository.getMedia(org, page, search, folderId, type, tag, sort, order, limit);
  }

  saveMediaInformation(org: string, data: SaveMediaInformationDto) {
    return this._mediaRepository.saveMediaInformation(org, data);
  }

  getVideoOptions() {
    return this._videoManager.getAllVideos();
  }

  async generateVideoAllowed(org: Organization, type: string) {
    const video = this._videoManager.getVideoByName(type);
    if (!video) {
      throw new Error(`Video type ${type} not found`);
    }

    if (!video.trial && org.isTrailing) {
      throw new HttpException('This video is not available in trial mode', 406);
    }

    return true;
  }

  async generateVideo(org: Organization, body: VideoDto) {
    const totalCredits = await this._subscriptionService.checkCredits(
      org,
      'ai_videos'
    );

    if (totalCredits.credits <= 0) {
      throw new SubscriptionException({
        action: AuthorizationActions.Create,
        section: Sections.VIDEOS_PER_MONTH,
      });
    }

    const video = this._videoManager.getVideoByName(body.type);
    if (!video) {
      throw new Error(`Video type ${body.type} not found`);
    }

    if (!video.trial && org.isTrailing) {
      throw new HttpException('This video is not available in trial mode', 406);
    }

    console.log(body.customParams);
    await video.instance.processAndValidate(body.customParams);
    console.log('no err');

    return await this._subscriptionService.useCredit(
      org,
      'ai_videos',
      async () => {
        const loadedData = await video.instance.process(
          body.output,
          body.customParams,
          org.id
        );

        const file = await (await this._storageService.getLocalAdapterForOrg(org.id, true)).uploadSimple(loadedData);
        return this.saveFile(org.id, file.split('/').pop(), file);
      }
    );
  }

  async videoFunction(identifier: string, functionName: string, body: any) {
    const video = this._videoManager.getVideoByName(identifier);
    if (!video) {
      throw new Error(`Video with identifier ${identifier} not found`);
    }

    // @ts-ignore
    const functionToCall = video.instance[functionName];
    if (
      typeof functionToCall !== 'function' ||
      this._videoManager.checkAvailableVideoFunction(functionToCall)
    ) {
      throw new HttpException(
        `Function ${functionName} not found on video instance`,
        400
      );
    }

    return functionToCall(body);
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
      const parent = await this._mediaRepository.getFolder(data.parentId);
      if (!parent || parent.organizationId !== org) {
        throw new HttpException('Parent folder not found', 404);
      }
    }

    return this._mediaRepository.createFolder(org, data);
  }

  async getFolder(org: string, id: string) {
    const folder = await this._mediaRepository.getFolder(id);
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
    const folder = await this._mediaRepository.getFolder(id);
    if (!folder || folder.organizationId !== org) {
      throw new HttpException('Folder not found', 404);
    }
    return this._mediaRepository.updateFolder(id, data);
  }

  async deleteFolder(org: string, id: string) {
    const folder = await this._mediaRepository.getFolder(id);
    if (!folder || folder.organizationId !== org) {
      throw new HttpException('Folder not found', 404);
    }
    return this._mediaRepository.deleteFolder(id);
  }

  async getFolderTree(org: string) {
    return this._mediaRepository.getFolderTree(org);
  }

  // ── Media File Operations ────────────────────────────────────

  async moveMedia(org: string, mediaId: string, folderId: string | null) {
    const media = await this._mediaRepository.getMediaById(mediaId);
    if (!media || media.organizationId !== org) {
      throw new HttpException('Media not found', 404);
    }

    if (folderId) {
      const folder = await this._mediaRepository.getFolder(folderId);
      if (!folder || folder.organizationId !== org) {
        throw new HttpException('Folder not found', 404);
      }
    }

    return this._mediaRepository.moveMedia(mediaId, folderId);
  }

  async bulkDelete(org: string, ids: string[]) {
    return this._mediaRepository.bulkDelete(org, ids);
  }

  async bulkMove(org: string, ids: string[], folderId: string | null) {
    if (folderId) {
      const folder = await this._mediaRepository.getFolder(folderId);
      if (!folder || folder.organizationId !== org) {
        throw new HttpException('Folder not found', 404);
      }
    }
    return this._mediaRepository.bulkMove(ids, folderId);
  }

  searchMedia(org: string, query: string, folderId?: string) {
    return this._mediaRepository.searchMedia(org, query, folderId);
  }

  async getMediaByFolder(org: string, folderId: string, page: number) {
    const folder = await this._mediaRepository.getFolder(folderId);
    if (!folder || folder.organizationId !== org) {
      throw new HttpException('Folder not found', 404);
    }
    return this._mediaRepository.getMediaByFolder(org, folderId, page);
  }

  getFolderContents(folderId: string) {
    return this._mediaRepository.getFolderContents(folderId);
  }

  async updateMediaTags(org: string, mediaId: string, tags: string[]) {
    const media = await this._mediaRepository.getMediaById(mediaId);
    if (!media || media.organizationId !== org) {
      throw new HttpException('Media not found', 404);
    }
    return this._mediaRepository.updateMediaTags(mediaId, tags);
  }

  async updateMediaDescription(org: string, mediaId: string, description: string) {
    const media = await this._mediaRepository.getMediaById(mediaId);
    if (!media || media.organizationId !== org) {
      throw new HttpException('Media not found', 404);
    }
    return this._mediaRepository.updateMediaDescription(mediaId, description);
  }

  async renameMedia(org: string, mediaId: string, name: string) {
    const media = await this._mediaRepository.getMediaById(mediaId);
    if (!media || media.organizationId !== org) {
      throw new HttpException('Media not found', 404);
    }
    return this._mediaRepository.renameMedia(mediaId, name);
  }

  async bulkSave(org: string, items: Array<{ name: string; path: string; originalName?: string }>) {
    return Promise.all(
      items.map((item) =>
        this._mediaRepository.saveFile(org, item.name, item.path, item.originalName)
      )
    );
  }

  async softDelete(mediaId: string, org: string) {
    const media = await this._mediaRepository.getMediaById(mediaId);
    if (!media || media.organizationId !== org) {
      throw new HttpException('Media not found', 404);
    }
    return this._mediaRepository.softDeleteMedia(mediaId);
  }

  async restore(mediaId: string, org: string) {
    const media = await this._mediaRepository.getMediaById(mediaId);
    if (!media || media.organizationId !== org) {
      throw new HttpException('Media not found', 404);
    }
    return this._mediaRepository.restoreMedia(mediaId);
  }

  async getTrashed(org: string) {
    return this._mediaRepository.getTrashedMedia(org);
  }
}
