'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import useSWR from 'swr';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { Button } from '@gitroom/react/form/button';
import {
  AI_MEDIA_CATEGORIES,
  MEDIA_CATEGORY_OPERATION,
  type AiMediaCategory,
} from '@gitroom/nestjs-libraries/ai/defaults/default-categories';
import { DefaultModelSelect } from '@gitroom/frontend/components/settings/shared/default-model-select';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { StudioForm } from '@gitroom/frontend/components/media-tools/studio-kit/studio-form';
import type {
  StudioDescriptor,
  StudioField,
  StudioFieldValue,
} from '@gitroom/frontend/components/media-tools/studio-kit/types';

interface MediaDefaultRow {
  category: AiMediaCategory;
  providerId?: string;
  version?: string;
  model?: string;
  settings?: Record<string, unknown>;
  source: 'stored' | 'auto' | null;
}

interface MediaDefaultsResponse {
  categories: MediaDefaultRow[];
}

const GROUPS: { title: string; categories: AiMediaCategory[] }[] = [
  {
    title: 'Image',
    categories: [
      'text-to-image',
      'image-to-image',
      'image-upscale',
      'image-bg-remove',
      'image-inpaint',
      'image-focal-point',
      'image-slide',
    ],
  },
  {
    title: 'Video',
    categories: [
      'text-to-video',
      'image-to-video',
      'video-to-video',
      'video-background',
      'video-upscale',
      'video-avatar',
      'video-caption',
    ],
  },
  {
    title: 'Audio',
    categories: ['text-to-speech', 'text-to-music'],
  },
];

const CATEGORY_LABELS: Record<AiMediaCategory, string> = {
  'text-to-speech': 'Text to Speech',
  'text-to-music': 'Text to Music',
  'text-to-image': 'Text to Image',
  'text-to-video': 'Text to Video',
  'image-to-image': 'Image to Image',
  'image-to-video': 'Image to Video',
  'image-upscale': 'Image Upscale',
  'image-bg-remove': 'Remove Background',
  'image-inpaint': 'Inpaint',
  'image-focal-point': 'Focal Point',
  'image-slide': 'Slide Generator',
  'video-avatar': 'Avatar Video',
  'video-caption': 'Caption Burn-in',
  'video-to-video': 'Video to Video',
  'video-background': 'Video Background',
  'video-upscale': 'Video Upscale',
};

const CATEGORY_HELP: Record<AiMediaCategory, string> = {
  'text-to-speech': 'Voice used for narration and TTS.',
  'text-to-music': 'Music/audio generation from a prompt.',
  'text-to-image': 'Default image generator.',
  'text-to-video': 'Default text-to-video model.',
  'image-to-image': 'Image editing/transformation.',
  'image-to-video': 'Image-to-video generation.',
  'image-upscale': 'Image upscaling/enhancement.',
  'image-bg-remove': 'Background removal for images.',
  'image-inpaint': 'Inpainting with a mask.',
  'image-focal-point': 'Vision model used to detect focal points.',
  'image-slide':
    'Frame image model for slideshows. Narration uses your Text to Speech default; the slide breakdown uses your High Reasoning default.',
  'video-avatar': 'Avatar/talking-head video.',
  'video-caption': 'Speech-to-text provider for caption burn-in.',
  'video-to-video': 'Video restyle/transformation.',
  'video-background': 'Video background removal/replacement.',
  'video-upscale': 'Video upscaling/enhancement.',
};

const NO_SETTINGS_CATEGORIES: AiMediaCategory[] = ['image-focal-point'];

const useMediaDefaults = () => {
  const fetch = useFetch();
  const load = useCallback(
    async () =>
      (await fetch('/settings/content/media-defaults')).json() as Promise<MediaDefaultsResponse>,
    [fetch]
  );
  return useSWR('/settings/content/media-defaults', load, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    revalidateIfStale: false,
    refreshWhenHidden: false,
    refreshWhenOffline: false,
  });
};

function safeJsonStringify(value: unknown): string {
  if (value === undefined || value === null) return '';
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return '';
  }
}

function safeJsonParse(text: string): Record<string, unknown> | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    return null;
  }
}

// Dynamic loaders for descriptor-driven kit studios. Each loader is isolated so
// webpack can code-split the descriptor modules.
const DESCRIPTOR_LOADERS: Record<string, () => Promise<StudioDescriptor>> = {
  runway: async () => (await import('../../media-tools/runway/descriptor')).runwayDescriptor,
  luma: async () => (await import('../../media-tools/luma/descriptor')).lumaDescriptor,
  minimax: async () => (await import('../../media-tools/minimax/descriptor')).minimaxDescriptor,
  qwen: async () => (await import('../../media-tools/qwen/descriptor')).qwenDescriptor,
  togetherai: async () =>
    (await import('../../media-tools/togetherai/descriptor')).togetheraiDescriptor,
  siliconflow: async () =>
    (await import('../../media-tools/siliconflow/descriptor')).siliconflowDescriptor,
  groq: async () => (await import('../../media-tools/groq/descriptor')).groqDescriptor,
  openrouter: async () =>
    (await import('../../media-tools/openrouter/descriptor')).openrouterDescriptor,
  fireworks: async () =>
    (await import('../../media-tools/fireworks/descriptor')).fireworksDescriptor,
  deepinfra: async () =>
    (await import('../../media-tools/deepinfra/descriptor')).deepinfraDescriptor,
  gateway: async () => (await import('../../media-tools/gateway/descriptor')).gatewayDescriptor,
  bedrock: async () => (await import('../../media-tools/bedrock/descriptor')).bedrockDescriptor,
  azure: async () => (await import('../../media-tools/azure/descriptor')).azureDescriptor,
  xai: async () => (await import('../../media-tools/xai/descriptor')).xaiDescriptor,
  wan: async () => (await import('../../media-tools/wan/descriptor')).wanDescriptor,
  higgsfield: async () =>
    (await import('../../media-tools/higgsfield/descriptor')).higgsfieldDescriptor,
  ltx: async () => (await import('../../media-tools/ltx/descriptor')).ltxDescriptor,
  suno: async () => (await import('../../media-tools/suno/descriptor')).sunoDescriptor,
  reelfarm: async () =>
    (await import('../../media-tools/reelfarm/descriptor')).reelfarmDescriptor,
  genviral: async () =>
    (await import('../../media-tools/genviral/descriptor')).genviralDescriptor,
  did: async () => (await import('../../media-tools/did/descriptor')).didDescriptor,
  hedra: async () => (await import('../../media-tools/hedra/descriptor')).hedraDescriptor,
  tavus: async () => (await import('../../media-tools/tavus/descriptor')).tavusDescriptor,
  elevenlabs: async () =>
    (await import('../../media-tools/elevenlabs/descriptor')).elevenlabsDescriptor,
  'black-forest-labs': async () =>
    (await import('../../media-tools/black-forest-labs/descriptor')).blackForestLabsDescriptor,
  'stability-ai': async () =>
    (await import('../../media-tools/stability-ai/descriptor')).stabilityDescriptor,
  recraft: async () => (await import('../../media-tools/recraft/descriptor')).recraftDescriptor,
  ideogram: async () =>
    (await import('../../media-tools/ideogram/descriptor')).ideogramDescriptor,
  leonardo: async () =>
    (await import('../../media-tools/leonardo/descriptor')).leonardoDescriptor,
  google: async () =>
    (await import('../../media-tools/google-ai/descriptor')).googleAiDescriptor,
  vertex: async () => (await import('../../media-tools/vertex/descriptor')).vertexDescriptor,
  deepgram: async () =>
    (await import('../../media-tools/deepgram/descriptor')).deepgramDescriptor,
  openai: async () => (await import('../../media-tools/openai/descriptor')).openaiDescriptor,
  sora: async () => (await import('../../media-tools/sora/descriptor')).soraDescriptor,
  fal: async () => (await import('../../media-tools/kling/descriptor')).klingDescriptor,
  pika: async () => (await import('../../media-tools/pika/descriptor')).pikaDescriptor,
  kling: async () => (await import('../../media-tools/kling/descriptor')).klingDescriptor,
};

async function loadDescriptor(
  providerId: string,
  category: AiMediaCategory,
  model?: string
): Promise<StudioDescriptor | null> {
  const operation = MEDIA_CATEGORY_OPERATION[category];

  // OpenAI video defaults use the Sora descriptor even though the credential
  // provider is `openai`.
  if (providerId === 'openai' && operation === 'video') {
    return DESCRIPTOR_LOADERS.sora?.();
  }

  // fal hosts both Kling and Pika; disambiguate by model id when possible.
  if (providerId === 'fal' && model?.toLowerCase().includes('pika')) {
    return DESCRIPTOR_LOADERS.pika?.();
  }

  const loader = DESCRIPTOR_LOADERS[providerId];
  if (!loader) return null;
  return loader();
}

function descriptorFieldsForCategory(
  descriptor: StudioDescriptor,
  category: AiMediaCategory,
  model?: string
): StudioField[] | null {
  const operation = MEDIA_CATEGORY_OPERATION[category];
  const tabs = descriptor.tabs.filter(
    (t) => t.operation === operation && !t.custom
  );
  if (tabs.length === 0) return null;

  let tab = tabs.find((t) => t.key === category);
  if (!tab && model) {
    tab =
      tabs.find((t) => t.model === model) ||
      tabs.find((t) =>
        t.fields.some(
          (f) =>
            f.type === 'select' &&
            f.name === 'model' &&
            f.options?.some((o) => o.value === model)
        )
      );
  }
  if (!tab) tab = tabs[0];

  // Persist only non-runtime tunables: drop the prompt input and media file refs.
  return tab.fields.filter((f) => f.type !== 'prompt' && f.type !== 'media');
}

function initialFormValues(
  fields: StudioField[],
  settings?: Record<string, unknown>
): Record<string, StudioFieldValue> {
  const out: Record<string, StudioFieldValue> = {};
  for (const field of fields) {
    const stored = settings?.[field.name];
    if (stored !== undefined) {
      out[field.name] = stored as StudioFieldValue;
    } else if (field.type === 'toggle') {
      out[field.name] = field.default ?? false;
    } else if (field.type === 'number') {
      out[field.name] = field.default ?? '';
    } else if (field.type === 'select') {
      out[field.name] = field.default ?? '';
    } else {
      out[field.name] = '';
    }
  }
  return out;
}

export const MediaDefaultsTab: React.FC = () => {
  const t = useT();
  const toaster = useToaster();
  const { data, mutate, isLoading } = useMediaDefaults();
  const fetch = useFetch();
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [draftJson, setDraftJson] = useState<Record<string, string>>({});
  const [draftFormValues, setDraftFormValues] = useState<
    Record<string, Record<string, StudioFieldValue>>
  >({});
  const [descriptorFields, setDescriptorFields] = useState<
    Record<string, StudioField[]>
  >({});
  // Tracks the (providerId/model/operation) signature each category's descriptor
  // fields + draft values were derived from, so we re-derive (and reset stale
  // drafts) when the resolved provider changes — even if the field count coincides.
  const descriptorSigRef = useRef<Record<string, string>>({});

  const rows = useMemo<MediaDefaultRow[]>(() => {
    return (
      data?.categories ??
      AI_MEDIA_CATEGORIES.map((category) => ({
        category,
        source: null as 'stored' | 'auto' | null,
      }))
    );
  }, [data]);

  const rowsByCategory = useMemo(() => {
    const map = new Map<string, MediaDefaultRow>();
    for (const row of rows) map.set(row.category, row);
    return map;
  }, [rows]);

  // Load descriptor fields when a row has a resolved provider/model. Re-derives the
  // field set AND resets stale draft values whenever the resolved provider/model
  // changes for a category (keyed on the signature, not the field count).
  useEffect(() => {
    let cancelled = false;
    for (const row of rows) {
      if (!row.providerId || NO_SETTINGS_CATEGORIES.includes(row.category)) {
        continue;
      }
      const operation = MEDIA_CATEGORY_OPERATION[row.category];
      const sig = `${row.providerId}::${row.model ?? ''}::${operation}`;
      loadDescriptor(row.providerId, row.category, row.model).then((descriptor) => {
        if (cancelled || !descriptor) return;
        const fields = descriptorFieldsForCategory(
          descriptor,
          row.category,
          row.model
        );
        if (!fields || fields.length === 0) return;
        // Already derived for this provider/model — keep the user's in-progress draft.
        if (descriptorSigRef.current[row.category] === sig) return;
        descriptorSigRef.current[row.category] = sig;
        setDescriptorFields((prev) => ({ ...prev, [row.category]: fields }));
        setDraftFormValues((prev) => ({
          ...prev,
          [row.category]: initialFormValues(fields, row.settings),
        }));
      });
    }
    return () => {
      cancelled = true;
    };
  }, [rows]);

  const saveDefault = useCallback(
    async (
      category: AiMediaCategory,
      value: { providerId: string; version: string; model?: string } | null,
      settings?: Record<string, unknown> | null
    ) => {
      setSaving((prev) => ({ ...prev, [category]: true }));
      try {
        if (!value) {
          const res = await fetch(`/settings/content/media-defaults/${category}`, {
            method: 'DELETE',
          });
          if (!res.ok) throw new Error('Failed to reset default');
        } else {
          const body: Record<string, unknown> = {
            providerId: value.providerId,
            version: value.version,
          };
          if (value.model) body.model = value.model;
          if (settings) body.settings = settings;
          const res = await fetch(`/settings/content/media-defaults/${category}`, {
            method: 'PUT',
            body: JSON.stringify(body),
          });
          if (!res.ok) {
            const errText = await res.text().catch(() => 'Failed to save default');
            throw new Error(errText);
          }
        }
        await mutate();
        toaster.show(t('default_saved', 'Default saved'), 'success');
      } catch (e) {
        toaster.show(
          (e as Error).message || t('failed_to_save_default', 'Failed to save default'),
          'warning'
        );
      } finally {
        setSaving((prev) => ({ ...prev, [category]: false }));
      }
    },
    [fetch, mutate, toaster, t]
  );

  if (isLoading || !data) {
    return <div className="text-newTextColor/60 text-[14px]">{t('loading', 'Loading…')}</div>;
  }

  return (
    <div className="flex flex-col gap-[24px]">
      {GROUPS.map((group) => (
        <div key={group.title}>
          <div className="text-[16px] font-[600] text-textColor mb-[12px]">{group.title}</div>
          <div className="flex flex-col gap-[12px]">
            {group.categories.map((category) => {
              const row = rowsByCategory.get(category);
              const value =
                row?.providerId && row?.version
                  ? {
                      providerId: row.providerId,
                      version: row.version,
                      model: row.model,
                    }
                  : null;
              const isAuto = row?.source === 'auto' || row?.source === null;
              const showSettings = !NO_SETTINGS_CATEGORIES.includes(category);
              const fields = descriptorFields[category];
              const hasDescriptorForm = showSettings && !!fields && fields.length > 0;
              const settingsDraft =
                draftJson[category] ?? safeJsonStringify(row?.settings);
              const parsedSettings = safeJsonParse(settingsDraft);

              return (
                <div
                  key={category}
                  className="flex flex-col gap-[10px] p-[16px] rounded-[8px] border border-newTableBorder bg-newBgColorInner"
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="text-[14px] font-[600] text-textColor">
                        {CATEGORY_LABELS[category]}
                      </div>
                      <div className="text-[12px] text-newTextColor/60">
                        {CATEGORY_HELP[category]}
                      </div>
                    </div>
                    {row?.source === 'stored' && (
                      <Button
                        type="button"
                        secondary
                        onClick={() => saveDefault(category, null)}
                        loading={saving[category]}
                      >
                        {t('reset_to_auto', 'Reset to Auto')}
                      </Button>
                    )}
                  </div>

                  <DefaultModelSelect
                    domain="media"
                    category={category}
                    value={value}
                    onChange={(newValue) => {
                      if (!newValue) return;
                      saveDefault(category, newValue);
                    }}
                  />

                  {showSettings && (
                    <div className="flex flex-col gap-[6px]">
                      {hasDescriptorForm ? (
                        <>
                          <div className="text-[12px] text-newTextColor/70">
                            {t('default_settings', 'Default settings')}
                          </div>
                          <StudioForm
                            fields={fields}
                            values={draftFormValues[category] ?? {}}
                            onChange={(name, val) =>
                              setDraftFormValues((prev) => ({
                                ...prev,
                                [category]: { ...(prev[category] ?? {}), [name]: val },
                              }))
                            }
                            provider={row?.providerId ?? ''}
                            operation={MEDIA_CATEGORY_OPERATION[category]}
                          />
                          <Button
                            type="button"
                            onClick={() => {
                              const values = draftFormValues[category];
                              const cleaned: Record<string, unknown> = {};
                              for (const f of fields) {
                                const v = values?.[f.name];
                                if (v !== undefined && v !== '' && v !== null) {
                                  cleaned[f.name] = v;
                                }
                              }
                              saveDefault(category, value, cleaned);
                            }}
                            loading={saving[category]}
                            className="self-start"
                          >
                            {t('save_settings', 'Save settings')}
                          </Button>
                        </>
                      ) : (
                        <>
                          <div className="text-[12px] text-newTextColor/70">
                            {t('default_settings', 'Default settings (JSON)')}
                          </div>
                          <textarea
                            value={settingsDraft}
                            onChange={(e) =>
                              setDraftJson((prev) => ({
                                ...prev,
                                [category]: e.target.value,
                              }))
                            }
                            placeholder='{"resolution": "1024x1024"}'
                            rows={4}
                            className="w-full px-[12px] py-[9px] rounded-[8px] bg-newBgColorInner border border-newTableBorder text-[13px] text-textColor outline-none focus:border-[#2B5CD3] transition-colors resize-y min-h-[88px] font-mono"
                          />
                          {parsedSettings === null && settingsDraft.trim() !== '' && (
                            <div className="text-[11px] text-amber-600">
                              {t('invalid_json', 'Invalid JSON')}
                            </div>
                          )}
                          <Button
                            type="button"
                            onClick={() => {
                              if (parsedSettings === null && settingsDraft.trim() !== '') {
                                toaster.show(t('invalid_json', 'Invalid JSON'), 'warning');
                                return;
                              }
                              saveDefault(category, value, parsedSettings);
                            }}
                            loading={saving[category]}
                            className="self-start"
                          >
                            {t('save_settings', 'Save settings')}
                          </Button>
                        </>
                      )}
                    </div>
                  )}

                  {isAuto && (
                    <div className="text-[11px] text-newTextColor/45">
                      {t('auto_default', 'Auto — picks a provider from your enabled media providers.')}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
};
