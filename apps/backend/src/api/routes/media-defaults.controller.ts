import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Put,
  Query,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { GetOrgFromRequest } from '@gitroom/nestjs-libraries/user/org.from.request';
import { Organization } from '@prisma/client';
import { ApiTags } from '@nestjs/swagger';
import { OrgMediaProviderSettingsService } from '@gitroom/nestjs-libraries/database/prisma/media-providers/org-media-provider-settings.service';
import { DefaultsSeedService } from '@gitroom/nestjs-libraries/ai/defaults/defaults-seed.service';
import { DefaultsResolutionService } from '@gitroom/nestjs-libraries/ai/defaults/defaults-resolution.service';
import { OrgDefaultModelRepository } from '@gitroom/nestjs-libraries/database/prisma/ai-settings/org-default-model.repository';
import {
  AI_MEDIA_CATEGORIES,
  MEDIA_CATEGORY_OPERATION,
} from '@gitroom/nestjs-libraries/ai/defaults/default-categories';
import { SetDefaultModelDto } from '@gitroom/nestjs-libraries/dtos/ai-settings/default-model.dto';
import { RequirePermission } from '@gitroom/backend/services/auth/rbac/require-permission.decorator';
import { PROVIDER_KERNEL } from '@gitroom/nestjs-libraries/providers/providers.module';
import { ProviderKernel } from '@gitroom/provider-kernel';
import { ProviderResolutionService } from '@gitroom/nestjs-libraries/providers/provider-resolution.service';
import { ioRedis } from '@gitroom/nestjs-libraries/redis/redis.service';
import { DefaultsSettingsValidator } from '@gitroom/nestjs-libraries/ai/defaults/defaults-settings.validator';

@ApiTags('Media Defaults')
@Controller('/settings/content/media-defaults')
@RequirePermission('media-config', 'manage')
export class MediaDefaultsController {
  constructor(
    private _orgMediaProviderSettings: OrgMediaProviderSettingsService,
    private _defaultsSeed: DefaultsSeedService,
    private _defaultsResolution: DefaultsResolutionService,
    private _defaultsRepository: OrgDefaultModelRepository,
    @Inject(PROVIDER_KERNEL) private _kernel: ProviderKernel,
    private _resolution: ProviderResolutionService,
    private _settingsValidator: DefaultsSettingsValidator,
  ) {}

  private _bustDefaultsCatalogCache(orgId: string): void {
    // Best-effort cache invalidation; never fail the request if Redis is down.
    try {
      const prefix = `settings:content:media-defaults:catalog:${orgId}:`;
      ioRedis
        .keys(`${prefix}*`)
        .then((keys) => {
          if (keys.length) ioRedis.del(...keys);
        })
        .catch(() => undefined);
    } catch {}
  }

  private _providerLabel(candidate: { providerId: string; metadata: { uiName?: string } }): string {
    return candidate.metadata.uiName
      ? `${candidate.providerId}-${candidate.metadata.uiName}`
      : candidate.providerId;
  }

  @Get('/')
  async getMediaDefaults(@GetOrgFromRequest() org: Organization) {
    const resolved = await this._defaultsResolution.resolveAll('media', org.id);
    const stored = await this._defaultsRepository.getAll(org.id, 'media');
    return {
      categories: AI_MEDIA_CATEGORIES.map((category) => {
        const r = resolved[category];
        const s = stored.find((row) => row.category === category);
        return {
          category,
          ...(r || {}),
          source: s ? 'stored' : (r ? 'auto' : null),
        };
      }),
    };
  }

  @Put('/:category')
  async setMediaDefault(
    @GetOrgFromRequest() org: Organization,
    @Param('category') category: string,
    @Body() body: SetDefaultModelDto,
  ) {
    if (!AI_MEDIA_CATEGORIES.includes(category as any)) {
      throw new BadRequestException(`Invalid media category: ${category}`);
    }
    const cleaned = this._sanitizeSettings('media', category, body);
    await this._defaultsRepository.upsert(org.id, 'media', category, cleaned);
    this._bustDefaultsCatalogCache(org.id);
    return { category, success: true };
  }

  private _sanitizeSettings(
    domain: 'ai' | 'media',
    category: string,
    body: SetDefaultModelDto,
  ): SetDefaultModelDto {
    if (!body.settings || typeof body.settings !== 'object') return body;
    const cleaned = this._settingsValidator.validate(domain, category, body.settings, {
      providerId: body.providerId,
      model: body.model,
      version: body.version,
    });
    return { ...body, settings: cleaned };
  }

  @Delete('/:category')
  async clearMediaDefault(
    @GetOrgFromRequest() org: Organization,
    @Param('category') category: string,
  ) {
    if (!AI_MEDIA_CATEGORIES.includes(category as any)) {
      throw new BadRequestException(`Invalid media category: ${category}`);
    }
    await this._defaultsRepository.remove(org.id, 'media', category);
    return { category, success: true };
  }

  @Get('/catalog')
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  async getMediaDefaultsCatalog(
    @GetOrgFromRequest() org: Organization,
    @Query('category') category: string,
  ) {
    if (!AI_MEDIA_CATEGORIES.includes(category as any)) {
      throw new BadRequestException(`Invalid media category: ${category}`);
    }
    const cacheKey = `settings:content:media-defaults:catalog:${org.id}:${category}`;
    const cached = await ioRedis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    const candidates = await this._defaultsResolution.candidates('media', category, org.id);
    const options: {
      providerId: string;
      version: string;
      model?: string;
      label: string;
      fields?: any[];
    }[] = [];
    for (const c of candidates) {
      const providerLabel = this._providerLabel(c);
      const staticModels = this._staticModelsForCandidate(c, category);

      if (c.metadata.kind === 'action') {
        options.push({
          providerId: c.providerId,
          version: c.version,
          label: providerLabel,
        });
      } else if (c.metadata.hasModelList) {
        const models = await this._listModelsForCandidate(c, category, org.id);
        if (!models || models.length === 0) {
          // Configured model-list provider whose catalog couldn't be enumerated
          // (transient API failure / empty list). Still offer a provider-level option
          // (no model) so a working provider stays selectable — mirrors the resolver's
          // undefined-model auto-pick. If a static fallback catalog exists, expose it.
          if (staticModels.length > 0) {
            for (const m of staticModels) {
              options.push({
                providerId: c.providerId,
                version: c.version,
                model: m.id,
                label: `${providerLabel}: ${m.label || m.id}`,
                fields: m.fields,
              });
            }
          } else {
            options.push({
              providerId: c.providerId,
              version: c.version,
              label: providerLabel,
            });
          }
        } else {
          const fieldsById = new Map(staticModels.map((m) => [m.id, m.fields]));
          for (const m of models) {
            options.push({
              providerId: c.providerId,
              version: c.version,
              model: m.id,
              label: `${providerLabel}: ${m.label || m.id}`,
              fields: fieldsById.get(m.id) ?? [],
            });
          }
        }
      } else if (staticModels.length > 0) {
        for (const m of staticModels) {
          options.push({
            providerId: c.providerId,
            version: c.version,
            model: m.id,
            label: `${providerLabel}: ${m.label || m.id}`,
            fields: m.fields,
          });
        }
      } else {
        options.push({
          providerId: c.providerId,
          version: c.version,
          label: providerLabel,
        });
      }
    }
    const result = { category, options };
    await ioRedis.set(cacheKey, JSON.stringify(result), 'EX', 60);
    return result;
  }

  private _listOperationForCategory(category: string): 'image' | 'video' | 'audio' {
    const mapped = MEDIA_CATEGORY_OPERATION[category as keyof typeof MEDIA_CATEGORY_OPERATION];
    switch (mapped) {
      case 'image':
      case 'upscale':
      case 'bg-remove':
      case 'inpaint':
      case 'focal-point':
      case 'slide':
        return 'image';
      case 'video':
      case 'avatar':
      case 'video-bg':
      case 'video-upscale':
        return 'video';
      case 'tts':
      case 'stt':
      case 'caption':
      case 'audio':
        return 'audio';
      default:
        return 'image';
    }
  }

  private _staticModelsForCandidate(
    candidate: { providerId: string; version: string; metadata: any },
    category: string,
  ): Array<{ id: string; label: string; fields: any[] }> {
    const categoryModels = candidate.metadata?.mediaModels?.[category];
    if (!Array.isArray(categoryModels)) return [];
    return categoryModels.map((m) => ({
      id: m.id,
      label: m.label || m.id,
      fields: Array.isArray(m.fields) ? m.fields : [],
    }));
  }

  private async _listModelsForCandidate(
    candidate: { providerId: string; version: string; metadata: any },
    category: string,
    orgId: string,
  ) {
    try {
      const config = await this._orgMediaProviderSettings.getConfigForProvider(
        orgId,
        candidate.providerId,
        candidate.version,
      );
      const credentials = config?.credentials ?? {};
      const mod = this._kernel?.get('media', candidate.providerId, candidate.version);
      const capability: any = mod?.create({
        credentials,
        encryption: {} as any,
        fetch: {} as any,
        logger: {} as any,
        telemetry: {} as any,
      });
      if (!capability?.listModels) return [];
      return await capability.listModels(this._listOperationForCategory(category), {
        credentials,
      });
    } catch {
      return [];
    }
  }
}
