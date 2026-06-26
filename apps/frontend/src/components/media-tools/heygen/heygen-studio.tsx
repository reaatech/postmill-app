'use client';

import React, { useState } from 'react';
import { Storyboard } from './storyboard';
import { TalkingPhoto } from './talking-photo';
import { Voiceover } from './voiceover';
import { Translate } from './translate';
import { RenderQueue } from './render-queue';
import { useHeygenStatus, useHeygenAvatars, useHeygenVoices, useHeygenJobs } from './use-heygen';

type TabKey = 'storyboard' | 'talking-photo' | 'translate' | 'voiceover';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'storyboard', label: 'Storyboard' },
  { key: 'talking-photo', label: 'Talking Photo' },
  { key: 'translate', label: 'Translate' },
  { key: 'voiceover', label: 'Voiceover' },
];

export function HeyGenStudio() {
  const { data: status } = useHeygenStatus();
  const configured = status?.configured ?? false;

  const [tab, setTab] = useState<TabKey>('storyboard');

  const { data: avatarsData } = useHeygenAvatars(configured);
  const { data: voicesData } = useHeygenVoices(configured);
  const { data: jobs, isLoading: jobsLoading, mutate: mutateJobs } = useHeygenJobs(configured);

  if (!status) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#2B5CD3]" />
      </div>
    );
  }

  if (!configured) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-[14px] text-center px-[20px]">
        <div className="text-[42px]">🎬</div>
        <h2 className="text-[18px] font-[600] text-textColor">HeyGen isn&apos;t configured</h2>
        <p className="text-[13px] text-newTextColor/50 max-w-[360px]">
          Add your HeyGen API key to start generating AI avatar videos, then come back here.
        </p>
        <a
          href="/settings?tab=media_providers"
          className="mt-[4px] px-[16px] py-[9px] rounded-[8px] bg-[#2B5CD3] text-white text-[13px] font-[500] hover:bg-[#2B5CD3]/80 transition-all"
        >
          Configure HeyGen
        </a>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-newBgColor">
      <div className="flex items-center justify-between gap-[10px] px-[16px] h-[52px] border-b border-newBorder shrink-0">
        <h1 className="text-[15px] font-[600] text-textColor whitespace-nowrap">HeyGen Studio</h1>
        <div className="flex items-center gap-[4px] overflow-x-auto">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`px-[12px] h-[34px] rounded-[8px] text-[13px] whitespace-nowrap transition-all ${
                tab === t.key ? 'bg-[#2B5CD3]/20 text-white' : 'text-newTextColor/70 hover:bg-boxHover hover:text-textColor'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-1 min-h-0 mobile:flex-col">
        {/* Active tool */}
        <div className="flex-1 min-w-0 overflow-y-auto p-[20px]">
          {tab === 'storyboard' && (
            <Storyboard
              avatars={avatarsData?.avatars || []}
              voices={voicesData?.voices || []}
              onGenerated={() => mutateJobs()}
            />
          )}
          {tab === 'talking-photo' && (
            <TalkingPhoto voices={voicesData?.voices || []} onGenerated={() => mutateJobs()} />
          )}
          {tab === 'translate' && <Translate onGenerated={() => mutateJobs()} />}
          {tab === 'voiceover' && (
            <Voiceover voices={voicesData?.voices || []} onGenerated={() => mutateJobs()} />
          )}
        </div>

        {/* Render queue */}
        <div className="w-[320px] mobile:w-full shrink-0 border-l mobile:border-l-0 mobile:border-t border-newBorder flex flex-col min-h-0">
          <div className="flex items-center justify-between px-[14px] h-[44px] border-b border-newBorder shrink-0">
            <span className="text-[12px] font-[600] uppercase tracking-wider text-newTableText">Render queue</span>
            <button
              type="button"
              onClick={() => mutateJobs()}
              aria-label="Refresh queue"
              className="w-[26px] h-[26px] flex items-center justify-center rounded-[6px] text-newTextColor/50 hover:text-textColor hover:bg-boxHover transition-all"
            >
              ⟳
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-[12px]">
            <RenderQueue jobs={jobs} isLoading={jobsLoading} />
          </div>
        </div>
      </div>
    </div>
  );
}
