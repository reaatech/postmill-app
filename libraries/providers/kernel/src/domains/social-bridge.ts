import { ProviderRuntimeContext } from '../module';
import {
  SocialCapability,
  SocialClientInformation,
  SocialAuthTokenDetails,
  SocialGenerateAuthUrlResponse,
  SocialAnalyticsData,
  SocialPostDetails,
  SocialPostResponse,
  SocialCommentDTO,
  SocialCommentsResult,
  SocialMentionResult,
  SocialPageInformationResult,
} from './social';
import {
  ClientInformation,
  SocialProvider,
} from './social-provider';

/**
 * Maps ProviderRuntimeContext credentials to the legacy ClientInformation shape.
 * Falls back to an empty object so the wrapped provider can rely on
 * IntegrationManager.getClientInformation when no explicit credentials are supplied.
 */
function contextToClientInformation(
  context?: ProviderRuntimeContext
): ClientInformation | undefined {
  if (!context?.credentials) {
    return undefined;
  }

  const credentials = context.credentials;
  return {
    client_id: (credentials.client_id || credentials.clientId || '') as string,
    client_secret: (credentials.client_secret ||
      credentials.clientSecret || '') as string,
    instanceUrl: (credentials.instanceUrl || credentials.instance_url || '') as string,
    token: credentials.token as string | undefined,
  };
}

/**
 * Thin bridge that exposes a legacy SocialProvider singleton through the
 * ProviderKernel's SocialCapability interface. The adapter accepts runtime
 * credentials from the kernel but most legacy providers read credentials via
 * IntegrationManager internally, so the context mapping is a best-effort fallback.
 */
export class SocialProviderKernelAdapter implements SocialCapability {
  constructor(
    private readonly _provider: SocialProvider,
    private readonly _context: ProviderRuntimeContext
  ) {}

  get identifier(): string {
    return this._provider.identifier;
  }

  get name(): string {
    return this._provider.name;
  }

  get toolTip(): string | undefined {
    return this._provider.toolTip;
  }

  get editor(): 'none' | 'normal' | 'markdown' | 'html' {
    return this._provider.editor;
  }

  get maxConcurrentJob(): number {
    return this._provider.maxConcurrentJob;
  }

  get scopes(): string[] {
    return this._provider.scopes;
  }

  get isWeb3(): boolean | undefined {
    return this._provider.isWeb3;
  }

  get isChromeExtension(): boolean | undefined {
    return this._provider.isChromeExtension;
  }

  get extensionCookies(): { name: string; domain: string }[] | undefined {
    return this._provider.extensionCookies;
  }

  get oneTimeToken(): boolean | undefined {
    return this._provider.oneTimeToken;
  }

  get isBetweenSteps(): boolean {
    return this._provider.isBetweenSteps;
  }

  get commentsCapabilities():
    | { read: boolean; reply: boolean; like: boolean }
    | undefined {
    return this._provider.commentsCapabilities;
  }

  // Expose legacy-only properties so the adapter remains compatible with
  // callers that expect a SocialProvider-shaped object.
  get dto(): any {
    return this._provider.dto;
  }

  get refreshWait(): boolean | undefined {
    return this._provider.refreshWait;
  }

  get convertToJPEG(): boolean | undefined {
    return this._provider.convertToJPEG;
  }

  get stripLinks(): (() => boolean) | undefined {
    return this._provider.stripLinks;
  }

  get refreshCron(): boolean | undefined {
    return this._provider.refreshCron;
  }

  maxLength(additionalSettings?: any): number {
    return this._provider.maxLength(additionalSettings);
  }

  async checkValidity(
    posts: Array<{ path: string; thumbnail?: string }[]>,
    settings: any,
    additionalSettings: any[]
  ): Promise<string | true> {
    return this._provider.checkValidity(posts, settings, additionalSettings);
  }

  async customFields(): Promise<
    {
      key: string;
      label: string;
      defaultValue?: string;
      validation: string;
      type: 'text' | 'password';
    }[]
  > {
    return this._provider.customFields?.() ?? [];
  }

  async authenticate(
    params: { code: string; codeVerifier: string; refresh?: string },
    clientInformation?: SocialClientInformation
  ): Promise<SocialAuthTokenDetails | string> {
    const ctxInfo = contextToClientInformation(this._context);
    return this._provider.authenticate(
      params,
      (ctxInfo || clientInformation) as ClientInformation | undefined
    );
  }

  async refreshToken(
    refreshToken: string,
    clientInformation?: SocialClientInformation
  ): Promise<SocialAuthTokenDetails> {
    const ctxInfo = contextToClientInformation(this._context);
    return this._provider.refreshToken(
      refreshToken,
      (ctxInfo || clientInformation) as ClientInformation | undefined
    );
  }

  async reConnect(
    id: string,
    requiredId: string,
    accessToken: string
  ): Promise<Omit<SocialAuthTokenDetails, 'refreshToken' | 'expiresIn'>> {
    return this._provider.reConnect!(id, requiredId, accessToken);
  }

  async generateAuthUrl(
    clientInformation?: SocialClientInformation
  ): Promise<SocialGenerateAuthUrlResponse> {
    const ctxInfo = contextToClientInformation(this._context);
    return this._provider.generateAuthUrl(
      (ctxInfo || clientInformation) as ClientInformation | undefined
    );
  }

  async analytics(
    id: string,
    accessToken: string,
    date: number,
    clientInformation?: SocialClientInformation
  ): Promise<SocialAnalyticsData[]> {
    const ctxInfo = contextToClientInformation(this._context);
    return this._provider.analytics!(
      id,
      accessToken,
      date,
      (ctxInfo || clientInformation) as ClientInformation | undefined
    );
  }

  async postAnalytics(
    integrationId: string,
    accessToken: string,
    postId: string,
    fromDate: number,
    clientInformation?: SocialClientInformation
  ): Promise<SocialAnalyticsData[]> {
    const ctxInfo = contextToClientInformation(this._context);
    return this._provider.postAnalytics!(
      integrationId,
      accessToken,
      postId,
      fromDate,
      (ctxInfo || clientInformation) as ClientInformation | undefined
    );
  }

  async changeNickname(
    id: string,
    accessToken: string,
    name: string
  ): Promise<{ name: string }> {
    return this._provider.changeNickname!(id, accessToken, name);
  }

  async changeProfilePicture(
    id: string,
    accessToken: string,
    url: string
  ): Promise<{ url: string }> {
    return this._provider.changeProfilePicture!(id, accessToken, url);
  }

  async missing(
    id: string,
    accessToken: string
  ): Promise<{ id: string; url: string }[]> {
    return this._provider.missing!(id, accessToken);
  }

  async post(
    id: string,
    accessToken: string,
    postDetails: SocialPostDetails[],
    integration: any,
    clientInformation?: SocialClientInformation
  ): Promise<SocialPostResponse[]> {
    const ctxInfo = contextToClientInformation(this._context);
    return this._provider.post(
      id,
      accessToken,
      postDetails as any,
      integration,
      (ctxInfo || clientInformation) as ClientInformation | undefined
    );
  }

  async comment(
    id: string,
    postId: string,
    lastCommentId: string | undefined,
    accessToken: string,
    postDetails: SocialPostDetails[],
    integration: any,
    clientInformation?: SocialClientInformation
  ): Promise<SocialPostResponse[]> {
    const ctxInfo = contextToClientInformation(this._context);
    return this._provider.comment!(
      id,
      postId,
      lastCommentId,
      accessToken,
      postDetails as any,
      integration,
      (ctxInfo || clientInformation) as ClientInformation | undefined
    );
  }

  async fetchComments(
    id: string,
    accessToken: string,
    postId: string,
    cursor: string | undefined,
    integration: any,
    clientInformation?: SocialClientInformation
  ): Promise<SocialCommentsResult> {
    const ctxInfo = contextToClientInformation(this._context);
    return this._provider.fetchComments!(
      id,
      accessToken,
      postId,
      cursor,
      integration,
      (ctxInfo || clientInformation) as ClientInformation | undefined
    );
  }

  async replyToComment(
    id: string,
    accessToken: string,
    postId: string,
    parentCommentId: string,
    message: string,
    integration: any,
    clientInformation?: SocialClientInformation
  ): Promise<SocialCommentDTO> {
    const ctxInfo = contextToClientInformation(this._context);
    return this._provider.replyToComment!(
      id,
      accessToken,
      postId,
      parentCommentId,
      message,
      integration,
      (ctxInfo || clientInformation) as ClientInformation | undefined
    );
  }

  async likeComment(
    id: string,
    accessToken: string,
    postId: string,
    commentId: string,
    like: boolean,
    integration: any,
    clientInformation?: SocialClientInformation
  ): Promise<{ liked: boolean; likeCount?: number }> {
    const ctxInfo = contextToClientInformation(this._context);
    return this._provider.likeComment!(
      id,
      accessToken,
      postId,
      commentId,
      like,
      integration,
      (ctxInfo || clientInformation) as ClientInformation | undefined
    );
  }

  async mention(
    token: string,
    data: { query: string },
    id: string,
    integration: any
  ): Promise<SocialMentionResult[] | { none: true }> {
    return this._provider.mention!(token, data, id, integration);
  }

  mentionFormat(idOrHandle: string, name: string): string {
    return this._provider.mentionFormat!(idOrHandle, name);
  }

  async fetchPageInformation(
    accessToken: string,
    data: any
  ): Promise<SocialPageInformationResult> {
    return this._provider.fetchPageInformation!(accessToken, data);
  }

  async externalUrl(
    url: string
  ): Promise<{ client_id: string; client_secret: string }> {
    return this._provider.externalUrl!(url);
  }
}
