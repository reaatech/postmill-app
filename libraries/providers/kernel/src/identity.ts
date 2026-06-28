export type ProviderDomain =
  | 'ai'
  | 'media'
  | 'storage'
  | 'shortlink'
  | 'social'
  | 'vpn'
  | 'contentpack'
  | 'email'
  | 'auth';

export const DEFAULT_VERSION = 'v1';
export const QUALIFIED_SEPARATOR = '@';

export interface ProviderKey {
  domain: ProviderDomain;
  providerId: string;
  version: string;
}

export interface ParsedQualifiedId {
  providerId: string;
  version?: string;
}

export function qualify(providerId: string, version = DEFAULT_VERSION): string {
  return `${providerId}${QUALIFIED_SEPARATOR}${version}`;
}

export function parseQualified(input: string): ParsedQualifiedId {
  const sepIndex = input.lastIndexOf(QUALIFIED_SEPARATOR);
  if (sepIndex <= 0 || sepIndex === input.length - 1) {
    return { providerId: input };
  }
  return {
    providerId: input.slice(0, sepIndex),
    version: input.slice(sepIndex + 1),
  };
}

export function keyString(key: ProviderKey): string {
  return `${key.domain}/${key.providerId}${QUALIFIED_SEPARATOR}${key.version}`;
}
