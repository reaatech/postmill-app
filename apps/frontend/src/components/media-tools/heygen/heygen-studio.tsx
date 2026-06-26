'use client';

import React, { useState } from 'react';
import { Logo } from '@gitroom/frontend/components/new-layout/logo';
import { FullscreenButton } from '@gitroom/frontend/components/media-tools/fullscreen-button';
import { useFullscreen } from '@gitroom/frontend/components/media-tools/use-fullscreen';
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
  // Full-screen fills the canvas app (not the page): the document goes fullscreen
  // (hides browser chrome, keeps modals which mount at the app root) and the studio
  // root goes immersive to cover the app nav/sidebar. z-[100] sits below modals (200+).
  const { isFullscreen } = useFullscreen();

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
    <div className={`flex flex-col h-full bg-studioBg${isFullscreen ? ' fixed inset-0 z-[100]' : ' rounded-[12px] overflow-hidden'}`}>
      <div className="flex items-center justify-between gap-[10px] px-[16px] h-[52px] border-b border-studioBorder shrink-0">
        <div className="flex items-center gap-[10px] shrink-0">
          <Logo size={22} className="" />
          <h1 className="text-[15px] font-[600] text-textColor whitespace-nowrap">HeyGen Studio</h1>
        </div>
        <div className="flex items-center gap-[8px] min-w-0">
          <div className="flex items-center gap-[4px] overflow-x-auto">
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={`px-[12px] h-[34px] rounded-[8px] text-[13px] whitespace-nowrap border transition-all ${
                  tab === t.key
                    ? 'bg-[#2B5CD3]/20 text-textColor border-transparent'
                    : 'border-studioBorder text-newTextColor/70 hover:bg-boxHover hover:text-textColor hover:border-[#2B5CD3]'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <FullscreenButton />
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
        <div className="w-[320px] mobile:w-full shrink-0 border-l mobile:border-l-0 mobile:border-t border-studioBorder flex flex-col min-h-0">
          <div className="flex items-center justify-between px-[14px] h-[44px] border-b border-studioBorder shrink-0">
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
