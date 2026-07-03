import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { AuthService as AuthChecker } from '@gitroom/helpers/auth/auth.service';
import { UsersService } from '@gitroom/nestjs-libraries/database/prisma/users/users.service';
import { OrganizationService } from '@gitroom/nestjs-libraries/database/prisma/organizations/organization.service';
import { RolesService } from '@gitroom/nestjs-libraries/database/prisma/roles/roles.service';
import { PermissionsService } from '@gitroom/backend/services/auth/permissions/permissions.service';
import {
  AuthorizationActions,
  Sections,
} from '@gitroom/backend/services/auth/permissions/permission.exception.class';
import { AiDesignerService } from '@gitroom/nestjs-libraries/ai-designer/ai-designer.service';
import { AiDesignerBudgetGuard } from '@gitroom/nestjs-libraries/ai-designer/guards/ai-designer-budget.guard';
import { AiDesignerDefaultsGate } from '@gitroom/nestjs-libraries/ai-designer/guards/ai-designer-defaults.gate';
import { AiDesignerIdempotencyService } from '@gitroom/nestjs-libraries/ai-designer/ai-designer-idempotency.service';
import { toAiDesignerSessionDto } from '@gitroom/nestjs-libraries/ai-designer/ai-designer.types';
import {
  StartAiDesignerSessionDto,
  AiDesignerMessageDto,
  AiDesignerFormSubmitDto,
  AiDesignerAcceptPlanDto,
  AiDesignerReviseDto,
} from '@gitroom/nestjs-libraries/dtos/ai-designer/start-ai-designer-session.dto';
import { AiDesignerConductorService } from '@gitroom/nestjs-libraries/ai-designer/conductor/ai-designer-conductor.service';

interface SocketContext {
  userId: string;
  orgId: string;
  isSuperAdmin: boolean;
  roleKey: string;
  orgCreatedAt: Date;
  sessionId?: string;
  lastAcked: number;
  lastAuthzAt: number;
}

const CSRF_COOKIE = 'csrf_token';
const CSRF_HEADER = 'x-csrf-token';
const ORG_HEADER = 'showorg';
const IMPERSONATE_COOKIE = 'impersonate';
const IMPERSONATE_HEADER = 'impersonate';

// How long a socket's membership/RBAC/billing snapshot stays trusted before a
// mutating event forces a re-check. HTTP re-runs its guards on every request;
// this keeps a long-lived socket within a minute of that.
const REAUTHZ_INTERVAL_MS = 60_000;

// Per-user, per-event sliding-window budgets. Every accepted mutating event
// can fan out into LLM dispatches and full renders, and the HTTP throttler
// does not cover gateways — this is the websocket equivalent. Keyed by user
// (not socket) so opening fresh sockets does not reset the window.
const RATE_LIMITS: Record<string, { limit: number; windowMs: number }> = {
  start: { limit: 5, windowMs: 60_000 },
  message: { limit: 20, windowMs: 60_000 },
  'form:submit': { limit: 10, windowMs: 60_000 },
  'accept:plan': { limit: 10, windowMs: 60_000 },
  revise: { limit: 10, windowMs: 60_000 },
  cancel: { limit: 10, windowMs: 60_000 },
};

// Sweep expired rate buckets when the map grows past this many entries.
const RATE_BUCKET_SWEEP_SIZE = 10_000;

// Per-IP budget on connection *attempts*. Every handshake runs JWT verify +
// user/org lookups before it can be rejected, and neither the HTTP throttler
// nor the per-event RATE_LIMITS covers the connection itself — without this an
// unauthenticated bot could loop connects into unmetered DB load.
const CONNECT_RATE_LIMIT = { limit: 30, windowMs: 60_000 };

// Bounds on `form:submit` values. The DTO can only assert `@IsObject()`, so
// the byte/depth ceiling (the cost ceiling for what gets persisted into the
// brief and fed to agent prompts) is enforced here.
const MAX_FORM_VALUES_BYTES = 32_768;
const MAX_FORM_VALUES_DEPTH = 5;

const ERROR_MESSAGES: Record<string, string> = {
  missing_auth: 'Authentication required.',
  invalid_jwt: 'Your session is invalid or has expired — sign in again.',
  user_not_found: 'User not found or not activated.',
  no_org: 'No active organization for this user.',
  csrf_failed: 'Security check failed — refresh the page and try again.',
  rbac_membership: 'You are no longer a member of this workspace.',
  rbac_media_create:
    'You need the media-create permission to use the AI Designer.',
  billing_ai: 'Your plan does not include AI features.',
  invalid_payload: 'The request failed validation.',
  duplicate_nonce: 'Duplicate request ignored.',
  budget_exceeded: 'The AI budget for this workspace is exhausted.',
  guardrail_blocked:
    "Your message was blocked by this workspace's content guardrails.",
  no_session: 'No active design session.',
  not_ready: 'The connection is still authenticating — try again.',
  rate_limited: 'Too many requests — please slow down.',
  session_limit:
    'You have too many AI Designer sessions — delete some old ones and try again.',
  session_not_found: 'Design session not found.',
  internal_error: 'Something went wrong.',
};

async function validatePayload<T extends object>(
  cls: new () => T,
  raw: unknown
): Promise<T | null> {
  const instance = plainToInstance(cls, raw ?? {});
  const errors = await validate(instance, {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  if (errors.length > 0) {
    return null;
  }
  return instance;
}

@WebSocketGateway({
  namespace: '/ai-designer',
  cors: {
    // An unset FRONTEND_URL must not leave `undefined` in the list — the
    // polling handshake would then reject every origin with no clear signal.
    origin: [process.env.FRONTEND_URL, process.env.MAIN_URL].filter(
      (o): o is string => Boolean(o)
    ),
    credentials: true,
  },
})
export class AiDesignerGateway {
  private readonly logger = new Logger(AiDesignerGateway.name);

  // Per-user rate buckets (`${userId}:${event}`), shared across that user's
  // sockets, plus per-IP connect buckets. Expired entries are swept once the
  // map grows large. In-process by design: the gateway assumes a single
  // instance (or sticky sessions), consistent with the in-memory Socket.IO
  // adapter — see the deployment note in docs/developer-docs/designer.md.
  private readonly _rateBuckets = new Map<
    string,
    { count: number; resetAt: number }
  >();

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly _service: AiDesignerService,
    private readonly _users: UsersService,
    private readonly _orgs: OrganizationService,
    private readonly _roles: RolesService,
    private readonly _permissions: PermissionsService,
    private readonly _budgetGuard: AiDesignerBudgetGuard,
    private readonly _defaultsGate: AiDesignerDefaultsGate,
    private readonly _idempotency: AiDesignerIdempotencyService,
    private readonly _conductor: AiDesignerConductorService
  ) {}

  async handleConnection(client: Socket) {
    try {
      // Cheapest check first: per-IP connection budget, before any JWT/DB work.
      if (!this._connectRateLimit(client)) {
        this._disconnect(client, 'rate_limited');
        return;
      }

      const auth = await this._authenticate(client);
      if (!auth) {
        return;
      }
      const { requestedSessionId, ctx } = auth;

      // Nest binds message handlers before handleConnection resolves, so ctx
      // must never carry an unvalidated sessionId: a handler racing this await
      // would otherwise write into a session the user doesn't own.
      client.data.ctx = ctx;

      if (requestedSessionId) {
        await this._joinSessionRoom(client, requestedSessionId, ctx);
      } else {
        client.emit('session:state', { session: null, messages: [] });
      }
    } catch (err) {
      this.logger.warn(
        `Connection error: ${(err as Error).message}`,
        AiDesignerGateway.name
      );
      this._disconnect(client, 'internal_error');
    }
  }

  handleDisconnect() {
    // Per-socket state (`lastAcked`) is intentionally ephemeral. The client
    // may send its last acked sequence on reconnect via handshake auth/query.
  }

  @SubscribeMessage('ack')
  handleAck(@ConnectedSocket() client: Socket, @MessageBody() payload: unknown) {
    const ctx = this._requireCtx(client);
    if (!ctx) {
      return;
    }
    const seq = Number((payload as { seq?: unknown } | null)?.seq);
    if (Number.isFinite(seq)) {
      ctx.lastAcked = Math.max(ctx.lastAcked, seq);
    }
  }

  @SubscribeMessage('start')
  async handleStart(
    @ConnectedSocket() client: Socket,
    @MessageBody() raw: unknown
  ) {
    const ctx = await this._gate(client, 'start');
    if (!ctx) {
      return;
    }

    const payload = await validatePayload(StartAiDesignerSessionDto, raw);
    if (!payload) {
      this._emitError(client, 'invalid_payload');
      return;
    }

    const ok = await this._idempotency.start(
      payload.nonce,
      ctx.userId,
      ctx.orgId
    );
    if (!ok) {
      this._emitError(client, 'duplicate_nonce', { nonce: payload.nonce });
      return;
    }

    // Every rejection below releases the nonce — it was claimed but nothing
    // was created, so a legitimate retry with the same nonce must not be
    // locked out for the full idempotency TTL.
    const reject = async (code: string, opts?: { message?: string }) => {
      await this._idempotency.releaseStart(
        payload.nonce,
        ctx.userId,
        ctx.orgId
      );
      this._emitError(client, code, { ...opts, nonce: payload.nonce });
    };

    try {
      if (await this._service.atSessionCap(ctx.orgId, ctx.userId)) {
        await reject('session_limit');
        return;
      }

      const defaultsCheck = await this._defaultsGate.missingDefaults(
        ctx.orgId
      );
      if (defaultsCheck.blocked) {
        // Plan §11: post a markdown chat message naming the missing categories and
        // routing to Settings → AI → Model Defaults, then do not proceed. (The
        // error event is also emitted for programmatic clients.)
        client.emit('message', {
          id: 'missing-defaults',
          seq: -1,
          role: 'assistant',
          kind: 'markdown',
          content: {
            kind: 'markdown',
            md: this._defaultsGate.missingDefaultsMarkdown(
              defaultsCheck.missing
            ),
          },
        });
        await reject(`missing_defaults:${defaultsCheck.missing.join(',')}`, {
          message: `AI Designer needs these model defaults configured: ${defaultsCheck.missing.join(
            ', '
          )}. Set them under Settings → AI → Model Defaults.`,
        });
        return;
      }

      const budgetCheck = await this._budgetGuard.checkStartBudget(ctx.orgId);
      if (!budgetCheck.allowed) {
        await reject(budgetCheck.reason ?? 'budget_exceeded');
        return;
      }

      // Input guardrails (org's @reaatech/guardrail-chain) run before anything
      // is persisted, so a blocked/redacted prompt never lands in the session.
      let prompt: string | undefined;
      try {
        prompt = payload.prompt
          ? await this._service.applyGuardrails(payload.prompt, ctx.orgId)
          : undefined;
      } catch {
        await reject('guardrail_blocked');
        return;
      }

      const session = await this._service.createSession({
        organizationId: ctx.orgId,
        userId: ctx.userId,
        mode: payload.mode,
        config: payload.config,
        brief: prompt ? { intent: prompt } : undefined,
      });

      if (ctx.sessionId && ctx.sessionId !== session.id) {
        client.leave(`session:${ctx.sessionId}`);
      }
      ctx.sessionId = session.id;
      await client.join(`session:${session.id}`);

      if (prompt) {
        const userMsg = await this._service.appendMessage({
          sessionId: session.id,
          role: 'user',
          kind: 'text',
          content: { kind: 'text', text: prompt },
        });
        this.server
          .to(`session:${session.id}`)
          .emit('message', { ...userMsg, nonce: payload.nonce });
      }

      await this._emitSessionState(client, ctx);

      const emitter = this._makeEmitter(client, ctx);
      await this._conductor.handleStart(
        session.id,
        { orgId: ctx.orgId, userId: ctx.userId, sessionId: session.id },
        payload.config,
        prompt,
        emitter,
        session.mode as 'chat' | 'prompt'
      );
    } catch (err) {
      // Unexpected throw after the claim (the reject paths above return
      // normally and have already released).
      await this._failClaimed(
        client,
        'start',
        payload.nonce,
        () =>
          this._idempotency.releaseStart(payload.nonce, ctx.userId, ctx.orgId),
        err
      );
    }
  }

  @SubscribeMessage('message')
  async handleMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() raw: unknown
  ) {
    const ctx = await this._gate(client, 'message');
    if (!ctx) {
      return;
    }
    if (!ctx.sessionId) {
      this._emitError(client, 'no_session');
      return;
    }

    const payload = await validatePayload(AiDesignerMessageDto, raw);
    if (!payload) {
      this._emitError(client, 'invalid_payload');
      return;
    }

    // Defense-in-depth: re-verify ownership before the only handler-side write
    // (`appendMessage` itself is sessionId-scoped, not org-scoped).
    const session = await this._service.getSessionForUser(
      ctx.sessionId,
      ctx.orgId,
      ctx.userId
    );
    if (!session) {
      this._emitError(client, 'session_not_found');
      return;
    }

    // Claimed after the ownership check so a session_not_found rejection
    // never burns the nonce. A resent `message` (reconnect/auto-retry) must
    // not append the chat row and dispatch the conductor twice.
    const ok = await this._idempotency.forSession(payload.nonce, ctx.sessionId);
    if (!ok) {
      this._emitError(client, 'duplicate_nonce', { nonce: payload.nonce });
      return;
    }

    try {
      // Input guardrails before persist — a blocked message never lands in chat.
      let text: string;
      try {
        text = await this._service.applyGuardrails(payload.text, ctx.orgId);
      } catch {
        // Nothing was persisted — release the nonce so a corrected retry with
        // the same nonce is not locked out for the idempotency TTL.
        await this._idempotency.releaseForSession(
          payload.nonce,
          ctx.sessionId
        );
        this._emitError(client, 'guardrail_blocked', { nonce: payload.nonce });
        return;
      }

      const userMsg = await this._service.appendMessage({
        sessionId: ctx.sessionId,
        role: 'user',
        kind: 'text',
        content: { kind: 'text', text },
      });
      this.server
        .to(`session:${ctx.sessionId}`)
        .emit('message', { ...userMsg, nonce: payload.nonce });

      const emitter = this._makeEmitter(client, ctx);
      await this._conductor.handleMessage(
        ctx.sessionId,
        { orgId: ctx.orgId, userId: ctx.userId, sessionId: ctx.sessionId },
        text,
        emitter
      );
    } catch (err) {
      const { sessionId } = ctx;
      await this._failClaimed(
        client,
        'message',
        payload.nonce,
        () => this._idempotency.releaseForSession(payload.nonce, sessionId),
        err
      );
    }
  }

  @SubscribeMessage('form:submit')
  async handleFormSubmit(
    @ConnectedSocket() client: Socket,
    @MessageBody() raw: unknown
  ) {
    const ctx = await this._gate(client, 'form:submit');
    if (!ctx) {
      return;
    }
    if (!ctx.sessionId) {
      this._emitError(client, 'no_session');
      return;
    }

    const payload = await validatePayload(AiDesignerFormSubmitDto, raw);
    if (!payload) {
      this._emitError(client, 'invalid_payload');
      return;
    }

    // Size/depth ceiling before anything is claimed or persisted: the DTO can
    // only assert `@IsObject()`, and these values end up in the session brief
    // and in agent prompts.
    if (!this._withinValueBounds(payload.values)) {
      this._emitError(client, 'invalid_payload', { nonce: payload.nonce });
      return;
    }

    const ok = await this._idempotency.forSession(payload.nonce, ctx.sessionId);
    if (!ok) {
      this._emitError(client, 'duplicate_nonce', { nonce: payload.nonce });
      return;
    }

    try {
      // Form values are user free-text too (intake answers, revise
      // instructions) — guardrail every string before the conductor persists
      // them into the brief or dispatches them to agents.
      let values: Record<string, unknown>;
      try {
        values = await this._guardValues(payload.values, ctx.orgId);
      } catch {
        // Nothing was persisted — release the nonce so a corrected retry with
        // the same nonce is not locked out for the idempotency TTL.
        await this._idempotency.releaseForSession(
          payload.nonce,
          ctx.sessionId
        );
        this._emitError(client, 'guardrail_blocked', { nonce: payload.nonce });
        return;
      }

      const emitter = this._makeEmitter(client, ctx);
      await this._conductor.handleFormSubmit(
        ctx.sessionId,
        { orgId: ctx.orgId, userId: ctx.userId, sessionId: ctx.sessionId },
        payload.replyTo,
        values,
        emitter
      );
    } catch (err) {
      const { sessionId } = ctx;
      await this._failClaimed(
        client,
        'form:submit',
        payload.nonce,
        () => this._idempotency.releaseForSession(payload.nonce, sessionId),
        err
      );
    }
  }

  @SubscribeMessage('accept:plan')
  async handleAcceptPlan(
    @ConnectedSocket() client: Socket,
    @MessageBody() raw: unknown
  ) {
    const ctx = await this._gate(client, 'accept:plan');
    if (!ctx) {
      return;
    }
    if (!ctx.sessionId) {
      this._emitError(client, 'no_session');
      return;
    }

    const payload = await validatePayload(AiDesignerAcceptPlanDto, raw);
    if (!payload) {
      this._emitError(client, 'invalid_payload');
      return;
    }

    const ok = await this._idempotency.forSession(payload.nonce, ctx.sessionId);
    if (!ok) {
      this._emitError(client, 'duplicate_nonce', { nonce: payload.nonce });
      return;
    }

    try {
      const emitter = this._makeEmitter(client, ctx);
      await this._conductor.handleAcceptPlan(
        ctx.sessionId,
        { orgId: ctx.orgId, userId: ctx.userId, sessionId: ctx.sessionId },
        payload.replyTo,
        payload.variantId,
        payload.saveTemplate,
        emitter
      );
    } catch (err) {
      const { sessionId } = ctx;
      await this._failClaimed(
        client,
        'accept:plan',
        payload.nonce,
        () => this._idempotency.releaseForSession(payload.nonce, sessionId),
        err
      );
    }
  }

  @SubscribeMessage('revise')
  async handleRevise(
    @ConnectedSocket() client: Socket,
    @MessageBody() raw: unknown
  ) {
    const ctx = await this._gate(client, 'revise');
    if (!ctx) {
      return;
    }
    if (!ctx.sessionId) {
      this._emitError(client, 'no_session');
      return;
    }

    const payload = await validatePayload(AiDesignerReviseDto, raw);
    if (!payload) {
      this._emitError(client, 'invalid_payload');
      return;
    }

    const ok = await this._idempotency.forSession(payload.nonce, ctx.sessionId);
    if (!ok) {
      this._emitError(client, 'duplicate_nonce', { nonce: payload.nonce });
      return;
    }

    try {
      // Input guardrails before dispatch — the conductor relies on every path
      // into handleRevise being checked here or on the message/form handlers.
      let instruction: string;
      try {
        instruction = await this._service.applyGuardrails(
          payload.instruction,
          ctx.orgId
        );
      } catch {
        // Nothing was dispatched — release the nonce (see form:submit).
        await this._idempotency.releaseForSession(
          payload.nonce,
          ctx.sessionId
        );
        this._emitError(client, 'guardrail_blocked', { nonce: payload.nonce });
        return;
      }

      const emitter = this._makeEmitter(client, ctx);
      await this._conductor.handleRevise(
        ctx.sessionId,
        { orgId: ctx.orgId, userId: ctx.userId, sessionId: ctx.sessionId },
        {
          instruction,
          targetDesignId: payload.targetDesignId,
          nonce: payload.nonce,
        },
        emitter
      );
    } catch (err) {
      const { sessionId } = ctx;
      await this._failClaimed(
        client,
        'revise',
        payload.nonce,
        () => this._idempotency.releaseForSession(payload.nonce, sessionId),
        err
      );
    }
  }

  @SubscribeMessage('cancel')
  async handleCancel(@ConnectedSocket() client: Socket) {
    const ctx = await this._gate(client, 'cancel');
    if (!ctx) {
      return;
    }
    if (!ctx.sessionId) {
      this._emitError(client, 'no_session');
      return;
    }

    // The cancel state machine lives in the conductor (it owns the pipeline
    // states) — the gateway only authenticates and relays.
    const emitter = this._makeEmitter(client, ctx);
    const found = await this._conductor.handleCancel(
      ctx.sessionId,
      { orgId: ctx.orgId, userId: ctx.userId, sessionId: ctx.sessionId },
      emitter
    );
    if (!found) {
      this._emitError(client, 'session_not_found');
    }
  }

  /**
   * Socket-handshake mirror of the HTTP AuthMiddleware
   * (apps/backend/src/services/auth/auth.middleware.ts): cookie JWT →
   * activated user → optional super-admin impersonation → org selection via
   * the `showorg` cookie/header. The middleware's extras — sliding token
   * re-issue and header/API-key auth — are deliberately not applicable to a
   * socket handshake. Extracting the shared resolution into nestjs-libraries
   * is a tracked follow-up; until then, keep the two in sync.
   */
  private async _authenticate(client: Socket): Promise<{
    ctx: SocketContext;
    requestedSessionId?: string;
  } | null> {
    const handshake = client.handshake;
    const cookies = this._parseCookies(handshake.headers.cookie ?? '');

    const token = cookies.auth;
    if (!token) {
      this._disconnect(client, 'missing_auth');
      return null;
    }

    let payload: any;
    try {
      payload = AuthChecker.verifyJWT(token);
    } catch {
      this._disconnect(client, 'invalid_jwt');
      return null;
    }

    if (!payload?.id) {
      this._disconnect(client, 'invalid_jwt');
      return null;
    }

    // CSRF before any DB work — it needs only the handshake, and a cross-site
    // attacker must be rejected without spending user/org lookups. This is the
    // one check NOT_SECURED may bypass — matching HTTP, where the dev toggle
    // relaxes CSRF/helmet but never RBAC or billing.
    if (!process.env.NOT_SECURED) {
      const csrfCookie = cookies[CSRF_COOKIE];
      const csrfToken =
        (handshake.auth as any)?.csrfToken ??
        (handshake.headers[CSRF_HEADER] as string | undefined);

      if (!csrfCookie || !csrfToken || csrfCookie !== csrfToken) {
        this._disconnect(client, 'csrf_failed');
        return null;
      }
    }

    let user = await this._users.getUserById(payload.id);
    if (!user || !user.activated) {
      this._disconnect(client, 'user_not_found');
      return null;
    }
    const isSuperAdmin = !!user.isSuperAdmin;

    // Cookie/header only (no query-string fallback): query strings land in
    // access/proxy logs, and HTTP accepts these from cookie/header only too.
    const orgHeader =
      cookies[ORG_HEADER] ??
      (handshake.headers[ORG_HEADER] as string | undefined);

    const impersonate =
      cookies[IMPERSONATE_COOKIE] ??
      (handshake.headers[IMPERSONATE_HEADER] as string | undefined);

    let org: any;
    if (isSuperAdmin && impersonate) {
      // Mirror the HTTP AuthMiddleware: impersonation swaps the *user and*
      // the org, so sessions are read/attributed as the impersonated user.
      const impersonated = await this._orgs.getUserOrg(impersonate as string);
      if (impersonated) {
        user = impersonated.user as typeof user;
        impersonated.organization.users =
          impersonated.organization.users?.filter(
            (f: any) => f.userId === user!.id
          );
        org = impersonated.organization;
      }
    }

    if (!org) {
      let orgs = await this._orgs.getOrgsByUserId(user.id);
      orgs = orgs.filter((o: any) => !o.users?.[0]?.disabled);
      if (orgs.length === 0) {
        this._disconnect(client, 'no_org');
        return null;
      }
      org = orgs.find((o: any) => o.id === orgHeader) ?? orgs[0];
    }

    const orgId = org.id;

    const roleKey =
      (org as any).users?.[0]?.roleRef?.key ??
      (org as any).users?.[0]?.role ??
      'member';

    const ctx: SocketContext = {
      userId: user.id,
      orgId,
      isSuperAdmin,
      roleKey,
      orgCreatedAt: org.createdAt,
      sessionId: undefined,
      lastAcked: this._readLastAcked(handshake),
      lastAuthzAt: 0,
    };

    if (!(await this._authorize(client, ctx))) {
      return null;
    }

    const sessionIdFromAuth = (handshake.auth as any)?.sessionId as
      | string
      | undefined;
    const sessionIdFromQuery = handshake.query.sessionId as string | undefined;

    return {
      ctx,
      requestedSessionId: sessionIdFromAuth ?? sessionIdFromQuery,
    };
  }

  /**
   * Membership + RBAC + billing. Runs at connect and again (at most every
   * REAUTHZ_INTERVAL_MS) before mutating events, so a member removed from the
   * org, a role losing media:create, or a lapsed subscription loses AI
   * Designer access within a minute instead of on the next reconnect.
   * Unconditional — NOT_SECURED does not bypass it (parity with HTTP guards).
   */
  private async _authorize(
    client: Socket,
    ctx: SocketContext
  ): Promise<boolean> {
    if (!ctx.isSuperAdmin) {
      const effective = await this._roles.getEffectivePermissions(
        ctx.orgId,
        ctx.userId
      );
      if (!effective) {
        this._disconnect(client, 'rbac_membership');
        return false;
      }
      if (
        !effective.permissions.includes('media:create') &&
        !effective.permissions.includes('media:manage')
      ) {
        this._disconnect(client, 'rbac_media_create');
        return false;
      }
    }

    // roleKey is an AppRole key (owner/admin/…); permissions.check's legacy
    // union predates RBAC keys — same loose pass-through the HTTP guard does.
    const ability = await this._permissions.check(
      ctx.orgId,
      ctx.orgCreatedAt,
      ctx.roleKey as Parameters<PermissionsService['check']>[2],
      [[AuthorizationActions.Create, Sections.AI]]
    );
    if (!ability.can(AuthorizationActions.Create, Sections.AI)) {
      this._disconnect(client, 'billing_ai');
      return false;
    }

    ctx.lastAuthzAt = Date.now();
    return true;
  }

  /**
   * Common front door for every mutating event: context present, per-socket
   * rate limit, and a (cached) re-authorization.
   */
  private async _gate(
    client: Socket,
    event: string
  ): Promise<SocketContext | null> {
    const ctx = this._requireCtx(client);
    if (!ctx) {
      this._emitError(client, 'not_ready');
      return null;
    }

    if (!this._rateLimit(ctx.userId, event)) {
      this._emitError(client, 'rate_limited');
      return null;
    }

    if (Date.now() - ctx.lastAuthzAt >= REAUTHZ_INTERVAL_MS) {
      if (!(await this._authorize(client, ctx))) {
        return null;
      }
    }

    return ctx;
  }

  /**
   * Per-IP budget on connection attempts, checked before any JWT/DB work.
   * Keyed on the socket's transport address — X-Forwarded-For is
   * client-forgeable, so trusting it would let an attacker mint a fresh
   * bucket per handshake and never trip the limit (the HTTP throttler
   * likewise uses `req.ip` and never enables `trust proxy`). Shares
   * `_rateBuckets` (and its sweep) with the per-event limits.
   */
  private _connectRateLimit(client: Socket): boolean {
    const ip = client.handshake.address;

    const now = Date.now();
    this._sweepExpiredBuckets(now);
    const key = `ip:${ip}:connect`;
    let bucket = this._rateBuckets.get(key);
    if (!bucket || now >= bucket.resetAt) {
      bucket = { count: 0, resetAt: now + CONNECT_RATE_LIMIT.windowMs };
      this._rateBuckets.set(key, bucket);
    }
    bucket.count += 1;
    return bucket.count <= CONNECT_RATE_LIMIT.limit;
  }

  private _rateLimit(userId: string, event: string): boolean {
    const conf = RATE_LIMITS[event];
    if (!conf) {
      return true;
    }
    const now = Date.now();
    this._sweepExpiredBuckets(now);
    const key = `${userId}:${event}`;
    let bucket = this._rateBuckets.get(key);
    if (!bucket || now >= bucket.resetAt) {
      bucket = { count: 0, resetAt: now + conf.windowMs };
      this._rateBuckets.set(key, bucket);
    }
    bucket.count += 1;
    return bucket.count <= conf.limit;
  }

  /**
   * Sweep expired buckets once the map grows past the sweep size. Runs on
   * both the per-event path and the connect path — connect attempts are
   * unauthenticated, so they must not be able to grow the map unswept.
   */
  private _sweepExpiredBuckets(now: number) {
    if (this._rateBuckets.size <= RATE_BUCKET_SWEEP_SIZE) {
      return;
    }
    for (const [key, bucket] of this._rateBuckets) {
      if (now >= bucket.resetAt) {
        this._rateBuckets.delete(key);
      }
    }
  }

  private _readLastAcked(handshake: Socket['handshake']): number {
    const fromAuth = Number((handshake.auth as any)?.lastAcked);
    if (Number.isFinite(fromAuth)) {
      return fromAuth;
    }
    const fromQuery = Number(handshake.query.lastAcked);
    return Number.isFinite(fromQuery) ? fromQuery : 0;
  }

  private async _joinSessionRoom(
    client: Socket,
    sessionId: string,
    ctx: SocketContext
  ) {
    const session = await this._service.getSessionForUser(
      sessionId,
      ctx.orgId,
      ctx.userId
    );
    if (!session) {
      this._disconnect(client, 'session_not_found');
      return;
    }

    // Only now is the handshake sessionId trusted on the socket context.
    ctx.sessionId = sessionId;
    await client.join(`session:${sessionId}`);
    await this._emitSessionState(client, ctx);
  }

  private async _emitSessionState(
    client: Socket,
    ctx: SocketContext
  ): Promise<void> {
    if (!ctx.sessionId) {
      client.emit('session:state', { session: null, messages: [] });
      return;
    }

    const session = await this._service.getSessionForUser(
      ctx.sessionId,
      ctx.orgId,
      ctx.userId
    );
    if (!session) {
      client.emit('session:state', { session: null, messages: [] });
      return;
    }

    const messages = await this._service.getMessagesAfterSeq(
      ctx.sessionId,
      ctx.lastAcked
    );
    client.emit('session:state', {
      session: toAiDesignerSessionDto(session),
      messages,
    });
  }

  private _makeEmitter(client: Socket, ctx: SocketContext) {
    const room = `session:${ctx.sessionId}`;
    return {
      toSession: (event: string, payload: unknown) => {
        this.server.to(room).emit(event, payload);
      },
      progress: (
        agent: string,
        phase: string,
        pct?: number,
        note?: string
      ) => {
        this.server
          .to(room)
          .emit('agent:progress', { kind: 'progress', agent, phase, pct, note });
      },
      preview: (result: any) => {
        this.server.to(room).emit('preview', result);
      },
      error: (code: string, message?: string, nonce?: string) => {
        this.server.to(room).emit('error', {
          code,
          message: message ?? ERROR_MESSAGES[code] ?? code,
          ...(nonce ? { nonce } : {}),
        });
      },
    };
  }

  /**
   * True when the form-values object fits the byte and depth ceilings.
   * `payload.values` is parsed JSON, so a re-stringify is a faithful size
   * measure and cannot throw on cycles.
   */
  private _withinValueBounds(values: Record<string, unknown>): boolean {
    // Byte length (not UTF-16 code units) — multibyte text must not get a
    // ~3x larger effective ceiling than the documented 32 KB.
    if (
      Buffer.byteLength(JSON.stringify(values), 'utf8') > MAX_FORM_VALUES_BYTES
    ) {
      return false;
    }
    const depthOk = (value: unknown, depth: number): boolean => {
      if (depth > MAX_FORM_VALUES_DEPTH) return false;
      if (Array.isArray(value)) {
        return value.every((item) => depthOk(item, depth + 1));
      }
      if (value && typeof value === 'object') {
        return Object.values(value).every((item) => depthOk(item, depth + 1));
      }
      return true;
    };
    return depthOk(values, 0);
  }

  /**
   * Run every user-entered string in a form-values object — at any nesting
   * depth — through the org's input guardrail chain. A string that only
   * reaches the brief inside a nested object must not skip the chain.
   * Throws GuardrailViolation on a block; returns possibly-redacted values.
   */
  private async _guardValues(
    values: Record<string, unknown>,
    orgId: string
  ): Promise<Record<string, unknown>> {
    return (await this._guardValue(values, orgId)) as Record<string, unknown>;
  }

  private async _guardValue(value: unknown, orgId: string): Promise<unknown> {
    if (typeof value === 'string' && value.trim()) {
      return this._service.applyGuardrails(value, orgId);
    }
    if (Array.isArray(value)) {
      return Promise.all(value.map((item) => this._guardValue(item, orgId)));
    }
    if (value && typeof value === 'object') {
      const out: Record<string, unknown> = {};
      for (const [key, item] of Object.entries(value)) {
        out[key] = await this._guardValue(item, orgId);
      }
      return out;
    }
    return value;
  }

  private _requireCtx(client: Socket): SocketContext | null {
    return (client.data.ctx as SocketContext | undefined) ?? null;
  }

  /**
   * Tail of every mutating handler's unexpected-throw path: the nonce was
   * claimed but the operation died before completing, so release it (an
   * idempotent retry must not stay locked out for the full TTL) and emit the
   * documented `error` channel — Nest's own fallback emits a generic
   * `exception` event the client does not listen for.
   */
  private async _failClaimed(
    client: Socket,
    event: string,
    nonce: string,
    release: () => Promise<unknown>,
    err: unknown
  ) {
    try {
      await release();
    } catch {
      /* best-effort — the idempotency TTL is the backstop */
    }
    this.logger.warn(
      `${event} failed after nonce claim: ${(err as Error)?.message ?? err}`,
      AiDesignerGateway.name
    );
    this._emitError(client, 'internal_error', { nonce });
  }

  private _emitError(
    client: Socket,
    code: string,
    opts?: { message?: string; nonce?: string }
  ) {
    client.emit('error', {
      code,
      message: opts?.message ?? ERROR_MESSAGES[code] ?? code,
      ...(opts?.nonce ? { nonce: opts.nonce } : {}),
    });
  }

  private _disconnect(client: Socket, reason: string) {
    try {
      this._emitError(client, reason);
    } catch {
      /* socket may already be closing */
    }
    client.disconnect(true);
  }

  private _parseCookies(cookieHeader: string): Record<string, string> {
    const cookies: Record<string, string> = {};
    if (!cookieHeader) {
      return cookies;
    }
    for (const part of cookieHeader.split(';')) {
      const trimmed = part.trim();
      const eq = trimmed.indexOf('=');
      if (eq === -1) {
        continue;
      }
      const key = trimmed.slice(0, eq);
      const value = trimmed.slice(eq + 1);
      try {
        cookies[key] = decodeURIComponent(value);
      } catch {
        cookies[key] = value;
      }
    }
    return cookies;
  }
}
