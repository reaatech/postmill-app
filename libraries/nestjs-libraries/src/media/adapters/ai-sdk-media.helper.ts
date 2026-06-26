import { AIProviderRegistry } from '@gitroom/nestjs-libraries/ai/ai-provider.registry';
import {
  MediaGenerationResult,
  MediaModelOption,
} from '../media-provider-adapter.interface';

// Bridges hub media adapters to the existing AI-SDK provider adapters so the hard auth
// (AWS SigV4 for Bedrock, deployment URLs for Azure, the Vercel gateway) is handled by the
// `@ai-sdk/*` provider packages rather than hand-rolled here. The media adapter resolves
// the matching AI adapter (same identifier) and runs its image model. Image only — video
// is not exposed by these AI-SDK provider packages (gateway video uses a separate path).
//
// The media adapters are constructed with plain `new` (no DI), so MediaModule injects the
// AI registry once at startup via `setAiRegistry`; adapters then reach it through `reg()`.
let _registry: AIProviderRegistry | undefined;

export function setAiRegistry(registry: AIProviderRegistry): void {
  _registry = registry;
}

function reg(): AIProviderRegistry {
  if (!_registry) {
    throw new Error('AI provider registry is not available (AI module disabled?)');
  }
  return _registry;
}

// Sniff the real image mime from the leading base64 bytes so the data URL is correct
// regardless of which format the provider returned (completeJob decodes data: URLs).
function sniffImageMime(b64: string): string {
  if (b64.startsWith('/9j/')) return 'image/jpeg';
  if (b64.startsWith('iVBOR')) return 'image/png';
  if (b64.startsWith('UklGR')) return 'image/webp';
  if (b64.startsWith('R0lGOD')) return 'image/gif';
  return 'image/png';
}

export interface AiSdkImageParams {
  identifier: string;
  credentials: Record<string, string>;
  prompt: string;
  model: string;
  size?: string;
  n?: number;
  aspectRatio?: string;
}

// Generate an image through the AI-SDK image model of the matching AI provider.
export async function generateImageViaAiSdk(params: AiSdkImageParams): Promise<MediaGenerationResult> {
  const { identifier, credentials, prompt, model, size, n, aspectRatio } = params;
  const adapter = reg().getAdapter(identifier);
  if (!adapter?.createImageModel) {
    throw new Error(`${identifier} does not support image generation`);
  }
  const imageModel = adapter.createImageModel(credentials, model);
  if (!imageModel) {
    throw new Error(`${identifier} could not build an image model for "${model}"`);
  }

  // Call the low-level model protocol directly (as ai-model.provider does) to sidestep the
  // provider-v5/v6 type seam; result.images are base64 strings.
  const result = await (imageModel as unknown as {
    doGenerate(opts: {
      prompt: string;
      n: number;
      size?: string;
      aspectRatio?: string;
      providerOptions: Record<string, unknown>;
    }): Promise<{ images?: string[] }>;
  }).doGenerate({
    prompt,
    n: n ?? 1,
    size,
    aspectRatio,
    providerOptions: {},
  });

  const images = (result.images ?? []).filter(Boolean);
  if (!images.length) throw new Error(`${identifier} returned no image`);
  const urls = images.map((b64) => `data:${sniffImageMime(b64)};base64,${b64}`);
  return {
    multi: urls.length > 1,
    image: urls[0],
    images: urls,
    metadata: { provider: identifier, model },
  };
}

// Image models for the studio's dynamic dropdown, reusing the AI adapter's catalog.
export async function listImageModelsViaAiSdk(
  identifier: string,
  credentials: Record<string, string>,
): Promise<MediaModelOption[]> {
  const adapter = reg().getAdapter(identifier);
  if (!adapter) return [];
  const models = await adapter.listModels(credentials);
  return models
    .filter((m) => m.kind === 'image' || m.capabilities?.image)
    .map((m) => ({ id: m.id, label: m.label || m.id }));
}

// Cheap auth check for AI-SDK-delegated hubs — validate the AI credentials.
export async function testConnectionViaAiSdk(
  identifier: string,
  credentials: Record<string, string>,
): Promise<{ ok: boolean; message: string }> {
  const adapter = reg().getAdapter(identifier);
  if (!adapter) return { ok: false, message: `Unknown provider "${identifier}"` };
  try {
    const res = await adapter.validateCredentials(credentials);
    return res.ok
      ? { ok: true, message: 'Connection successful' }
      : { ok: false, message: res.error || 'Invalid credentials' };
  } catch (err) {
    return { ok: false, message: (err as Error).message };
  }
}
