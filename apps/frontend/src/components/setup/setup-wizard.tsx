'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import useSWR, { useSWRConfig } from 'swr';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { Button } from '@gitroom/react/form/button';
import { SetupStepper } from '@gitroom/frontend/components/setup/setup-stepper';
import { StepLlm } from '@gitroom/frontend/components/setup/steps/step-llm';
import { StepAiMedia } from '@gitroom/frontend/components/setup/steps/step-ai-media';
import { StepChannels } from '@gitroom/frontend/components/setup/steps/step-channels';
import { StepContentPacks } from '@gitroom/frontend/components/setup/steps/step-content-packs';
import { StepStorage } from '@gitroom/frontend/components/setup/steps/step-storage';
import { StepShortlinks } from '@gitroom/frontend/components/setup/steps/step-shortlinks';
import { StepVpn } from '@gitroom/frontend/components/setup/steps/step-vpn';

const STEP_COMPONENTS = [
  StepLlm,
  StepAiMedia,
  StepChannels,
  StepContentPacks,
  StepStorage,
  StepShortlinks,
  StepVpn,
];

export function SetupWizard() {
  const t = useT();
  const fetch = useFetch();
  const router = useRouter();
  const { mutate: globalMutate } = useSWRConfig();

  // Restore the active step after an OAuth full-page round-trip (connecting a channel or an
  // OAuth short-link provider navigates the tab out to the provider and back; the gate then
  // returns the still-incomplete user to /setup, remounting this wizard). sessionStorage
  // survives same-tab navigation, so we resume on the step the user left instead of step 0.
  const [currentStep, setCurrentStep] = useState<number>(() => {
    if (typeof window === 'undefined') return 0;
    const saved = window.sessionStorage.getItem('setup:step');
    const n = saved ? parseInt(saved, 10) : 0;
    return Number.isInteger(n) && n >= 0 && n < STEP_COMPONENTS.length ? n : 0;
  });
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set());
  const [skippedSteps, setSkippedSteps] = useState<Set<number>>(new Set());
  const [finishing, setFinishing] = useState(false);
  const [finishError, setFinishError] = useState<string | null>(null);

  const steps = useMemo(
    () => [
      { id: 'llm', label: t('setup_step_llm', 'LLM'), required: true },
      { id: 'ai-media', label: t('setup_step_ai_media', 'AI Media') },
      { id: 'channels', label: t('setup_step_channels', 'Channels') },
      { id: 'content-packs', label: t('setup_step_content_packs', 'Content Packs') },
      { id: 'storage', label: t('setup_step_storage', 'Storage') },
      { id: 'shortlinks', label: t('setup_step_shortlinks', 'Shortlinks') },
      { id: 'vpn', label: t('setup_step_vpn', 'VPN') },
    ],
    [t]
  );

  // Poll the dashboard summary while on the LLM step so Next enables as soon as
  // the first provider auto-activates (§3.5).
  const { data: summary } = useSWR(
    '/dashboard/summary',
    useCallback(async (url: string) => (await fetch(url)).json(), [fetch]),
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      refreshInterval: currentStep === 0 ? 2000 : 0,
    }
  );

  // Persist the active step so it survives an OAuth round-trip / gate remount (see above).
  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.sessionStorage.setItem('setup:step', String(currentStep));
    }
  }, [currentStep]);

  const aiProviderActive = !!summary?.aiProviderActive;
  const isLastStep = currentStep === steps.length - 1;
  const canFinish = aiProviderActive;

  const handleNext = useCallback(() => {
    if (currentStep === 0 && !aiProviderActive) return;
    setCompletedSteps((prev) => new Set(prev).add(currentStep));
    setCurrentStep((s) => Math.min(s + 1, steps.length - 1));
  }, [currentStep, aiProviderActive, steps.length]);

  const handleSkip = useCallback(() => {
    if (currentStep === 0) return;
    setSkippedSteps((prev) => new Set(prev).add(currentStep));
    setCompletedSteps((prev) => new Set(prev).add(currentStep));
    setCurrentStep((s) => Math.min(s + 1, steps.length - 1));
  }, [currentStep, steps.length]);

  const handleBack = useCallback(() => {
    setCurrentStep((s) => Math.max(s - 1, 0));
  }, []);

  const handleStepClick = useCallback((index: number) => {
    setCurrentStep(index);
  }, []);

  const finishSetup = useCallback(async () => {
    if (!canFinish) return;
    setFinishing(true);
    setFinishError(null);
    try {
      const res = await fetch('/settings/setup/complete', { method: 'POST' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || t('setup_complete_failed', 'Could not complete setup'));
      }
      // CRITICAL: update the /user/self cache BEFORE navigating, otherwise the
      // LayoutComponent gate on /dashboard sees the stale setupCompleted:false
      // and bounces the user back to /setup.
      await globalMutate(
        '/user/self',
        (prev: any) => (prev ? { ...prev, setupCompleted: true } : prev),
        { revalidate: true }
      );
      if (typeof window !== 'undefined') {
        window.sessionStorage.removeItem('setup:step');
      }
      router.replace('/dashboard');
    } catch (err) {
      setFinishing(false);
      setFinishError(
        err instanceof Error ? err.message : t('setup_complete_failed', 'Could not complete setup')
      );
    }
  }, [canFinish, fetch, globalMutate, router, t]);

  const ActiveStepComponent = STEP_COMPONENTS[currentStep];

  return (
    <div className="flex flex-col h-full">
      <SetupStepper
        steps={steps}
        currentStep={currentStep}
        completedSteps={completedSteps}
        skippedSteps={skippedSteps}
        onStepClick={handleStepClick}
      />

      <div className="flex-1 min-h-0 overflow-hidden">
        <ActiveStepComponent />
      </div>

      {finishError && (
        <div className="shrink-0 px-[24px] py-[8px] bg-red-500/10 border-t border-red-500/20 text-red-500 text-[13px]">
          {finishError}
        </div>
      )}

      <div className="shrink-0 h-[64px] px-[24px] border-t border-newBorder flex items-center justify-between bg-primary">
        <Button
          type="button"
          onClick={handleBack}
          disabled={currentStep === 0}
          className="!bg-transparent border border-newTableBorder text-textColor"
        >
          {t('back', 'Back')}
        </Button>

        <div className="flex items-center gap-[12px]">
          {currentStep !== 0 && !isLastStep && (
            <Button
              type="button"
              onClick={handleSkip}
              className="!bg-transparent border border-newTableBorder text-textColor"
            >
              {t('skip', 'Skip')}
            </Button>
          )}

          {canFinish && (
            <Button
              type="button"
              onClick={finishSetup}
              disabled={finishing}
              className="bg-btnPrimary text-white"
            >
              {finishing
                ? t('finishing', 'Finishing...')
                : t('finish_setup', 'Finish setup')}
            </Button>
          )}

          {!isLastStep && (
            <Button
              type="button"
              onClick={handleNext}
              disabled={currentStep === 0 && !aiProviderActive}
              className="bg-btnPrimary text-white"
            >
              {t('next', 'Next')}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
