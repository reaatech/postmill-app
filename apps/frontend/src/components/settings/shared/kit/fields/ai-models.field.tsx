'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { ExtraFieldProps } from './extra-field.types';

interface ModelInfo {
  id: string;
  label: string;
  kind: 'text' | 'image' | 'embedding';
  reasoning?: boolean;
}

/**
 * AI standard + reasoning model selects. Loads the model catalog from
 * `/admin/ai-settings/providers/:identifier` on mount and prefills
 * default/reasoning model (and any returned credentials), mirroring the old
 * `ai/provider-form.tsx`. Writes `extra.defaultModel` / `extra.reasoningModel`.
 */
export const AiModelsField: React.FC<ExtraFieldProps> = ({
  state,
  setExtra,
  setCredentials,
  identifier,
}) => {
  const t = useT();
  const fetch = useFetch();
  const [models, setModels] = useState<ModelInfo[]>([]);

  const defaultModel = state.extra.defaultModel || '';
  const reasoningModel = state.extra.reasoningModel || '';

  // Latest setters via a ref so the model fetch runs once per identifier without
  // re-running when the parent form recreates these callbacks each render.
  const cbRef = useRef({ setExtra, setCredentials });
  useEffect(() => {
    cbRef.current = { setExtra, setCredentials };
  }, [setExtra, setCredentials]);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch(`/admin/ai-settings/providers/${identifier}`, {
          method: 'GET',
        });
        if (!res.ok || !active) return;
        const data = await res.json();
        if (!active) return;
        setModels(data.models || []);
        if (data.defaultModel) cbRef.current.setExtra('defaultModel', data.defaultModel);
        if (data.reasoningModel) cbRef.current.setExtra('reasoningModel', data.reasoningModel);
        if (data.credentials) cbRef.current.setCredentials(data.credentials);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      active = false;
    };
  }, [fetch, identifier]);

  const textModels = models.filter((m) => m.kind === 'text');
  if (textModels.length === 0) return null;

  const standard = textModels.filter((m) => !m.reasoning);
  const reasoning = textModels.filter((m) => m.reasoning);

  return (
    <div className="grid grid-cols-2 gap-[16px]">
      <div className="flex flex-col gap-[4px]">
        <label className="text-[13px] text-newTableText">
          {t('default_model', 'Standard Model')}
        </label>
        <select
          className="bg-newBgColorInner border border-newTableBorder rounded-[8px] p-[8px] text-textColor text-[13px]"
          value={defaultModel}
          onChange={(e) => setExtra('defaultModel', e.target.value)}
        >
          <option value="">{t('select_model', 'Select a model...')}</option>
          <optgroup label={t('standard_models', 'Standard')}>
            {standard.map((model) => (
              <option key={model.id} value={model.id}>
                {model.label}
              </option>
            ))}
          </optgroup>
          {reasoning.length > 0 && (
            <optgroup label={t('reasoning_models', 'Reasoning')}>
              {reasoning.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.label}
                </option>
              ))}
            </optgroup>
          )}
        </select>
      </div>
      <div className="flex flex-col gap-[4px]">
        <label className="text-[13px] text-newTableText">
          {t('reasoning_model', 'Reasoning Model')}
          <span className="text-newTableText/50 ml-[4px]">{t('optional', '(optional)')}</span>
        </label>
        <select
          className="bg-newBgColorInner border border-newTableBorder rounded-[8px] p-[8px] text-textColor text-[13px]"
          value={reasoningModel}
          onChange={(e) => setExtra('reasoningModel', e.target.value)}
        >
          <option value="">{t('no_reasoning_model', 'No reasoning model')}</option>
          <optgroup label={t('reasoning_models', 'Reasoning')}>
            {reasoning.map((model) => (
              <option key={model.id} value={model.id}>
                {model.label}
              </option>
            ))}
          </optgroup>
          <optgroup label={t('standard_models', 'Standard')}>
            {standard.map((model) => (
              <option key={model.id} value={model.id}>
                {model.label}
              </option>
            ))}
          </optgroup>
        </select>
      </div>
    </div>
  );
};
