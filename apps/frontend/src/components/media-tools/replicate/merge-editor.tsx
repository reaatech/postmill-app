'use client';

import React, { useState, useCallback } from 'react';
import useSWR from 'swr';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useModals } from '@gitroom/frontend/components/layout/new-modal';
import { MediaSelectorModal } from '@gitroom/frontend/components/media-tools/media-selector-modal';
import { useReplicateStore } from './replicate.store';
import { VideoPlayer } from './players/video-player';
import { EditorShell, toolbarBtn, toolbarPrimary } from './editor-shell';

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

const fieldLabel = 'text-[10px] uppercase tracking-wider text-gray-500';
const fieldInput =
  'w-full px-2 py-1 rounded border border-newBorder bg-newBgColor text-white text-xs focus:outline-none focus:border-designerAccent';

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
  const saveFolderId = useReplicateStore((s) => s.saveFolderId);
  const [clips, setClips] = useState<MergeClip[]>([]);
  const [transitions, setTransitions] = useState<MergeTransition[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [running, setRunning] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data: jobData } = useJobPoll(jobId);
  const isComplete = jobData?.status === 'completed';

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
            setClips((prev) => {
              if (prev.length >= 6) return prev;
              if (prev.length > 0) setTransitions((t) => [...t, { type: 'fade', duration: 0.5 }]);
              return [...prev, { fileId: item.fileId }];
            });
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
      if (prev.length > 0) setTransitions((t) => [...t, { type: 'fade', duration: 0.5 }]);
      return [...prev, { url }];
    });
  }, [clips.length]);

  const removeClip = useCallback((index: number) => {
    setClips((prev) => prev.filter((_, i) => i !== index));
    setTransitions((prev) => prev.filter((_, i) => i !== index));
    setSelected((cur) => (cur === index ? null : cur));
  }, []);

  const updateClip = useCallback((index: number, patch: Partial<MergeClip>) => {
    setClips((prev) => prev.map((c, i) => (i === index ? { ...c, ...patch } : c)));
  }, []);

  const updateTransition = useCallback((index: number, field: string, value: unknown) => {
    setTransitions((prev) => prev.map((t, i) => (i === index ? { ...t, [field]: value } : t)));
  }, []);

  const handleMerge = useCallback(async () => {
    if (clips.length === 0 || !saveFolderId) return;
    setRunning(true);
    setError(null);
    try {
      const res = await fetch('/media/replicate/merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clips, transitions, folderId: saveFolderId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || 'Merge failed');
      setJobId(data.jobId);
    } catch (err: any) {
      setError(err.message);
      setRunning(false);
    }
  }, [clips, transitions, fetch, saveFolderId]);

  const openInFiles = useCallback(() => {
    const target = saveFolderId ? `/files?folderId=${encodeURIComponent(saveFolderId)}` : '/files';
    window.open(target, '_blank');
  }, [saveFolderId]);

  const selectedClip = selected !== null ? clips[selected] : null;

  const toolbar = (
    <>
      <button onClick={addFileClip} disabled={clips.length >= 6} className={toolbarBtn}>
        + Files ({clips.length}/6)
      </button>
      <button onClick={addUrlClip} disabled={clips.length >= 6} className={toolbarBtn}>
        + URL
      </button>
      <button
        onClick={handleMerge}
        disabled={clips.length === 0 || running || !saveFolderId}
        className={toolbarPrimary}
      >
        {running && !isComplete ? 'Merging…' : 'Merge'}
      </button>
    </>
  );

  const inspector = (
    <div className="p-4 space-y-4">
      {!saveFolderId && <p className="text-xs text-yellow-400">Pick a save folder (header) before merging.</p>}
      {selectedClip ? (
        <div className="space-y-3">
          <div className={fieldLabel}>Clip {selected! + 1}</div>
          <p className="text-[11px] text-gray-500 truncate">{selectedClip.url || selectedClip.fileId}</p>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <div className={fieldLabel}>Trim start (s)</div>
              <input
                type="number"
                value={selectedClip.trimStart ?? ''}
                onChange={(e) =>
                  updateClip(selected!, { trimStart: e.target.value ? Number(e.target.value) : undefined })
                }
                placeholder="0"
                className={fieldInput}
              />
            </div>
            <div>
              <div className={fieldLabel}>Trim end (s)</div>
              <input
                type="number"
                value={selectedClip.trimEnd ?? ''}
                onChange={(e) =>
                  updateClip(selected!, { trimEnd: e.target.value ? Number(e.target.value) : undefined })
                }
                placeholder="end"
                className={fieldInput}
              />
            </div>
          </div>
          {selected! < clips.length - 1 && transitions[selected!] && (
            <div className="border-t border-newBorder pt-3 space-y-2">
              <div className={fieldLabel}>Transition → next clip</div>
              <select
                value={transitions[selected!].type}
                onChange={(e) => updateTransition(selected!, 'type', e.target.value)}
                className={fieldInput}
              >
                {TRANSITION_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <div>
                <div className={fieldLabel}>Duration (s)</div>
                <input
                  type="number"
                  min={0.1}
                  max={5}
                  step={0.1}
                  value={transitions[selected!].duration}
                  onChange={(e) => updateTransition(selected!, 'duration', Number(e.target.value))}
                  className={fieldInput}
                />
              </div>
            </div>
          )}
          <button onClick={() => removeClip(selected!)} className="text-xs text-red-400 hover:text-red-300">
            Remove clip
          </button>
        </div>
      ) : (
        <p className="text-xs text-gray-600">Select a clip in the strip to trim it or set its transition.</p>
      )}
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );

  return (
    <EditorShell title="Merge Videos" toolbar={toolbar} inspector={inspector} stageClassName="!items-stretch !justify-start flex-col">
      {clips.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-gray-500 text-sm">
          Add up to 6 video clips to merge them with transitions.
        </div>
      ) : (
        <div className="w-full">
          {/* Filmstrip */}
          <div className="flex items-stretch gap-1 overflow-x-auto pb-4">
            {clips.map((clip, idx) => (
              <React.Fragment key={idx}>
                <button
                  onClick={() => setSelected(idx)}
                  className={`flex-shrink-0 w-40 h-24 rounded-lg border flex flex-col items-center justify-center gap-1 transition-colors ${
                    selected === idx
                      ? 'border-designerAccent bg-designerAccent/15 text-white'
                      : 'border-newBorder bg-newBgColorInner text-gray-400 hover:bg-boxHover'
                  }`}
                >
                  <span className="text-2xl">🎬</span>
                  <span className="text-xs">Clip {idx + 1}</span>
                  {(clip.trimStart != null || clip.trimEnd != null) && (
                    <span className="text-[10px] text-gray-500">
                      {clip.trimStart ?? 0}s–{clip.trimEnd ?? '∞'}s
                    </span>
                  )}
                </button>
                {idx < clips.length - 1 && (
                  <div className="flex-shrink-0 flex flex-col items-center justify-center w-16 text-center">
                    <span className="text-gray-600 text-lg">⟶</span>
                    <span className="text-[9px] text-gray-500">{transitions[idx]?.type || 'fade'}</span>
                  </div>
                )}
              </React.Fragment>
            ))}
          </div>

          {/* Preview / status */}
          {running && !isComplete && (
            <div className="flex items-center gap-2 mt-2">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-designerAccent" />
              <span className="text-sm text-gray-400">Processing merge…</span>
            </div>
          )}
          {isComplete && jobData?.result?.urls && (
            <div className="flex flex-col gap-2 mt-2 max-w-xl">
              <VideoPlayer src={jobData.result.urls[0]} />
              <button onClick={openInFiles} className={`${toolbarBtn} self-start`}>
                Open in Files
              </button>
            </div>
          )}
        </div>
      )}
    </EditorShell>
  );
}
