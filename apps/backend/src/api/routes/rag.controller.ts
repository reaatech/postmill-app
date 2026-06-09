import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpException,
  HttpStatus,
  Logger,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Organization, User } from '@prisma/client';
import { ApiTags } from '@nestjs/swagger';
import { GetOrgFromRequest } from '@gitroom/nestjs-libraries/user/org.from.request';
import { GetUserFromRequest } from '@gitroom/nestjs-libraries/user/user.from.request';
import { CheckPolicies } from '@gitroom/backend/services/auth/permissions/permissions.ability';
import { AuthorizationActions, Sections } from '@gitroom/backend/services/auth/permissions/permission.exception.class';
import { RagService, RagSettings } from '@gitroom/nestjs-libraries/ai/governance/rag.service';
import { AiSettingsManager } from '@gitroom/nestjs-libraries/ai/ai-settings.manager';
import { AiSettingsService } from '@gitroom/nestjs-libraries/database/prisma/ai-settings/ai-settings.service';

@ApiTags('RAG')
@Controller('/rag')
export class RagController {
  private readonly _logger = new Logger(RagController.name);

  constructor(
    private _ragService: RagService,
    private _aiSettingsManager: AiSettingsManager,
    private _aiSettingsService: AiSettingsService,
  ) {}

  @Get('/status')
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @CheckPolicies([AuthorizationActions.Read, Sections.AI])
  async getStatus(@GetOrgFromRequest() org: Organization) {
    return this._ragService.getStatus(org.id);
  }

  @Post('/index')
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @CheckPolicies([AuthorizationActions.Create, Sections.AI])
  async indexContent(
    @GetOrgFromRequest() org: Organization,
    @GetUserFromRequest() user: User,
    @Body()
    body: {
      sourceType: string;
      content: string;
      sourceId?: string;
    },
  ) {
    if (!body.sourceType || !body.content) {
      throw new BadRequestException('sourceType and content are required');
    }
    if (!['text', 'url', 'file'].includes(body.sourceType)) {
      throw new BadRequestException('sourceType must be "text", "url", or "file"');
    }

    const sourceId = body.sourceId || `${body.sourceType}_${Date.now()}`;

    try {
      await this._ragService.indexContent({
        organizationId: org.id,
        sourceType: body.sourceType,
        sourceId,
        content: body.content,
      });

      return { success: true, sourceType: body.sourceType, sourceId };
    } catch (err) {
      this._logger.error(
        `RAG index failed for org ${org.id}: ${(err as Error).message}`,
      );
      throw new HttpException(
        (err as Error).message || 'Indexing failed',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('/items')
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @CheckPolicies([AuthorizationActions.Read, Sections.AI])
  async listItems(
    @GetOrgFromRequest() org: Organization,
    @Query('offset') offset?: string,
    @Query('limit') limit?: string,
    @Query('sourceType') sourceType?: string,
  ) {
    const parsedOffset = offset ? Math.max(0, parseInt(offset, 10)) : 0;
    const parsedLimit = limit
      ? Math.min(100, Math.max(1, parseInt(limit, 10)))
      : 20;

    return this._ragService.getItems(org.id, {
      sourceType,
      offset: parsedOffset,
      limit: parsedLimit,
    });
  }

  @Delete('/items/:sourceType/:sourceId')
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @CheckPolicies([AuthorizationActions.Delete, Sections.AI])
  async deleteItem(
    @GetOrgFromRequest() org: Organization,
    @Param('sourceType') sourceType: string,
    @Param('sourceId') sourceId: string,
  ) {
    try {
      await this._ragService.deleteItem(org.id, sourceType, sourceId);
      return { success: true };
    } catch (err) {
      this._logger.error(
        `RAG delete failed for org ${org.id}: ${(err as Error).message}`,
      );
      throw new HttpException(
        (err as Error).message || 'Delete failed',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('/search')
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @CheckPolicies([AuthorizationActions.Read, Sections.AI])
  async search(
    @GetOrgFromRequest() org: Organization,
    @Body() body: { query: string; limit?: number },
  ) {
    if (!body.query || !body.query.trim()) {
      throw new BadRequestException('query is required');
    }

    try {
      const results = await this._ragService.search({
        organizationId: org.id,
        query: body.query,
        limit: body.limit || 10,
      });
      return { results };
    } catch (err) {
      this._logger.error(
        `RAG search failed for org ${org.id}: ${(err as Error).message}`,
      );
      throw new HttpException(
        (err as Error).message || 'Search failed',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  @Post('/backfill')
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  @CheckPolicies([AuthorizationActions.Create, Sections.AI])
  async triggerBackfill(
    @GetOrgFromRequest() org: Organization,
    @GetUserFromRequest() user: User,
  ) {
    try {
      const result = await this._ragService.backfill(org.id, user?.id);
      return { status: 'completed', ...result };
    } catch (err) {
      this._logger.error(
        `RAG backfill failed for org ${org.id}: ${(err as Error).message}`,
      );
      throw new HttpException(
        (err as Error).message || 'Backfill failed',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('/settings')
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @CheckPolicies([AuthorizationActions.Read, Sections.AI])
  async getSettings() {
    const settings = await this._aiSettingsManager.getSettings();
    const rag = (settings?.ragSettings || {}) as Record<string, any>;
    return {
      enabled: !!rag.enabled,
      vectorStore: rag.vectorStore || 'pgvector',
      qdrantUrl: rag.qdrantUrl || '',
      qdrantCollection: rag.qdrantCollection || 'postiz_rag',
      qdrantConfigured: !!(rag.qdrantUrl || (settings as any)?.secretSettings?.qdrantApiKey),
      embeddingDimension: rag.embeddingDimension || 1536,
      chunkSize: rag.chunkSize || 500,
      chunkOverlap: rag.chunkOverlap || 100,
      autoIndex: !!rag.autoIndex,
      autoIndexSources: Array.isArray(rag.autoIndexSources) ? rag.autoIndexSources : [],
    };
  }

  @Put('/settings')
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @CheckPolicies([AuthorizationActions.Create, Sections.AI])
  async saveSettings(
    @Body()
    body: {
      enabled?: boolean;
      vectorStore?: string;
      qdrantUrl?: string;
      qdrantApiKey?: string;
      qdrantCollection?: string;
      embeddingDimension?: number;
      chunkSize?: number;
      chunkOverlap?: number;
      autoIndex?: boolean;
      autoIndexSources?: string[];
    },
  ) {
    if (body.vectorStore && !['pgvector', 'qdrant'].includes(body.vectorStore)) {
      throw new BadRequestException('vectorStore must be "pgvector" or "qdrant"');
    }

    const settings = await this._aiSettingsManager.getSettings();
    const existing = (settings?.ragSettings || {}) as Record<string, any>;

    const rag: Record<string, any> = { ...existing };

    if (body.enabled !== undefined) rag.enabled = body.enabled;
    if (body.vectorStore !== undefined) rag.vectorStore = body.vectorStore;
    if (body.qdrantUrl !== undefined) rag.qdrantUrl = body.qdrantUrl;
    if (body.qdrantCollection !== undefined) rag.qdrantCollection = body.qdrantCollection;
    if (body.embeddingDimension !== undefined) rag.embeddingDimension = body.embeddingDimension;
    if (body.chunkSize !== undefined) rag.chunkSize = body.chunkSize;
    if (body.chunkOverlap !== undefined) rag.chunkOverlap = body.chunkOverlap;
    if (body.autoIndex !== undefined) rag.autoIndex = body.autoIndex;
    if (body.autoIndexSources !== undefined) rag.autoIndexSources = body.autoIndexSources;

    // If a new qdrantApiKey is provided, store it in secretSettings (encrypted)
    if (body.qdrantApiKey !== undefined) {
      rag.qdrantApiKey = body.qdrantApiKey;
    }

    await this._aiSettingsService.upsertSystemSettings({ ragSettings: rag });
    await this._aiSettingsManager.refreshCache();

    return { success: true };
  }

  @Post('/settings/test-connection')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @CheckPolicies([AuthorizationActions.Create, Sections.AI])
  async testConnection(
    @Body()
    body: {
      vectorStore: string;
      qdrantUrl?: string;
      qdrantApiKey?: string;
      qdrantCollection?: string;
      embeddingDimension?: number;
    },
  ) {
    if (!['pgvector', 'qdrant'].includes(body.vectorStore)) {
      throw new BadRequestException('vectorStore must be "pgvector" or "qdrant"');
    }

    const result = await this._ragService.testConnection({
      enabled: true,
      vectorStore: body.vectorStore as 'pgvector' | 'qdrant',
      qdrantUrl: body.qdrantUrl,
      qdrantApiKey: body.qdrantApiKey,
      qdrantCollection: body.qdrantCollection,
      embeddingDimension: body.embeddingDimension,
    } as RagSettings);

    return result;
  }
}
