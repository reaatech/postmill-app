/**
 * Reads a deployment-level env var for application sign-in (SSO / login).
 *
 * This is the BOOTSTRAP FALLBACK for when no AuthProviderConfig row exists in the DB.
 * All OAuth providers (GitHub, Google, Farcaster, GENERIC/OIDC) resolve credentials
 * from AuthProviderConfig first; env vars are only used when DB config is absent or
 * disabled. LOCAL auth is always available regardless of DB config.
 *
 * Unlike the deleted getEnvOr (channel provider env path), this helper reads only
 * the explicitly-carved-out login env vars and must NEVER be used for channel or
 * AI provider credentials.
 */
export function getLoginEnv(name: string): string {
  return process.env[name] || '';
}
