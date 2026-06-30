'use client';

import React, { FC, useCallback, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import clsx from 'clsx';
import { useIntegrationList } from '@gitroom/frontend/components/launches/helpers/use.integration.list';
import { useDashboardSummary } from './hooks/useDashboardSummary';

const SETUP_STEPS = [
  { key: 'ai', label: 'Connect an AI (LLM) Provider', hint: 'OpenAI, Anthropic, DeepSeek', href: '/settings/ai/llm-providers' },
  { key: 'media', label: 'Connect an AI Media Provider', hint: 'OpenAI, Replicate, Luma', href: '/settings/content/ai-media' },
  { key: 'storage', label: 'Connect a Storage Provider', hint: 'AWS S3, Cloudflare R2, Backblaze B2', href: '/settings/storage/providers' },
  { key: 'channel', label: 'Connect a Social Channel', hint: 'Instagram, TikTok, YouTube', href: '/settings/channels' },
  { key: 'post', label: 'Create your First Post', hint: 'Craft, review, publish', href: '/schedule' },
  { key: 'team', label: 'Invite a Team Member', hint: 'Colleague, Contractor, Client', href: '/settings/team' },
];

export const DashboardSetup: FC = () => {
  const router = useRouter();
  const { data: integrations } = useIntegrationList();
  const { data: summary } = useDashboardSummary();
  const [dismissed, setDismissed] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('onboarding_dismissed') === 'true';
    }
    return false;
  });

  const steps: Record<string, boolean> = useMemo(() => ({
    ai: summary?.aiProviderActive === true,
    media: summary?.mediaProviderActive === true,
    storage: summary?.storageProviderActive === true,
    channel: (integrations?.length || 0) > 0,
    post: (summary?.totalPosts || 0) > 0,
    team: (summary?.teamMembers || 0) > 1,
  }), [integrations, summary]);

  const completedCount = Object.values(steps).filter(Boolean).length;
  const allComplete = completedCount === SETUP_STEPS.length;

  const handleDismiss = useCallback(() => {
    setDismissed(true);
    if (typeof window !== 'undefined') {
      localStorage.setItem('onboarding_dismissed', 'true');
    }
  }, []);

  if (dismissed || allComplete) return null;

  return (
    <div className="bg-newBgColorInner border border-newTableBorder rounded-[12px] p-[16px] mobile:p-[20px] mb-[24px]">
      <div className="flex items-center justify-between mb-[16px]">
        <div>
          <h2 className="text-[16px] font-[600]">Welcome to Postmill</h2>
          <p className="text-[12px] text-newTableText">Let&apos;s get you set up</p>
        </div>
        <button onClick={handleDismiss} className="text-[12px] text-newTableText hover:text-textColor cursor-pointer" type="button">Dismiss</button>
      </div>

      <div className="mb-[16px]">
        <div className="flex justify-between text-[11px] text-newTableText mb-[4px]">
          <span>Setup progress</span>
          <span>{completedCount}/{SETUP_STEPS.length}</span>
        </div>
        <div className="h-[6px] bg-newTableHeader rounded-full overflow-hidden">
          <div className="h-full bg-green-500 rounded-full transition-all duration-500" style={{ width: `${(completedCount / SETUP_STEPS.length) * 100}%` }} />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-[8px]">
        {SETUP_STEPS.map((step, idx) => {
          const done = steps[step.key];
          return (
            <button
              key={step.key}
              type="button"
              onClick={() => !done && router.push(step.href)}
              className={clsx(
                'flex items-center gap-[10px] p-[10px] rounded-[8px] text-start',
                !done && 'hover:bg-boxHover cursor-pointer transition-colors',
                done && 'cursor-default'
              )}
            >
              <div className={clsx(
                'w-[20px] h-[20px] rounded-full flex items-center justify-center shrink-0 text-[10px] font-[600]',
                done ? 'bg-green-500 text-white' : 'border-2 border-newTableText text-newTableText'
              )}>
                {done ? (
                  <svg viewBox="0 0 15 15" fill="none" width="10" height="10">
                    <path d="M11.4669 3.72684C11.7558 3.91574 11.8369 4.30308 11.648 4.592L7.39799 11.092C7.29783 11.2452 7.13556 11.3467 6.95402 11.3699C6.77247 11.3931 6.58989 11.3355 6.45446 11.2124L3.20446 8.21243C2.94715 7.97215 2.93374 7.56924 3.17402 7.31193C3.4143 7.05462 3.81721 7.04122 4.07452 7.2815L6.69638 9.73846L10.352 3.90804C10.5409 3.61913 10.9282 3.53795 11.2171 3.72684C11.4669 3.88593 11.5532 4.17873 11.4669 3.72684Z" fill="white" fillRule="evenodd" clipRule="evenodd" />
                  </svg>
                ) : (
                  idx + 1
                )}
              </div>
              <div className="flex flex-col min-w-0">
                <span className={clsx('text-[12px]', done ? 'text-green-500 line-through' : 'text-textColor')}>{step.label}</span>
                <span className="text-[10px] text-newTableText truncate">{step.hint}</span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};
