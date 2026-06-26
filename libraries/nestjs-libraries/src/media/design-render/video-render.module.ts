import { Module } from '@nestjs/common';
import { VideoRenderService } from './video-render.service';
import { ChromiumFrameCaptureService } from './chromium-frame-capture.service';
import { FfmpegVideoEncoderService } from './ffmpeg-video-encoder.service';

// AiSettingsService and EncryptionService are resolved from the @Global() DatabaseModule.
@Module({
  providers: [
    VideoRenderService,
    ChromiumFrameCaptureService,
    FfmpegVideoEncoderService,
  ],
  exports: [
    VideoRenderService,
    ChromiumFrameCaptureService,
    FfmpegVideoEncoderService,
  ],
})
export class VideoRenderModule {}
