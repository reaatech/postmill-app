import { Injectable } from '@nestjs/common';
import { safeFetch } from '@gitroom/nestjs-libraries/dtos/webhooks/safe.fetch';
import { StockPhotoItem, StockVideoItem, StockSearchResponse } from './stock.types';

@Injectable()
export class StockMediaService {
  private get unsplashKey(): string | undefined {
    return process.env.UNSPLASH_ACCESS_KEY;
  }

  private get pexelsKey(): string | undefined {
    return process.env.PEXELS_API_KEY;
  }

  async searchPhotos(query: string, page: number = 1, orientation?: string, color?: string): Promise<StockSearchResponse<StockPhotoItem>> {
    if (!this.unsplashKey) return { results: [], page, totalPages: 0, configured: false };

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
      };
    }

    const params = new URLSearchParams({ query, page: String(page), per_page: '20' });
    if (orientation) params.set('orientation', orientation);
    if (color) params.set('color', color);
    const res = await safeFetch(`https://api.unsplash.com/search/photos?${params}`, {
      headers: { Authorization: `Client-ID ${this.unsplashKey}` },
    });
    const data = await res.json() as any;
    return {
      results: (data.results || []).map(this.mapUnsplashPhoto.bind(this)),
      page,
      totalPages: data.total_pages || 0,
      configured: true,
    };
  }

  async getRelatedPhotos(photoId: string): Promise<StockPhotoItem[]> {
    if (!this.unsplashKey) return [];
    const res = await safeFetch(`https://api.unsplash.com/photos/${photoId}/related`, {
      headers: { Authorization: `Client-ID ${this.unsplashKey}` },
    });
    const data = await res.json() as any;
    return (data.results || []).map(this.mapUnsplashPhoto.bind(this));
  }

  async searchVideos(query: string, page: number = 1, orientation?: string, size?: string): Promise<StockSearchResponse<StockVideoItem>> {
    if (!this.pexelsKey) return { results: [], page, totalPages: 0, configured: false };

    const endpoint = query
      ? 'https://api.pexels.com/videos/search'
      : 'https://api.pexels.com/videos/popular';
    const params = new URLSearchParams({ page: String(page), per_page: '15' });
    if (query) params.set('query', query);
    if (orientation) params.set('orientation', orientation);
    if (size) params.set('size', size);
    const res = await safeFetch(`${endpoint}?${params}`, {
      headers: { Authorization: this.pexelsKey },
    });
    const data = await res.json() as any;
    return {
      results: (data.videos || []).map(this.mapPexelsVideo.bind(this)),
      page,
      totalPages: Math.ceil((data.total_results || 0) / 15),
      configured: true,
    };
  }

  async getRelatedVideos(videoId: string): Promise<StockVideoItem[]> {
    if (!this.pexelsKey) return [];
    const res = await safeFetch(`https://api.pexels.com/videos/videos/${videoId}`, {
      headers: { Authorization: this.pexelsKey },
    });
    const video = await res.json() as any;
    if (!video || !video.id) return [];

    return this.searchVideos(video.url?.split('/').pop() || '', 1).then(r => r.results);
  }

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
    };
  }

  private mapPexelsVideo(video: any): StockVideoItem {
    const hdFile = video.video_files?.find((f: any) => f.quality === 'hd') || video.video_files?.[0];
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
    };
  }
}
