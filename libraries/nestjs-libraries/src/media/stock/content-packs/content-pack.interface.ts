import { StockSearchResponse } from '../stock.types';

// Every capability a content pack can serve. The first four are the "premium"
// catalog surfaces that override the free providers (Unsplash/Pexels/Pixabay/
// Iconify); stickers/audio are included because some packs (e.g. Envato) cover
// them. Anything a given pack does NOT declare falls back to the free provider.
export type ContentPackCapability =
  | 'photos'
  | 'vectors'
  | 'icons'
  | 'videos'
  | 'stickers'
  | 'audio';

// A premium, BYOK stock library. Implementations search a capability and mint a
// licensed download URL from an item id (mint-then-ingest). All outbound HTTP
// must go through `safeFetch`; credentials are passed in already-decrypted.
export interface ContentPack {
  search(
    capability: ContentPackCapability,
    query: string,
    page?: number,
    filters?: Record<string, string>
  ): Promise<StockSearchResponse<any>>;

  resolveDownload(id: string, capability: ContentPackCapability): Promise<string>;
}

// Thrown when a pack's provider returns a rate/quota error (HTTP 429). The
// import controller maps this to a 402 so the user sees a clear "limit reached".
export class ContentPackDailyCapError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ContentPackDailyCapError';
  }
}
