'use client';

import React, { useEffect, useRef, useCallback } from 'react';
import useSWR from 'swr';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useReplicateStore, EstimateResult } from './replicate.store';

function useEstimate(modelId: string | undefined, input: Record<string, unknown>) {
  const fetch = useFetch();
  return useSWR(
    modelId ? `replicate-estimate-${modelId}-${JSON.stringify(input)}` : null,
    async () => {
      const res = await fetch('/media/replicate/estimate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modelId, input }),
      });
      return (await res.json()) as EstimateResult;
    },
    { revalidateOnFocus: false, dedupingInterval: 2000 }
  );
}

export function CostBar() {
  // Select individual slices — subscribing to the whole store returns a new object
  // identity on every state change, which made the setEstimate effect loop forever.
  const formInput = useReplicateStore((s) => s.formInput);
  const selectedModel = useReplicateStore((s) => s.selectedModel);
  const setEstimate = useReplicateStore((s) => s.setEstimate);
  const storedEstimate = useReplicateStore((s) => s.estimate);
  const debounceRef = useRef<NodeJS.Timeout>(undefined);
  const inputRef = useRef(formInput);
  const [debouncedInput, setDebouncedInput] = React.useState(formInput);

  useEffect(() => {
    inputRef.current = formInput;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedInput(inputRef.current);
    }, 500);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [formInput]);

  const { data: estimate } = useEstimate(selectedModel?.id, debouncedInput);

  useEffect(() => {
    if (estimate) {
      setEstimate(estimate);
    }
  }, [estimate, setEstimate]);

  if (!selectedModel) return null;

  return (
    <div className="flex items-center gap-3 mt-4 pt-3 border-t border-newBorder">
      {storedEstimate ? (
        storedEstimate.approximate ? (
          <span className="text-xs text-gray-500">
            Billed by usage — exact cost is usage-dependent
          </span>
        ) : (
          <span className="text-xs text-gray-400">
            Est. cost: <span className="text-white font-medium">${storedEstimate.usd.toFixed(4)}</span>
            {' '}per run
          </span>
        )
      ) : (
        <span className="text-xs text-gray-600">Estimating cost...</span>
      )}
    </div>
  );
}
