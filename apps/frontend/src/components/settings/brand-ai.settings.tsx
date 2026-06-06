'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import useSWR from 'swr';
import { Slider } from '@gitroom/react/form/slider';
import { Select } from '@gitroom/react/form/select';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { useT } from '@gitroom/react/translation/get.transation.service.client';

interface BrandProfile {
  instructions?: string;
  language?: string;
  enabled?: boolean;
}

interface ScopeSummary {
  scope: string;
  _sum: {
    costUsd: number | null;
    inputTokens: number | null;
    outputTokens: number | null;
  };
}

interface BudgetInfo {
  monthlyCap: number | null;
  dailyCap: number | null;
  remainingMonthly: number | null;
  remainingDaily: number | null;
}

interface UsageResponse {
  byScope: ScopeSummary[];
  totalSpendUsd: number;
  budget: BudgetInfo | null;
}

interface PromptTemplate {
  id: string;
  key: string;
  content: string;
  organizationId: string | null;
}

interface PromptLibraryItem {
  id: string;
  title: string;
  content: string;
  createdAt: string;
}

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

const useBrandProfile = () => {
  const fetch = useFetch();
  const load = useCallback(async () => {
    const res = await fetch('/ai/brand-profile');
    if (!res.ok) throw new Error('Failed to load brand profile');
    return res.json();
  }, [fetch]);
  return useSWR<BrandProfile>('ai-brand-profile', load, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    revalidateIfStale: false,
    revalidateOnMount: true,
    refreshWhenHidden: false,
    refreshWhenOffline: false,
  });
};

const useUsage = () => {
  const fetch = useFetch();
  const load = useCallback(async () => {
    const res = await fetch('/ai/usage');
    if (!res.ok) throw new Error('Failed to load AI usage');
    return res.json();
  }, [fetch]);
  return useSWR<UsageResponse>('ai-usage', load, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    revalidateIfStale: false,
    revalidateOnMount: true,
    refreshWhenHidden: false,
    refreshWhenOffline: false,
  });
};

const usePromptTemplates = () => {
  const fetch = useFetch();
  const load = useCallback(async () => {
    const res = await fetch('/ai/prompt-templates');
    if (!res.ok) throw new Error('Failed to load prompt templates');
    return res.json();
  }, [fetch]);
  return useSWR<PromptTemplate[]>('ai-prompt-templates', load, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    revalidateIfStale: false,
    revalidateOnMount: true,
    refreshWhenHidden: false,
    refreshWhenOffline: false,
  });
};

const usePromptLibrary = () => {
  const fetch = useFetch();
  const load = useCallback(async () => {
    const res = await fetch('/ai/prompt-library');
    if (!res.ok) throw new Error('Failed to load prompt library');
    return res.json();
  }, [fetch]);
  return useSWR<PromptLibraryItem[]>('ai-prompt-library', load, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    revalidateIfStale: false,
    revalidateOnMount: true,
    refreshWhenHidden: false,
    refreshWhenOffline: false,
  });
};

const BrandVoiceSection = () => {
  const t = useT();
  const fetch = useFetch();
  const toaster = useToaster();
  const { data, isLoading } = useBrandProfile();

  const [instructions, setInstructions] = useState('');
  const [language, setLanguage] = useState('en');
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    if (data) {
      setInstructions(data.instructions || '');
      setLanguage(data.language || 'en');
      setEnabled(data.enabled ?? false);
    }
  }, [data]);

  const handleSave = useCallback(async () => {
    const res = await fetch('/ai/brand-profile', {
      method: 'PUT',
      body: JSON.stringify({ instructions, language, enabled }),
    });
    if (!res.ok) {
      toaster.show(t('brand_profile_save_failed', 'Failed to save brand profile'), 'warning');
      return;
    }
    toaster.show(t('brand_profile_saved', 'Brand profile saved'), 'success');
  }, [instructions, language, enabled, fetch, toaster, t]);

  if (isLoading) {
    return (
      <div className="my-[16px] mt-[16px] bg-sixth border-fifth border rounded-[4px] p-[24px]">
        <div className="animate-pulse">{t('loading', 'Loading...')}</div>
      </div>
    );
  }

  return (
    <div className="my-[16px] mt-[16px] bg-sixth border-fifth border rounded-[4px] p-[24px] flex flex-col gap-[24px]">
      <div className="mt-[4px]">{t('brand_voice', 'Brand Voice')}</div>

      <div className="flex items-center justify-between">
        <div className="flex flex-col">
          <div className="text-[14px]">{t('enable_brand_profile', 'Enable Brand Profile')}</div>
          <div className="text-[12px] text-customColor18">
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
        <div className="text-[12px] text-customColor18">
          {t('brand_instructions_description', 'Define tone, banned words, emoji policy, CTA style, and other brand guidelines for AI-generated content')}
        </div>
        <textarea
          className="bg-forth border border-tableBorder rounded-[4px] min-h-[100px] p-[12px] text-textColor resize-y bg-newBgColor"
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          placeholder={t('brand_instructions_placeholder', 'e.g. Keep a friendly and professional tone. Never use emojis. Always include a call-to-action at the end.')}
        />
      </div>

      <div className="flex items-center justify-between gap-[24px]">
        <div className="flex flex-col flex-1">
          <div className="text-[14px]">{t('brand_language', 'Language')}</div>
          <div className="text-[12px] text-customColor18">
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
          className="bg-customColor4 text-white rounded-[4px] px-[16px] py-[8px] text-[14px] hover:opacity-90"
          onClick={handleSave}
        >
          {t('save', 'Save')}
        </button>
      </div>
    </div>
  );
};

const UsageSection = () => {
  const t = useT();
  const { data, isLoading } = useUsage();

  if (isLoading) {
    return (
      <div className="my-[16px] mt-[16px] bg-sixth border-fifth border rounded-[4px] p-[24px]">
        <div className="animate-pulse">{t('loading', 'Loading...')}</div>
      </div>
    );
  }

  const scopeLabels: Record<string, string> = {
    utility: t('utility', 'Utility'),
    generator: t('generator', 'Generator'),
    agent: t('agent', 'Agent'),
    mcp: t('mcp', 'MCP'),
  };

  const maxScopeCost =
    data?.byScope?.reduce((max, s) => Math.max(max, s._sum?.costUsd || 0), 0) || 1;

  return (
    <div className="my-[16px] mt-[16px] bg-sixth border-fifth border rounded-[4px] p-[24px] flex flex-col gap-[24px]">
      <div className="mt-[4px]">{t('usage_and_spend', 'Usage & Spend')}</div>

      <div className="flex flex-col gap-[8px]">
        <div className="text-[14px]">
          {t('total_spend', 'Total Spend')}:{' '}
          <span className="font-semibold">
            ${(data?.totalSpendUsd || 0).toFixed(4)}
          </span>
        </div>

        {data?.budget && (
          <div className="flex flex-col gap-[4px] text-[12px] text-customColor18">
            {data.budget.monthlyCap != null && (
              <div>
                {t('monthly_cap', 'Monthly cap')}: ${data.budget.monthlyCap.toFixed(2)}
                {' '}
                ({t('remaining', 'remaining')}: ${data.budget.remainingMonthly?.toFixed(4)})
              </div>
            )}
            {data.budget.dailyCap != null && (
              <div>
                {t('daily_cap', 'Daily cap')}: ${data.budget.dailyCap.toFixed(2)}
                {' '}
                ({t('remaining', 'remaining')}: ${data.budget.remainingDaily?.toFixed(4)})
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-[12px]">
        <div className="text-[14px]">{t('spend_by_scope', 'Spend by Scope')}</div>
        {data?.byScope?.map((scope) => {
          const cost = scope._sum?.costUsd || 0;
          const barWidth = maxScopeCost > 0 ? (cost / maxScopeCost) * 100 : 0;
          return (
            <div key={scope.scope} className="flex items-center gap-[12px]">
              <div className="w-[80px] text-[13px]">
                {scopeLabels[scope.scope] || scope.scope}
              </div>
              <div className="flex-1 h-[20px] bg-forth border border-tableBorder rounded-[4px] overflow-hidden">
                <div
                  className="h-full bg-customColor4 rounded-[4px] transition-all"
                  style={{ width: `${barWidth}%` }}
                />
              </div>
              <div className="w-[80px] text-[12px] text-right">
                ${cost.toFixed(4)}
              </div>
            </div>
          );
        })}
        {(!data?.byScope || data.byScope.length === 0) && (
          <div className="text-[12px] text-customColor18">
            {t('no_spend_data', 'No spend data yet')}
          </div>
        )}
      </div>
    </div>
  );
};

const PromptTemplatesSection = () => {
  const t = useT();
  const fetch = useFetch();
  const toaster = useToaster();
  const { data, isLoading, mutate } = usePromptTemplates();

  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editingContent, setEditingContent] = useState('');
  const [newKey, setNewKey] = useState('');
  const [newContent, setNewContent] = useState('');
  const [showNew, setShowNew] = useState(false);

  const startEdit = useCallback((template: PromptTemplate) => {
    setEditingKey(template.key);
    setEditingContent(template.content);
  }, []);

  const cancelEdit = useCallback(() => {
    setEditingKey(null);
    setEditingContent('');
  }, []);

  const handleSave = useCallback(
    async (key: string) => {
      const res = await fetch('/ai/prompt-templates', {
        method: 'PUT',
        body: JSON.stringify({ key, content: editingContent }),
      });
      if (!res.ok) {
        toaster.show(t('template_save_failed', 'Failed to save template'), 'warning');
        return;
      }
      mutate();
      setEditingKey(null);
      setEditingContent('');
      toaster.show(t('template_saved', 'Template saved'), 'success');
    },
    [editingContent, fetch, mutate, toaster, t],
  );

  const handleDelete = useCallback(
    async (key: string) => {
      const res = await fetch(`/ai/prompt-templates/${encodeURIComponent(key)}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        toaster.show(t('template_delete_failed', 'Failed to delete template'), 'warning');
        return;
      }
      mutate();
      toaster.show(t('template_deleted', 'Template deleted'), 'success');
    },
    [fetch, mutate, toaster, t],
  );

  const handleCreate = useCallback(async () => {
    if (!newKey.trim() || !newContent.trim()) return;
    const res = await fetch('/ai/prompt-templates', {
      method: 'PUT',
      body: JSON.stringify({ key: newKey.trim(), content: newContent.trim() }),
    });
    if (!res.ok) {
      toaster.show(t('template_create_failed', 'Failed to create template'), 'warning');
      return;
    }
    mutate();
    setNewKey('');
    setNewContent('');
    setShowNew(false);
    toaster.show(t('template_created', 'Template created'), 'success');
  }, [newKey, newContent, fetch, mutate, toaster, t]);

  if (isLoading) {
    return (
      <div className="my-[16px] mt-[16px] bg-sixth border-fifth border rounded-[4px] p-[24px]">
        <div className="animate-pulse">{t('loading', 'Loading...')}</div>
      </div>
    );
  }

  return (
    <div className="my-[16px] mt-[16px] bg-sixth border-fifth border rounded-[4px] p-[24px] flex flex-col gap-[24px]">
      <div className="flex items-center justify-between">
        <div className="mt-[4px]">{t('prompt_templates', 'Prompt Templates')}</div>
        <button
          className="text-[13px] text-customColor4 hover:underline"
          onClick={() => setShowNew(!showNew)}
        >
          {showNew ? t('cancel', 'Cancel') : t('add_template', '+ Add Template')}
        </button>
      </div>

      {showNew && (
        <div className="flex flex-col gap-[12px] bg-forth border border-tableBorder rounded-[4px] p-[16px]">
          <input
            className="bg-newBgColor border border-tableBorder rounded-[4px] p-[8px] text-textColor text-[13px]"
            placeholder={t('template_key_placeholder', 'Template key (e.g. social_twitter)')}
            value={newKey}
            onChange={(e) => setNewKey(e.target.value)}
          />
          <textarea
            className="bg-newBgColor border border-tableBorder rounded-[4px] min-h-[80px] p-[8px] text-textColor text-[13px] resize-y"
            placeholder={t('template_content_placeholder', 'Template content with {{variable}} placeholders')}
            value={newContent}
            onChange={(e) => setNewContent(e.target.value)}
          />
          <div className="flex justify-end gap-[8px]">
            <button
              className="text-[13px] px-[12px] py-[6px] rounded-[4px] border border-tableBorder hover:bg-boxHover"
              onClick={() => {
                setShowNew(false);
                setNewKey('');
                setNewContent('');
              }}
            >
              {t('cancel', 'Cancel')}
            </button>
            <button
              className="bg-customColor4 text-white rounded-[4px] px-[12px] py-[6px] text-[13px] hover:opacity-90"
              onClick={handleCreate}
            >
              {t('create', 'Create')}
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-[12px]">
        {data?.map((template) => (
          <div
            key={template.id}
            className="flex flex-col gap-[8px] bg-forth border border-tableBorder rounded-[4px] p-[16px]"
          >
            <div className="flex items-center justify-between">
              <span className="text-[13px] font-semibold">{template.key}</span>
              {!template.organizationId && (
                <span className="text-[11px] text-customColor18 bg-fifth rounded-[4px] px-[8px] py-[2px]">
                  {t('global', 'Global')}
                </span>
              )}
            </div>

            {editingKey === template.key ? (
              <div className="flex flex-col gap-[8px]">
                <textarea
                  className="bg-newBgColor border border-tableBorder rounded-[4px] min-h-[80px] p-[8px] text-textColor text-[13px] resize-y"
                  value={editingContent}
                  onChange={(e) => setEditingContent(e.target.value)}
                />
                <div className="flex justify-end gap-[8px]">
                  <button
                    className="text-[13px] px-[12px] py-[6px] rounded-[4px] border border-tableBorder hover:bg-boxHover"
                    onClick={cancelEdit}
                  >
                    {t('cancel', 'Cancel')}
                  </button>
                  <button
                    className="bg-customColor4 text-white rounded-[4px] px-[12px] py-[6px] text-[13px] hover:opacity-90"
                    onClick={() => handleSave(template.key)}
                  >
                    {t('save', 'Save')}
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-[8px]">
                <div className="text-[12px] text-textColor whitespace-pre-wrap">
                  {template.content}
                </div>
                <div className="flex justify-end gap-[8px]">
                  <button
                    className="text-[12px] text-customColor4 hover:underline"
                    onClick={() => startEdit(template)}
                  >
                    {t('edit', 'Edit')}
                  </button>
                  <button
                    className="text-[12px] text-red-500 hover:underline"
                    onClick={() => handleDelete(template.key)}
                  >
                    {t('delete', 'Delete')}
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
        {(!data || data.length === 0) && (
          <div className="text-[12px] text-customColor18">
            {t('no_templates', 'No templates yet')}
          </div>
        )}
      </div>
    </div>
  );
};

const PromptLibrarySection = () => {
  const t = useT();
  const fetch = useFetch();
  const toaster = useToaster();
  const { data, isLoading, mutate } = usePromptLibrary();

  const [newTitle, setNewTitle] = useState('');
  const [newContent, setNewContent] = useState('');
  const [showNew, setShowNew] = useState(false);

  const handleCreate = useCallback(async () => {
    if (!newTitle.trim() || !newContent.trim()) return;
    const res = await fetch('/ai/prompt-library', {
      method: 'POST',
      body: JSON.stringify({ title: newTitle.trim(), content: newContent.trim() }),
    });
    if (!res.ok) {
      toaster.show(t('prompt_save_failed', 'Failed to save prompt'), 'warning');
      return;
    }
    mutate();
    setNewTitle('');
    setNewContent('');
    setShowNew(false);
    toaster.show(t('prompt_saved', 'Prompt saved to library'), 'success');
  }, [newTitle, newContent, fetch, mutate, toaster, t]);

  const handleDelete = useCallback(
    async (id: string) => {
      const res = await fetch(`/ai/prompt-library/${id}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        toaster.show(t('prompt_delete_failed', 'Failed to delete prompt'), 'warning');
        return;
      }
      mutate();
      toaster.show(t('prompt_deleted', 'Prompt deleted'), 'success');
    },
    [fetch, mutate, toaster, t],
  );

  if (isLoading) {
    return (
      <div className="my-[16px] mt-[16px] bg-sixth border-fifth border rounded-[4px] p-[24px]">
        <div className="animate-pulse">{t('loading', 'Loading...')}</div>
      </div>
    );
  }

  return (
    <div className="my-[16px] mt-[16px] bg-sixth border-fifth border rounded-[4px] p-[24px] flex flex-col gap-[24px]">
      <div className="flex items-center justify-between">
        <div className="mt-[4px]">{t('prompt_library', 'Prompt Library')}</div>
        <button
          className="text-[13px] text-customColor4 hover:underline"
          onClick={() => setShowNew(!showNew)}
        >
          {showNew ? t('cancel', 'Cancel') : t('add_prompt', '+ Add Prompt')}
        </button>
      </div>

      {showNew && (
        <div className="flex flex-col gap-[12px] bg-forth border border-tableBorder rounded-[4px] p-[16px]">
          <input
            className="bg-newBgColor border border-tableBorder rounded-[4px] p-[8px] text-textColor text-[13px]"
            placeholder={t('prompt_title_placeholder', 'Prompt title')}
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
          />
          <textarea
            className="bg-newBgColor border border-tableBorder rounded-[4px] min-h-[80px] p-[8px] text-textColor text-[13px] resize-y"
            placeholder={t('prompt_content_placeholder', 'Prompt content')}
            value={newContent}
            onChange={(e) => setNewContent(e.target.value)}
          />
          <div className="flex justify-end gap-[8px]">
            <button
              className="text-[13px] px-[12px] py-[6px] rounded-[4px] border border-tableBorder hover:bg-boxHover"
              onClick={() => {
                setShowNew(false);
                setNewTitle('');
                setNewContent('');
              }}
            >
              {t('cancel', 'Cancel')}
            </button>
            <button
              className="bg-customColor4 text-white rounded-[4px] px-[12px] py-[6px] text-[13px] hover:opacity-90"
              onClick={handleCreate}
            >
              {t('save', 'Save')}
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-[12px]">
        {data?.map((item) => (
          <div
            key={item.id}
            className="flex items-start justify-between bg-forth border border-tableBorder rounded-[4px] p-[16px]"
          >
            <div className="flex flex-col gap-[4px] flex-1">
              <span className="text-[13px] font-semibold">{item.title}</span>
              <span className="text-[12px] text-textColor whitespace-pre-wrap line-clamp-2">
                {item.content}
              </span>
            </div>
            <button
              className="text-[12px] text-red-500 hover:underline ml-[12px] shrink-0"
              onClick={() => handleDelete(item.id)}
            >
              {t('delete', 'Delete')}
            </button>
          </div>
        ))}
        {(!data || data.length === 0) && (
          <div className="text-[12px] text-customColor18">
            {t('no_prompts', 'No saved prompts yet')}
          </div>
        )}
      </div>
    </div>
  );
};

export const BrandAISettings = () => {
  const t = useT();
  return (
    <div className="flex flex-col">
      <h3 className="text-[20px]">{t('brand_ai', 'Brand & AI')}</h3>
      <BrandVoiceSection />
      <UsageSection />
      <PromptTemplatesSection />
      <PromptLibrarySection />
    </div>
  );
};
