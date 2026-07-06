/**
 * Single source of truth for file upload size limits used by both the server
 * validation pipe and the client-side Uppy pre-processor.
 *
 * Env overrides allow operators to raise/lower caps without rebuilding the
 * frontend; the client reads these limits from `/settings/bootstrap` (or a
 * dedicated endpoint) so it never needs to hardcode them.
 */

const MB = 1024 * 1024;
const GB = 1024 * MB;

function envBytes(key: string, fallbackBytes: number): number {
  const raw = process.env[key];
  if (!raw) {
    return fallbackBytes;
  }
  const parsed = parseInt(raw, 10);
  return Number.isNaN(parsed) || parsed <= 0 ? fallbackBytes : parsed;
}

export const UPLOAD_LIMITS = {
  image: {
    maxBytes: envBytes('UPLOAD_IMAGE_MAX_BYTES', 10 * MB),
  },
  video: {
    maxBytes: envBytes('UPLOAD_VIDEO_MAX_BYTES', 1 * GB),
  },
  audio: {
    maxBytes: envBytes('UPLOAD_AUDIO_MAX_BYTES', 50 * MB),
  },
  // Overall multipart cap used by FileInterceptor / raw upload endpoints.
  // Defaults to 1 GB; this is a backstop, not the per-category limit.
  maxBytes: envBytes('MEDIA_UPLOAD_MAX_BYTES', 1 * GB),
} as const;

export const UPLOAD_ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/avif',
  'image/bmp',
  'image/tiff',
  'video/mp4',
  'audio/mpeg',
  'audio/mp4',
  'audio/wav',
  'audio/ogg',
]);

export interface UploadLimitCheckFile {
  size: number;
  mimetype: string;
}

/**
 * Shared limit check used by the server `CustomFileValidationPipe` and the
 * client-side Uppy pre-processor. Returns an object so callers can decide how
 * to surface the rejection.
 */
export function checkUploadLimit(
  file: UploadLimitCheckFile,
  limits = UPLOAD_LIMITS
): { ok: boolean; reason?: string } {
  if (!UPLOAD_ALLOWED_MIME_TYPES.has(file.mimetype)) {
    return { ok: false, reason: 'Unsupported file type.' };
  }

  const maxBytes = file.mimetype.startsWith('image/')
    ? limits.image.maxBytes
    : file.mimetype.startsWith('video/')
      ? limits.video.maxBytes
      : limits.audio.maxBytes;

  if (file.size > maxBytes) {
    return {
      ok: false,
      reason: `File size exceeds the maximum allowed size of ${maxBytes} bytes.`,
    };
  }

  return { ok: true };
}
