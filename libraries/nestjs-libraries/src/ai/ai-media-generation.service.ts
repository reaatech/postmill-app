import { HttpException, Injectable } from '@nestjs/common';
import { OpenaiService } from '@gitroom/nestjs-libraries/openai/openai.service';
import { SubscriptionService } from '@gitroom/nestjs-libraries/database/prisma/subscriptions/subscription.service';
import { Organization } from '@prisma/client';
import { VideoManager } from '@gitroom/nestjs-libraries/videos/video.manager';
import { VideoDto } from '@gitroom/nestjs-libraries/dtos/videos/video.dto';
import { StorageService } from '@gitroom/nestjs-libraries/database/prisma/storage/storage.service';
import { FileService } from '@gitroom/nestjs-libraries/database/prisma/file/file.service';
import {
  AuthorizationActions,
  Sections,
  SubscriptionException,
} from '@gitroom/backend/services/auth/permissions/permission.exception.class';
import { AiMediaService } from '@gitroom/nestjs-libraries/ai/governance/media.service';


@Injectable()
export class AiMediaGenerationService {
  constructor(
    private _openAi: OpenaiService,
    private _subscriptionService: SubscriptionService,
    private _videoManager: VideoManager,
    private _storageService: StorageService,
    private _fileService: FileService,
    private _aiMediaService: AiMediaService
  ) {}

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
        }
        return this._openAi.generateImage(prompt);
      }
    );

    return generating;
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

    await video.instance.processAndValidate(body.customParams);

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
        return this._fileService.saveFile(org.id, file.split('/').pop(), file);
      }
    );
  }

  async videoFunction(identifier: string, functionName: string, body: any) {
    const video = this._videoManager.getVideoByName(identifier);
    if (!video) {
      throw new Error(`Video with identifier ${identifier} not found`);
    }

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

  removeBackground(org: Organization, imageUrl: string) {
    return this._aiMediaService.removeBackground(imageUrl, { orgId: org.id });
  }

  inpaintImage(
    org: Organization,
    imageUrl: string,
    maskUrl: string,
    prompt: string
  ) {
    return this._aiMediaService.inpaintImage(imageUrl, maskUrl, prompt, {
      orgId: org.id,
    });
  }

  upscaleImage(org: Organization, imageUrl: string, scale?: number) {
    return this._aiMediaService.upscaleImage(imageUrl, { orgId: org.id, scale });
  }

  async textToSpeech(org: Organization, text: string, voice?: string) {
    const buffer = await this._aiMediaService.textToSpeech(text, { orgId: org.id, voice });
    const adapter = await this._storageService.getLocalAdapterForOrg(org.id, true);
    const fileName = `voiceover-${Date.now()}.mp3`;
    const path = await adapter.writeBuffer(buffer, 'audio/mpeg');
    const saved = await this._fileService.saveFile(org.id, fileName, path, fileName);
    return { id: saved.id, path: saved.path, name: saved.name };
  }

  async speechToText(org: Organization, audioUrl: string) {
    const res = await fetch(audioUrl);
    if (!res.ok) {
      throw new HttpException('Could not fetch audio for transcription', 400);
    }
    const arrayBuffer = await res.arrayBuffer();
    const text = await this._aiMediaService.speechToText(Buffer.from(arrayBuffer), { orgId: org.id });
    return { text };
  }

  async speechToTextWords(org: Organization, audioUrl: string) {
    const res = await fetch(audioUrl);
    if (!res.ok) {
      throw new HttpException('Could not fetch audio for transcription', 400);
    }
    const arrayBuffer = await res.arrayBuffer();
    return this._aiMediaService.speechToTextWords(Buffer.from(arrayBuffer), { orgId: org.id });
  }

  detectFocalPoint(org: Organization, imageUrl: string) {
    return this._aiMediaService.detectFocalPoint(imageUrl, { orgId: org.id });
  }
}
