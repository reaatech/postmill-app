import { describe, expect, it, vi } from 'vitest';

vi.mock('@mastra/mcp', () => ({
  MCPServer: class MockMCPServer {},
}));

vi.mock('@gitroom/nestjs-libraries/chat/mastra.service', () => ({
  MastraService: class MockMastraService {},
}));

vi.mock('@gitroom/nestjs-libraries/database/prisma/organizations/organization.service', () => ({
  OrganizationService: class MockOrganizationService {},
}));

vi.mock('@gitroom/nestjs-libraries/database/prisma/oauth/oauth.service', () => ({
  OAuthService: class MockOAuthService {},
}));

vi.mock('@gitroom/nestjs-libraries/ai/ai-settings.manager', () => ({
  AiSettingsManager: class MockAiSettingsManager {},
}));

vi.mock('@gitroom/nestjs-libraries/ai/governance/idempotency.factory', () => ({
  IdempotencyFactory: class MockIdempotencyFactory {},
}));

vi.mock('@gitroom/nestjs-libraries/ai/governance/budget.service', () => ({
  BudgetService: class MockBudgetService {},
}));

vi.mock('@gitroom/nestjs-libraries/redis/redis.service', () => ({
  ioRedis: {
    incr: vi.fn(),
    pexpire: vi.fn(),
  },
}));

vi.mock('./async.storage', () => ({
  runWithContext: vi.fn(),
}));

vi.mock('./oauth-middleware', () => ({
  createOAuthMiddleware: vi.fn(),
}));

vi.mock('./oauth-types', () => ({
  extractBearerToken: vi.fn(),
}));

import { createMcpScopeStrategy, requireScopes } from './start.mcp';

describe('startMcp auth helpers', () => {
  it('does not grant configured scopes to a token that does not have them', async () => {
    const strategy = createMcpScopeStrategy(
      vi.fn().mockResolvedValue({
        auth: { id: 'org-1' },
        scopes: ['mcp:read'],
      }),
      { allowedScopes: ['mcp:admin'] },
    );

    const result = await strategy.authenticate({
      headers: { authorization: 'Bearer token' },
    } as any);

    expect(result.authenticated).toBe(false);
    expect(result.scopes).toEqual(['mcp:read']);
    expect(result.reason).toContain('mcp:admin');
  });

  it('authenticates when the resolved token scopes satisfy configured requirements', async () => {
    const strategy = createMcpScopeStrategy(
      vi.fn().mockResolvedValue({
        auth: { id: 'org-1' },
        scopes: ['mcp:read', 'mcp:posts:write'],
      }),
      { allowedScopes: ['mcp:posts:write'] },
    );

    const result = await strategy.authenticate({
      headers: { authorization: 'Bearer token' },
    } as any);

    expect(result.authenticated).toBe(true);
    expect(result.principal).toBe('org-1');
  });

  it('requires every requested scope', () => {
    expect(requireScopes({ authenticated: true, scopes: ['mcp:read'] }, ['mcp:read'])).toBe(true);
    expect(requireScopes({ authenticated: true, scopes: ['mcp:read'] }, ['mcp:read', 'mcp:admin'])).toBe(false);
  });
});
