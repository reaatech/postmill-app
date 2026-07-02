import { Injectable } from '@nestjs/common';
import { DefaultsResolutionService } from './defaults-resolution.service';
import { AIModelProvider } from '@gitroom/nestjs-libraries/ai/ai-model.provider';
import { AiMediaService } from '@gitroom/nestjs-libraries/ai/governance/media.service';
import {
  DefaultNotConfiguredError,
  DefaultOperationNotImplementedError,
} from './defaults.errors';

export { DefaultNotConfiguredError, DefaultOperationNotImplementedError };

@Injectable()
export class AiDefaultsService {
  constructor(
    private _resolution: DefaultsResolutionService,
    private _aiModelProvider: AIModelProvider,
    private _aiMediaService: AiMediaService,
  ) {}

  // ── Text utilities ─────────────────────────────────────────────────────────

  async lowReasoningText(orgId: string, prompt: string, opts?: { temperature?: number; maxTokens?: number }) {
    return this._textForCategory('low-reasoning', orgId, prompt, opts);
  }

  async highReasoningText(orgId: string, prompt: string, opts?: { temperature?: number; maxTokens?: number }) {
    return this._textForCategory('high-reasoning', orgId, prompt, opts);
  }

  async workflow(
    orgId: string,
    messages: Array<{ role: string; content: string }>,
    opts?: { temperature?: number; maxTokens?: number; [key: string]: unknown },
  ) {
    const resolved = await this._require('ai', 'workflow', orgId);
    return this._aiModelProvider.generateTextWithModel(
      orgId,
      resolved.providerId,
      resolved.version,
      resolved.model,
      { messages, ...opts },
    );
  }

  async vision(orgId: string, imageUrl: string, prompt: string) {
    const resolved = await this._require('ai', 'vision', orgId);
    return this._aiModelProvider.generateTextWithModel(
      orgId,
      resolved.providerId,
      resolved.version,
      resolved.model,
      { imageUrl, prompt },
    );
  }

  async altText(orgId: string, imageUrl: string): Promise<{ altText: string }> {
    const resolved = await this._require('ai', 'vision', orgId);
    const altText = await this._aiModelProvider.generateTextWithModel(
      orgId,
      resolved.providerId,
      resolved.version,
      resolved.model,
      {
        imageUrl,
        prompt:
          'Describe this image in one concise sentence suitable as alt text. Return only the description, no markdown or explanation.',
      },
    );
    return { altText };
  }

  private async _textForCategory(
    category: 'low-reasoning' | 'high-reasoning',
    orgId: string,
    prompt: string,
    opts?: { temperature?: number; maxTokens?: number },
  ) {
    const resolved = await this._require('ai', category, orgId);
    return this._aiModelProvider.generateTextWithModel(
      orgId,
      resolved.providerId,
      resolved.version,
      resolved.model,
      { prompt, ...opts },
    );
  }

  // ── Media utilities (implemented) ──────────────────────────────────────────
  //
  // F-3: every media utility first resolves the org's configured media default for
  // its category and throws the typed `DefaultNotConfiguredError` (→ 409) when none
  // exists, BEFORE delegating to `AiMediaService`. Without this guard the delegation
  // would silently fall back to ANY capability-matching provider and surface a generic
  // `CapabilityNotAvailable` instead of the plan's typed "no default configured" error.
  // The success path (a default IS configured) is unchanged — `AiMediaService` still
  // re-resolves internally for the actual provider/model.

  async textToImage(orgId: string, prompt: string) {
    await this._requireMedia(orgId, 'text-to-image');
    return this._aiMediaService.generateImage(prompt, { orgId });
  }

  async textToVideo(orgId: string, prompt: string) {
    await this._requireMedia(orgId, 'text-to-video');
    return this._aiMediaService.generateVideo(prompt, { orgId });
  }

  async textToSpeech(orgId: string, text: string, opts?: { voice?: string }) {
    await this._requireMedia(orgId, 'text-to-speech');
    return this._aiMediaService.textToSpeech(text, { orgId, voice: opts?.voice });
  }

  async textToMusic(orgId: string, prompt: string) {
    await this._requireMedia(orgId, 'text-to-music');
    return this._aiMediaService.generateAudio(prompt, { orgId });
  }

  async imageUpscale(orgId: string, imageUrl: string) {
    await this._requireMedia(orgId, 'image-upscale');
    return this._aiMediaService.upscaleImage(imageUrl, { orgId });
  }

  async imageBgRemove(orgId: string, imageUrl: string) {
    await this._requireMedia(orgId, 'image-bg-remove');
    return this._aiMediaService.removeBackground(imageUrl, { orgId });
  }

  async imageInpaint(orgId: string, imageUrl: string, maskUrl: string, prompt: string) {
    await this._requireMedia(orgId, 'image-inpaint');
    return this._aiMediaService.inpaintImage(imageUrl, maskUrl, prompt, { orgId });
  }

  async imageFocalPoint(orgId: string, imageUrl: string) {
    // Focal-point detection uses the AI vision default, not a media default.
    await this._require('ai', 'vision', orgId);
    return this._aiMediaService.detectFocalPoint(imageUrl, { orgId });
  }

  // ── Media utilities (pending new pipelines) ─────────────────────────────────

  async imageToImage(orgId: string, prompt: string, imageUrl: string) {
    await this._requireMedia(orgId, 'image-to-image');
    return this._aiMediaService.generateImage(prompt, { orgId, sourceUrl: imageUrl });
  }

  async imageToVideo(orgId: string, prompt: string, imageUrl: string) {
    await this._requireMedia(orgId, 'image-to-video');
    return this._aiMediaService.generateVideo(prompt, { orgId, sourceUrl: imageUrl });
  }

  async videoToVideo(orgId: string, prompt: string, videoUrl: string) {
    await this._requireMedia(orgId, 'video-to-video');
    return this._aiMediaService.generateVideo(prompt, {
      orgId,
      sourceUrl: videoUrl,
      category: 'video-to-video',
    });
  }

  async imageSlide(orgId: string, prompt: string, imageUrls?: string[]) {
    await this._requireMedia(orgId, 'image-slide');
    return this._aiMediaService.generateSlide(orgId, prompt, imageUrls);
  }

  async videoAvatar(orgId: string, script: string, opts?: { imageUrl?: string; avatarId?: string }) {
    await this._requireMedia(orgId, 'video-avatar');
    return this._aiMediaService.generateAvatar(script, { orgId, sourceUrl: opts?.imageUrl });
  }

  async videoCaption(orgId: string, videoUrl: string) {
    await this._requireMedia(orgId, 'video-caption');
    return this._aiMediaService.captionVideo(orgId, videoUrl);
  }

  async videoBackground(orgId: string, videoUrl: string, _opts?: { background?: string }) {
    await this._requireMedia(orgId, 'video-background');
    return this._aiMediaService.removeVideoBackground(videoUrl, { orgId });
  }

  async videoUpscale(orgId: string, videoUrl: string) {
    await this._requireMedia(orgId, 'video-upscale');
    return this._aiMediaService.upscaleVideo(videoUrl, { orgId });
  }

  // ── Shared helpers ─────────────────────────────────────────────────────────

  private async _requireMedia(orgId: string, category: string) {
    return this._require('media', category, orgId);
  }

  private async _require(domain: 'ai' | 'media', category: string, orgId: string) {
    const resolved = await this._resolution.resolve(domain, category, orgId);
    if (!resolved) {
      throw new DefaultNotConfiguredError(category);
    }
    return resolved;
  }
}
