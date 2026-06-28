export interface ShortLinkCredentialField {
  key: string;
  label: string;
  type: 'string' | 'password' | 'select';
  required: boolean;
  options?: { label: string; value: string }[];
  placeholder?: string;
}

export interface ShortLinkCapabilities {
  create: boolean;
  expand: boolean;
  statistics: boolean;
  bulkStatistics: boolean;
  customDomain: boolean;
}

export interface ShortLinkContext {
  orgId: string;
  credentials: Record<string, string>;
  customDomain?: string;
  extraConfig?: Record<string, string>;
}

export interface ShortLinkStat {
  short: string;
  original: string;
  clicks: string;
}

export interface ShortLinkOauth {
  authorizeUrl(ctx: ShortLinkContext, state: string, redirectUri: string, codeChallenge?: string): string;
  exchangeCode(code: string, redirectUri: string, ctx: ShortLinkContext, codeVerifier?: string): Promise<Record<string, string>>;
}

export interface ShortLinkCapability {
  readonly identifier: string;
  readonly name: string;
  readonly credentialFields: ShortLinkCredentialField[];
  readonly capabilities: ShortLinkCapabilities;
  readonly authType: 'none' | 'apiKey' | 'oauth2';
  readonly defaultDomain?: string;
  readonly setupNotes?: string;

  resolveDomain(ctx: ShortLinkContext): string;
  validateCredentials(ctx: ShortLinkContext): Promise<{ ok: boolean; error?: string }>;
  createShortLink(ctx: ShortLinkContext, originalUrl: string): Promise<{ shortUrl: string; providerLinkId?: string }>;
  expandShortLink?(ctx: ShortLinkContext, shortUrl: string): Promise<string>;
  linkStatistics?(ctx: ShortLinkContext, links: string[]): Promise<ShortLinkStat[]>;
  listLinks?(ctx: ShortLinkContext, page: number): Promise<ShortLinkStat[]>;
  oauth?: ShortLinkOauth;
}
