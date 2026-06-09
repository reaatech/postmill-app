'use client';

import { FC, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import clsx from 'clsx';

const STEPS_CONFIG = [
  { key: 'channel' as const, label: 'Connect your first channel', href: '/third-party' },
  { key: 'ai' as const, label: 'Configure AI provider', href: '/settings?tab=ai' },
  { key: 'post' as const, label: 'Create your first post', href: '/launches' },
  { key: 'team' as const, label: 'Invite team members', href: '/settings?tab=teams' },
];

const useIntegrations = () => {
  const fetch = useFetch();
  return useSWR('/integrations/list', (url: string) => fetch(url).then(r => r.json()), {
    revalidateOnFocus: false,
    fallbackData: { integrations: [] },
  });
};

const useAIConfig = () => {
  const fetch = useFetch();
  return useSWR('/settings/ai/config', (url: string) => fetch(url).then(r => r.json()), {
    revalidateOnFocus: false,
    fallbackData: { active: null, providers: [] },
  });
};

const useTeam = () => {
  const fetch = useFetch();
  return useSWR('/settings/team', (url: string) => fetch(url).then(r => r.json()), {
    revalidateOnFocus: false,
    fallbackData: { users: [] },
  });
};

export const useOnboardingChecklist = () => {
  const { data: integrations, isLoading: loading1 } = useIntegrations();
  const { data: aiConfig, isLoading: loading2 } = useAIConfig();
  const { data: teamData, isLoading: loading3 } = useTeam();

  const steps = useMemo(() => ({
    channel: (integrations?.integrations?.length || 0) > 0,
    ai: aiConfig?.active !== null && aiConfig?.active !== undefined,
    post: false,
    team: (teamData?.users?.length || 0) > 1,
  }), [integrations, aiConfig, teamData]);

  const dismissed = typeof window !== 'undefined' && localStorage.getItem('onboarding_dismissed') === 'true';

  const isLoading = loading1 || loading2 || loading3;
  const show = !isLoading && !steps.channel && !dismissed;

  const dismiss = useCallback(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('onboarding_dismissed', 'true');
    }
  }, []);

  return { show, dismiss, steps, isLoading };
};

export const OnboardingChecklist: FC = () => {
  const { show, dismiss, steps } = useOnboardingChecklist();
  const router = useRouter();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (show) {
      setVisible(true);
    }
  }, [show]);

  const handleDismiss = useCallback(() => {
    setVisible(false);
    dismiss();
  }, [dismiss]);

  const completedCount = Object.values(steps).filter(Boolean).length;

  const firstIncomplete = STEPS_CONFIG.find(s => !steps[s.key]);

  const handleGetStarted = useCallback(() => {
    if (firstIncomplete) {
      router.push(firstIncomplete.href);
    }
    setVisible(false);
    dismiss();
  }, [firstIncomplete, dismiss, router]);

  const handleStepClick = useCallback((step: typeof STEPS_CONFIG[number]) => {
    if (!steps[step.key]) {
      router.push(step.href);
      setVisible(false);
      dismiss();
    }
  }, [steps, dismiss, router]);

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-newBgColorInner rounded-[16px] w-[440px] max-w-[90vw] p-[32px] shadow-2xl border border-newTableBorder relative">
        <button
          onClick={handleDismiss}
          className="absolute top-[16px] end-[16px] text-customColor18 hover:text-textColor cursor-pointer"
          type="button"
        >
          <svg viewBox="0 0 15 15" fill="none" width="16" height="16">
            <path d="M11.7816 4.03157C12.0062 3.80702 12.0062 3.44295 11.7816 3.2184C11.5571 2.99385 11.193 2.99385 10.9685 3.2184L7.50005 6.68682L4.03164 3.2184C3.80708 2.99385 3.44301 2.99385 3.21846 3.2184C2.99391 3.44295 2.99391 3.80702 3.21846 4.03157L6.68688 7.49999L3.21846 10.9684C2.99391 11.193 2.99391 11.557 3.21846 11.7816C3.44301 12.0061 3.80708 12.0061 4.03164 11.7816L7.50005 8.31316L10.9685 11.7816C11.193 12.0061 11.5571 12.0061 11.7816 11.7816C12.0062 11.557 12.0062 11.193 11.7816 10.9684L8.31322 7.49999L11.7816 4.03157Z" fill="currentColor" fillRule="evenodd" clipRule="evenodd" />
          </svg>
        </button>

        <div className="text-[22px] font-semibold text-center text-textColor">Welcome to Postmill!</div>
        <div className="text-[13px] text-customColor18 text-center mt-[4px] mb-[24px]">
          Let&apos;s get you set up
        </div>

        <div className="mb-[24px]">
          <div className="flex justify-between text-[12px] text-customColor18 mb-[6px]">
            <span>Setup progress</span>
            <span>{completedCount}/4</span>
          </div>
          <div className="h-[6px] bg-newTableHeader rounded-full overflow-hidden">
            <div
              className="h-full bg-green-500 rounded-full transition-all duration-500"
              style={{ width: `${(completedCount / 4) * 100}%` }}
            />
          </div>
        </div>

        <div className="flex flex-col gap-[8px]">
          {STEPS_CONFIG.map((step) => {
            const done = steps[step.key];
            return (
              <button
                key={step.key}
                type="button"
                onClick={() => handleStepClick(step)}
                className={clsx(
                  'flex items-center gap-[12px] p-[12px] rounded-[8px] w-full text-start',
                  !done && 'hover:bg-boxHover cursor-pointer transition-colors',
                  done && 'cursor-default'
                )}
              >
                <div
                  className={clsx(
                    'w-[24px] h-[24px] rounded-full flex items-center justify-center shrink-0',
                    done ? 'bg-green-500' : 'bg-newTableHeader border border-newTableBorder'
                  )}
                >
                  {done && (
                    <svg viewBox="0 0 15 15" fill="none" width="12" height="12">
                      <path d="M11.4669 3.72684C11.7558 3.91574 11.8369 4.30308 11.648 4.592L7.39799 11.092C7.29783 11.2452 7.13556 11.3467 6.95402 11.3699C6.77247 11.3931 6.58989 11.3355 6.45446 11.2124L3.20446 8.21243C2.94715 7.97215 2.93374 7.56924 3.17402 7.31193C3.4143 7.05462 3.81721 7.04122 4.07452 7.2815L6.69638 9.73846L10.352 3.90804C10.5409 3.61913 10.9282 3.53795 11.2171 3.72684C11.4669 3.88593 11.5532 4.17873 11.4669 3.72684Z" fill="white" fillRule="evenodd" clipRule="evenodd" />
                    </svg>
                  )}
                </div>
                <span className={clsx('text-[14px]', done ? 'text-green-500 line-through' : 'text-textColor')}>
                  {step.label}
                </span>
              </button>
            );
          })}
        </div>

        <div className="flex items-center justify-between mt-[24px] pt-[16px] border-t border-newTableBorder">
          <button
            onClick={handleDismiss}
            className="text-[13px] text-customColor18 hover:text-textColor cursor-pointer"
            type="button"
          >
            Dismiss
          </button>
          <button
            onClick={handleGetStarted}
            className="px-[24px] py-[10px] bg-btnPrimary text-white rounded-[8px] text-[14px] font-medium hover:opacity-90 cursor-pointer transition-opacity"
            type="button"
          >
            {completedCount === 0 ? 'Get Started' : 'Continue'}
          </button>
        </div>
      </div>
    </div>
  );
};
