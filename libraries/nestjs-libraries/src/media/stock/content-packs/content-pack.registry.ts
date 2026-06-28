import { ContentPackCapability } from './content-pack.interface';

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
}

// Single source of truth for the content-pack metadata catalog. Adding a pack
// here surfaces it in the settings list, the credential form, and the
// per-capability resolution — no other wiring needed. Capabilities a pack omits
// fall back to the free provider for that capability (handled in
// StockMediaService.resolveSearch). The runtime adapter is built from the
// matching relocated package module.
export const CONTENT_PACK_REGISTRY: Record<string, ContentPackMeta> = {
  magnific: {
    identifier: 'magnific',
    name: 'Magnific',
    capabilities: ['photos', 'vectors', 'icons', 'videos'],
    credentialFields: [{ key: 'apiKey', label: 'API Key', required: true }],
  },
  vecteezy: {
    identifier: 'vecteezy',
    name: 'Vecteezy',
    capabilities: ['photos', 'vectors', 'videos'],
    credentialFields: [{ key: 'apiKey', label: 'API Key', required: true }],
  },
  'adobe-stock': {
    identifier: 'adobe-stock',
    name: 'Adobe Stock',
    capabilities: ['photos', 'vectors', 'videos'],
    credentialFields: [{ key: 'apiKey', label: 'API Key', required: true }],
  },
  envato: {
    identifier: 'envato',
    name: 'Envato Elements',
    capabilities: ['photos', 'vectors', 'videos', 'audio'],
    credentialFields: [{ key: 'apiKey', label: 'API Token', required: true }],
  },
};

export const CONTENT_PACK_IDENTIFIERS = Object.keys(CONTENT_PACK_REGISTRY);

export function contentPackMeta(identifier: string): ContentPackMeta | undefined {
  return CONTENT_PACK_REGISTRY[identifier];
}
