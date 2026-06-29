import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@gitroom/nestjs-libraries/database/prisma/prisma.service';

/**
 * RetentionActivity (ENHANCEMENTS_2 I3 + I4c) — bounded, logged, non-fatal retention
 * for the tables that otherwise grow unbounded, plus the IP/agent retention bound.
 *
 * Mirrors `AnalyticsActivity.pruneAndRollupSnapshots`: each prune is wrapped so one
 * failure never aborts the others, every window is env-tunable with a documented
 * default, and counts are logged. Hard-purges run in capped batches so a backlog
 * can't lock the table or blow the step timeout (the next cron tick continues).
 *
 * Read/writes through `PrismaService` directly — sanctioned cross-table maintenance
 * exception (same as the seeders / `DeletionService`).
 */
@Injectable()
export class RetentionActivity {
  private readonly _logger = new Logger(RetentionActivity.name);

  // Per-batch cap and max batches for the hard-purge sweeps (Post/File).
  private static readonly BATCH = 500;
  private static readonly MAX_BATCHES = 50; // ≤ 25k rows/table/run

  constructor(private readonly _prisma: PrismaService) {}

  async runRetention(): Promise<Record<string, number>> {
    const counts: Record<string, number> = {};
    const now = Date.now();
    const before = (days: number) => new Date(now - days * 86_400_000);

    await this._safe('errors', counts, async () => {
      const r = await this._prisma.errors.deleteMany({
        where: { createdAt: { lt: before(this._days('ERRORS_RETENTION_DAYS', 90)) } },
      });
      return r.count;
    });

    await this._safe('notifications', counts, async () => {
      // NotificationRead cascades from Notifications (onDelete: Cascade).
      const r = await this._prisma.notifications.deleteMany({
        where: {
          createdAt: { lt: before(this._days('NOTIFICATIONS_RETENTION_DAYS', 180)) },
        },
      });
      return r.count;
    });

    await this._safe('multipartUploads', counts, async () => {
      const r = await this._prisma.multipartUpload.deleteMany({
        where: {
          state: { not: 'completed' },
          updatedAt: {
            lt: before(this._days('MULTIPART_UPLOAD_RETENTION_DAYS', 7)),
          },
        },
      });
      return r.count;
    });

    await this._safe('mastraTraces', counts, async () => {
      const cutoff = before(this._days('MASTRA_TRACE_RETENTION_DAYS', 30));
      // mastra_ai_spans / mastra_evals are @@ignore'd (no Prisma client delegate),
      // so we prune the queryable trace tables: mastra_traces + mastra_scorers.
      const traces = await this._prisma.mastra_traces.deleteMany({
        where: { createdAt: { lt: cutoff } },
      });
      const scorers = await this._prisma.mastra_scorers.deleteMany({
        where: { createdAt: { lt: cutoff } },
      });
      return traces.count + scorers.count;
    });

    await this._safe('softDeletedPosts', counts, async () => {
      return this._purgeSoftDeletedPosts(
        before(this._days('SOFT_DELETE_RETENTION_DAYS', 30))
      );
    });

    await this._safe('softDeletedFiles', counts, async () => {
      const cutoff = before(this._days('SOFT_DELETE_RETENTION_DAYS', 30));
      let total = 0;
      for (let i = 0; i < RetentionActivity.MAX_BATCHES; i++) {
        const rows = await this._prisma.file.findMany({
          where: { deletedAt: { not: null, lt: cutoff } },
          select: { id: true },
          take: RetentionActivity.BATCH,
        });
        if (!rows.length) break;
        // File child refs (pictureId/previewFileId/etc.) are optional → SetNull.
        const r = await this._prisma.file.deleteMany({
          where: { id: { in: rows.map((f) => f.id) } },
        });
        total += r.count;
        if (rows.length < RetentionActivity.BATCH) break;
      }
      return total;
    });

    // I4c — bound IP/agent retention: null personal network identifiers past N days.
    await this._safe('userIpAgent', counts, async () => {
      const cutoff = before(this._days('IP_RETENTION_DAYS', 90));
      const r = await this._prisma.user.updateMany({
        where: {
          lastOnline: { lt: cutoff },
          OR: [{ ip: { not: null } }, { agent: { not: null } }],
        },
        data: { ip: null, agent: null },
      });
      return r.count;
    });

    await this._safe('sessionIpAgent', counts, async () => {
      const cutoff = before(this._days('IP_RETENTION_DAYS', 90));
      const r = await this._prisma.session.updateMany({
        where: {
          lastUsedAt: { lt: cutoff },
          OR: [{ ip: { not: null } }, { userAgent: { not: null } }],
        },
        data: { ip: null, userAgent: null },
      });
      return r.count;
    });

    this._logger.log(`Retention sweep complete: ${JSON.stringify(counts)}`);
    return counts;
  }

  /**
   * Hard-delete soft-deleted posts past the cutoff in capped batches. Non-cascading
   * required child rows (TagsPosts, Comments, Errors) are removed first; the rest
   * (PostAnalyticsSnapshot, SocialComment, PostCommentRead) cascade from Post.
   */
  private async _purgeSoftDeletedPosts(cutoff: Date): Promise<number> {
    let total = 0;
    for (let i = 0; i < RetentionActivity.MAX_BATCHES; i++) {
      const rows = await this._prisma.post.findMany({
        where: { deletedAt: { not: null, lt: cutoff } },
        select: { id: true },
        take: RetentionActivity.BATCH,
      });
      if (!rows.length) break;
      const ids = rows.map((p) => p.id);

      await this._prisma.$transaction([
        this._prisma.tagsPosts.deleteMany({ where: { postId: { in: ids } } }),
        this._prisma.comments.deleteMany({ where: { postId: { in: ids } } }),
        this._prisma.errors.deleteMany({ where: { postId: { in: ids } } }),
        // Children of these posts lose their parent link (self-relation is optional).
        this._prisma.post.updateMany({
          where: { parentPostId: { in: ids } },
          data: { parentPostId: null },
        }),
        this._prisma.post.deleteMany({ where: { id: { in: ids } } }),
      ]);

      total += ids.length;
      if (rows.length < RetentionActivity.BATCH) break;
    }
    return total;
  }

  private _days(envKey: string, fallback: number): number {
    const raw = process.env[envKey];
    if (raw === undefined || raw === '') return fallback;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      this._logger.warn(
        `RetentionActivity: invalid ${envKey}="${raw}", falling back to ${fallback}`
      );
      return fallback;
    }
    return Math.floor(parsed);
  }

  private async _safe(
    key: string,
    counts: Record<string, number>,
    fn: () => Promise<number>
  ): Promise<void> {
    try {
      counts[key] = await fn();
    } catch (err) {
      counts[key] = -1;
      this._logger.warn(
        `RetentionActivity: prune "${key}" failed (non-fatal): ${(err as Error)?.message}`
      );
    }
  }
}
