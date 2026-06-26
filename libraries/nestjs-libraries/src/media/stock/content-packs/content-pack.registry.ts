import { ContentPack, ContentPackCapability } from './content-pack.interface';
import { MagnificContentPack } from './magnific.content-pack';
import { VecteezyContentPack } from './vecteezy.content-pack';
import { AdobeStockContentPack } from './adobe-stock.content-pack';
import { EnvatoContentPack } from './envato.content-pack';

export interface ContentPackCredentialField {
  key: string;
  label: string;
  required: boolean;
}

export interface ContentPackMeta {
  identifier: string;
  name: string;
  capabilities: ContentPackCapability[];
  credentialFields: ContentPackCredentialField[];
  factory: (credentials: Record<string, string>) => ContentPack;
}

// Single source of truth for the content packs. Adding a pack here surfaces it
// in the settings list, the credential form, and the per-capability resolution —
// no other wiring needed. Capabilities a pack omits fall back to the free
// provider for that capability (handled in StockMediaService.resolveSearch).
export const CONTENT_PACK_REGISTRY: Record<string, ContentPackMeta> = {
  magnific: {
    identifier: 'magnific',
    name: 'Magnific',
    capabilities: ['photos', 'vectors', 'icons', 'videos'],
    credentialFields: [{ key: 'apiKey', label: 'API Key', required: true }],
    factory: (c) => new MagnificContentPack(c.apiKey),
  },
  vecteezy: {
    identifier: 'vecteezy',
    name: 'Vecteezy',
    capabilities: ['photos', 'vectors', 'videos'],
    credentialFields: [{ key: 'apiKey', label: 'API Key', required: true }],
    factory: (c) => new VecteezyContentPack(c.apiKey),
  },
  'adobe-stock': {
    identifier: 'adobe-stock',
    name: 'Adobe Stock',
    capabilities: ['photos', 'vectors', 'videos'],
    credentialFields: [{ key: 'apiKey', label: 'API Key', required: true }],
    factory: (c) => new AdobeStockContentPack(c.apiKey),
  },
  envato: {
    identifier: 'envato',
    name: 'Envato Elements',
    capabilities: ['photos', 'vectors', 'videos', 'audio'],
    credentialFields: [{ key: 'apiKey', label: 'API Token', required: true }],
    factory: (c) => new EnvatoContentPack(c.apiKey),
  },
};

export const CONTENT_PACK_IDENTIFIERS = Object.keys(CONTENT_PACK_REGISTRY);

export function contentPackMeta(identifier: string): ContentPackMeta | undefined {
  return CONTENT_PACK_REGISTRY[identifier];
}

export function createContentPack(
  identifier: string,
  credentials: Record<string, string>
): ContentPack | null {
  const meta = CONTENT_PACK_REGISTRY[identifier];
  if (!meta) return null;
  return meta.factory(credentials);
}
