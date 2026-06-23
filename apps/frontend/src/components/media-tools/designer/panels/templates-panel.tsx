'use client';

import React, { FC, useCallback } from 'react';
import useSWR from 'swr';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import type { DesignerStore, DesignerDoc } from '../designer.store';
import { PanelSkeletonGrid, PanelError } from './panel-states';

interface DesignTemplate {
  id: string;
  name: string;
  doc: DesignerDoc;
  isSystem: boolean;
  thumbnail?: string;
}

interface TemplatesPanelProps {
  store: ReturnType<typeof import('../designer.store').createDesignerStore>;
  onClose?: () => void;
}

export const TemplatesPanel: FC<TemplatesPanelProps> = ({ store, onClose }) => {
  const fetch = useFetch();

  const { data, error, isLoading, mutate } = useSWR(
    'design-templates',
    async () => {
      const res = await fetch('/media/design-templates');
      if (!res.ok) throw new Error('Failed to load templates');
      return res.json() as Promise<DesignTemplate[]>;
    },
    { keepPreviousData: true }
  );

  const applyTemplate = useCallback((template: DesignTemplate) => {
    store.getState().setDoc(JSON.parse(JSON.stringify(template.doc)));
    store.getState().pushHistory();
    onClose?.();
  }, [store, onClose]);

  const saveAsTemplate = useCallback(async () => {
    const state = store.getState();
    const name = state.designName;
    const res = await fetch('/media/design-templates', {
      method: 'POST',
      body: JSON.stringify({
        name: `${name} (template)`,
        doc: state.doc,
      }),
    });
    if (res.ok) {
      mutate();
    }
  }, [store, fetch, mutate]);

  return (
    <div className="flex flex-col gap-3">
      <button
        onClick={saveAsTemplate}
        className="w-full px-3 py-2 rounded-lg text-[12px] font-medium bg-[#2B5CD3] text-white hover:bg-[#2B5CD3]/80"
      >
        Save current as template
      </button>

      {isLoading && !data ? (
        <PanelSkeletonGrid count={4} />
      ) : error && !data ? (
        <PanelError message="Couldn't load templates" onRetry={() => mutate()} />
      ) : !data?.length ? (
        <div className="text-[12px] text-newTextColor/40 text-center py-4">
          No templates yet
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {data.map((template) => (
            <div
              key={template.id}
              className="rounded-lg border border-newBorder bg-newBgColorInner overflow-hidden group"
            >
              <div className="aspect-[4/3] bg-newColColor/10 flex items-center justify-center text-[20px] text-newTextColor/20">
                {template.isSystem ? '◧' : '▣'}
              </div>
              <div className="p-2">
                <div className="text-[11px] text-textColor truncate">{template.name}</div>
                <div className="text-[10px] text-newTextColor/40">
                  {template.isSystem ? 'System' : 'Org'}
                </div>
                <button
                  onClick={() => applyTemplate(template)}
                  className="mt-1 w-full px-2 py-1 rounded text-[11px] bg-[#2B5CD3] text-white hover:bg-[#2B5CD3]/80"
                >
                  Apply
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
