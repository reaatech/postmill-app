'use client';

import React, { useState } from 'react';
import {
  PromptTemplatesSection,
  PromptLibrarySection,
} from '@gitroom/frontend/components/settings/brand-ai.settings';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useUser } from '@gitroom/frontend/components/layout/user.context';
import { ProviderSettingsPanel } from '@gitroom/frontend/components/settings/shared/kit/provider-settings-panel';
import { aiDescriptor } from '@gitroom/frontend/components/settings/shared/kit/descriptors/ai.descriptor';
import { BrandTab } from '@gitroom/frontend/components/settings/brand/brand.tab';

type SubTab = 'provider' | 'brands' | 'templates' | 'library';

export const AITab = () => {
  const t = useT();
  const user = useUser();
  const [subTab, setSubTab] = useState<SubTab>('provider');

  const subTabs: { key: SubTab; label: string }[] = [
    { key: 'provider', label: t('llm_providers', 'LLM Providers') },
    ...(user?.tier?.current !== 'FREE'
      ? [{ key: 'brands' as SubTab, label: t('brands', 'Brands') }]
      : []),
    { key: 'templates', label: t('prompt_templates', 'Prompt Templates') },
    { key: 'library', label: t('prompt_library', 'Prompt Library') },
  ];

  return (
    <div className="flex flex-col gap-[16px]">
      <div className="flex gap-[8px] border-b border-newTableBorder pb-[8px]">
        {subTabs.map((tab) => (
          <button
            key={tab.key}
            className={`text-[13px] px-[16px] py-[8px] rounded-t-[4px] transition-colors ${
              subTab === tab.key
                ? 'bg-newBgColorInner border border-newTableBorder border-b-transparent text-textColor'
                : 'text-newTableText hover:text-textColor'
            }`}
            onClick={() => {
              setSubTab(tab.key);
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {subTab === 'brands' && <BrandTab />}

      {subTab === 'provider' && <ProviderSettingsPanel descriptor={aiDescriptor} />}

      {subTab === 'templates' && <PromptTemplatesSection />}

      {subTab === 'library' && <PromptLibrarySection />}
    </div>
  );
};
