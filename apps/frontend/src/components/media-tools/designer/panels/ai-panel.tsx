'use client';

import React, { FC, useCallback, useRef, useState } from 'react';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useToaster } from '@gitroom/react/toaster/toaster';

interface AiPanelProps {
  store: any;
}

// Explicit lifecycle states for an AI generation request (C7).
type GenStatus = 'idle' | 'queued' | 'generating' | 'failed';

export const AiPanel: FC<AiPanelProps> = ({ store }) => {
  const fetch = useFetch();
  const toaster = useToaster();
  const [prompt, setPrompt] = useState('');
  const [status, setStatus] = useState<GenStatus>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [results, setResults] = useState<string[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  const inFlight = status === 'queued' || status === 'generating';

  const handleGenerate = useCallback(async () => {
    if (!prompt.trim() || inFlight) return;
    setErrorMessage('');
    setStatus('queued');

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      // Brief queued → generating transition so the user sees the request was accepted.
      setStatus('generating');
      const res = await fetch('/media/generate-image', {
        method: 'POST',
        body: JSON.stringify({ prompt: prompt.trim() }),
        signal: controller.signal,
      });
      if (!res.ok) {
        setStatus('failed');
        setErrorMessage('Image generation failed. Please try again.');
        return;
      }
      const data = await res.json();
      if (data?.output) {
        setResults((prev) => [data.output, ...prev]);
        setStatus('idle');
        toaster.show('Image generated', 'success');
      } else {
        setStatus('failed');
        setErrorMessage('The model returned no image.');
      }
    } catch (e) {
      // Aborts are user-initiated cancels — return to idle silently.
      if (controller.signal.aborted) {
        setStatus('idle');
        return;
      }
      setStatus('failed');
      setErrorMessage('Generation failed. Please try again.');
    } finally {
      abortRef.current = null;
    }
  }, [prompt, fetch, toaster, inFlight]);

  const handleCancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setStatus('idle');
    toaster.show('Generation cancelled', 'success');
  }, [toaster]);

  const handleAddToCanvas = useCallback(
    (dataUrl: string) => {
      const state = store.getState();
      const out = state.doc.outputs[state.currentOutput];
      state.addElement({
        id: '',
        type: 'image',
        src: dataUrl,
        x: 0,
        y: 0,
        width: Math.min(300, out.width),
        height: Math.min(300, out.height),
        rotation: 0,
        opacity: 1,
        locked: false,
        hidden: false,
      });
      toaster.show('Image added to canvas', 'success');
    },
    [store, toaster]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleGenerate();
      }
    },
    [handleGenerate]
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2">
        <input
          type="text"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Describe the image..."
          className="flex-1 h-[36px] px-[10px] rounded-[6px] bg-newBgColor border border-newBorder text-[13px] text-textColor outline-none focus:border-designerAccent"
        />
        {inFlight ? (
          <button
            onClick={handleCancel}
            className="px-[12px] h-[36px] rounded-[6px] border border-newBorder text-textColor text-[13px] font-medium hover:bg-boxHover shrink-0"
          >
            Cancel
          </button>
        ) : (
          <button
            onClick={handleGenerate}
            disabled={!prompt.trim()}
            className="px-[12px] h-[36px] rounded-[6px] bg-designerAccent text-white text-[13px] font-medium hover:bg-designerAccent/80 disabled:opacity-50 shrink-0"
          >
            Generate
          </button>
        )}
      </div>

      {status === 'queued' && (
        <div className="flex items-center justify-center gap-2 py-6 text-newTextColor/50 text-[13px]">
          <span
            className="w-[10px] h-[10px] rounded-full bg-[#EAB308] motion-safe:animate-pulse"
            aria-hidden="true"
          />
          Queued…
        </div>
      )}

      {status === 'generating' && (
        <div className="flex items-center justify-center gap-2 py-6 text-newTextColor/50 text-[13px]">
          <span
            className="w-[14px] h-[14px] rounded-full border-2 border-newBorder border-t-designerAccent motion-safe:animate-spin"
            aria-hidden="true"
          />
          Generating…
        </div>
      )}

      {status === 'failed' && (
        <div
          className="flex flex-col items-center gap-2 py-5 text-center"
          role="alert"
        >
          <div className="text-[20px] text-newTextColor/30" aria-hidden="true">
            ⚠
          </div>
          <div className="text-[12px] text-newTextColor/60">
            {errorMessage || 'Generation failed.'}
          </div>
          <button
            type="button"
            onClick={handleGenerate}
            disabled={!prompt.trim()}
            className="px-3 py-1.5 rounded-lg text-[12px] font-medium border border-newBorder text-textColor hover:border-designerAccent hover:bg-boxHover transition-colors disabled:opacity-50"
          >
            Try again
          </button>
        </div>
      )}

      {results.length > 0 && (
        <div className="grid grid-cols-2 gap-2">
          {results.map((dataUrl, i) => (
            <button
              key={i}
              onClick={() => handleAddToCanvas(dataUrl)}
              className="relative group rounded-[6px] overflow-hidden border border-newBorder hover:border-designerAccent transition-all"
              title="Click to add to canvas"
            >
              <img
                src={dataUrl}
                alt={`Generated ${i + 1}`}
                className="w-full aspect-square object-cover"
              />
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-all flex items-center justify-center">
                <span className="text-white text-[12px] font-medium opacity-0 group-hover:opacity-100 transition-all">
                  Add to Canvas
                </span>
              </div>
            </button>
          ))}
        </div>
      )}

      <div className="flex gap-2 mt-2">
        <button
          onClick={() => toaster.show('Background removal coming soon', 'success')}
          className="flex-1 h-[32px] rounded-[6px] border border-newBorder text-[12px] text-textColor hover:bg-boxHover transition-all"
        >
          Background Removal
        </button>
        <button
          onClick={() => toaster.show('Upscale coming soon', 'success')}
          className="flex-1 h-[32px] rounded-[6px] border border-newBorder text-[12px] text-textColor hover:bg-boxHover transition-all"
        >
          Upscale
        </button>
      </div>
    </div>
  );
};
