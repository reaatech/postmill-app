import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import type { AiDesignerSession as PrismaAiDesignerSession } from '@prisma/client';
import type { AiDesignerConfig, AiDesignerSessionState, DesignBrief } from '@gitroom/nestjs-libraries/ai-designer/ai-designer.types';

@Injectable()
export class AiDesignerSessionRepository {
  constructor(private readonly _prisma: PrismaService) {}

  async create(data: {
    organizationId: string;
    userId: string;
    mode: string;
    format: string;
    config: AiDesignerConfig;
    brief?: DesignBrief | null;
    state?: AiDesignerSessionState;
    activeDesignIds?: string[] | null;
  }): Promise<PrismaAiDesignerSession> {
    return this._prisma.aiDesignerSession.create({
      data: {
        organizationId: data.organizationId,
        userId: data.userId,
        mode: data.mode,
        format: data.format,
        config: data.config as any,
        brief: (data.brief ?? null) as any,
        state: data.state ?? 'intake',
        activeDesignIds: (data.activeDesignIds ?? null) as any,
      },
    });
  }

  async findByIdForOrgAndUser(
    id: string,
    organizationId: string,
    userId: string
  ): Promise<PrismaAiDesignerSession | null> {
    return this._prisma.aiDesignerSession.findFirst({
      where: { id, organizationId, userId },
    });
  }

  async listByOrgAndUser(
    organizationId: string,
    userId: string,
    options?: { page?: number; limit?: number }
  ): Promise<{ sessions: PrismaAiDesignerSession[]; total: number }> {
    const page = options?.page ?? 1;
    const limit = options?.limit ?? 20;
    const skip = (page - 1) * limit;

    const [sessions, total] = await Promise.all([
      this._prisma.aiDesignerSession.findMany({
        where: { organizationId, userId },
        orderBy: { updatedAt: 'desc' },
        skip,
        take: limit,
      }),
      this._prisma.aiDesignerSession.count({
        where: { organizationId, userId },
      }),
    ]);

    return { sessions, total };
  }

  async update(
    id: string,
    organizationId: string,
    userId: string,
    data: {
      state?: AiDesignerSessionState;
      brief?: DesignBrief | null;
      config?: AiDesignerConfig;
      activeDesignIds?: string[] | null;
    }
  ): Promise<PrismaAiDesignerSession> {
    const prismaData: any = {};
    if (data.state !== undefined) prismaData.state = data.state;
    if (data.brief !== undefined) prismaData.brief = data.brief as any;
    if (data.config !== undefined) prismaData.config = data.config as any;
    if (data.activeDesignIds !== undefined) {
      prismaData.activeDesignIds = data.activeDesignIds as any;
    }

    // Sessions are user-private (find/delete scope by userId too) — keep the
    // write path symmetric so a caller can never rewrite another member's
    // session with only a client-influenced sessionId.
    return this._prisma.aiDesignerSession.update({
      where: { id, organizationId, userId },
      data: prismaData,
    });
  }

  async delete(
    id: string,
    organizationId: string,
    userId: string
  ): Promise<PrismaAiDesignerSession> {
    return this._prisma.aiDesignerSession.delete({
      where: { id, organizationId, userId },
    });
  }
}
