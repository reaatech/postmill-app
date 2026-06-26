import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { OrgMediaProviderSettingsService } from '@gitroom/nestjs-libraries/database/prisma/media-providers/org-media-provider-settings.service';
import { MediaJobLifecycleService } from '@gitroom/nestjs-libraries/database/prisma/media-providers/media-job-lifecycle.service';
import { StorageService } from '@gitroom/nestjs-libraries/database/prisma/storage/storage.service';
import { FileService } from '@gitroom/nestjs-libraries/database/prisma/file/file.service';
import { MediaProviderRegistry } from '@gitroom/nestjs-libraries/media/media-provider.registry';

export interface TranscriptWord {
  word: string;
  start: number;
  end: number;
}

export interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
}

export interface TranscriptResult {
  text: string;
  words: TranscriptWord[];
  segments: TranscriptSegment[];
}

// Extension → MIME for the Content-Type Deepgram receives. Deepgram demuxes audio
// from video containers, so video/* sources transcribe fine.
const MIME_BY_EXT: Record<string, string> = {
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  oga: 'audio/ogg',
  flac: 'audio/flac',
  webm: 'audio/webm',
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  m4v: 'video/mp4',
};

// Phrase chunking for caption segments — mirrors the Designer timeline's grouping so a
// transcript lines up with what auto-captions produce there.
const MAX_WORDS_PER_SEGMENT = 12;

// Bespoke Deepgram (STT) studio backend. Unlike the kit studios, Deepgram returns text
// rather than a media artifact, so it has its own controller/service instead of riding
// the generic MediaStudioService.
@Injectable()
export class DeepgramService {
  private readonly _logger = new Logger(DeepgramService.name);

  constructor(
    private readonly _orgMediaProviderSettings: OrgMediaProviderSettingsService,
    private readonly _lifecycle: MediaJobLifecycleService,
    private readonly _storage: StorageService,
    private readonly _fileService: FileService,
    private readonly _registry: MediaProviderRegistry,
  ) {}

  async getStatus(orgId: string): Promise<{ configured: boolean }> {
    const config = await this._orgMediaProviderSettings.getConfigForProvider(orgId, 'deepgram');
    const key = config?.credentials?.apiKey || config?.credentials?.key || config?.credentials?.token;
    return { configured: !!key };
  }

  async transcribe(
    orgId: string,
    params: { fileId: string; model?: string; language?: string },
  ): Promise<TranscriptResult> {
    const adapter = this._registry.get('deepgram');
    if (!adapter?.speechToTextWords) {
      throw new ForbiddenException('Deepgram transcription is not available.');
    }

    const config = await this._orgMediaProviderSettings.getConfigForProvider(orgId, 'deepgram');
    const credentials = config?.credentials;
    if (!credentials || Object.keys(credentials).length === 0) {
      throw new ForbiddenException('Deepgram is not configured. Add an API key in Settings → Media.');
    }

    const { buffer, mimeType } = await this._readFile(orgId, params.fileId);

    const { text, words } = await adapter.speechToTextWords(buffer, {
      credentials,
      model: params.model || 'nova-2',
      mimeType,
      input: {
        smartFormat: true,
        ...(params.language ? { language: params.language } : {}),
      },
    });

    return { text, words, segments: this._buildSegments(words, text) };
  }

  // Persist a transcript as a text document under the org's media tree (best path for
  // reuse as post copy). Bypasses the /files import content-type allowlist by writing
  // straight to tenant storage via the lifecycle helper.
  async saveTranscript(
    orgId: string,
    params: { text: string; segments?: TranscriptSegment[] },
  ): Promise<{ path: string; fileId: string }> {
    const stored = await this._lifecycle.storeTranscript({
      organizationId: orgId,
      provider: 'deepgram',
      text: params.text,
      segments: params.segments,
    });
    return { path: stored.path, fileId: stored.mediaId };
  }

  // ── internals ──

  private async _readFile(orgId: string, fileId: string): Promise<{ buffer: Buffer; mimeType: string }> {
    const file = await this._fileService.getFileById(fileId);
    if (!file || file.organizationId !== orgId) {
      throw new ForbiddenException('File not found');
    }
    // readFile resolves the bytes for both local (handles full /uploads URLs) and cloud
    // (object key) storage — no outbound HTTP, so no SSRF surface for internal URLs.
    const adapter = file.folderId
      ? await this._storage.resolveAdapterForFolder(file.folderId, orgId)
      : await this._storage.getLocalAdapterForOrg(orgId, true);
    const buffer = await adapter.readFile(file.path);
    return { buffer, mimeType: this._mimeForPath(file.path) };
  }

  private _mimeForPath(path: string): string {
    const ext = path.split('?')[0].split('.').pop()?.toLowerCase() || '';
    return MIME_BY_EXT[ext] || 'audio/mpeg';
  }

  private _buildSegments(words: TranscriptWord[], fallbackText: string): TranscriptSegment[] {
    if (!words.length) {
      return fallbackText ? [{ start: 0, end: 0, text: fallbackText }] : [];
    }
    const segments: TranscriptSegment[] = [];
    let current: TranscriptWord[] = [];
    for (const w of words) {
      current.push(w);
      const endsPhrase = /[.!?]$/.test(w.word) || current.length >= MAX_WORDS_PER_SEGMENT;
      if (endsPhrase) {
        segments.push(this._segmentFromWords(current));
        current = [];
      }
    }
    if (current.length) segments.push(this._segmentFromWords(current));
    return segments;
  }

  private _segmentFromWords(words: TranscriptWord[]): TranscriptSegment {
    return {
      start: words[0].start,
      end: words[words.length - 1].end,
      text: words.map((w) => w.word).join(' '),
    };
  }
}
