import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@gitroom/nestjs-libraries/inngest/inngest.client', () => ({
  inngest: {
    send: vi.fn(),
    createFunction: vi.fn(),
  },
}));

import { inngest } from '@gitroom/nestjs-libraries/inngest/inngest.client';
import { createAgentDigest, createAgentDigestOrg } from './agent-digest';
import { createMockStep, captureFunctionHandler } from '../test/step.mock';

const makeActivity = () => ({
  run: vi.fn().mockResolvedValue({ threadId: 'thread-1', notified: true }),
});

const makeOrgRepo = () => ({
  getAllIds: vi.fn().mockResolvedValue([{ id: 'org-1' }, { id: 'org-2' }]),
});

describe('createAgentDigest (cron, fan-out)', () => {
  let agentDigestActivity: ReturnType<typeof makeActivity>;
  let organizationRepository: ReturnType<typeof makeOrgRepo>;
  let getHandler: () => any;
  const originalEnv = process.env.AGENT_DIGEST_ENABLED;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.AGENT_DIGEST_ENABLED = 'true';
    agentDigestActivity = makeActivity();
    organizationRepository = makeOrgRepo();
    getHandler = captureFunctionHandler(vi.mocked(inngest.createFunction));
    createAgentDigest(agentDigestActivity as any, organizationRepository as any);
  });

  afterEach(() => {
    process.env.AGENT_DIGEST_ENABLED = originalEnv;
  });

  it('registers a Monday 07:00 ET cron with concurrency 1', () => {
    expect(inngest.createFunction).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'agent-digest', concurrency: 1 }),
      { cron: 'TZ=America/New_York 0 7 * * 1' },
      expect.any(Function)
    );
  });

  it('skips when AGENT_DIGEST_ENABLED is not true', async () => {
    process.env.AGENT_DIGEST_ENABLED = 'false';
    const step = createMockStep();

    const result = await getHandler()({ step });

    expect(result.skipped).toBe(true);
    expect(step.run).not.toHaveBeenCalled();
    expect(step.sendEvent).not.toHaveBeenCalled();
  });

  it('reads org ids and fans out one agent/digest-org event per org', async () => {
    const step = createMockStep();

    await getHandler()({ step });

    expect(step.run).toHaveBeenCalledWith('get-org-ids', expect.any(Function));
    expect(organizationRepository.getAllIds).toHaveBeenCalled();

    expect(step.sendEvent).toHaveBeenCalledWith('fan-out-agent-digest', [
      { name: 'agent/digest-org', data: { organizationId: 'org-1' } },
      { name: 'agent/digest-org', data: { organizationId: 'org-2' } },
    ]);

    expect(agentDigestActivity.run).not.toHaveBeenCalled();
  });

  it('does not fan out when there are no orgs', async () => {
    organizationRepository.getAllIds.mockResolvedValue([]);
    const step = createMockStep();

    await getHandler()({ step });

    expect(step.sendEvent).not.toHaveBeenCalled();
  });
});

describe('createAgentDigestOrg (per-org event handler)', () => {
  let agentDigestActivity: ReturnType<typeof makeActivity>;
  let getHandler: () => any;

  beforeEach(() => {
    vi.clearAllMocks();
    agentDigestActivity = makeActivity();
    getHandler = captureFunctionHandler(vi.mocked(inngest.createFunction));
    createAgentDigestOrg(agentDigestActivity as any);
  });

  it('registers an event handler with concurrency 2', () => {
    expect(inngest.createFunction).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'agent-digest-org', concurrency: 2 }),
      { event: 'agent/digest-org' },
      expect.any(Function)
    );
  });

  it('runs the agent digest activity for the event org', async () => {
    const step = createMockStep();

    const result = await getHandler()({
      step,
      event: { data: { organizationId: 'org-9' } },
    });

    expect(step.run).toHaveBeenCalledWith('run-agent-digest', expect.any(Function));
    expect(agentDigestActivity.run).toHaveBeenCalledWith('org-9');
    expect(result).toEqual({ threadId: 'thread-1', notified: true });
  });
});
