import { Injectable } from '@nestjs/common';
import { AiSettingsRepository } from './ai-settings.repository';
import { AuthService } from '@gitroom/helpers/auth/auth.service';
import { EncryptionService } from '@gitroom/nestjs-libraries/encryption/encryption.service';

@Injectable()
export class AiSettingsService {
  constructor(
    private _repository: AiSettingsRepository,
    private _encryption: EncryptionService,
  ) {}

  // ── AIProviderConfig ──

  getProviderConfigs() {
    return this._repository.getProviderConfigs();
  }

  listProviderConfigs() {
    return this._repository.listProviderConfigs();
  }

  getProviderConfigByIdentifier(identifier: string) {
    return this._repository.getProviderConfigByIdentifier(identifier);
  }

  async upsertProviderConfig(
    identifier: string,
    data: {
      enabled?: boolean;
      credentials?: Record<string, string>;
      defaultModel?: string;
      reasoningModel?: string;
      extraConfig?: Record<string, any>;
    },
  ) {
    let extraConfig: string | undefined;
    if (data.extraConfig !== undefined) {
      if (typeof data.extraConfig === 'string') {
        try {
          JSON.parse(data.extraConfig);
          extraConfig = data.extraConfig;
        } catch {
          throw new Error('extraConfig must be a valid JSON string');
        }
      } else if (typeof data.extraConfig === 'object') {
        extraConfig = JSON.stringify(data.extraConfig);
      }
    }

    const encryptedCredentials = data.credentials
      ? AuthService.fixedEncryption(JSON.stringify(data.credentials))
      : undefined;

    return this._repository.upsertProviderConfig(identifier, {
      ...data,
      credentials: encryptedCredentials,
      extraConfig,
    });
  }

  decryptProviderConfig(config: { credentials?: string | null }) {
    if (!config.credentials) return { credentials: undefined };
    try {
      return {
        credentials: JSON.parse(
          AuthService.fixedDecryption(config.credentials),
        ) as Record<string, string>,
      };
    } catch {
      return { credentials: undefined };
    }
  }

  async deleteProviderConfig(identifier: string) {
    return this._repository.deleteProviderConfig(identifier);
  }

  getEnabledProviderConfigs() {
    return this._repository.getEnabledProviderConfigs();
  }

  // ── AISystemSettings (singleton) ──

  async getSystemSettings() {
    return this._repository.getSystemSettings();
  }

  private _tryParseJson(raw: string | null | undefined): any {
    if (!raw) return undefined;
    try {
      return JSON.parse(raw);
    } catch {
      return raw;
    }
  }

  async getDecryptedSystemSettings() {
    const settings = await this._repository.getSystemSettings();
    if (!settings) return null;

    let secretSettings: Record<string, string> | undefined;
    if (settings.secretSettings) {
      try {
        secretSettings = JSON.parse(
          AuthService.fixedDecryption(settings.secretSettings),
        );
      } catch {
        secretSettings = undefined;
      }
    }

    return {
      ...settings,
      secretSettings,
      scopeModels: this._tryParseJson(settings.scopeModels),
      guardrailSettings: this._tryParseJson(settings.guardrailSettings),
      budgetSettings: this._tryParseJson(settings.budgetSettings),
      rateLimitSettings: this._tryParseJson(settings.rateLimitSettings),
      observability: this._tryParseJson(settings.observability),
      mcpSettings: this._tryParseJson(settings.mcpSettings),
      ragSettings: this._tryParseJson(settings.ragSettings),
    };
  }

  async upsertSystemSettings(data: Record<string, any>) {
    const processed = { ...data };

    const jsonFields = ['scopeModels', 'guardrailSettings', 'budgetSettings', 'rateLimitSettings', 'observability', 'mcpSettings', 'ragSettings'];
    for (const field of jsonFields) {
      if (processed[field] === undefined || processed[field] === null) continue;
      if (typeof processed[field] === 'object') {
        processed[field] = JSON.stringify(processed[field]);
      } else if (typeof processed[field] === 'string' && processed[field] !== '') {
        try {
          JSON.parse(processed[field]);
        } catch {
          throw new Error(`Invalid JSON in ${field}: must be valid JSON string`);
        }
      }
    }

    if (processed.secretSettings && typeof processed.secretSettings === 'object') {
      processed.secretSettings = AuthService.fixedEncryption(
        JSON.stringify(processed.secretSettings),
      );
    }

    return this._repository.upsertSystemSettings(processed);
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
    return this._repository.createSpendLog(data);
  }

  getSpendSummary(organizationId?: string, since?: Date) {
    return this._repository.getSpendSummary(organizationId, since);
  }

  // ── AISettingsAudit ──

  private _sanitizeAuditDetail(detail: any): any {
    const SENSITIVE_KEYS = ['apiKey', 'api_key', 'apikey', 'secret', 'password', 'token', 'credential', 'auth', 'key'];
    const isSensitiveKey = (key: string) => {
      const lowerKey = key.toLowerCase();
      return SENSITIVE_KEYS.some(sk => lowerKey === sk || lowerKey.startsWith(sk) || lowerKey.endsWith(sk));
    };
    if (Array.isArray(detail)) {
      return detail.map((item) => this._sanitizeAuditDetail(item));
    }
    if (typeof detail !== 'object' || detail === null) {
      return detail;
    }

    const sanitized: Record<string, any> = {};
    const sensitiveFieldName =
      (typeof detail.field === 'string' && isSensitiveKey(detail.field)) ||
      (typeof detail.name === 'string' && isSensitiveKey(detail.name));

    for (const [key, value] of Object.entries(detail)) {
      if (isSensitiveKey(key)) {
        sanitized[key] = '[REDACTED]';
      } else if (
        sensitiveFieldName &&
        ['value', 'oldValue', 'newValue', 'before', 'after', 'previous', 'next'].includes(key)
      ) {
        sanitized[key] = '[REDACTED]';
      } else if (typeof value === 'object' && value !== null) {
        sanitized[key] = this._sanitizeAuditDetail(value);
      } else {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }

  getAuditLogs(limit = 100, offset = 0) {
    return this._repository.getAuditLogs(limit, offset);
  }

  createAuditLog(data: { userId?: string; action: string; detail?: string }) {
    let sanitizedDetail: any;
    if (data.detail) {
      try {
        sanitizedDetail = this._sanitizeAuditDetail(JSON.parse(data.detail));
      } catch {
        sanitizedDetail = {
          parseError: 'invalid_json',
          raw: '[UNPARSABLE_DETAIL_REDACTED]',
        };
      }
    }
    return this._repository.createAuditLog({
      ...data,
      detail: sanitizedDetail ? JSON.stringify(sanitizedDetail) : undefined,
    });
  }

  // ── AIOrgProviderConfig ──

  getOrgProviderConfigs(organizationId: string) {
    return this._repository.getOrgProviderConfigs(organizationId);
  }

  getAllOrgIds() {
    return this._repository.getAllOrgIds();
  }

  getOrgProviderConfig(organizationId: string, identifier: string) {
    return this._repository.getOrgProviderConfig(organizationId, identifier);
  }

  async upsertOrgProviderConfig(
    organizationId: string,
    identifier: string,
    data: {
      enabled?: boolean;
      credentials?: Record<string, string>;
      defaultModel?: string;
      reasoningModel?: string;
      extraConfig?: Record<string, any>;
    },
  ) {
    let extraConfig: string | undefined;
    if (data.extraConfig !== undefined) {
      if (typeof data.extraConfig === 'string') {
        try {
          JSON.parse(data.extraConfig);
          extraConfig = data.extraConfig;
        } catch {
          throw new Error('extraConfig must be a valid JSON string');
        }
      } else if (typeof data.extraConfig === 'object') {
        extraConfig = JSON.stringify(data.extraConfig);
      }
    }

    // 3.9: per-org AIOrgProviderConfig rows are read back at runtime by
    // OrgAiSettingsService / OrgMediaProviderSettingsService via EncryptionService,
    // so the admin write goes through the same service for symmetry. Note this is a
    // no-op in crypto terms: EncryptionService.encrypt delegates to
    // AuthService.fixedEncryption (encryption.service.ts), the same routine used for
    // the deployment-wide AIProviderConfig — both share one getEncryptionKey(), so
    // the two routes do NOT diverge even when a dedicated ENCRYPTION_KEY is set. It
    // is "same key behind two routes"; keeping this call on EncryptionService is
    // convention, not correctness.
    const encryptedCredentials = data.credentials
      ? this._encryption.encrypt(JSON.stringify(data.credentials))
      : undefined;

    return this._repository.upsertOrgProviderConfig(organizationId, identifier, {
      ...data,
      credentials: encryptedCredentials,
      extraConfig,
    });
  }

  deleteOrgProviderConfig(organizationId: string, identifier: string) {
    return this._repository.deleteOrgProviderConfig(organizationId, identifier);
  }

  // ── AIBrandProfile ──

  getBrandProfile(organizationId: string, brandId?: string) {
    return this._repository.getBrandProfile(organizationId, brandId);
  }

  upsertBrandProfile(
    organizationId: string,
    data: { instructions?: string; language?: string; enabled?: boolean; platformInstructions?: Record<string, string> },
  ) {
    return this._repository.upsertBrandProfile(organizationId, data);
  }

  // ── AIPromptTemplate ──

  getPromptTemplates(organizationId?: string | null) {
    return this._repository.getPromptTemplates(organizationId);
  }

  upsertPromptTemplate(
    organizationId: string | null,
    key: string,
    content: string,
  ) {
    return this._repository.upsertPromptTemplate(organizationId, key, content);
  }

  deletePromptTemplate(organizationId: string | null, key: string) {
    return this._repository.deletePromptTemplate(organizationId, key);
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
    version?: string | null;
    inputJson?: string | null;
  }) {
    return this._repository.createMediaJob(data);
  }

  updateMediaJob(
    organizationId: string,
    id: string,
    data: {
      status?: string;
      artifactUrl?: string | null;
      provenance?: string;
      costUsd?: number;
      error?: string | null;
      folderId?: string | null;
      model?: string | null;
      version?: string | null;
      inputJson?: string | null;
      creditType?: string | null;
    },
  ) {
    return this._repository.updateMediaJob(organizationId, id, data);
  }

  getMediaJobs(organizationId: string, limit = 50) {
    return this._repository.getMediaJobs(organizationId, limit);
  }

  async getMediaJobsWithCounts(organizationId: string, limit = 20) {
    const [jobs, counts] = await Promise.all([
      this._repository.getMediaJobs(organizationId, limit),
      this._repository.getMediaJobStatusCounts(organizationId),
    ]);
    return { jobs, counts };
  }

  getMediaJobsByProvider(organizationId: string, provider: string, limit = 50) {
    return this._repository.getMediaJobsByProvider(organizationId, provider, limit);
  }

  getMediaJobById(organizationId: string, id: string) {
    return this._repository.getMediaJobById(organizationId, id);
  }

  // See AiSettingsRepository.getMediaJobByIdUnscoped — job-id-only entry points only.
  getMediaJobByIdUnscoped(id: string) {
    return this._repository.getMediaJobByIdUnscoped(id);
  }

  // §3.1: atomic status-transition claim — see AiSettingsRepository.claimMediaJobStatus.
  claimMediaJobStatus(organizationId: string, id: string, from: string[], to: string) {
    return this._repository.claimMediaJobStatus(organizationId, id, from, to);
  }

  getPendingMediaJobs(limit = 100) {
    return this._repository.getPendingMediaJobs(limit);
  }

  // §3.1 crash-recovery: reset jobs stranded in the transient `landing` state (a crash
  // between the completion claim and the terminal write) back to `processing`.
  reclaimStaleLandingJobs(cutoff: Date) {
    return this._repository.reclaimStaleLandingJobs(cutoff);
  }

  // ── AIPromptLibraryItem ──

  getPromptLibraryItems(organizationId: string) {
    return this._repository.getPromptLibraryItems(organizationId);
  }

  createPromptLibraryItem(data: {
    organizationId: string;
    title: string;
    content: string;
  }) {
    return this._repository.createPromptLibraryItem(data);
  }

  deletePromptLibraryItem(id: string, organizationId: string) {
    return this._repository.deletePromptLibraryItem(id, organizationId);
  }

  // ── AIContentIndex (Phase 5 RAG — wrappers will be added then) ──

  async upsertContentIndex(data: {
    organizationId: string;
    sourceType: string;
    sourceId: string;
    chunkIndex: number;
    contentHash: string;
    chunk?: string;
  }) {
    if (typeof data.contentHash !== 'string' || data.contentHash.length < 8) {
      throw new Error('contentHash must be at least 8 characters');
    }
    return this._repository.upsertContentIndex(data);
  }
}
