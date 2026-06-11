import { INestApplication } from '@nestjs/common';
import { Request, Response } from 'express';
import { MastraService } from '@gitroom/nestjs-libraries/chat/mastra.service';
import { MCPServer } from '@mastra/mcp';
import { randomUUID, createHash } from 'crypto';
import { OAuthService } from '@gitroom/nestjs-libraries/database/prisma/oauth/oauth.service';
import { ApiKeysService } from '@gitroom/nestjs-libraries/database/prisma/api-keys/api-keys.service';
import { AiSettingsManager } from '@gitroom/nestjs-libraries/ai/ai-settings.manager';
import { IdempotencyFactory } from '@gitroom/nestjs-libraries/ai/governance/idempotency.factory';
import { BudgetService } from '@gitroom/nestjs-libraries/ai/governance/budget.service';
import { ioRedis } from '@gitroom/nestjs-libraries/redis/redis.service';
import { runWithContext } from './async.storage';
import { createOAuthMiddleware } from './oauth-middleware';
import { extractBearerToken } from './oauth-types';
import type { AuthStrategy, AuthResult, AuthContext } from '@reaatech/a2a-reference-auth';
// Two-layer auth:
// 1. Custom middleware resolves pos_/api-key tokens (backward compatible)
// 2. @reaatech/a2a-reference-auth AuthStrategy enforces scopes on the resolved identity
//
// @reaatech/agent-auth-proxy-server (Fastify plugin, ESM-only @ v2.0.0):
// Future enhancement — run as a separate Fastify proxy in front of MCP for
// API-key/JWT/OAuth2 auth with built-in rate limiting and scope enforcement.
// Currently deferred because it's ESM+Fastify and this app is Express/NestJS.
// For now, scope enforcement via AuthStrategy above fulfills the requirement.

declare module 'express' {
  interface Request {
    auth?: any;
  }
}

const fixAcceptHeader = (req: Request) => {
  const value = 'application/json, text/event-stream';
  req.headers.accept = value;
  const idx = req.rawHeaders.findIndex((h) => h.toLowerCase() === 'accept');
  if (idx !== -1) {
    req.rawHeaders[idx + 1] = value;
  } else {
    req.rawHeaders.push('Accept', value);
  }
};

// ── Rate limiter (Redis-backed with in-memory fallback) ──
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 200;

async function checkRateLimit(key: string): Promise<boolean> {
  const now = Date.now();
  // Try Redis first
  try {
    const redisKey = `ratelimit:mcp:${key}`;
    const count = await ioRedis.incr(redisKey);
    if (count === 1) {
      await ioRedis.pexpire(redisKey, RATE_LIMIT_WINDOW_MS);
    }
    if (count > RATE_LIMIT_MAX) return false;
    return true;
  } catch {
    // Redis unavailable — fall through to in-memory
  }
  // In-memory fallback
  const record = rateLimitMap.get(key);
  if (!record || now > record.resetAt) {
    rateLimitMap.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  if (record.count >= RATE_LIMIT_MAX) return false;
  record.count++;
  return true;
}

// ── In-memory idempotency cache (24h TTL) — fallback when IdempotencyFactory is unavailable ──
const idempotencyCache = new Map<string, { expiresAt: number }>();
const IDEMPOTENCY_TTL_MS = 86_400_000;

function checkIdempotencyFallback(key: string): boolean {
  const now = Date.now();
  const existing = idempotencyCache.get(key);
  if (existing && now < existing.expiresAt) return false;
  idempotencyCache.set(key, { expiresAt: now + IDEMPOTENCY_TTL_MS });
  return true;
}

// ── CORS helper ──
// Restricts Access-Control-Allow-Origin to the configured frontend URL.
// In development (NODE_ENV=development) a fallback of '*' is used.
// If the request Origin does not match the allowed origin, no CORS
// headers are set so the browser enforces same-origin policy.
const ALLOWED_ORIGINS = (() => {
  const fe = process.env.FRONTEND_URL;
  if (!fe) return new Set<string>();
  return new Set([fe.replace(/\/+$/, '')]);
})();

const DEV_MODE = process.env.NODE_ENV === 'development';

function setCorsHeaders(res: Response, req?: Request) {
  let origin: string | undefined;
  if (DEV_MODE) {
    origin = '*';
  } else if (req) {
    const reqOrigin = req.headers.origin;
    if (reqOrigin && ALLOWED_ORIGINS.has(reqOrigin)) {
      origin = reqOrigin;
    }
  }
  if (!origin) return;
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Access-Control-Expose-Headers', '*');
}

interface McpSettings {
  enabled?: boolean;
  allowedScopes?: string[];
  mediaEnabled?: boolean;
}

interface ResolvedMcpAuth {
  auth: any;
  scopes: string[];
  userId?: string;
  role?: string;
}

const DEFAULT_MCP_SCOPES = ['mcp:read'];
const ORG_API_KEY_MCP_SCOPES = ['mcp:read', 'mcp:posts:write'];

function requiredMcpScopes(
  mcpSettings: McpSettings | null,
  defaults = DEFAULT_MCP_SCOPES,
): string[] {
  const configured = Array.isArray(mcpSettings?.allowedScopes)
    ? mcpSettings!.allowedScopes!.filter((scope) => typeof scope === 'string' && scope.trim())
    : [];
  return Array.from(new Set([...defaults, ...configured]));
}

// ── Typed scope enforcement via AuthStrategy ──
export function createMcpScopeStrategy(
  resolveAuthFn: (token: string) => Promise<ResolvedMcpAuth | null>,
  mcpSettings: McpSettings | null,
): AuthStrategy {
  return {
    async authenticate(context: AuthContext): Promise<AuthResult> {
      const authHeader = context.headers['authorization'];
      const raw = Array.isArray(authHeader) ? authHeader[0] : authHeader;
      if (!raw) {
        return { authenticated: false, reason: 'Missing Authorization header' };
      }
      const token = raw.replace(/^Bearer\s+/i, '');
      const resolved = await resolveAuthFn(token);
      if (!resolved) {
        return { authenticated: false, reason: 'Invalid API Key or OAuth token' };
      }
      const scopes = resolved.scopes.filter((scope) => typeof scope === 'string' && scope.trim());
      const required = requiredMcpScopes(mcpSettings);
      return {
        authenticated: requireScopes({ authenticated: true, scopes }, required),
        principal: resolved.auth.id ?? token,
        scopes,
        reason: requireScopes({ authenticated: true, scopes }, required)
          ? undefined
          : `Requires ${required.join(', ')}`,
      };
    },
  };
}

export function requireScopes(authResult: AuthResult, required: string[]): boolean {
  if (!authResult.scopes) return required.length === 0;
  return required.every((s) => authResult.scopes!.includes(s));
}

export const startMcp = async (app: INestApplication) => {
  const mastraService = app.get(MastraService, { strict: false });
  const oauthService = app.get(OAuthService, { strict: false });
  const apiKeysService = app.get(ApiKeysService, { strict: false });
  const aiSettingsManager = app.get(AiSettingsManager, { strict: false });

  // IdempotencyFactory is not registered in every Nest context. app.get() throws
  // UnknownElementException (even with strict:false) when a provider is absent, so
  // resolve it defensively and fall back to the in-memory idempotency cache below —
  // the design already guards every `if (idempotencyMiddleware)` usage for this case.
  let idempotencyFactory: IdempotencyFactory | null = null;
  try {
    idempotencyFactory = app.get(IdempotencyFactory, { strict: false });
  } catch {
    idempotencyFactory = null;
  }
  const idempotencyMiddleware = idempotencyFactory?.getMiddleware() ?? null;
  const budgetService = app.get(BudgetService, { strict: false });

  let mcpSettings: McpSettings | null = null;
  try {
    const settings = await aiSettingsManager.getSettings();
    if (settings?.mcpSettings) {
      mcpSettings = settings.mcpSettings;
    }
  } catch {
    // MCP settings unavailable — fall back to defaults (enabled, scope mcp:read)
    mcpSettings = { enabled: true, allowedScopes: ['mcp:read'], mediaEnabled: false };
  }

  const mcpEnabled = mcpSettings?.enabled !== false;

  const resolveAuthContext = async (token: string): Promise<ResolvedMcpAuth | null> => {
    if (token.startsWith('pos_')) {
      const authorization = await oauthService.getOrgByOAuthToken(token);
      if (!authorization) return null;
      return {
        auth: authorization.organization,
        scopes: DEFAULT_MCP_SCOPES,
      };
    }
    const hash = createHash('sha256').update(token).digest('hex');
    const apiKey = await apiKeysService.findActiveByHash(hash);
    if (!apiKey) return null;
    const userOrg = apiKey.user.organizations?.find(
      (o) => o.organizationId === apiKey.organizationId,
    );
    const role =
      userOrg?.role ??
      (apiKey.user.isSuperAdmin ? 'SUPERADMIN' : 'USER');
    const scopes =
      role === 'SUPERADMIN' || role === 'ADMIN'
        ? ORG_API_KEY_MCP_SCOPES
        : DEFAULT_MCP_SCOPES;
    return {
      auth: apiKey.organization,
      userId: apiKey.user.id,
      role,
      scopes,
    };
  };

  const resolveAuth = async (token: string) => {
    const ctx = await resolveAuthContext(token);
    if (!ctx) return null;
    return { org: ctx.auth, userId: ctx.userId, role: ctx.role };
  };

  // ── Boot-time tool snapshot (hot provider/model changes are OK; tool-set changes need restart) ──
  const mastra = await mastraService.mastra();
  const agent = mastra.getAgent('postmill');
  const tools = await agent.listTools();

  const serverConfig = {
    name: 'Postmill MCP',
    version: '1.0.0',
    tools,
    agents: { postmill: agent },
  };

  const server = new MCPServer(serverConfig);

  // ── Scope strategy (typed via @reaatech/a2a-reference-auth) ──
  const scopeStrategy = createMcpScopeStrategy(resolveAuthContext, mcpSettings);

  const oauthMiddleware = createOAuthMiddleware({
    oauth: {
      // NOTE: NEXT_PUBLIC_BACKEND_URL is a frontend env var used here server-side.
      // This works because the variable is set at build-time, but should be refactored
      // to a dedicated server-side env var (e.g. BACKEND_URL) for correctness.
      resource: new URL('/mcp-oauth', process.env.NEXT_PUBLIC_BACKEND_URL!).toString(),
      authorizationServers: [process.env.NEXT_PUBLIC_BACKEND_URL!],
      validateToken: async (token: string) => {
        const org = await resolveAuth(token);
        if (!org) {
          return { valid: false, error: 'invalid_token', errorDescription: 'Invalid API Key or OAuth token' };
        }
        return { valid: true, subject: token };
      },
    },
    mcpPath: '/mcp-oauth',
  });

  if (process.env.OPENAI_APP_CHALLENGE) {
    app.use('/.well-known/openai-apps-challenge', (req: Request, res: Response) => {
      res.setHeader('Content-Type', 'text/plain');
      res.send(process.env.OPENAI_APP_CHALLENGE);
    });
  }

  app.use('/.well-known/oauth-protected-resource', async (req: Request, res: Response) => {
    setCorsHeaders(res, req);

    if (req.method === 'OPTIONS') {
      res.sendStatus(200);
      return;
    }

    const url = new URL('/.well-known/oauth-protected-resource', process.env.NEXT_PUBLIC_BACKEND_URL);
    const result = await oauthMiddleware(req, res, url);
    if (result?.tokenValidation?.subject) {
      const authResult = await scopeStrategy.authenticate({
        headers: { authorization: `Bearer ${result.tokenValidation.subject}` },
      });
      if (authResult.authenticated && !requireScopes(authResult, ['mcp:read'])) {
        res.status(403).json({ error: 'insufficient_scope', error_description: 'Requires mcp:read' });
        return;
      }
    }
  });

  app.use('/.well-known/oauth-authorization-server', async (req: Request, res: Response) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      res.writeHead(204);
      res.end();
      return;
    }
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'max-age=3600');
    res.json({
      issuer: process.env.NEXT_PUBLIC_BACKEND_URL,
      authorization_endpoint: `${process.env.FRONTEND_URL}/oauth/authorize`,
      token_endpoint: `${process.env.NEXT_PUBLIC_OVERRIDE_BACKEND_URL || process.env.NEXT_PUBLIC_BACKEND_URL}/oauth/token`,
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code'],
      code_challenge_methods_supported: ['S256'],
      scopes_supported: ['mcp:read', 'mcp:posts:write', 'mcp:admin'],
    });
  });

  // ── Entrypoint 1: /mcp-oauth (OAuth2-protected MCP) ──
  app.use('/mcp-oauth', async (req: Request, res: Response, next: () => void) => {
    if (req.path !== '/' && req.path !== '') {
      next();
      return;
    }

    if (!mcpEnabled) {
      res.status(403).json({ error: 'mcp_disabled', error_description: 'MCP server is disabled' });
      return;
    }

    const rateLimitKey = `mcp-oauth:${req.ip}`;
    if (!(await checkRateLimit(rateLimitKey))) {
      res.status(429).json({ error: 'too_many_requests', error_description: 'Rate limit exceeded' });
      return;
    }

    const mcpOauthIdempotencyKey = (req.headers['x-idempotency-key'] as string) || '';
    if (mcpOauthIdempotencyKey) {
      if (idempotencyMiddleware) {
        let idempRejected = false;
        await new Promise<void>((resolve, reject) => {
          idempotencyMiddleware(req, res, (err?: any) => {
            if (err) { idempRejected = true; reject(err); } else { resolve(); }
          });
        });
        if (idempRejected) return;
      } else if (!checkIdempotencyFallback(mcpOauthIdempotencyKey)) {
        res.status(409).json({ error: 'idempotency_conflict', error_description: 'Duplicate request' });
        return;
      }
    }

    const url = new URL('/mcp-oauth', process.env.NEXT_PUBLIC_BACKEND_URL);

    const result = await oauthMiddleware(req, res, url);
    if (!result.proceed) return;

    const token = result.tokenValidation?.subject;
    if (!token) {
      res.status(401).json({ error: 'invalid_token', error_description: 'Could not extract token' });
      return;
    }

    const auth = await resolveAuth(token);
    if (!auth) {
      res.status(401).json({ error: 'invalid_token', error_description: 'Could not resolve organization' });
      return;
    }

    const authResult = await scopeStrategy.authenticate({
      headers: { authorization: `Bearer ${token}` },
    });
    if (!authResult.authenticated) {
      res.status(403).json({ error: 'insufficient_scope', error_description: authResult.reason });
      return;
    }
    if (!requireScopes(authResult, ['mcp:read'])) {
      res.status(403).json({ error: 'insufficient_scope', error_description: 'Requires mcp:read' });
      return;
    }

    const budgetResult = await budgetService.checkBudget('mcp', auth.org.id);
    if (!budgetResult.allowed) {
      res.status(429).json({
        statusCode: 429,
        error: 'BudgetExceeded',
        message: budgetResult.reason,
      });
      return;
    }

    fixAcceptHeader(req);
    await runWithContext({ requestId: token, auth: auth.org }, async () => {
      await server.startHTTP({
        url: url,
        httpPath: url.pathname,
        options: {
          sessionIdGenerator: () => {
            return randomUUID();
          },
          enableJsonResponse: true,
        },
        req,
        res,
      });
    });
  });

  // ── Entrypoint 2: /mcp (Bearer token via Authorization header) ──
  // MCP rate limiting: a separate Express middleware (e.g. express-rate-limit) must be
  // mounted before these routes. The Nest @nestjs/throttler guard does not apply here.
  app.use('/mcp', async (req: Request, res: Response, next: () => void) => {
    if (req.path !== '/' && req.path !== '') {
      next();
      return;
    }

    setCorsHeaders(res, req);

    if (req.method === 'OPTIONS') {
      res.sendStatus(200);
      return;
    }

    if (!mcpEnabled) {
      res.status(403).json({ error: 'mcp_disabled', error_description: 'MCP server is disabled' });
      return;
    }

    // Idempotency check (Redis-backed via IdempotencyFactory, fallback to in-memory)
    const idempotencyKey = (req.headers['x-idempotency-key'] as string) || '';
    if (idempotencyKey) {
      if (idempotencyMiddleware) {
        let middlewareRejected = false;
        await new Promise<void>((resolve, reject) => {
          idempotencyMiddleware(req, res, (err?: any) => {
            if (err) {
              middlewareRejected = true;
              reject(err);
            } else {
              resolve();
            }
          });
        });
        if (middlewareRejected) return;
      } else if (!checkIdempotencyFallback(idempotencyKey)) {
        res.status(409).json({ error: 'idempotency_conflict', error_description: 'Duplicate request' });
        return;
      }
    }

    const rateLimitKey = `mcp:${req.ip}`;
    if (!(await checkRateLimit(rateLimitKey))) {
      res.status(429).json({ error: 'too_many_requests', error_description: 'Rate limit exceeded' });
      return;
    }

    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      res.status(401).json({ error: 'unauthorized', error_description: 'Missing Authorization header' });
      return;
    }

    const authResult = await scopeStrategy.authenticate({
      headers: { authorization: `Bearer ${token}` },
    });
    if (!authResult.authenticated) {
      res.status(403).send(authResult.reason || 'Insufficient scope');
      return;
    }
    if (!requireScopes(authResult, requiredMcpScopes(mcpSettings))) {
      res.status(403).json({
        error: 'insufficient_scope',
        error_description: `Requires ${requiredMcpScopes(mcpSettings).join(', ')}`,
      });
      return;
    }

    req.auth = await resolveAuth(token);
    if (!req.auth) {
      res.status(401).send('Invalid API Key or OAuth token');
      return;
    }

    const budgetResult = await budgetService.checkBudget('mcp', req.auth.org.id);
    if (!budgetResult.allowed) {
      res.status(429).json({
        statusCode: 429,
        error: 'BudgetExceeded',
        message: budgetResult.reason,
      });
      return;
    }

    const url = new URL('/mcp', process.env.NEXT_PUBLIC_BACKEND_URL);

    fixAcceptHeader(req);
    await runWithContext({ requestId: token, auth: req.auth.org }, async () => {
      await server.startHTTP({
        url,
        httpPath: url.pathname,
        options: {
          sessionIdGenerator: () => {
            return randomUUID();
          },
          enableJsonResponse: true,
        },
        req,
        res,
      });
    });
  });

  // ── Entrypoint 3: /mcp/:id (API key in path param) ──
  app.use('/mcp/:id', async (req: Request, res: Response) => {
    setCorsHeaders(res, req);

    if (req.method === 'OPTIONS') {
      res.sendStatus(200);
      return;
    }

    if (!mcpEnabled) {
      res.status(403).json({ error: 'mcp_disabled', error_description: 'MCP server is disabled' });
      return;
    }

    const rateLimitKey = `mcp-id:${req.params.id}`;
    if (!(await checkRateLimit(rateLimitKey))) {
      res.status(429).json({ error: 'too_many_requests', error_description: 'Rate limit exceeded' });
      return;
    }

    const mcpIdIdempotencyKey = (req.headers['x-idempotency-key'] as string) || '';
    if (mcpIdIdempotencyKey) {
      if (idempotencyMiddleware) {
        let idempRejected = false;
        await new Promise<void>((resolve, reject) => {
          idempotencyMiddleware(req, res, (err?: any) => {
            if (err) { idempRejected = true; reject(err); } else { resolve(); }
          });
        });
        if (idempRejected) return;
      } else if (!checkIdempotencyFallback(mcpIdIdempotencyKey)) {
        res.status(409).json({ error: 'idempotency_conflict', error_description: 'Duplicate request' });
        return;
      }
    }

    const id = req.params.id as string;
    const hash = createHash('sha256').update(id).digest('hex');
    const apiKey = await apiKeysService.findActiveByHash(hash);
    if (!apiKey) {
      res.status(401).json({ error: 'unauthorized', error_description: 'Invalid API Key' });
      return;
    }
    const userOrg = apiKey.user.organizations?.find(
      (o) => o.organizationId === apiKey.organizationId,
    );
    const role =
      userOrg?.role ??
      (apiKey.user.isSuperAdmin ? 'SUPERADMIN' : 'USER');
    req.auth = { org: apiKey.organization, userId: apiKey.user.id, role };

    // NOTE: The raw API key from the URL param is passed as `Bearer ${id}` to
    // scopeStrategy.authenticate(). This works correctly for long API keys, but
    // the key will appear as a "bearer token" in auth logs — this is a cosmetic
    // logging concern only, not a functional issue.
    const authResult = await scopeStrategy.authenticate({
      headers: { authorization: `Bearer ${id}` },
    });
    if (!authResult.authenticated) {
      res.status(403).send(authResult.reason || 'Insufficient scope');
      return;
    }
    if (!requireScopes(authResult, ['mcp:read'])) {
      res.status(403).json({ error: 'insufficient_scope', error_description: 'Requires mcp:read' });
      return;
    }

    const budgetResult = await budgetService.checkBudget('mcp', req.auth.org.id);
    if (!budgetResult.allowed) {
      res.status(429).json({
        statusCode: 429,
        error: 'BudgetExceeded',
        message: budgetResult.reason,
      });
      return;
    }

    const url = new URL(
      `/mcp/${id}`,
      process.env.NEXT_PUBLIC_BACKEND_URL
    );

    fixAcceptHeader(req);
    await runWithContext(
      { requestId: id, auth: req.auth.org },
      async () => {
        await server.startHTTP({
          url,
          httpPath: url.pathname,
          options: {
            sessionIdGenerator: () => {
              return randomUUID();
            },
            enableJsonResponse: true,
          },
          req,
          res,
        });
      }
    );
  });

  // ── Entrypoints 4 & 5: /sse/:id and /message/:id (SSE transport with API key in param) ──
  app.use(['/sse/:id', '/message/:id'], async (req: Request, res: Response) => {
    setCorsHeaders(res, req);

    if (req.method === 'OPTIONS') {
      res.sendStatus(200);
      return;
    }

    if (!mcpEnabled) {
      res.status(403).json({ error: 'mcp_disabled', error_description: 'MCP server is disabled' });
      return;
    }

    const id = req.params.id as string;
    const rateLimitKey = `sse:${id}`;
    if (!(await checkRateLimit(rateLimitKey))) {
      res.status(429).json({ error: 'too_many_requests', error_description: 'Rate limit exceeded' });
      return;
    }

    // Idempotency check (Redis-backed via IdempotencyFactory, fallback to in-memory)
    const idempotencyKey = (req.headers['x-idempotency-key'] as string) || '';
    if (idempotencyKey) {
      if (idempotencyMiddleware) {
        let middlewareRejected = false;
        await new Promise<void>((resolve, reject) => {
          idempotencyMiddleware(req, res, (err?: any) => {
            if (err) {
              middlewareRejected = true;
              reject(err);
            } else {
              resolve();
            }
          });
        });
        if (middlewareRejected) return;
      } else if (!checkIdempotencyFallback(idempotencyKey)) {
        res.status(409).json({ error: 'idempotency_conflict', error_description: 'Duplicate request' });
        return;
      }
    }

    const hash = createHash('sha256').update(id).digest('hex');
    const apiKey = await apiKeysService.findActiveByHash(hash);
    if (!apiKey) {
      res.status(401).json({ error: 'unauthorized', error_description: 'Invalid API Key' });
      return;
    }
    const sseUserOrg = apiKey.user.organizations?.find(
      (o) => o.organizationId === apiKey.organizationId,
    );
    const sseRole =
      sseUserOrg?.role ??
      (apiKey.user.isSuperAdmin ? 'SUPERADMIN' : 'USER');
    req.auth = { org: apiKey.organization, userId: apiKey.user.id, role: sseRole };

    const authResult = await scopeStrategy.authenticate({
      headers: { authorization: `Bearer ${id}` },
    });
    if (!authResult.authenticated) {
      res.status(403).send(authResult.reason || 'Insufficient scope');
      return;
    }
    if (!requireScopes(authResult, ['mcp:read'])) {
      res.status(403).json({ error: 'insufficient_scope', error_description: 'Requires mcp:read' });
      return;
    }

    const budgetResult = await budgetService.checkBudget('mcp', req.auth.org.id);
    if (!budgetResult.allowed) {
      res.status(429).json({
        statusCode: 429,
        error: 'BudgetExceeded',
        message: budgetResult.reason,
      });
      return;
    }

    const url = new URL(req.originalUrl, process.env.NEXT_PUBLIC_BACKEND_URL);

    await runWithContext(
      { requestId: id, auth: req.auth.org },
      async () => {
        await server.startSSE({
          url,
          ssePath: `/sse/${id}`,
          messagePath: `/message/${id}`,
          req,
          res,
        });
      }
    );
  });

  // ── Media MCP server (§2.4/§8) — second MCP surface for media operations ──
  const mediaEnabled = mcpSettings?.mediaEnabled === true;

  if (mediaEnabled) {
    try {
      const {
        MCPServer: MediaMCPServer,
        ProviderRegistry: MediaProviderRegistry,
        loadConfig,
      } = await import('@reaatech/media-pipeline-mcp-server' as any).catch(() => null as any);
      const {
        createRBACMiddleware,
        createRateLimiter,
        createAuditLogger,
      } = await import('@reaatech/media-pipeline-mcp-security' as any).catch(() => null as any);

      if (MediaMCPServer && MediaProviderRegistry) {
        const mediaRegistry = new MediaProviderRegistry();
        const mediaServerConfig = loadConfig?.({
          port: 0,
          host: '0.0.0.0',
          features: {
            idempotency: true,
            budgetCaps: true,
            multiTenant: true,
            provenance: false,
            streaming: true,
            safetyGate: true,
            routing: false,
            variants: false,
            batch: false,
            subtitles: false,
            contentCache: false,
            resumablePipelines: false,
            dryRun: false,
            webhooks: false,
            runContext: false,
            mcpResources: false,
            sttStream: false,
          },
          multiTenant: {
            enabled: true,
            resolver: 'header',
            defaultBudgetCaps: { dailyUsd: 10, monthlyUsd: 100 },
            allowAdminOverride: true,
          },
          budget: {
            dailyUsd: 10,
            monthlyUsd: 100,
          },
        }) || {};

        const mediaServer = new MediaMCPServer(mediaServerConfig);

        // Wire up security middleware
        if (createRBACMiddleware && createRateLimiter && createAuditLogger) {
          if (!process.env.JWT_SECRET) {
            throw new Error('JWT_SECRET is required before mounting /media-mcp');
          }

          const rbac = createRBACMiddleware({
            secret: process.env.JWT_SECRET,
            roles: { admin: ['pipeline:run', 'pipeline:define', 'artifact:read', 'cost:read'] },
          });
          const rateLimiter = createRateLimiter({
            windowMs: 60_000,
            maxRequests: 30,
          });
          const auditLogger = createAuditLogger({
            exporters: [{ type: 'file', config: { path: '/tmp/media-mcp-audit.log' } }],
          });

          app.use('/media-mcp', async (req: Request, res: Response) => {
            setCorsHeaders(res, req);
            if (req.method === 'OPTIONS') {
              res.sendStatus(200);
              return;
            }

            // Auth check via API key (same as /mcp/:id)
            const authHeader = req.headers.authorization;
            if (authHeader) {
              const token = authHeader.replace(/^Bearer\s+/i, '');
              const resolved = await resolveAuth(token);
              if (!resolved) {
                res.status(401).json({ error: 'unauthorized', error_description: 'Invalid token' });
                return;
              }
              (req as any).auth = resolved;

              const authContext = await rbac.authenticate(req.headers);
              if (!authContext.authenticated) {
                res.status(403).json({ error: 'forbidden', error_description: 'Insufficient permissions' });
                return;
              }

              const rateResult = await rateLimiter.checkLimit(resolved.org.id, 'media-mcp');
              if (!rateResult.allowed) {
                res.status(429).json({ error: 'too_many_requests', error_description: 'Rate limit exceeded' });
                return;
              }

              const budgetResult = await budgetService.checkBudget('mcp', resolved.org.id);
              if (!budgetResult.allowed) {
                res.status(429).json({
                  statusCode: 429,
                  error: 'BudgetExceeded',
                  message: budgetResult.reason,
                });
                return;
              }
            } else {
              res.status(401).json({ error: 'unauthorized', error_description: 'Missing Authorization header' });
              return;
            }

            await mediaServer.startHTTP({
              url: new URL('/media-mcp', process.env.NEXT_PUBLIC_BACKEND_URL!),
              httpPath: '/media-mcp',
              options: { sessionIdGenerator: () => randomUUID(), enableJsonResponse: true },
              req: req as any,
              res: res as any,
            });
          });

          console.log('[startMcp] Media MCP server mounted at /media-mcp');
        } else {
          console.warn(
            '[startMcp] Media MCP server packages installed but security middleware unavailable — /media-mcp not mounted',
          );
        }
      } else {
        console.warn(
          '[startMcp] @reaatech/media-pipeline-mcp-server not available — /media-mcp not mounted',
        );
      }
    } catch (err) {
      console.warn(
        `[startMcp] Media MCP server init failed (may need package install): ${(err as Error).message}`,
      );
    }
  }

  // ── A2A bridge (§8) — expose the chat agent over A2A protocol in addition to MCP ──
  try {
    const a2aBridge = await import('@reaatech/a2a-reference-mcp-bridge' as any).catch(() => null as any);
    if (a2aBridge?.A2aAsMcpServer && a2aBridge?.McpToolAdapter) {
      const { A2aAsMcpServer, McpToolAdapter } = a2aBridge;
      const resolveOrgAuth = async (token: string) => {
        const ctx = await resolveAuthContext(token);
        return ctx?.auth ?? null;
      };
      const toolAdapter = new McpToolAdapter(agent, { serverName: 'postmill', auth: resolveOrgAuth });
      const a2aServer = new A2aAsMcpServer({
        tools: toolAdapter,
        auth: resolveOrgAuth,
        serverInfo: { name: 'Postmill A2A', version: '1.0.0' },
      });

      app.use('/a2a', async (req: Request, res: Response) => {
        setCorsHeaders(res, req);
        if (req.method === 'OPTIONS') {
          res.sendStatus(200);
          return;
        }

        if (!mcpEnabled) {
          res.status(403).json({ error: 'a2a_disabled', error_description: 'A2A server is disabled' });
          return;
        }

        const rateLimitKey = `a2a:${req.ip}`;
        if (!(await checkRateLimit(rateLimitKey))) {
          res.status(429).json({ error: 'too_many_requests', error_description: 'Rate limit exceeded' });
          return;
        }

        const authHeader = req.headers.authorization;
        const token = extractBearerToken(authHeader);
        if (!token) {
          res.status(401).json({ error: 'unauthorized', error_description: 'Missing Authorization header' });
          return;
        }

        const authResult = await scopeStrategy.authenticate({
          headers: { authorization: `Bearer ${token}` },
        });
        if (!authResult.authenticated) {
          res.status(403).json({ error: 'insufficient_scope', error_description: authResult.reason || 'Insufficient scope' });
          return;
        }

        const resolved = await resolveAuth(token);
        if (!resolved) {
          res.status(401).json({ error: 'unauthorized', error_description: 'Invalid API Key or OAuth token' });
          return;
        }

        const budgetResult = await budgetService.checkBudget('mcp', resolved.org.id);
        if (!budgetResult.allowed) {
          res.status(429).json({
            statusCode: 429,
            error: 'BudgetExceeded',
            message: budgetResult.reason,
          });
          return;
        }
        (req as any).auth = resolved;

        try {
          await a2aServer.handleRequest(req as any, res as any);
        } catch (err) {
          console.warn(`[startMcp] A2A request failed: ${(err as Error).message}`);
          if (!res.headersSent) {
            res.status(500).json({ error: 'a2a_internal_error' });
          }
        }
      });

      console.log('[startMcp] A2A bridge mounted at /a2a');
    } else {
      console.warn(
        '[startMcp] @reaatech/a2a-reference-mcp-bridge not available — /a2a not mounted',
      );
    }
  } catch (err) {
    console.warn(
      `[startMcp] A2A bridge init failed (may need package install): ${(err as Error).message}`,
    );
  }
};
