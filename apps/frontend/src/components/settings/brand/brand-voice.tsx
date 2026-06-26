'use client';

import React, { useCallback, useState } from 'react';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { Slider } from '@gitroom/react/form/slider';
import { Select } from '@gitroom/react/form/select';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { useT } from '@gitroom/react/translation/get.transation.service.client';

interface BrandProfile {
  instructions?: string;
  language?: string;
  enabled?: boolean;
  platformInstructions?: Record<string, string>;
}

const PLATFORM_OPTIONS = [
  { value: 'x', label: 'X/Twitter' },
  { value: 'linkedin', label: 'LinkedIn' },
  { value: 'facebook', label: 'Facebook' },
  { value: 'instagram', label: 'Instagram' },
  { value: 'tiktok', label: 'TikTok' },
  { value: 'threads', label: 'Threads' },
  { value: 'bluesky', label: 'Bluesky' },
  { value: 'mastodon', label: 'Mastodon' },
  { value: 'youtube', label: 'YouTube' },
  { value: 'discord', label: 'Discord' },
  { value: 'telegram', label: 'Telegram' },
  { value: 'slack', label: 'Slack' },
];

const LANGUAGES = [
  { value: 'en', label: 'English' },
  { value: 'fr', label: 'French' },
  { value: 'de', label: 'German' },
  { value: 'es', label: 'Spanish' },
  { value: 'pt-BR', label: 'Portuguese (Brazil)' },
  { value: 'ja', label: 'Japanese' },
  { value: 'ar', label: 'Arabic' },
  { value: 'he', label: 'Hebrew' },
  { value: 'zh-CN', label: 'Chinese (Simplified)' },
  { value: 'zh-TW', label: 'Chinese (Traditional)' },
  { value: 'ko', label: 'Korean' },
  { value: 'it', label: 'Italian' },
  { value: 'nl', label: 'Dutch' },
  { value: 'pl', label: 'Polish' },
  { value: 'ru', label: 'Russian' },
  { value: 'tr', label: 'Turkish' },
  { value: 'hi', label: 'Hindi' },
  { value: 'sv', label: 'Swedish' },
  { value: 'da', label: 'Danish' },
  { value: 'fi', label: 'Finnish' },
];

const BrandVoiceForm = ({ initial, brandId, onMutate }: { initial?: BrandProfile; brandId?: string; onMutate?: () => void }) => {
  const t = useT();
  const fetch = useFetch();
  const toaster = useToaster();

  const [instructions, setInstructions] = useState(initial?.instructions || '');
  const [language, setLanguage] = useState(initial?.language || 'en');
  const [enabled, setEnabled] = useState(initial?.enabled ?? false);
  const [platformInstructions, setPlatformInstructions] = useState<Record<string, string>>(initial?.platformInstructions || {});
  const [selectedPlatform, setSelectedPlatform] = useState('');

  const handleSave = useCallback(async () => {
    const url = brandId ? `/brands/${brandId}` : '/ai/brand-profile';
    const res = await fetch(url, {
      method: 'PUT',
      body: JSON.stringify({
        instructions,
        language,
        enabled,
        platformInstructions,
      }),
    });
    if (!res.ok) {
      toaster.show(t('brand_profile_save_failed', 'Failed to save brand profile'), 'warning');
      return;
    }
    toaster.show(t('brand_profile_saved', 'Brand profile saved'), 'success');
    onMutate?.();
  }, [instructions, language, enabled, platformInstructions, fetch, toaster, t, onMutate, brandId]);

  const handlePlatformSelect = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedPlatform(e.target.value);
  }, []);

  const handlePlatformInstructionChange = useCallback((platform: string, value: string) => {
    setPlatformInstructions((prev) => ({
      ...prev,
      [platform]: value,
    }));
  }, []);

  return (
    <div className="my-[16px] mt-[16px] bg-newBgColorInner border-newTableBorder border rounded-[12px] p-[24px] flex flex-col gap-[24px]">
      <div className="flex items-center justify-between">
        <div className="flex flex-col">
          <div className="text-[14px]">{t('brand_voice', 'Brand Voice')}</div>
          <div className="text-[12px] text-newTableText">
            {t('brand_voice_description', 'Define your brand voice and tone for AI-generated content')}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex flex-col">
          <div className="text-[14px]">{t('enable_brand_profile', 'Enable Brand Profile')}</div>
          <div className="text-[12px] text-newTableText">
            {t('enable_brand_profile_description', 'Apply brand instructions to AI-generated content')}
          </div>
        </div>
        <Slider
          value={enabled ? 'on' : 'off'}
          onChange={(value) => setEnabled(value === 'on')}
          fill={true}
        />
      </div>

      <div className="flex flex-col gap-[8px]">
        <div className="text-[14px]">{t('brand_instructions', 'Brand Instructions')}</div>
        <div className="text-[12px] text-newTableText">
          {t('brand_instructions_description', 'Define tone, banned words, emoji policy, CTA style, and other brand guidelines for AI-generated content')}
        </div>
        <textarea
          className="bg-newBgColorInner border border-newTableBorder rounded-[8px] min-h-[100px] p-[12px] text-textColor resize-y bg-newBgColor"
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          placeholder={t('brand_instructions_placeholder', 'e.g. Keep a friendly and professional tone. Never use emojis. Always include a call-to-action at the end.')}
        />
      </div>

      <div className="flex flex-col gap-[12px]">
        <div className="text-[14px]">{t('platform_overrides', 'Per-Platform Overrides')}</div>
        <div className="text-[12px] text-newTableText">
          {t('platform_overrides_description', 'Override brand instructions for specific platforms. Falls back to global instructions when not set.')}
        </div>

        <div className="w-[250px]">
          <Select
            name="platformSelector"
            label=""
            disableForm={true}
            hideErrors={true}
            value={selectedPlatform}
            onChange={handlePlatformSelect}
          >
            <option value="">{t('select_platform', 'Select platform...')}</option>
            {PLATFORM_OPTIONS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </Select>
        </div>

        {selectedPlatform && (
          <div className="flex flex-col gap-[4px]">
            <div className="text-[13px] text-newTableText">
              {t('platform_instructions', `Instructions for ${PLATFORM_OPTIONS.find((p) => p.value === selectedPlatform)?.label || selectedPlatform}`)}
            </div>
            <textarea
              className="bg-newBgColorInner border border-newTableBorder rounded-[8px] min-h-[80px] p-[12px] text-textColor resize-y bg-newBgColor text-[13px]"
              value={platformInstructions[selectedPlatform] || ''}
              onChange={(e) => handlePlatformInstructionChange(selectedPlatform, e.target.value)}
              placeholder={t('platform_instructions_placeholder', 'e.g. Be more casual on this platform')}
            />
          </div>
        )}

        {Object.keys(platformInstructions).length > 0 && (
          <div className="flex flex-wrap gap-[6px]">
            {Object.entries(platformInstructions).map(([platform, instr]) =>
              instr ? (
                <div
                  key={platform}
                  className="bg-newTableHeader border border-newTableBorder rounded-[4px] px-[8px] py-[4px] text-[12px] flex items-center gap-[4px]"
                >
                  <span className="font-medium">{PLATFORM_OPTIONS.find((p) => p.value === platform)?.label || platform}</span>
                  <button
                    onClick={() => {
                      setPlatformInstructions((prev) => {
                        const next = { ...prev };
                        delete next[platform];
                        return next;
                      });
                    }}
                    className="text-red-500 hover:opacity-80 ml-[4px]"
                    aria-label={`Remove ${platform} override`}
                  >
                    ×
                  </button>
                </div>
              ) : null
            )}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between gap-[24px]">
        <div className="flex flex-col flex-1">
          <div className="text-[14px]">{t('brand_language', 'Language')}</div>
          <div className="text-[12px] text-newTableText">
            {t('brand_language_description', 'Default language for AI-generated content')}
          </div>
        </div>
        <div className="w-[200px]">
          <Select
            name="brandLanguage"
            label=""
            disableForm={true}
            hideErrors={true}
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
          >
            {LANGUAGES.map((lang) => (
              <option key={lang.value} value={lang.value}>
                {lang.label}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <div className="flex justify-end">
        <button
          className="bg-btnPrimary text-white rounded-[8px] px-[16px] py-[8px] text-[14px] hover:opacity-90"
          onClick={handleSave}
        >
          {t('save', 'Save')}
        </button>
      </div>
    </div>
  );
};

export const BrandVoice = ({ brandId, initial, onSaved }: { brandId?: string; initial?: BrandProfile; onSaved?: () => void }) => {
  return <BrandVoiceForm key={brandId || 'default'} initial={initial} brandId={brandId} onMutate={onSaved} />;
};
