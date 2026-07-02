import { describe, expect, it, vi, beforeEach } from 'vitest';
import { RetentionActivity } from './retention.activity';

function makePrisma() {
  const del = () => vi.fn().mockResolvedValue({ count: 2 });
  const findEmpty = vi.fn().mockResolvedValue([]);
  return {
    errors: { deleteMany: del() },
    notifications: { deleteMany: del() },
    multipartUpload: { deleteMany: del() },
    mastra_traces: { deleteMany: del() },
    mastra_scorers: { deleteMany: del() },
    file: { findMany: findEmpty, deleteMany: del() },
    post: { findMany: findEmpty, deleteMany: del(), updateMany: del() },
    user: { updateMany: del() },
    session: { updateMany: del() },
    tagsPosts: { deleteMany: del() },
    comments: { deleteMany: del() },
    $transaction: vi.fn().mockResolvedValue([]),
  } as any;
}

describe('RetentionActivity', () => {
  beforeEach(() => {
    delete process.env.ERRORS_RETENTION_DAYS;
    delete process.env.IP_RETENTION_DAYS;
  });

  it('runs every prune and reports counts', async () => {
    const prisma = makePrisma();
    const activity = new RetentionActivity(prisma);

    const counts = await activity.runRetention();

    expect(prisma.errors.deleteMany).toHaveBeenCalledTimes(1);
    expect(prisma.notifications.deleteMany).toHaveBeenCalledTimes(1);
    expect(prisma.multipartUpload.deleteMany).toHaveBeenCalledTimes(1);
    expect(prisma.mastra_traces.deleteMany).toHaveBeenCalledTimes(1);
    expect(prisma.user.updateMany).toHaveBeenCalledTimes(1); // IP/agent null
    expect(prisma.session.updateMany).toHaveBeenCalledTimes(1);
    expect(counts.errors).toBe(2);
    expect(counts.userIpAgent).toBe(2);
  });

  it('is non-fatal: one prune throwing does not abort the rest', async () => {
    const prisma = makePrisma();
    prisma.errors.deleteMany = vi.fn().mockRejectedValue(new Error('boom'));
    const activity = new RetentionActivity(prisma);

    const counts = await activity.runRetention();

    expect(counts.errors).toBe(-1); // failure marker
    expect(prisma.notifications.deleteMany).toHaveBeenCalled(); // continued
    expect(counts.notifications).toBe(2);
  });

  it('only nulls multipart stragglers (state != completed)', async () => {
    const prisma = makePrisma();
    const activity = new RetentionActivity(prisma);
    await activity.runRetention();
    const where = prisma.multipartUpload.deleteMany.mock.calls[0][0].where;
    expect(where.state).toEqual({ not: 'completed' });
  });
});
