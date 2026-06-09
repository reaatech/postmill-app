export type CredentialEntry = {
  clientId?: string;
  clientSecret?: string;
  redirectUri?: string;
  token?: string;
  scopes?: string[];
};

const credentialsCache: Map<string, Map<string, CredentialEntry>> = new Map();

export function setCredentials(
  orgId: string,
  identifier: string,
  entry: CredentialEntry
) {
  let orgCache = credentialsCache.get(orgId);
  if (!orgCache) {
    orgCache = new Map();
    credentialsCache.set(orgId, orgCache);
  }
  orgCache.set(identifier, entry);
}

export function getCredential(
  orgId: string,
  identifier: string,
  key: 'clientId' | 'clientSecret' | 'redirectUri' | 'token'
): string | undefined {
  return credentialsCache.get(orgId)?.get(identifier)?.[key];
}

export function clearOrgCredentials(orgId: string) {
  credentialsCache.delete(orgId);
}

export function clearAllCredentials() {
  credentialsCache.clear();
}

export function clearCredentials() {
  clearAllCredentials();
}

export function replaceCredentialsMap(orgId: string, newMap: Map<string, CredentialEntry>) {
  credentialsCache.set(orgId, new Map(newMap));
}

export function getOrgCredential(
  orgId: string,
  identifier: string,
  key: 'clientId' | 'clientSecret' | 'redirectUri' | 'token'
): string | undefined {
  return getCredential(orgId, identifier, key);
}

// Deprecated: use getOrgCredential(orgId, identifier, key) instead.
// Only returns env var fallback — does NOT scan other org caches (security).
// Thread orgId through your provider calls and switch to getOrgCredential.
export function getEnvOr(
  envKey: string,
  _providerIdentifier: string,
  _credentialKey: 'clientId' | 'clientSecret' | 'redirectUri' | 'token'
): string {
  return process.env[envKey] || '';
}
