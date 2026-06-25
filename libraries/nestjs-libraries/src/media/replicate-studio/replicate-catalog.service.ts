import { Injectable, NotFoundException } from '@nestjs/common';
import { safeFetch } from '@gitroom/nestjs-libraries/dtos/webhooks/safe.fetch';
import { RedisService } from '@gitroom/nestjs-libraries/redis/redis.service';
import { EncryptionService } from '@gitroom/nestjs-libraries/encryption/encryption.service';
import { OrgMediaProviderSettingsService } from '@gitroom/nestjs-libraries/database/prisma/media-providers/org-media-provider-settings.service';
import { CATEGORIES, MODEL_ALLOWLIST, isWarm, CategoryDefinition } from './replicate-catalog.allowlist';
import { pricingCategory, hasPrice, ReplicateCostService } from './replicate-cost';

const BASE = 'https://api.replicate.com/v1';
const CACHE_TTL = 86400; // 24h

export interface ModelSummary {
  id: string;
  name: string;
  description: string;
  coverImageUrl: string | null;
  runCount: number;
  warm: boolean;
  pricing: 'output' | 'usage';
  price: { kind: string; usd: number } | null;
}

export interface ModelDetail {
  id: string;
  name: string;
  coverImageUrl: string | null;
  warm: boolean;
  versionId: string;
  inputSchema: Record<string, unknown> | null;
}

interface ReplicateModelApi {
  owner: string;
  name: string;
  description?: string;
  cover_image_url?: string;
  run_count?: number;
  latest_version?: {
    id: string;
    openapi_schema?: {
      components?: {
        schemas?: {
          Input?: Record<string, unknown>;
        };
      };
    };
  };
}

@Injectable()
export class ReplicateCatalogService {
  constructor(
    private readonly _orgMediaProviderSettings: OrgMediaProviderSettingsService,
    private readonly _redis: RedisService,
    private readonly _encryption: EncryptionService,
    private readonly _cost: ReplicateCostService,
  ) {}

  getCategories(): CategoryDefinition[] {
    return CATEGORIES;
  }

  async getReplicateKey(orgId: string): Promise<string> {
    const config = await this._orgMediaProviderSettings.getConfigForProvider(orgId, 'replicate');
    if (!config) {
      throw new NotFoundException('Replicate is not configured for this organization');
    }
    const credentials = config.credentials as Record<string, string> | undefined;
    const apiKey = credentials?.apiKey || credentials?.key || credentials?.token;
    if (!apiKey) {
      throw new NotFoundException('Replicate API key is not configured');
    }
    // Support both v2: encryption and plain storage by trying decrypt first
    if (apiKey.startsWith('v2:')) {
      return this._encryption.decrypt(apiKey);
    }
    return apiKey;
  }

  private async _fetchModel(owner: string, name: string, apiKey: string): Promise<ReplicateModelApi> {
    const res = await safeFetch(`${BASE}/models/${owner}/${name}`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    });
    if (!res.ok) {
      throw new Error(`Replicate model fetch failed for ${owner}/${name}: ${res.status}`);
    }
    return (await res.json()) as ReplicateModelApi;
  }

  async listModels(categoryKey: string, orgId: string): Promise<ModelSummary[]> {
    const allowlist = MODEL_ALLOWLIST[categoryKey];
    const category = CATEGORIES.find((c) => c.key === categoryKey);

    // Return empty for local categories or unknown/all categories with no allowlist
    if (!allowlist || allowlist.length === 0 || category?.execution === 'local') {
      return [];
    }

    const categoryCacheKey = `replicate:category:${categoryKey}`;
    const cachedCategory = await this._redis.get(categoryCacheKey);
    if (cachedCategory) {
      return JSON.parse(cachedCategory);
    }

    const apiKey = await this.getReplicateKey(orgId);

    const results: ModelSummary[] = [];
    for (const modelId of allowlist) {
      const cacheKey = `replicate:model:${modelId}`;
      try {
        const cached = await this._redis.get(cacheKey);
        if (cached) {
          results.push(JSON.parse(cached));
          continue;
        }

        const [owner, name] = modelId.split('/');
        const data = await this._fetchModel(owner, name, apiKey);

        const summary: ModelSummary = {
          id: modelId,
          name: data.name || name,
          description: data.description || '',
          coverImageUrl: data.cover_image_url || null,
          runCount: data.run_count || 0,
          warm: isWarm(modelId),
          pricing: pricingCategory(modelId),
          price: this._cost.getPrice(modelId),
        };

        // Only cache on successful fetch — never poison cache with failed response
        await this._redis.set(cacheKey, JSON.stringify(summary), CACHE_TTL);
        results.push(summary);
      } catch {
        // Skip failed models — try the cached version if available
        const cached = await this._redis.get(cacheKey);
        if (cached) {
          results.push(JSON.parse(cached));
        }
      }
    }

    // Cache the full category index only when every allowlisted model resolved
    // (whether from API or from per-model cache). Failed models are skipped.
    if (results.length === allowlist.length) {
      await this._redis.set(categoryCacheKey, JSON.stringify(results), CACHE_TTL);
    }

    return results;
  }

  async getModel(owner: string, name: string, orgId: string): Promise<ModelDetail> {
    const modelId = `${owner}/${name}`;
    const apiKey = await this.getReplicateKey(orgId);

    const data = await this._fetchModel(owner, name, apiKey);

    const schemas = data.latest_version?.openapi_schema?.components?.schemas;
    const inputSchema = this._inlineEnumRefs(schemas?.Input || null, schemas);

    return {
      id: modelId,
      name: data.name || name,
      coverImageUrl: data.cover_image_url || null,
      warm: isWarm(modelId),
      versionId: data.latest_version?.id || '',
      inputSchema,
    };
  }

  // Replicate expresses every enum/constrained field as a separate component
  // schema referenced from the property — via `allOf`, `anyOf` or `oneOf`
  // (`{ $ref: '#/components/schemas/<name>' }`), e.g. aspect_ratio,
  // output_format, megapixels, scheduler, voice, style, … The Input schema alone
  // carries no `enum`/`type` for ANY of these, so the UI can't render a select.
  // Resolve the refs for EVERY property here and inline enum/type/min/max,
  // keeping the property's own default/description/x-order.
  private _inlineEnumRefs(
    input: any,
    schemas: Record<string, any> | undefined,
  ): any {
    if (!input?.properties || !schemas) return input;

    const resolveRef = (ref: unknown): any | undefined => {
      if (typeof ref !== 'string') return undefined;
      const m = /#\/components\/schemas\/(.+)$/.exec(ref);
      return m ? schemas[m[1]] : undefined;
    };

    // Find the first $ref anywhere a property can reference a component schema.
    const findRefSchema = (prop: any): any | undefined => {
      if (prop.$ref) {
        const r = resolveRef(prop.$ref);
        if (r) return r;
      }
      for (const key of ['allOf', 'anyOf', 'oneOf'] as const) {
        if (Array.isArray(prop[key])) {
          for (const entry of prop[key]) {
            const r = resolveRef(entry?.$ref);
            if (r) return r;
          }
        }
      }
      return undefined;
    };

    const properties: Record<string, any> = {};
    for (const [key, raw] of Object.entries<any>(input.properties)) {
      const prop = { ...raw };
      const ref = findRefSchema(prop);
      if (ref) {
        // Inline the referenced constraints, never overwriting the property's own.
        for (const f of ['enum', 'type', 'minimum', 'maximum', 'title'] as const) {
          if (prop[f] == null && ref[f] != null) prop[f] = ref[f];
        }
        // Drop the now-resolved ref wrappers so the field renders directly.
        delete prop.allOf;
        delete prop.$ref;
        if (prop.enum != null) {
          delete prop.anyOf;
          delete prop.oneOf;
        }
      }
      properties[key] = prop;
    }
    return { ...input, properties };
  }
}
