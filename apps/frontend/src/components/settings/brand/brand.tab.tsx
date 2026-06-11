'use client';

import React, { useState } from 'react';
import { BrandVoice } from '@gitroom/frontend/components/settings/brand/brand-voice';
import { KnowledgeBase } from '@gitroom/frontend/components/settings/brand/knowledge-base';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import clsx from 'clsx';

export const BrandTab = () => {
  const t = useT();
  const [subtab, setSubtab] = useState<'voice' | 'knowledge'>('voice');

  return (
    <div className="flex flex-col">
      <h3 className="text-[20px] mb-[8px]">{t('brand', 'Brand')}</h3>
      <div className="flex gap-[16px] border-b border-newTableBorder mb-[8px]">
        <button
          className={clsx(
            'pb-[8px] text-[14px] border-b-2 transition-colors',
            subtab === 'voice'
              ? 'border-btnPrimary text-textColor'
              : 'border-transparent text-newTableText hover:text-textColor',
          )}
          onClick={() => setSubtab('voice')}
        >
          {t('brand_voice', 'Brand Voice')}
        </button>
        <button
          className={clsx(
            'pb-[8px] text-[14px] border-b-2 transition-colors',
subtab === 'knowledge'
                ? 'border-btnPrimary text-textColor'
              : 'border-transparent text-newTableText hover:text-textColor',
          )}
          onClick={() => setSubtab('knowledge')}
        >
          {t('knowledge_base', 'Knowledge Base')}
        </button>
      </div>
      {subtab === 'voice' && <BrandVoice />}
      {subtab === 'knowledge' && <KnowledgeBase />}
    </div>
  );
};
