export type CredentialEntry = {
  clientId?: string;
  clientSecret?: string;
  redirectUri?: string;
  token?: string;
  scopes?: string[];
};

let credentialsCache: Map<string, CredentialEntry> = new Map();

export function setCredentials(
  identifier: string,
  entry: CredentialEntry
) {
  credentialsCache.set(identifier, entry);
}

export function getCredential(
  identifier: string,
  key: 'clientId' | 'clientSecret' | 'redirectUri' | 'token'
): string | undefined {
  return credentialsCache.get(identifier)?.[key];
}

export function getEnvOr(
  envKey: string,
  providerIdentifier: string,
  credentialKey: 'clientId' | 'clientSecret' | 'redirectUri' | 'token'
): string {
  const dbValue = getCredential(providerIdentifier, credentialKey);
  if (dbValue) {
    return dbValue;
  }
  return process.env[envKey] || '';
}

export function clearCredentials() {
  credentialsCache.clear();
}

export function replaceCredentialsMap(newMap: Map<string, CredentialEntry>) {
  credentialsCache = new Map(newMap);
}
