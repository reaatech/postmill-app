/**
 * Reads a deployment-level env var for application sign-in (SSO / login).
 *
 * These env vars are explicitly OUT of scope for the v3.7.1 per-tenant credential
 * migration — they configure app-level OAuth (GitHub/Google login, custom OAuth,
 * Farcaster) which has a bootstrap chicken-and-egg problem (must log in before any
 * in-app config exists).
 *
 * Unlike the deleted getEnvOr (channel provider env path), this helper reads only
 * the explicitly-carved-out login env vars and must NEVER be used for channel or
 * AI provider credentials.
 */
export function getLoginEnv(name: string): string {
  return process.env[name] || '';
}
