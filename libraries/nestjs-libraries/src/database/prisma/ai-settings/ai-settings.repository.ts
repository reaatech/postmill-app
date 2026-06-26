import { PrismaRepository } from '@gitroom/nestjs-libraries/database/prisma/prisma.service';
import { Injectable } from '@nestjs/common';

@Injectable()
export class AiSettingsRepository {
  constructor(
    private _aiProviderConfig: PrismaRepository<'aIProviderConfig'>,
    private _aiSystemSettings: PrismaRepository<'aISystemSettings'>,
    private _aiSpendLog: PrismaRepository<'aISpendLog'>,
    private _aiSettingsAudit: PrismaRepository<'aISettingsAudit'>,
    private _aiBrandProfile: PrismaRepository<'aIBrandProfile'>,
    private _aiPromptTemplate: PrismaRepository<'aIPromptTemplate'>,
    private _aiMediaJob: PrismaRepository<'aIMediaJob'>,
    private _aiPromptLibraryItem: PrismaRepository<'aIPromptLibraryItem'>,
    private _aiContentIndex: PrismaRepository<'aIContentIndex'>,
    private _aiOrgProviderConfig: PrismaRepository<'aIOrgProviderConfig'>,
  ) {}

  // ── AIProviderConfig ──
  getProviderConfigs() {
    return this._aiProviderConfig.model.aIProviderConfig.findMany();
  }

  listProviderConfigs() {
    return this._aiProviderConfig.model.aIProviderConfig.findMany({
      select: {
        id: true,
        identifier: true,
        enabled: true,
        defaultModel: true,
        reasoningModel: true,
        extraConfig: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  getProviderConfigByIdentifier(identifier: string) {
    return this._aiProviderConfig.model.aIProviderConfig.findUnique({
      where: { identifier },
    });
  }

  upsertProviderConfig(
    identifier: string,
    data: {
      enabled?: boolean;
      credentials?: string;
      defaultModel?: string;
      reasoningModel?: string;
      extraConfig?: string;
    },
  ) {
    return this._aiProviderConfig.model.aIProviderConfig.upsert({
      where: { identifier },
      create: { identifier, ...data },
      update: data,
    });
  }

  deleteProviderConfig(identifier: string) {
    return this._aiProviderConfig.model.aIProviderConfig.delete({
      where: { identifier },
    });
  }

  getEnabledProviderConfigs() {
    return this._aiProviderConfig.model.aIProviderConfig.findMany({
      where: { enabled: true },
    });
  }

  // ── AISystemSettings (singleton) ──
  getSystemSettings() {
    return this._aiSystemSettings.model.aISystemSettings.findUnique({
      where: { id: 'singleton' },
    });
  }

  upsertSystemSettings(data: Record<string, any>) {
    return this._aiSystemSettings.model.aISystemSettings.upsert({
      where: { id: 'singleton' },
      create: { id: 'singleton', ...data },
      update: data,
    });
  }

  // ── AISpendLog ──
  createSpendLog(data: {
    organizationId?: string;
    userId?: string;
    provider: string;
    model: string;
    scope: string;
    inputTokens: number;
    outputTokens: number;
    costUsd: number;
  }) {
    return this._aiSpendLog.model.aISpendLog.create({ data });
  }

  getSpendSummary(organizationId?: string, since?: Date) {
    return this._aiSpendLog.model.aISpendLog.groupBy({
      by: ['scope'],
      where: {
        ...(organizationId ? { organizationId } : {}),
        ...(since ? { createdAt: { gte: since } } : {}),
      },
      _sum: { costUsd: true, inputTokens: true, outputTokens: true },
    });
  }

  // ── AISettingsAudit ──
  getAuditLogs(limit = 100, offset = 0) {
    return this._aiSettingsAudit.model.aISettingsAudit.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    });
  }

  createAuditLog(data: { userId?: string; action: string; detail?: string }) {
    return this._aiSettingsAudit.model.aISettingsAudit.create({ data });
  }

  // ── AIBrandProfile ──
  getBrandProfile(organizationId: string, brandId?: string) {
    if (brandId) {
      return this._aiBrandProfile.model.aIBrandProfile.findFirst({
        where: { id: brandId, organizationId },
      });
    }
    return this._aiBrandProfile.model.aIBrandProfile.findFirst({
      where: { organizationId, isDefault: true },
    });
  }

  async upsertBrandProfile(
    organizationId: string,
    data: { instructions?: string; language?: string; enabled?: boolean; platformInstructions?: Record<string, string> },
  ) {
    const existing = await this._aiBrandProfile.model.aIBrandProfile.findFirst({
      where: { organizationId, isDefault: true },
    });
    if (existing) {
      return this._aiBrandProfile.model.aIBrandProfile.update({
        where: { id: existing.id },
        data,
      });
    }
    return this._aiBrandProfile.model.aIBrandProfile.create({
      data: { organizationId, ...data, isDefault: true, name: 'Default Brand' },
    });
  }

  // ── AIPromptTemplate ──
  /**
   * Fetch prompt templates.
   * @param organizationId - `null` → return only global (org=null) templates;
   *                         `undefined` → return ALL templates (no filter);
   *                         a string → return templates for that org only.
   */
  getPromptTemplates(organizationId?: string | null) {
    const where: any = {};
    if (organizationId !== undefined) where.organizationId = organizationId;

    return this._aiPromptTemplate.model.aIPromptTemplate.findMany({ where });
  }

  /**
   * Fetch templates matching the org OR global (org=null) for resolution:
   * org → global → built-in constant.
   */
  getPromptTemplatesForResolution(organizationId: string) {
    return this._aiPromptTemplate.model.aIPromptTemplate.findMany({
      where: {
        OR: [
          { organizationId },
          { organizationId: null },
        ],
      },
    });
  }

  getPromptTemplate(organizationId: string | null, key: string) {
    if (organizationId === null) {
      return this._aiPromptTemplate.model.aIPromptTemplate.findUnique({
        where: { globalKey: key },
      });
    }

    return this._aiPromptTemplate.model.aIPromptTemplate.findUnique({
      where: { organizationId_key: { organizationId, key } },
    });
  }

  upsertPromptTemplate(
    organizationId: string | null,
    key: string,
    content: string,
  ) {
    if (organizationId === null) {
      return this._aiPromptTemplate.model.aIPromptTemplate.upsert({
        where: { globalKey: key },
        create: { organizationId: null, globalKey: key, key, content },
        update: { content, globalKey: key },
      });
    }

    return this._aiPromptTemplate.model.aIPromptTemplate.upsert({
      where: { organizationId_key: { organizationId, key } },
      create: { organizationId, globalKey: null, key, content },
      update: { content, globalKey: null },
    });
  }

  deletePromptTemplate(organizationId: string | null, key: string) {
    if (organizationId === null) {
      return this._aiPromptTemplate.model.aIPromptTemplate.delete({
        where: { globalKey: key },
      });
    }

    return this._aiPromptTemplate.model.aIPromptTemplate.delete({
      where: { organizationId_key: { organizationId, key } },
    });
  }

  // ── AIMediaJob ──
  createMediaJob(data: {
    organizationId: string;
    userId?: string;
    provider: string;
    operation: string;
    status?: string;
    artifactUrl?: string;
    provenance?: string;
    costUsd?: number;
    creditType?: string;
    error?: string;
    folderId?: string | null;
    model?: string | null;
    versionId?: string | null;
    inputJson?: string | null;
  }) {
    return this._aiMediaJob.model.aIMediaJob.create({ data });
  }

  updateMediaJob(
    id: string,
    data: {
      status?: string;
      artifactUrl?: string | null;
      provenance?: string;
      costUsd?: number;
      error?: string | null;
      folderId?: string | null;
      model?: string | null;
      versionId?: string | null;
      inputJson?: string | null;
      creditType?: string | null;
    },
  ) {
    return this._aiMediaJob.model.aIMediaJob.update({
      where: { id },
      data,
    });
  }

  getMediaJobs(organizationId: string, limit = 50) {
    return this._aiMediaJob.model.aIMediaJob.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  getMediaJobsByProvider(organizationId: string, provider: string, limit = 50) {
    return this._aiMediaJob.model.aIMediaJob.findMany({
      where: { organizationId, provider },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  getMediaJobById(id: string) {
    return this._aiMediaJob.model.aIMediaJob.findUnique({ where: { id } });
  }

  // Pending/processing async jobs across all orgs for the polling sweep (§11.2).
  getPendingMediaJobs(limit = 100) {
    return this._aiMediaJob.model.aIMediaJob.findMany({
      where: { status: { in: ['pending', 'processing'] } },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });
  }

  // ── AIPromptLibraryItem ──
  getPromptLibraryItems(organizationId: string) {
    return this._aiPromptLibraryItem.model.aIPromptLibraryItem.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
    });
  }

  createPromptLibraryItem(data: {
    organizationId: string;
    title: string;
    content: string;
  }) {
    return this._aiPromptLibraryItem.model.aIPromptLibraryItem.create({ data });
  }

  async deletePromptLibraryItem(id: string, organizationId: string) {
    const item = await this._aiPromptLibraryItem.model.aIPromptLibraryItem.findUnique({
      where: { id },
      select: { organizationId: true },
    });
    if (!item || item.organizationId !== organizationId) {
      throw new Error('Prompt library item not found or access denied');
    }
    await this._aiPromptLibraryItem.model.aIPromptLibraryItem.delete({
      where: { id },
    });
  }

  // ── AIContentIndex ──
  getContentIndexEntries(organizationId: string, sourceType: string, sourceId: string) {
    return this._aiContentIndex.model.aIContentIndex.findMany({
      where: { organizationId, sourceType, sourceId },
    });
  }

  createContentIndex(data: {
    organizationId: string;
    sourceType: string;
    sourceId: string;
    chunkIndex: number;
    contentHash: string;
    chunk?: string;
  }) {
    return this._aiContentIndex.model.aIContentIndex.create({ data });
  }

  /**
   * Deletes content index chunk rows for the given source.
   *
   * ⚠️ Embedded vectors are stored in an out-of-band AIContentEmbedding
   * side table created via raw SQL (§3.6). The raw-SQL FK must include
   * `ON DELETE CASCADE` referencing AIContentIndex.id — otherwise
   * orphaned embedding rows will be left behind when chunks are removed.
   * Verify the raw migration before shipping.
   */
  deleteContentIndexEntries(organizationId: string, sourceType: string, sourceId: string) {
    return this._aiContentIndex.model.aIContentIndex.deleteMany({
      where: { organizationId, sourceType, sourceId },
    });
  }

  upsertContentIndex(data: {
    organizationId: string;
    sourceType: string;
    sourceId: string;
    chunkIndex: number;
    contentHash: string;
    chunk?: string;
  }) {
    const { organizationId, sourceType, sourceId, chunkIndex, ...rest } = data;
    return this._aiContentIndex.model.aIContentIndex.upsert({
      where: {
        organizationId_sourceType_sourceId_chunkIndex: {
          organizationId,
          sourceType,
          sourceId,
          chunkIndex,
        },
      },
      create: data,
      update: rest,
    });
  }

  // ── AIOrgProviderConfig (BYOK scaffold) ──
  getOrgProviderConfigs(organizationId: string) {
    return this._aiOrgProviderConfig.model.aIOrgProviderConfig.findMany({
      where: { organizationId },
    });
  }

  async getAllOrgIds(): Promise<string[]> {
    const rows = await this._aiOrgProviderConfig.model.aIOrgProviderConfig.findMany({
      select: { organizationId: true },
      distinct: ['organizationId'],
    });
    return rows.map((r) => r.organizationId);
  }

  getOrgProviderConfig(organizationId: string, identifier: string) {
    return this._aiOrgProviderConfig.model.aIOrgProviderConfig.findUnique({
      where: { organizationId_identifier: { organizationId, identifier } },
    });
  }

  upsertOrgProviderConfig(
    organizationId: string,
    identifier: string,
    data: {
      enabled?: boolean;
      credentials?: string;
      defaultModel?: string;
      reasoningModel?: string;
      extraConfig?: string;
    },
  ) {
    return this._aiOrgProviderConfig.model.aIOrgProviderConfig.upsert({
      where: { organizationId_identifier: { organizationId, identifier } },
      create: { organizationId, identifier, ...data },
      update: data,
    });
  }

  deleteOrgProviderConfig(organizationId: string, identifier: string) {
    return this._aiOrgProviderConfig.model.aIOrgProviderConfig.delete({
      where: { organizationId_identifier: { organizationId, identifier } },
    });
  }
}
