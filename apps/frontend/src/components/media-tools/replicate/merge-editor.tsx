'use client';

import React, { useState, useCallback } from 'react';
import useSWR from 'swr';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useModals } from '@gitroom/frontend/components/layout/new-modal';
import { MediaSelectorModal } from '@gitroom/frontend/components/media-tools/media-selector-modal';
import { useReplicateStore } from './replicate.store';
import { VideoPlayer } from './players/video-player';

interface MergeClip {
  url?: string;
  fileId?: string;
  trimStart?: number;
  trimEnd?: number;
}

interface MergeTransition {
  type: string;
  duration: number;
}

const TRANSITION_OPTIONS = [
  { value: 'fade', label: 'Fade' },
  { value: 'dissolve', label: 'Dissolve' },
  { value: 'xfade-wipe', label: 'Wipe Right' },
  { value: 'pixelize', label: 'Pixelize' },
  { value: 'radial', label: 'Radial' },
  { value: 'fadegrayscale', label: 'Fade Grayscale' },
];

function useJobPoll(jobId: string | null) {
  const fetch = useFetch();
  return useSWR(
    jobId ? `merge-job-${jobId}` : null,
    async () => {
      const res = await fetch(`/media/replicate/jobs/${jobId}`);
      return (await res.json()) as { status: string; result: { kind: string; urls: string[] } | null };
    },
    { refreshInterval: 6000 }
  );
}

export function MergeEditor() {
  const fetch = useFetch();
  const modals = useModals();
  const store = useReplicateStore();
  const [clips, setClips] = useState<MergeClip[]>([]);
  const [transitions, setTransitions] = useState<MergeTransition[]>([]);
  const [running, setRunning] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data: jobData } = useJobPoll(jobId);

  const addFileClip = useCallback(() => {
    if (clips.length >= 6) return;
    modals.openModal({
      title: 'Select video clip',
      removeLayout: true,
      children: (close) => (
        <MediaSelectorModal
          open
          onClose={close}
          onSelect={(item) => {
            if (clips.length < 6) {
              setClips((prev) => {
                const next = [...prev, { fileId: item.fileId }];
                if (prev.length > 0) {
                  setTransitions((t) => [...t, { type: 'fade', duration: 0.5 }]);
                }
                return next;
              });
            }
            close();
          }}
        />
      ),
    });
  }, [clips.length, modals]);

  const addUrlClip = useCallback(() => {
    if (clips.length >= 6) return;
    const url = prompt('Enter external clip URL (https):');
    if (!url) return;
    if (!url.startsWith('https://')) {
      setError('External clip URL must start with https://');
      return;
    }
    setClips((prev) => {
      const next = [...prev, { url }];
      if (prev.length > 0) {
        setTransitions((t) => [...t, { type: 'fade', duration: 0.5 }]);
      }
      return next;
    });
  }, [clips.length]);

  const removeClip = useCallback((index: number) => {
    setClips((prev) => prev.filter((_, i) => i !== index));
    setTransitions((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const updateTransition = useCallback((index: number, field: string, value: unknown) => {
    setTransitions((prev) =>
      prev.map((t, i) => (i === index ? { ...t, [field]: value } : t))
    );
  }, []);

  const handleMerge = useCallback(async () => {
    if (clips.length === 0) return;
    if (!store.saveFolderId) return;
    setRunning(true);
    setError(null);

    try {
      const res = await fetch('/media/replicate/merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clips, transitions, folderId: store.saveFolderId }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || data.error || 'Merge failed');
      }
      setJobId(data.jobId);
    } catch (err: any) {
      setError(err.message);
      setRunning(false);
    }
  }, [clips, transitions, fetch, store.saveFolderId]);

  const isComplete = jobData?.status === 'completed';

  const handleOpenInFiles = useCallback(() => {
    const folderId = store.saveFolderId;
    const target = folderId ? `/files?folderId=${encodeURIComponent(folderId)}` : '/files';
    window.open(target, '_blank');
  }, [store.saveFolderId]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium text-white">Merge Clips</h4>
        <div className="flex gap-2">
          <button
            onClick={addFileClip}
            disabled={clips.length >= 6}
            className="px-3 py-1.5 rounded-lg bg-gray-800 text-white text-xs hover:bg-gray-700 disabled:opacity-50"
          >
            Add from Files ({clips.length}/6)
          </button>
          <button
            onClick={addUrlClip}
            disabled={clips.length >= 6}
            className="px-3 py-1.5 rounded-lg bg-gray-800 text-white text-xs hover:bg-gray-700 disabled:opacity-50"
          >
            Add URL ({clips.length}/6)
          </button>
        </div>
      </div>

      {!store.saveFolderId && (
        <p className="text-xs text-yellow-400">
          Select a save folder before merging.
        </p>
      )}

      {/* Clip list */}
      {clips.map((clip, idx) => (
        <div key={idx} className="p-3 rounded-lg border border-newBorder bg-newBgColorInner">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-gray-400">Clip {idx + 1}</span>
            <button onClick={() => removeClip(idx)} className="text-xs text-red-400 hover:text-red-300">Remove</button>
          </div>
          <p className="text-xs text-gray-500 truncate">{clip.url || clip.fileId}</p>
          <div className="flex gap-3 mt-2">
            <div>
              <label className="text-[10px] text-gray-600">Trim Start (s)</label>
              <input
                type="number"
                value={clip.trimStart ?? ''}
                onChange={(e) => {
                  const newClips = [...clips];
                  newClips[idx] = { ...clip, trimStart: e.target.value ? Number(e.target.value) : undefined };
                  setClips(newClips);
                }}
                placeholder="0"
                className="w-20 px-2 py-1 rounded border border-newBorder bg-gray-800 text-white text-xs"
              />
            </div>
            <div>
              <label className="text-[10px] text-gray-600">Trim End (s)</label>
              <input
                type="number"
                value={clip.trimEnd ?? ''}
                onChange={(e) => {
                  const newClips = [...clips];
                  newClips[idx] = { ...clip, trimEnd: e.target.value ? Number(e.target.value) : undefined };
                  setClips(newClips);
                }}
                placeholder="end"
                className="w-20 px-2 py-1 rounded border border-newBorder bg-gray-800 text-white text-xs"
              />
            </div>
          </div>
          {/* Transition (between this clip and next) */}
          {idx < clips.length - 1 && transitions[idx] && (
            <div className="flex gap-3 mt-2 pt-2 border-t border-newBorder">
              <div>
                <label className="text-[10px] text-gray-600">Transition</label>
                <select
                  value={transitions[idx].type}
                  onChange={(e) => updateTransition(idx, 'type', e.target.value)}
                  className="w-32 px-2 py-1 rounded border border-newBorder bg-gray-800 text-white text-xs"
                >
                  {TRANSITION_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[10px] text-gray-600">Duration (s)</label>
                <input
                  type="number"
                  min={0.1}
                  max={5}
                  step={0.1}
                  value={transitions[idx].duration}
                  onChange={(e) => updateTransition(idx, 'duration', Number(e.target.value))}
                  className="w-20 px-2 py-1 rounded border border-newBorder bg-gray-800 text-white text-xs"
                />
              </div>
            </div>
          )}
        </div>
      ))}

      {clips.length === 0 && (
        <div className="text-center py-8 text-gray-500 text-sm">
          Add video clips to merge them together with transitions
        </div>
      )}

      {/* Actions */}
      <button
        onClick={handleMerge}
        disabled={clips.length === 0 || running || !store.saveFolderId}
        className="px-6 py-2.5 rounded-xl bg-designerAccent text-white font-medium hover:bg-designerAccent/80 disabled:opacity-50"
      >
        {running ? 'Merging...' : 'Merge Videos'}
      </button>

      {/* Result */}
      {running && !isComplete && (
        <div className="flex items-center gap-2">
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-designerAccent" />
          <span className="text-sm text-gray-400">Processing merge...</span>
        </div>
      )}

      {isComplete && jobData?.result?.urls && (
        <div className="flex flex-col gap-2">
          <VideoPlayer src={jobData.result.urls[0]} />
          <button
            onClick={handleOpenInFiles}
            className="px-3 py-1.5 rounded-lg bg-gray-800 text-white text-xs hover:bg-gray-700 transition-colors self-start"
          >
            Open in Files
          </button>
        </div>
      )}

      {error && (
        <p className="text-sm text-red-400">{error}</p>
      )}
    </div>
  );
}
