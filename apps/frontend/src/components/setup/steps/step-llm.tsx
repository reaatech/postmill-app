'use client';

import React from 'react';
import { StepFrame } from '@gitroom/frontend/components/setup/step-frame';
import { ProviderSettingsPanel } from '@gitroom/frontend/components/settings/shared/kit/provider-settings-panel';
import { aiDescriptor } from '@gitroom/frontend/components/settings/shared/kit/descriptors/ai.descriptor';
import { useT } from '@gitroom/react/translation/get.transation.service.client';

export function StepLlm() {
  const t = useT();
  return (
    <StepFrame
      title={t('setup_llm_title', 'Connect an LLM provider')}
      subtitle={t(
        'setup_llm_subtitle',
        'Pick a Large Language Model provider to power AI features. This step is required before you can finish setup.'
      )}
    >
      <ProviderSettingsPanel descriptor={aiDescriptor} hideHeader />
    </StepFrame>
  );
}
