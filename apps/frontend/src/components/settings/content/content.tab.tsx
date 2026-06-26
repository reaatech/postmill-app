'use client';

import React, { useState } from 'react';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { MediaProvidersTab } from '@gitroom/frontend/components/settings/media-providers/media-providers.tab';
import { ContentPacksTab } from '@gitroom/frontend/components/settings/content-packs/content-packs.tab';

type ContentSubTab = 'media' | 'packs';

// Unifies AI Media providers and Content Packs under one "Content" page. The
// Content Packs sub-tab is gated on media-config:manage (its original gate);
// AI Media is ungated, so the page always has at least one sub-tab.
export const ContentTab: React.FC<{
  initialSubTab?: ContentSubTab;
  canManagePacks: boolean;
}> = ({ initialSubTab = 'media', canManagePacks }) => {
  const t = useT();
  const [subTab, setSubTab] = useState<ContentSubTab>(
    initialSubTab === 'packs' && !canManagePacks ? 'media' : initialSubTab
  );

  const subTabs: { key: ContentSubTab; label: string }[] = [
    { key: 'media', label: t('ai_media', 'AI Media') },
    ...(canManagePacks
      ? [{ key: 'packs' as ContentSubTab, label: t('content_packs', 'Content Packs') }]
      : []),
  ];

  return (
    <div className="flex flex-col gap-[16px]">
      <div className="flex items-center justify-between">
        <h3 className="text-[20px]">{t('content', 'Content')}</h3>
      </div>

      <div className="flex gap-[8px] border-b border-newTableBorder pb-[8px]">
        {subTabs.map((tab) => (
          <button
            key={tab.key}
            className={`text-[13px] px-[16px] py-[8px] rounded-t-[4px] transition-colors ${
              subTab === tab.key
                ? 'bg-newBgColorInner border border-newTableBorder border-b-transparent text-textColor'
                : 'text-newTableText hover:text-textColor'
            }`}
            onClick={() => setSubTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {subTab === 'media' && <MediaProvidersTab />}
      {subTab === 'packs' && canManagePacks && <ContentPacksTab />}
    </div>
  );
};
