/**
 * Declarative metadata for a provider package.
 *
 * This is static truth that the defaults resolver, catalog endpoints, and settings
 * UI read instead of inferring behaviour from adapter capabilities. It is deliberately
 * separate from `ProviderManifest` so it can be authored as a small metadata file
 * (`metadata.ts`) in each provider package.
 *
 * Category values are strings; consumers in `@gitroom/nestjs-libraries` validate that
 * declared categories are subsets of the known `AI_MODEL_CATEGORIES` and
 * `AI_MEDIA_CATEGORIES` unions.
 */
export interface ProviderMetadata {
  /** Matches `manifest.providerId`. */
  id: string;

  /** Brand/display name (often identical to `manifest.displayName`). */
  displayName: string;

  /**
   * Optional UI suffix used when formatting a default as `<provider>[-<ui-name>]: <model>`.
   * Omit when the provider has a single branded surface.
   */
  uiName?: string;

  /**
   * Provider kind:
   * - `direct` — single-brand provider with its own models (OpenAI, Anthropic, …).
   * - `hub` — aggregator that exposes many third-party models (OpenRouter, Together, …).
   * - `action` — no model list; the provider is action-only (HeyGen, Suno, Deepgram, …).
   */
  kind: 'direct' | 'hub' | 'action';

  /** Which default surfaces this provider may serve. */
  domains: Array<'ai' | 'media'>;

  /** AI text/vision categories this provider can serve (e.g. 'low-reasoning', 'vision'). */
  modelCategories?: string[];

  /** Media categories this provider can serve (e.g. 'text-to-image', 'video-avatar'). */
  mediaCategories?: string[];

  /** Whether the adapter implements `listModels` for its domain(s). */
  hasModelList: boolean;

  /**
   * Per-category preferred model-id substrings, scoped to this provider only.
   * Used to rank the output of `listModels` when auto-selecting a default.
   * The provider id is never chosen by a hint — hints only order models within
   * one provider's catalog.
   */
  modelHints?: Partial<Record<string, string[]>>;

  /** Link to provider docs. */
  docsUrl?: string;
}
