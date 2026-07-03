import '@gitroom/nestjs-libraries/ai-designer/agent-mesh/agent-mesh-env.shim';
import { Injectable, OnModuleInit } from '@nestjs/common';
import {
  registerInProcessAgent,
  type InProcessHandler,
} from '@reaatech/agent-mesh-router';
import type { AgentResponse } from '@reaatech/agent-mesh';
import sharp from 'sharp';
import { AiDefaultsService } from '@gitroom/nestjs-libraries/ai/defaults/ai-defaults.service';
import { FileService } from '@gitroom/nestjs-libraries/database/prisma/file/file.service';
import { StorageService } from '@gitroom/nestjs-libraries/database/prisma/storage/storage.service';
import { StockMediaService } from '@gitroom/nestjs-libraries/media/stock/stock-media.service';
import type { AssetResult } from '../../ai-designer.types';

const AI_DESIGNER_ASSET_TIMEOUT_MS =
  Number(process.env.AI_DESIGNER_ASSET_TIMEOUT_MS) || 90000;

// Provider-returned data: URLs bypass `importFromUrl`'s allowlist/size guard,
// so this path enforces its own: raster-image MIMEs only (no SVG — it can
// carry scripts and these files land on the shared uploads host) and the same
// 512 MB cap the media-job lifecycle uses for data-URL decodes.
const ALLOWED_DATA_URL_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
]);
const MAX_DATA_URL_MEDIA_BYTES = 512 * 1024 * 1024;

interface AssetNeed {
  slotId: string;
  brief: string;
  prefer: 'generate' | 'stock' | 'either';
}

interface AssetRequestInput {
  type: 'asset-request';
  assetNeeds: AssetNeed[];
  orgId: string;
  referenceFileIds?: string[];
}

@Injectable()
export class AiDesignerAssetService implements OnModuleInit {
  constructor(
    private readonly _aiDefaults: AiDefaultsService,
    private readonly _fileService: FileService,
    private readonly _storageService: StorageService,
    private readonly _stockMedia: StockMediaService
  ) {}

  onModuleInit() {
    registerInProcessAgent('asset', this._handler.bind(this));
  }

  private _handler: InProcessHandler = async (
    context
  ): Promise<AgentResponse> => {
    const payload = JSON.parse(context.raw_input) as AssetRequestInput;
    const assets: Record<string, AssetResult> = {};

    await Promise.all(
      payload.assetNeeds.map(async (need) => {
        const result = await this._resolveAsset(payload.orgId, need);
        if (result) {
          assets[need.slotId] = result;
        }
      })
    );

    return {
      content: JSON.stringify({
        type: 'assets',
        assets,
      }),
      workflow_complete: false,
    };
  };

  private async _resolveAsset(
    orgId: string,
    need: AssetNeed
  ): Promise<AssetResult | null> {
    if (need.prefer === 'generate' || need.prefer === 'either') {
      try {
        const url = await this._generateImageWithTimeout(orgId, need.brief);
        if (url.startsWith('https:')) {
          const file = await this._fileService.importFromUrl(orgId, {
            url,
            name: need.brief.slice(0, 40),
          });
          return this._toResult(need.slotId, file);
        }
        if (url.startsWith('data:')) {
          const file = await this._importDataUrl(orgId, url, need.brief);
          if (file) return this._toResult(need.slotId, file);
        }
      } catch {
        // Swallow provider/timeout/capability errors and try stock.
      }
    }

    const stock = await this._tryStock(orgId, need);
    if (stock) return stock;

    return this._fallbackGradient(orgId, need);
  }

  private async _generateImageWithTimeout(
    orgId: string,
    brief: string
  ): Promise<string> {
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error('Asset generation timed out')),
        AI_DESIGNER_ASSET_TIMEOUT_MS
      );
    });
    try {
      return await Promise.race([
        this._aiDefaults.textToImage(orgId, brief),
        timeout,
      ]);
    } finally {
      if (timer) {
        clearTimeout(timer);
      }
    }
  }

  private async _tryStock(
    orgId: string,
    need: AssetNeed
  ): Promise<AssetResult | null> {
    try {
      const response = await this._stockMedia.searchPhotos(
        orgId,
        need.brief,
        1
      );
      const item = response.results[0];
      if (!item) {
        return null;
      }

      const file = await this._fileService.importFromUrl(orgId, {
        url: item.url,
        name: need.brief.slice(0, 40),
        source: item.source,
        attribution: item.attribution,
      });

      return this._toResult(need.slotId, file);
    } catch {
      return null;
    }
  }

  private async _importDataUrl(
    orgId: string,
    dataUrl: string,
    brief: string
  ): Promise<{ id: string; path: string } | null> {
    const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) return null;

    const mime = match[1] || 'image/png';
    if (!ALLOWED_DATA_URL_MIME_TYPES.has(mime)) return null;
    // Reject before decoding: base64 expands ~4/3, so a payload string longer
    // than this cannot decode under the byte cap.
    if (match[2].length > (MAX_DATA_URL_MEDIA_BYTES / 3) * 4) return null;
    try {
      const buffer = Buffer.from(match[2], 'base64');
      if (buffer.length > MAX_DATA_URL_MEDIA_BYTES) return null;
      const adapter = await this._storageService.getLocalAdapterForOrg(orgId, true);
      const path = await adapter.writeBuffer(buffer, mime);
      const file = await this._fileService.saveGeneratedMedia(orgId, {
        name: brief.slice(0, 40) || 'ai-asset',
        path,
        type: mime,
        folderId: null,
        fileSize: buffer.length,
      });
      return { id: file.id, path: file.path };
    } catch {
      return null;
    }
  }

  private async _fallbackGradient(
    orgId: string,
    need: AssetNeed
  ): Promise<AssetResult | null> {
    try {
      const size = 512;
      const svg = this._buildFallbackSvg(need.brief, size);
      const buffer = await sharp(Buffer.from(svg))
        .resize(size, size, { fit: 'fill' })
        .png()
        .toBuffer();

      const adapter = await this._storageService.getLocalAdapterForOrg(orgId, true);
      const path = await adapter.writeBuffer(buffer, 'image/png');
      const file = await this._fileService.saveGeneratedMedia(orgId, {
        name: `${need.brief.slice(0, 40)}-fallback`,
        path,
        type: 'image/png',
        folderId: null,
        fileSize: buffer.length,
      });

      return this._toResult(need.slotId, file);
    } catch {
      return null;
    }
  }

  private _buildFallbackSvg(brief: string, size: number): string {
    const { from, to } = this._colorsFromBrief(brief);
    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${from}"/>
      <stop offset="100%" stop-color="${to}"/>
    </linearGradient>
  </defs>
  <rect width="${size}" height="${size}" fill="url(#g)"/>
</svg>`;
  }

  private _colorsFromBrief(brief: string): { from: string; to: string } {
    const lower = brief.toLowerCase();
    if (lower.includes('blue') || lower.includes('professional')) {
      return { from: '#2B5CD3', to: '#d4e0f0' };
    }
    if (lower.includes('warm') || lower.includes('sunset')) {
      return { from: '#f59e0b', to: '#ef4444' };
    }
    if (lower.includes('dark') || lower.includes('night')) {
      return { from: '#111827', to: '#374151' };
    }
    return { from: '#e5e7eb', to: '#9ca3af' };
  }

  private _toResult(
    slotId: string,
    file: { id: string; path: string }
  ): AssetResult {
    return {
      slotId,
      fileId: file.id,
      path: file.path,
      type: 'image',
    };
  }
}
