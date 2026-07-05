import 'reflect-metadata';
import { describe, it, expect, vi } from 'vitest';
import { IntegrationSchedulePostTool } from '../integration.schedule.post';
import { executeTool, makeUser } from './tool-test.harness';

const user = makeUser();

const baseInput = {
  socialPost: [
    {
      integrationId: 'int-1',
      isPremium: false,
      date: '2026-07-05T12:00:00Z',
      shortLink: false,
      type: 'schedule',
      postsAndComments: [{ content: '<p>Hello</p>', attachments: [] }],
      settings: [],
    },
  ],
};

describe('IntegrationSchedulePostTool', () => {
  it('throws via parseOrg when the org context has no id (fail-closed) and never touches any service', async () => {
    const postsService = { validatePosts: vi.fn(), createPost: vi.fn() };
    const integrationService = { getIntegrationById: vi.fn() };
    const guardrailService = { checkOutput: vi.fn() };
    const tool = new IntegrationSchedulePostTool(
      postsService as any,
      integrationService as any,
      guardrailService as any
    );

    await expect(
      executeTool(tool, {
        inputData: baseInput,
        organization: { name: 'No Id Org' }, // missing id
        user,
        access: { mode: 'user' },
      })
    ).rejects.toThrow('Organization context missing id');

    expect(guardrailService.checkOutput).not.toHaveBeenCalled();
    expect(integrationService.getIntegrationById).not.toHaveBeenCalled();
    expect(postsService.validatePosts).not.toHaveBeenCalled();
    expect(postsService.createPost).not.toHaveBeenCalled();
  });
});
