'use client';

import React, { useCallback, useState } from 'react';
import {
  UsageSection,
  PromptTemplatesSection,
  PromptLibrarySection,
} from '@gitroom/frontend/components/settings/brand-ai.settings';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import useSWR from 'swr';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { ProviderForm } from '@gitroom/frontend/components/settings/ai/provider-form';
import { SpendTab } from '@gitroom/frontend/components/settings/ai/spend-tab';

interface OrgProviderInfo {
  identifier: string;
  name: string;
  type: string;
  enabled: boolean;
  isActive: boolean;
  isConfigured: boolean;
  defaultModel: string;
  imageModel: string;
}

interface OrgConfigResponse {
  active: {
    identifier: string;
    name: string;
    type: string;
    defaultModel: string;
    credentials?: Record<string, string>;
  } | null;
  providers: OrgProviderInfo[];
}

const useOrgConfig = () => {
  const fetch = useFetch();
  const load = useCallback(async () => {
    const res = await fetch('/settings/ai/config');
    if (!res.ok) throw new Error('Failed to load AI config');
    return res.json();
  }, [fetch]);
  return useSWR<OrgConfigResponse>('org-ai-config', load, {
    revalidateOnFocus: false,
  });
};

type SubTab = 'provider' | 'spend' | 'templates' | 'library';

export const AITab = () => {
  const t = useT();
  const fetch = useFetch();
  const toaster = useToaster();
  const { data: config, isLoading, error, mutate } = useOrgConfig();
  const [subTab, setSubTab] = useState<SubTab>('provider');
  const [configuringProvider, setConfiguringProvider] = useState<string | null>(null);

  const handleSetActive = useCallback(async (identifier: string) => {
    const res = await fetch(`/settings/ai/config/${identifier}/set-active`, {
      method: 'POST',
    });
    if (!res.ok) {
      const err = await res.text();
      toaster.show(err || t('set_active_failed', 'Failed to set active provider'), 'warning');
      return;
    }
    toaster.show(t('provider_activated', 'Provider activated'), 'success');
    mutate();
  }, [fetch, mutate, toaster, t]);

  const handleDelete = useCallback(async (identifier: string) => {
    const res = await fetch(`/settings/ai/config/${identifier}`, {
      method: 'DELETE',
    });
    if (!res.ok) {
      toaster.show(t('delete_failed', 'Failed to delete'), 'warning');
      return;
    }
    toaster.show(t('deleted', 'Provider configuration deleted'), 'success');
    mutate();
  }, [fetch, mutate, toaster, t]);

  const subTabs: { key: SubTab; label: string }[] = [
    { key: 'provider', label: t('provider_and_model', 'Provider & Model') },
    { key: 'spend', label: t('spend', 'Spend') },
    { key: 'templates', label: t('prompt_templates', 'Prompt Templates') },
    { key: 'library', label: t('prompt_library', 'Prompt Library') },
  ];

  return (
    <div className="flex flex-col gap-[16px]">
      <h3 className="text-[20px]">{t('ai_settings', 'AI Settings')}</h3>

      <div className="flex gap-[8px] border-b border-fifth pb-[8px]">
        {subTabs.map((tab) => (
          <button
            key={tab.key}
            className={`text-[13px] px-[16px] py-[8px] rounded-t-[4px] transition-colors ${
              subTab === tab.key
                ? 'bg-sixth border border-fifth border-b-transparent text-textColor'
                : 'text-customColor18 hover:text-textColor'
            }`}
            onClick={() => {
              setSubTab(tab.key);
              setConfiguringProvider(null);
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="bg-sixth border border-fifth rounded-[4px] p-[24px] flex flex-col items-center gap-[12px]">
          <span className="text-[14px] text-red-500">{t('failed_to_load_ai_settings', 'Failed to load AI settings')}</span>
          <button
            className="text-[13px] bg-forth border border-tableBorder rounded-[4px] px-[16px] py-[8px] hover:bg-boxHover transition-colors"
            onClick={() => window.location.reload()}
          >
            {t('try_again', 'Try again')}
          </button>
        </div>
      )}

      {!error && subTab === 'provider' && (
        <div className="flex flex-col gap-[24px]">
          {configuringProvider ? (
            <ProviderForm
              identifier={configuringProvider}
              onClose={() => setConfiguringProvider(null)}
              onSaved={() => {
                setConfiguringProvider(null);
                mutate();
              }}
            />
          ) : (
            <>
              <div className="bg-sixth border border-fifth rounded-[4px] p-[24px] flex flex-col gap-[24px]">
                <div className="mt-[4px]">{t('active_provider', 'Active Provider')}</div>
                {isLoading ? (
                  <div className="animate-pulse">{t('loading', 'Loading...')}</div>
                ) : config?.active ? (
                  <div className="bg-forth border border-tableBorder rounded-[4px] p-[16px] flex items-center justify-between">
                    <div className="flex flex-col gap-[4px]">
                      <span className="text-[14px] font-semibold">{config.active.name}</span>
                      <span className="text-[12px] text-customColor18">
                        {config.active.defaultModel || t('no_model_selected', 'No model selected')}
                      </span>
                    </div>
                    <span className="text-[11px] bg-green-900/20 text-green-400 rounded-[4px] px-[8px] py-[2px]">
                      {t('active', 'Active')}
                    </span>
                  </div>
                ) : (
                  <div className="bg-forth border border-tableBorder rounded-[4px] p-[16px]">
                    <span className="text-[13px] text-customColor18">
                      {t('no_active_provider', 'No provider configured. Select and configure a provider below.')}
                    </span>
                  </div>
                )}
              </div>

              <div className="bg-sixth border border-fifth rounded-[4px] p-[24px] flex flex-col gap-[24px]">
                <div className="flex items-center justify-between">
                  <div className="mt-[4px]">{t('all_providers', 'All Providers')}</div>
                </div>
                {isLoading ? (
                  <div className="animate-pulse">{t('loading', 'Loading...')}</div>
                ) : (
                  <div className="flex flex-col gap-[16px]">
                    {[
                      { type: 'direct', label: t('direct_providers', 'Direct Providers') },
                      { type: 'hub', label: t('hub_providers', 'Hub Providers') },
                    ].map((group) => {
                      const groupProviders = config?.providers?.filter((p) => p.type === group.type) || [];
                      if (groupProviders.length === 0) return null;
                      return (
                        <div key={group.type}>
                          <div className="text-[11px] uppercase text-customColor18 mb-[6px] tracking-wide">
                            {group.label}
                          </div>
                          <div className="flex flex-col gap-[8px]">
                            {groupProviders.map((provider) => (
                              <div
                                key={provider.identifier}
                                className="bg-forth border border-tableBorder rounded-[4px] p-[16px] flex items-center justify-between"
                              >
                                <div className="flex flex-col gap-[4px] flex-1">
                                  <div className="flex items-center gap-[8px]">
                                    <span className="text-[14px] font-semibold">{provider.name}</span>
                                    {provider.isActive && (
                                      <span className="text-[11px] bg-green-900/20 text-green-400 rounded-[4px] px-[8px] py-[2px]">
                                        {t('active', 'Active')}
                                      </span>
                                    )}
                                    {provider.isConfigured && !provider.isActive && (
                                      <span className="text-[11px] bg-blue-900/20 text-blue-400 rounded-[4px] px-[8px] py-[2px]">
                                        {t('configured', 'Configured')}
                                      </span>
                                    )}
                                  </div>
                                  {provider.defaultModel && (
                                    <span className="text-[12px] text-customColor18">
                                      {provider.defaultModel}
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center gap-[8px]">
                                  <button
                                    className="text-[12px] text-customColor4 hover:underline"
                                    onClick={() => setConfiguringProvider(provider.identifier)}
                                  >
                                    {provider.isConfigured ? t('edit', 'Edit') : t('configure', 'Configure')}
                                  </button>
                                  {!provider.isActive && provider.isConfigured && (
                                    <button
                                      className="text-[12px] text-customColor4 hover:underline"
                                      onClick={() => handleSetActive(provider.identifier)}
                                    >
                                      {t('set_active', 'Set Active')}
                                    </button>
                                  )}
                                  {provider.isConfigured && (
                                    <button
                                      className="text-[12px] text-red-500 hover:underline"
                                      onClick={() => handleDelete(provider.identifier)}
                                    >
                                      {t('remove', 'Remove')}
                                    </button>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                    {(!config?.providers || config.providers.length === 0) && (
                      <div className="text-[12px] text-customColor18">
                        {t('no_providers', 'No providers available')}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {!error && subTab === 'spend' && <SpendTab />}

      {!error && subTab === 'templates' && <PromptTemplatesSection />}

      {!error && subTab === 'library' && <PromptLibrarySection />}
    </div>
  );
};
