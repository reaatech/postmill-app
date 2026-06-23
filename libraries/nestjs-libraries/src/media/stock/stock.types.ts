export interface StockPhotoItem {
  id: string;
  url: string;
  thumbUrl: string;
  description: string | null;
  author: string;
  authorUrl: string;
  sourceUrl: string;
  downloadLocation: string | null;
  width: number;
  height: number;
  color: string | null;
}

export interface StockVideoItem {
  id: string;
  url: string;
  thumbUrl: string;
  description: string | null;
  author: string;
  authorUrl: string;
  sourceUrl: string;
  width: number;
  height: number;
  duration: number;
}

export interface StockSearchResponse<T> {
  results: T[];
  page: number;
  totalPages: number;
  configured: boolean;
}
