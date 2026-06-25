import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import { safeFetch } from '@gitroom/nestjs-libraries/dtos/webhooks/safe.fetch';
import { RedisService } from '@gitroom/nestjs-libraries/redis/redis.service';
import { OrgContentPackSettingsService } from '@gitroom/nestjs-libraries/database/prisma/content-packs/org-content-pack-settings.service';
import { MagnificContentPack, type ContentPackCapability } from './content-packs/magnific.content-pack';
import {
  StockAudioItem,
  StockIconItem,
  StockPhotoItem,
  StockSearchResponse,
  StockStickerItem,
  StockVectorItem,
  StockVideoItem,
} from './stock.types';

const CACHE_TTL_SECONDS = 60;

@Injectable()
export class StockMediaService {
  constructor(
    private readonly _redis: RedisService,
    private readonly _contentPacks: OrgContentPackSettingsService
  ) {}

  private get unsplashKey(): string | undefined {
    return process.env.UNSPLASH_ACCESS_KEY;
  }

  private get pexelsKey(): string | undefined {
    return process.env.PEXELS_API_KEY;
  }

  private get pixabayKey(): string | undefined {
    return process.env.PIXABAY_API_KEY;
  }

  private get giphyKey(): string | undefined {
    return process.env.GIPHY_API_KEY;
  }

  private get jamendoClientId(): string | undefined {
    return process.env.JAMENDO_CLIENT_ID;
  }

  // ── Photos ─────────────────────────────────────────────────

  async searchPhotos(
    orgId: string,
    query: string,
    page: number = 1,
    orientation?: string,
    color?: string
  ): Promise<StockSearchResponse<StockPhotoItem>> {
    return this.resolveSearch(
      orgId,
      'photos',
      query,
      page,
      { orientation, color },
      () => this.searchPhotosFree(query, page, orientation, color)
    );
  }

  private async searchPhotosFree(
    query: string,
    page: number = 1,
    orientation?: string,
    color?: string
  ): Promise<StockSearchResponse<StockPhotoItem>> {
    if (!this.unsplashKey) {
      return { results: [], page, totalPages: 0, configured: false, source: 'unsplash' };
    }

    const cacheKey = this.buildCacheKey('unsplash', 'photos', query, page, orientation, color);
    return this.withCache(cacheKey, async () => {
      if (!query) {
        const params = new URLSearchParams({ page: String(page), per_page: '20' });
        if (orientation) params.set('orientation', orientation);
        const res = await safeFetch(`https://api.unsplash.com/photos?${params}`, {
          headers: { Authorization: `Client-ID ${this.unsplashKey}` },
        });
        const data = await res.json();
        const photos = Array.isArray(data) ? data : [];
        return {
          results: photos.map(this.mapUnsplashPhoto.bind(this)),
          page,
          totalPages: 100,
          configured: true,
          source: 'unsplash',
        };
      }

      const params = new URLSearchParams({ query, page: String(page), per_page: '20' });
      if (orientation) params.set('orientation', orientation);
      if (color) params.set('color', color);
      const res = await safeFetch(`https://api.unsplash.com/search/photos?${params}`, {
        headers: { Authorization: `Client-ID ${this.unsplashKey}` },
      });
      const data = (await res.json()) as any;
      return {
        results: (data.results || []).map(this.mapUnsplashPhoto.bind(this)),
        page,
        totalPages: data.total_pages || 0,
        configured: true,
        source: 'unsplash',
      };
    });
  }

  async getRelatedPhotos(photoId: string): Promise<StockPhotoItem[]> {
    if (!this.unsplashKey) return [];
    const res = await safeFetch(`https://api.unsplash.com/photos/${photoId}/related`, {
      headers: { Authorization: `Client-ID ${this.unsplashKey}` },
    });
    const data = (await res.json()) as any;
    return (data.results || []).map(this.mapUnsplashPhoto.bind(this));
  }

  // ── Videos ─────────────────────────────────────────────────

  async searchVideos(
    orgId: string,
    query: string,
    page: number = 1,
    orientation?: string,
    size?: string
  ): Promise<StockSearchResponse<StockVideoItem>> {
    return this.resolveSearch(
      orgId,
      'videos',
      query,
      page,
      { orientation, size },
      () => this.searchVideosFree(query, page, orientation, size)
    );
  }

  private async searchVideosFree(
    query: string,
    page: number = 1,
    orientation?: string,
    size?: string
  ): Promise<StockSearchResponse<StockVideoItem>> {
    if (!this.pexelsKey) {
      return { results: [], page, totalPages: 0, configured: false, source: 'pexels' };
    }

    const cacheKey = this.buildCacheKey('pexels', 'videos', query, page, orientation, size);
    return this.withCache(cacheKey, async () => {
      const endpoint = query
        ? 'https://api.pexels.com/videos/search'
        : 'https://api.pexels.com/videos/popular';
      const params = new URLSearchParams({ page: String(page), per_page: '15' });
      if (query) params.set('query', query);
      if (orientation) params.set('orientation', orientation);
      if (size) params.set('size', size);
      const res = await safeFetch(`${endpoint}?${params}`, {
        headers: { Authorization: this.pexelsKey! },
      });
      const data = (await res.json()) as any;
      return {
        results: (data.videos || []).map(this.mapPexelsVideo.bind(this)),
        page,
        totalPages: Math.ceil((data.total_results || 0) / 15),
        configured: true,
        source: 'pexels',
      };
    });
  }

  async getRelatedVideos(videoId: string): Promise<StockVideoItem[]> {
    if (!this.pexelsKey) return [];
    const res = await safeFetch(`https://api.pexels.com/videos/videos/${videoId}`, {
      headers: { Authorization: this.pexelsKey },
    });
    const video = (await res.json()) as any;
    if (!video || !video.id) return [];

    return this.searchVideosFree(video.url?.split('/').pop() || '', 1).then((r) => r.results);
  }

  // ── Vectors (Pixabay) ──────────────────────────────────────

  async searchVectors(
    orgId: string,
    query: string,
    page: number = 1,
    orientation?: string,
    color?: string
  ): Promise<StockSearchResponse<StockVectorItem>> {
    return this.resolveSearch(
      orgId,
      'vectors',
      query,
      page,
      { orientation, color },
      () => this.searchVectorsFree(query, page, orientation, color)
    );
  }

  private async searchVectorsFree(
    query: string,
    page: number = 1,
    orientation?: string,
    color?: string
  ): Promise<StockSearchResponse<StockVectorItem>> {
    if (!this.pixabayKey) {
      return { results: [], page, totalPages: 0, configured: false, source: 'pixabay' };
    }

    const cacheKey = this.buildCacheKey('pixabay', 'vectors', query, page, orientation, color);
    return this.withCache(cacheKey, async () => {
      const params = new URLSearchParams({
        key: this.pixabayKey!,
        q: query || '',
        page: String(page),
        per_page: '20',
        image_type: 'vector',
        safesearch: 'true',
      });
      if (orientation) params.set('orientation', orientation);
      if (color) params.set('colors', color);

      const res = await safeFetch(`https://pixabay.com/api/?${params}`);
      if (!res.ok) {
        return { results: [], page, totalPages: 0, configured: true, source: 'pixabay' };
      }
      const data = (await res.json()) as any;
      const hits = Array.isArray(data?.hits) ? data.hits : [];
      const totalHits = typeof data?.totalHits === 'number' ? data.totalHits : hits.length;

      return {
        results: hits.map(this.mapPixabayVector.bind(this)),
        page,
        totalPages: Math.max(1, Math.ceil(totalHits / 20)),
        configured: true,
        source: 'pixabay',
      };
    });
  }

  // ── Stickers (GIPHY) ───────────────────────────────────────

  async searchStickers(
    orgId: string,
    query: string,
    page: number = 1
  ): Promise<StockSearchResponse<StockStickerItem>> {
    return this.resolveSearch(
      orgId,
      'stickers',
      query,
      page,
      {},
      () => this.searchStickersFree(query, page)
    );
  }

  private async searchStickersFree(
    query: string,
    page: number = 1
  ): Promise<StockSearchResponse<StockStickerItem>> {
    if (!this.giphyKey) {
      return { results: [], page, totalPages: 0, configured: false, source: 'giphy' };
    }

    const cacheKey = this.buildCacheKey('giphy', 'stickers', query, page);
    return this.withCache(cacheKey, async () => {
      const limit = 20;
      const offset = (page - 1) * limit;
      // GIPHY search requires a query; fall back to trending so the tab has
      // content on load (matching the photos/videos behaviour).
      const endpoint = query
        ? 'https://api.giphy.com/v1/stickers/search'
        : 'https://api.giphy.com/v1/stickers/trending';
      const params = new URLSearchParams({
        api_key: this.giphyKey!,
        limit: String(limit),
        offset: String(offset),
        rating: 'g',
        lang: 'en',
      });
      if (query) params.set('q', query);

      const res = await safeFetch(`${endpoint}?${params}`);
      if (!res.ok) {
        return { results: [], page, totalPages: 0, configured: true, source: 'giphy' };
      }
      const data = (await res.json()) as any;
      const items = Array.isArray(data?.data) ? data.data : [];
      const total = typeof data?.pagination?.total_count === 'number' ? data.pagination.total_count : items.length;

      return {
        results: items.map(this.mapGiphySticker.bind(this)),
        page,
        totalPages: Math.max(1, Math.ceil(total / limit)),
        configured: true,
        source: 'giphy',
      };
    });
  }

  // ── Icons (Iconify) ────────────────────────────────────────

  async searchIcons(
    orgId: string,
    query: string,
    page: number = 1
  ): Promise<StockSearchResponse<StockIconItem>> {
    return this.resolveSearch(
      orgId,
      'icons',
      query,
      page,
      {},
      () => this.searchIconsFree(query, page)
    );
  }

  private async searchIconsFree(query: string, page: number = 1): Promise<StockSearchResponse<StockIconItem>> {
    // Iconify's search endpoint requires a non-empty query (an empty one returns
    // a plain-text "Bad request"). Show the empty state instead of erroring.
    if (!query.trim()) {
      return { results: [], page, totalPages: 0, configured: true, source: 'iconify' };
    }

    const cacheKey = this.buildCacheKey('iconify', 'icons', query, page);
    return this.withCache(cacheKey, async () => {
      const limit = 32;
      const start = (page - 1) * limit;
      const params = new URLSearchParams({
        query,
        limit: String(limit),
        start: String(start),
      });

      const res = await safeFetch(`https://api.iconify.design/search?${params}`);
      if (!res.ok) {
        return { results: [], page, totalPages: 0, configured: true, source: 'iconify' };
      }
      const data = (await res.json()) as any;
      const icons: string[] = Array.isArray(data?.icons) ? data.icons : [];
      const total = typeof data?.total === 'number' ? data.total : icons.length;
      const collections: Record<string, any> = data?.collections || {};

      return {
        results: icons.map((id: string) => this.mapIconifyIcon(id, collections)),
        page,
        totalPages: Math.max(1, Math.ceil(total / limit)),
        configured: true,
        source: 'iconify',
      };
    });
  }

  // ── Audio (Jamendo) ────────────────────────────────────────

  async searchAudio(
    orgId: string,
    query: string,
    page: number = 1
  ): Promise<StockSearchResponse<StockAudioItem>> {
    return this.resolveSearch(
      orgId,
      'audio',
      query,
      page,
      {},
      () => this.searchAudioFree(query, page)
    );
  }

  private async searchAudioFree(query: string, page: number = 1): Promise<StockSearchResponse<StockAudioItem>> {
    const clientId = this.jamendoClientId;
    if (!clientId) {
      return { results: [], page, totalPages: 0, configured: false, source: 'jamendo' };
    }

    const cacheKey = this.buildCacheKey('jamendo', 'audio', query, page);
    return this.withCache(cacheKey, async () => {
      const limit = 20;
      const offset = (page - 1) * limit;
      const params = new URLSearchParams({
        client_id: clientId,
        format: 'json',
        limit: String(limit),
        offset: String(offset),
        include: 'musicinfo',
        audioformat: 'mp32',
      });
      if (query) params.set('search', query);
      else params.set('order', 'popularity_total');

      try {
        const res = await safeFetch(`https://api.jamendo.com/v3.0/tracks?${params}`);
        const data = (await res.json()) as any;
        const hits = Array.isArray(data?.results) ? data.results : [];
        const total =
          typeof data?.headers?.results_fullcount === 'number'
            ? data.headers.results_fullcount
            : hits.length;
        return {
          results: hits.map((h: any) => ({
            id: String(h.id),
            url: h.audio || h.audiodownload || '',
            name: h.name || 'Untitled',
            duration: typeof h.duration === 'number' ? h.duration : 0,
            author: h.artist_name || 'Unknown',
            source: 'jamendo',
          })),
          page,
          totalPages: Math.max(1, Math.ceil(total / limit)),
          configured: true,
          source: 'jamendo',
        };
      } catch {
        return { results: [], page, totalPages: 0, configured: false, source: 'jamendo' };
      }
    });
  }

  // ── Premium mint-then-ingest ─────────────────────────────────

  async resolveMagnificDownload(
    orgId: string,
    id: string,
    capability: ContentPackCapability = 'photos'
  ) {
    // Caller is responsible for having an active Magnific pack; this is used by /files/import.
    const active = await this._contentPacks.getActiveForCapability(orgId, capability);
    if (!active) {
      throw new Error('No active Magnific content pack');
    }
    const pack = new MagnificContentPack(active.credentials.apiKey);
    return pack.resolveDownload(id, capability);
  }

  // ── Download triggers ──────────────────────────────────────

  async triggerDownload(downloadLocation: string): Promise<void> {
    if (!this.unsplashKey) return;
    try {
      await safeFetch(downloadLocation, {
        headers: { Authorization: `Client-ID ${this.unsplashKey}` },
      });
    } catch {
      // Non-fatal
    }
  }

  // ── Resolution & caching ───────────────────────────────────

  private async resolveSearch<T>(
    orgId: string,
    capability: ContentPackCapability | 'stickers' | 'audio',
    query: string,
    page: number,
    filters: Record<string, string | undefined>,
    freeSearch: () => Promise<StockSearchResponse<T>>
  ): Promise<StockSearchResponse<T>> {
    const premiumCapabilities: ContentPackCapability[] = ['photos', 'vectors', 'icons', 'videos'];
    if (premiumCapabilities.includes(capability as ContentPackCapability)) {
      const active = await this._contentPacks.getActiveForCapability(orgId, capability as ContentPackCapability);
      if (active) {
        const pack = new MagnificContentPack(active.credentials.apiKey);
        return pack.search(
          capability as ContentPackCapability,
          query,
          page,
          Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== undefined)) as Record<string, string>
        );
      }
    }
    return freeSearch();
  }

  private buildCacheKey(
    source: string,
    capability: string,
    ...parts: Array<string | number | undefined>
  ): string {
    const input = parts
      .filter((p): p is string | number => p !== undefined && p !== null && p !== '')
      .join('|');
    const hash = createHash('sha256').update(input).digest('hex');
    return `stock:${source}:${capability}:${hash}`;
  }

  private async withCache<T>(
    key: string,
    fetcher: () => Promise<StockSearchResponse<T>>,
    ttl = CACHE_TTL_SECONDS
  ): Promise<StockSearchResponse<T>> {
    try {
      const cached = await this._redis.get(key);
      if (cached) {
        return JSON.parse(cached) as StockSearchResponse<T>;
      }
    } catch {
      // Redis unavailable — fall through to fetch.
    }

    const result = await fetcher();

    // Negative-cache empty results so a missing key / no hits doesn't hammer the API.
    try {
      await this._redis.set(key, JSON.stringify(result), ttl).catch(() => {});
    } catch {
      // ignore
    }

    return result;
  }

  // ── Mappers ────────────────────────────────────────────────

  private mapUnsplashPhoto(photo: any): StockPhotoItem {
    return {
      id: photo.id,
      url: photo.urls?.full || photo.urls?.regular || '',
      thumbUrl: photo.urls?.thumb || photo.urls?.small || '',
      description: photo.alt_description || photo.description || null,
      author: photo.user?.name || 'Unknown',
      authorUrl: photo.user?.links?.html || '',
      sourceUrl: photo.links?.html || '',
      downloadLocation: photo.links?.download_location || null,
      width: photo.width || 0,
      height: photo.height || 0,
      color: photo.color || null,
      source: 'unsplash',
    };
  }

  private mapPexelsVideo(video: any): StockVideoItem {
    const hdFile =
      video.video_files?.find((f: any) => f.quality === 'hd') || video.video_files?.[0];
    return {
      id: String(video.id),
      url: hdFile?.link || '',
      thumbUrl: video.image || '',
      description: video.url || null,
      author: video.user?.name || 'Unknown',
      authorUrl: video.user?.url || '',
      sourceUrl: video.url || '',
      width: video.width || 0,
      height: video.height || 0,
      duration: video.duration || 0,
      source: 'pexels',
    };
  }

  private mapPixabayVector(hit: any): StockVectorItem {
    return {
      id: String(hit.id),
      url: hit.largeImageURL || hit.imageURL || hit.webformatURL || '',
      thumbUrl: hit.previewURL || hit.webformatURL || '',
      description: hit.tags || null,
      author: hit.user || 'Unknown',
      authorUrl: `https://pixabay.com/users/${hit.user}-${hit.user_id}/`,
      sourceUrl: hit.pageURL || '',
      width: hit.imageWidth || 0,
      height: hit.imageHeight || 0,
      source: 'pixabay',
      attribution: { provider: 'Pixabay', userId: hit.user_id },
    };
  }

  private mapGiphySticker(item: any): StockStickerItem {
    const images = item.images || {};
    const thumb = images.fixed_width_small || images.fixed_height_small || images.preview_gif || images.original || {};
    const full = images.original || images.fixed_width || images.fixed_height || {};
    const mp4 = images.preview_mp4 || images.fixed_width_small_mp4 || {};
    return {
      id: String(item.id),
      url: full.url || thumb.url || '',
      thumbUrl: thumb.url || full.url || '',
      description: item.title || null,
      author: item.user?.display_name || item.username || 'GIPHY',
      authorUrl: item.user?.profile_url || 'https://giphy.com',
      sourceUrl: item.url || 'https://giphy.com',
      width: full.width ? parseInt(full.width, 10) : thumb.width ? parseInt(thumb.width, 10) : 0,
      height: full.height ? parseInt(full.height, 10) : thumb.height ? parseInt(thumb.height, 10) : 0,
      source: 'giphy',
      isSticker: true,
      mp4Url: mp4.url,
      attribution: { provider: 'GIPHY' },
    };
  }

  private mapIconifyIcon(id: string, collections: Record<string, any>): StockIconItem {
    const [prefix, iconName] = id.split(':');
    const collection = prefix ? collections[prefix] : undefined;
    const license = collection?.license || 'Unknown';
    const licenseUrl = collection?.licenseUrl;
    return {
      id,
      url: `https://api.iconify.design/${prefix}/${iconName}.svg`,
      thumbUrl: `https://api.iconify.design/${prefix}/${iconName}.svg`,
      description: iconName || null,
      author: collection?.author?.name || collection?.name || prefix || 'Unknown',
      authorUrl: collection?.author?.url || `https://iconify.design/collection/${prefix}`,
      sourceUrl: `https://iconify.design/collection/${prefix}/${iconName}`,
      width: 24,
      height: 24,
      source: 'iconify',
      prefix: prefix || '',
      iconName: iconName || '',
      license,
      licenseUrl,
      attribution: {
        provider: 'Iconify',
        prefix,
        set: collection?.name,
        license,
        licenseUrl,
      },
    };
  }
}
