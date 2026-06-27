'use client';

import React, { useState } from 'react';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { MediaProvidersTab } from '@gitroom/frontend/components/settings/media-providers/media-providers.tab';
import { ContentPacksTab } from '@gitroom/frontend/components/settings/content-packs/content-packs.tab';
import { Sets } from '@gitroom/frontend/components/sets/sets';
import { SignaturesComponent } from '@gitroom/frontend/components/settings/signatures.component';

type ContentSubTab = 'media' | 'packs' | 'sets' | 'signatures';

// Unifies the content-authoring surfaces under one "Content" page: AI Media
// providers, Content Packs, Sets and Signatures. Content Packs is gated on
// media-config:manage; Sets/Signatures are paid-tier only. AI Media is ungated,
// so the page always has at least one sub-tab.
export const ContentTab: React.FC<{
  initialSubTab?: ContentSubTab;
  canManagePacks: boolean;
  canManageTemplates: boolean;
}> = ({ initialSubTab = 'media', canManagePacks, canManageTemplates }) => {
  const t = useT();

  const subTabs: { key: ContentSubTab; label: string }[] = [
    { key: 'media', label: t('ai_media', 'AI Media') },
    ...(canManagePacks
      ? [{ key: 'packs' as ContentSubTab, label: t('content_packs', 'Content Packs') }]
      : []),
    ...(canManageTemplates
      ? [
          { key: 'sets' as ContentSubTab, label: t('sets', 'Sets') },
          { key: 'signatures' as ContentSubTab, label: t('signatures', 'Signatures') },
        ]
      : []),
  ];

  const [subTab, setSubTab] = useState<ContentSubTab>(
    subTabs.some((s) => s.key === initialSubTab) ? initialSubTab : 'media'
  );

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
            onClick={() => setSubTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {subTab === 'media' && <MediaProvidersTab />}
      {subTab === 'packs' && canManagePacks && <ContentPacksTab />}
      {subTab === 'sets' && canManageTemplates && <Sets />}
      {subTab === 'signatures' && canManageTemplates && <SignaturesComponent />}
    </div>
  );
};
