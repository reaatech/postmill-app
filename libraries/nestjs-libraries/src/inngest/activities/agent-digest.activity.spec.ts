import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AgentDigestActivity } from './agent-digest.activity';
import { MastraService } from '@gitroom/nestjs-libraries/chat/mastra.service';
import { BudgetService } from '@gitroom/nestjs-libraries/ai/governance/budget.service';
import { NotificationPreferenceService } from '@gitroom/nestjs-libraries/database/prisma/notifications/notification-preference.service';
import { NotificationService } from '@gitroom/nestjs-libraries/database/prisma/notifications/notification.service';
import { OrganizationRepository } from '@gitroom/nestjs-libraries/database/prisma/organizations/organization.repository';
import { Organization } from '@prisma/client';

describe('AgentDigestActivity', () => {
  let activity: AgentDigestActivity;

  const mockGenerate = vi.fn().mockResolvedValue({ text: 'weekly plan' });
  const mockGetAgent = vi.fn().mockReturnValue({ generate: mockGenerate });
  const mockMastra = vi.fn().mockResolvedValue({
    getAgent: mockGetAgent,
  });

  const mastraService = {
    mastra: mockMastra,
  } as unknown as MastraService;

  const budgetService = {
    checkBudget: vi.fn().mockResolvedValue({ allowed: true }),
  } as unknown as BudgetService;

  const preferenceService = {
    orgHasCategoryEnabled: vi.fn().mockResolvedValue(true),
  } as unknown as NotificationPreferenceService;

  const notificationService = {
    notify: vi.fn().mockResolvedValue(undefined),
  } as unknown as NotificationService;

  const organizationRepository = {
    getOrgById: vi.fn().mockResolvedValue({
      id: 'org-1',
      name: 'Test Org',
    } as Organization),
  } as unknown as OrganizationRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    activity = new AgentDigestActivity(
      preferenceService,
      budgetService,
      mastraService,
      notificationService,
      organizationRepository,
    );
  });

  it('skips when no org member has the agent category enabled', async () => {
    vi.mocked(preferenceService.orgHasCategoryEnabled).mockResolvedValueOnce(false);

    const result = await activity.run('org-1');

    expect(result.skipped).toBe(true);
    expect(result.reason).toBe('no_opt_in');
    expect(budgetService.checkBudget).not.toHaveBeenCalled();
    expect(mockGenerate).not.toHaveBeenCalled();
    expect(notificationService.notify).not.toHaveBeenCalled();
  });

  it('skips when the org is over budget', async () => {
    vi.mocked(budgetService.checkBudget).mockResolvedValueOnce({
      allowed: false,
      reason: 'monthly cap exceeded',
    });

    const result = await activity.run('org-1');

    expect(result.skipped).toBe(true);
    expect(result.reason).toBe('budget_exceeded');
    expect(mockGenerate).not.toHaveBeenCalled();
    expect(notificationService.notify).not.toHaveBeenCalled();
  });

  it('skips when the organization is not found', async () => {
    vi.mocked(organizationRepository.getOrgById).mockResolvedValueOnce(null);

    const result = await activity.run('org-1');

    expect(result.skipped).toBe(true);
    expect(result.reason).toBe('org_not_found');
    expect(mockGenerate).not.toHaveBeenCalled();
    expect(notificationService.notify).not.toHaveBeenCalled();
  });

  it('runs the agent with headless context and notifies with thread link', async () => {
    const result = await activity.run('org-1');

    expect(result.notified).toBe(true);
    expect(result.threadId).toBeDefined();
    expect(mockGenerate).toHaveBeenCalledTimes(1);

    const [prompt, options] = mockGenerate.mock.calls[0];
    expect(typeof prompt).toBe('string');
    expect(prompt).toContain('read-only');
    expect(prompt).toContain('analyticsOverview');
    expect(prompt).toContain('recommendations');
    expect(prompt).toContain('commentsInbox');
    expect(prompt).toContain('bestTime');

    expect(options.memory.resource).toBe('org-1');
    expect(options.memory.thread).toBe(result.threadId);
    expect(options.maxSteps).toBe(20);

    const requestContext = options.requestContext;
    expect(JSON.parse(requestContext.get('organization'))).toEqual({
      id: 'org-1',
      name: 'Test Org',
    });
    expect(JSON.parse(requestContext.get('user'))).toEqual({ id: 'system' });
    expect(requestContext.get('ui')).toBe('false');
    expect(JSON.parse(requestContext.get('access'))).toEqual({
      mode: 'headless',
    });

    expect(notificationService.notify).toHaveBeenCalledWith({
      orgId: 'org-1',
      category: 'agent',
      title: 'Weekly agent brief ready',
      message:
        'Your agent has drafted a next-week plan based on last week\'s performance.',
      link: `/agents/${result.threadId}`,
    });
  });
});
