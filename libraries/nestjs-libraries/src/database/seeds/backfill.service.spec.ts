import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BackfillService } from './backfill.service';

type Tx = {
  user: { findMany: ReturnType<typeof vi.fn> };
  userProfile: { create: ReturnType<typeof vi.fn> };
  appRole: { findMany: ReturnType<typeof vi.fn> };
  userOrganization: {
    groupBy: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  aIBrandProfile: { updateMany: ReturnType<typeof vi.fn> };
  storageProviderConfig: { findMany: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };
  orgShortLinkConfig: { findMany: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };
  aISystemSettings: { findFirst: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };
  aIOrgProviderConfig: { findMany: ReturnType<typeof vi.fn> };
  mediaProviderConfig: { upsert: ReturnType<typeof vi.fn> };
};

const makeTx = (): Tx => ({
  user: { findMany: vi.fn().mockResolvedValue([]) },
  userProfile: { create: vi.fn() },
  appRole: { findMany: vi.fn().mockResolvedValue([]) },
  userOrganization: {
    groupBy: vi.fn().mockResolvedValue([]),
    findMany: vi.fn().mockResolvedValue([]),
    update: vi.fn(),
  },
  aIBrandProfile: { updateMany: vi.fn() },
  storageProviderConfig: { findMany: vi.fn().mockResolvedValue([]), update: vi.fn() },
  orgShortLinkConfig: { findMany: vi.fn().mockResolvedValue([]), update: vi.fn() },
  aISystemSettings: { findFirst: vi.fn().mockResolvedValue(null), update: vi.fn() },
  aIOrgProviderConfig: { findMany: vi.fn().mockResolvedValue([]) },
  mediaProviderConfig: { upsert: vi.fn() },
});

const makeService = (tx: Tx) => {
  const prisma = {
    $transaction: vi.fn(async (fn: (tx: Tx) => Promise<void>) => fn(tx)),
  };
  // The service only touches prisma.$transaction; the tx shape above covers
  // every model the backfill reads/writes.
  return new BackfillService(prisma as never);
};

describe('BackfillService — ragSettings.mediaProviders migration', () => {
  let tx: Tx;

  beforeEach(() => {
    tx = makeTx();
  });

  it('migrates blob entries to MediaProviderConfig and strips the blob key', async () => {
    tx.aISystemSettings.findFirst.mockResolvedValue({
      id: 'settings-1',
      ragSettings: JSON.stringify({
        someRagKey: { keep: true },
        mediaProviders: {
          openai: { enabled: true, operations: ['image'], c2paAvailable: false },
        },
      }),
    });
    tx.aIOrgProviderConfig.findMany.mockResolvedValue([
      { organizationId: 'org-1' },
    ]);

    await makeService(tx).backfill();

    expect(tx.mediaProviderConfig.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          organizationId_identifier: {
            organizationId: 'org-1',
            identifier: 'openai',
          },
        },
        create: expect.objectContaining({ enabled: true }),
      })
    );

    // Step 7: the blob key is removed, other rag settings are preserved.
    expect(tx.aISystemSettings.update).toHaveBeenCalledTimes(1);
    const updateArg = tx.aISystemSettings.update.mock.calls[0][0];
    expect(updateArg.where).toEqual({ id: 'settings-1' });
    const rewritten = JSON.parse(updateArg.data.ragSettings);
    expect(rewritten.mediaProviders).toBeUndefined();
    expect(rewritten.someRagKey).toEqual({ keep: true });
  });

  it('is a no-op when the blob key is absent (idempotent after the strip)', async () => {
    tx.aISystemSettings.findFirst.mockResolvedValue({
      id: 'settings-1',
      ragSettings: JSON.stringify({ someRagKey: { keep: true } }),
    });

    await makeService(tx).backfill();

    expect(tx.mediaProviderConfig.upsert).not.toHaveBeenCalled();
    expect(tx.aISystemSettings.update).not.toHaveBeenCalled();
  });

  it('is a no-op when there are no AI system settings', async () => {
    await makeService(tx).backfill();
    expect(tx.mediaProviderConfig.upsert).not.toHaveBeenCalled();
    expect(tx.aISystemSettings.update).not.toHaveBeenCalled();
  });

  it('ignores unparseable ragSettings without touching the row', async () => {
    tx.aISystemSettings.findFirst.mockResolvedValue({
      id: 'settings-1',
      ragSettings: 'not-json',
    });

    await makeService(tx).backfill();

    expect(tx.mediaProviderConfig.upsert).not.toHaveBeenCalled();
    expect(tx.aISystemSettings.update).not.toHaveBeenCalled();
  });
});
