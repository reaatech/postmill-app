'use client';

import React, { useEffect, useCallback } from 'react';
import useSWR from 'swr';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useReplicateStore, ModelSummary } from './replicate.store';

interface ModelPickerProps {
  categoryKey: string;
}

function useModels(categoryKey: string) {
  const fetch = useFetch();
  return useSWR(
    categoryKey ? `replicate-models-${categoryKey}` : null,
    async () => {
      const res = await fetch(`/media/replicate/categories/${categoryKey}/models`);
      return (await res.json()) as ModelSummary[];
    }
  );
}

function ModelCard({ model, onClick }: { model: ModelSummary; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex-shrink-0 w-36 rounded-xl border border-newBorder bg-newBgColorInner hover:bg-boxHover transition-colors overflow-hidden text-left"
    >
      {model.coverImageUrl ? (
        <img
          src={model.coverImageUrl}
          alt={model.name}
          className="w-full h-24 object-cover"
          loading="lazy"
        />
      ) : (
        <div className="w-full h-24 bg-gray-800 flex items-center justify-center text-gray-600 text-2xl">
          ✨
        </div>
      )}
      <div className="p-2">
        <p className="text-xs font-medium text-white truncate">{model.name}</p>
        <div className="flex items-center gap-1 mt-1">
          {model.warm ? (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-900/50 text-green-400">
              Instant
            </span>
          ) : (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-yellow-900/50 text-yellow-400">
              Community · may cold-start · usage-billed
            </span>
          )}
          <span className="text-[10px] text-gray-500">
            {model.pricing === 'output' ? (
              model.price ? `$${model.price.usd}` : '$'
            ) : (
              'Billed by usage'
            )}
          </span>
        </div>
      </div>
    </button>
  );
}

export function ModelPicker({ categoryKey }: ModelPickerProps) {
  const { data: models } = useModels(categoryKey);
  const store = useReplicateStore();
  const fetch = useFetch();

  // Determine if this category has any community models
  const hasCommunity = models?.some((m) => !m.warm) ?? false;
  const hasOfficial = models?.some((m) => m.warm) ?? false;

  const loadModel = useCallback(async (modelId: string) => {
    const [owner, name] = modelId.split('/');
    const res = await fetch(`/media/replicate/models/${owner}/${name}`);
    const detail = await res.json();
    store.setSelectedModel(detail);
  }, [fetch, store]);

  useEffect(() => {
    if (models) {
      store.setModels(models);
    }
  }, [models, store]);

  const filteredModels = store.showCommunity
    ? models || []
    : (models || []).filter((m) => m.warm);

  if (!models) {
    return (
      <div className="flex gap-3">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="w-36 h-40 rounded-xl bg-gray-800 animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-medium text-white">Models</h4>
        {hasCommunity && !hasOfficial && (
          <p className="text-xs text-yellow-400">Community models only — may cold-start</p>
        )}
        {hasCommunity && (
          <label className="flex items-center gap-2 text-xs text-gray-400 cursor-pointer">
            <input
              type="checkbox"
              checked={store.showCommunity}
              onChange={(e) => store.setShowCommunity(e.target.checked)}
              className="rounded bg-gray-800 border-gray-600"
            />
            Show community models
          </label>
        )}
      </div>
      <div className="flex gap-3 overflow-x-auto pb-2">
        {filteredModels.map((model) => (
          <ModelCard
            key={model.id}
            model={model}
            onClick={() => loadModel(model.id)}
          />
        ))}
      </div>
    </div>
  );
}
