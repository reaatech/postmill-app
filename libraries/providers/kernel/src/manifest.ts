import { ProviderDomain, ProviderKey, keyString } from './identity';

export type ProviderVersionStatus = 'preview' | 'active' | 'deprecated' | 'retired';

export interface CredentialFieldOption {
  label: string;
  value: string;
}

export interface CredentialField {
  key: string;
  label: string;
  type: 'string' | 'text' | 'password' | 'textarea' | 'json' | 'select';
  required: boolean;
  placeholder?: string;
  help?: string;
  options?: CredentialFieldOption[];
}

export interface ProviderManifest<Caps = unknown> {
  domain: ProviderDomain;
  providerId: string;
  version: string;
  displayName: string;
  status: ProviderVersionStatus;
  deprecatedAt?: string;
  sunsetAt?: string;
  credentialFields: CredentialField[];
  capabilities: Caps;
  universalCredentialFrom?: string;
  icon?: string;
  docsUrl?: string;
  /** Domain-specific UI hints. */
  setupNotes?: string;
  authType?: 'none' | 'apiKey' | 'oauth2';
  defaultDomain?: string;
}

export interface ProviderHealth {
  lastSuccessAt: number | null;
  lastErrorAt: number | null;
  successCount: number;
  errorCount: number;
  consecutiveErrors: number;
}

export function validateManifest<Caps>(manifest: ProviderManifest<Caps>): void {
  if (!manifest.domain) {
    throw new Error('Manifest missing domain');
  }
  if (!manifest.providerId || typeof manifest.providerId !== 'string') {
    throw new Error('Manifest missing providerId');
  }
  if (!manifest.version || typeof manifest.version !== 'string') {
    throw new Error('Manifest missing version');
  }
  if (!manifest.displayName || typeof manifest.displayName !== 'string') {
    throw new Error('Manifest missing displayName');
  }
  const validStatuses: ProviderVersionStatus[] = ['preview', 'active', 'deprecated', 'retired'];
  if (!validStatuses.includes(manifest.status)) {
    throw new Error(`Manifest invalid status: ${manifest.status}`);
  }
  if (!Array.isArray(manifest.credentialFields)) {
    throw new Error('Manifest credentialFields must be an array');
  }
  if (manifest.capabilities === undefined || manifest.capabilities === null) {
    throw new Error('Manifest missing capabilities');
  }
  for (const field of manifest.credentialFields) {
    if (!field.key || typeof field.key !== 'string') {
      throw new Error('CredentialField missing key');
    }
    if (!field.label || typeof field.label !== 'string') {
      throw new Error(`CredentialField ${field.key} missing label`);
    }
    const validTypes = ['string', 'text', 'password', 'textarea', 'json', 'select'];
    if (!validTypes.includes(field.type)) {
      throw new Error(`CredentialField ${field.key} invalid type: ${field.type}`);
    }
    if (typeof field.required !== 'boolean') {
      throw new Error(`CredentialField ${field.key} missing required boolean`);
    }
  }
}

export function manifestKey(manifest: ProviderManifest): ProviderKey {
  return {
    domain: manifest.domain,
    providerId: manifest.providerId,
    version: manifest.version,
  };
}

export function manifestKeyString(manifest: ProviderManifest): string {
  return keyString(manifestKey(manifest));
}
