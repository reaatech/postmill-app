import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@gitroom/nestjs-libraries/inngest/inngest.client', () => ({
  inngest: {
    send: vi.fn(),
    createFunction: vi.fn(),
  },
}));

import { inngest } from '@gitroom/nestjs-libraries/inngest/inngest.client';
import { createDigestEmail } from './digest-email';
import { createMockStep, captureFunctionHandler } from '../test/step.mock';

describe('createDigestEmail', () => {
  let emailActivity: {
    sendEmail: ReturnType<typeof vi.fn>;
  };
  let getHandler: () => any;

  beforeEach(() => {
    vi.clearAllMocks();

    emailActivity = {
      sendEmail: vi.fn().mockResolvedValue(undefined),
    };

    getHandler = captureFunctionHandler(vi.mocked(inngest.createFunction));
    createDigestEmail(emailActivity as any);
  });

  it('registers an email/digest event handler with batchEvents config', () => {
    expect(inngest.createFunction).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'digest-email',
        batchEvents: {
          maxSize: 100,
          timeout: '3600s',
          key: 'event.data.organizationId',
        },
      }),
      { event: 'email/digest' },
      expect.any(Function)
    );
  });

  it('calls step.run to send a batched digest email', async () => {
    const step = createMockStep();
    const events = [
      { data: { organizationId: 'org-1', title: 'T1', message: 'M1' } },
      { data: { organizationId: 'org-1', title: 'T2', message: 'M2' } },
    ];

    await getHandler()({ step, events });

    expect(step.run).toHaveBeenCalledWith('send-digest', expect.any(Function));
    expect(emailActivity.sendEmail).toHaveBeenCalledWith(
      'org-1',
      '[Postmill] Digest',
      '<p><strong>T1</strong><br/>M1</p><p><strong>T2</strong><br/>M2</p>',
      undefined
    );
  });
});
