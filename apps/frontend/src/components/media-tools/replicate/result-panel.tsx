'use client';

import React, { useEffect, useRef, useCallback, useState } from 'react';
import useSWR from 'swr';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useReplicateStore } from './replicate.store';
import { AudioPlayer } from './players/audio-player';
import { VideoPlayer } from './players/video-player';

function useJobPoll(jobId: string | null) {
  const fetch = useFetch();
  return useSWR(
    jobId ? `replicate-job-${jobId}` : null,
    async () => {
      const res = await fetch(`/media/replicate/jobs/${jobId}`);
      return (await res.json()) as { status: string; result: { kind: string; urls: string[] } | null };
    },
    { refreshInterval: 6000 }
  );
}

function downloadBlob(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function generateSrt(segments: Array<{ text: string; start?: number; end?: number }>): string {
  return segments
    .map((seg, i) => {
      const start = seg.start ?? 0;
      const end = seg.end ?? start + 1;
      const format = (s: number) => {
        const h = Math.floor(s / 3600);
        const m = Math.floor((s % 3600) / 60);
        const sec = Math.floor(s % 60);
        const ms = Math.floor((s % 1) * 1000);
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
      };
      return `${i + 1}\n${format(start)} --> ${format(end)}\n${seg.text}\n`;
    })
    .join('\n');
}

export function ResultPanel() {
  const store = useReplicateStore();
  // Stable action/value selectors for the polling effect below. Depending on the
  // whole `store` object (which changes identity on every state update) made this
  // effect re-run forever after a job completed (Maximum update depth exceeded).
  const setResult = useReplicateStore((s) => s.setResult);
  const setRunState = useReplicateStore((s) => s.setRunState);
  const setError = useReplicateStore((s) => s.setError);
  const resultJobId = useReplicateStore((s) => s.result?.jobId);
  const fetch = useFetch();
  const [saving, setSaving] = useState(false);
  const [savedFileId, setSavedFileId] = useState<string | null>(null);
  const [savedPaths, setSavedPaths] = useState<Record<string, string>>({});

  const isPolling = store.runState === 'running' && store.result?.jobId;
  const { data: jobData } = useJobPoll(isPolling ? store.result!.jobId! : null);

  useEffect(() => {
    if (jobData?.status === 'completed' && jobData.result) {
      setResult({
        kind: jobData.result.kind as 'image' | 'video' | 'audio' | 'text',
        urls: jobData.result.urls,
        jobId: resultJobId,
      });
      setRunState('success');
    }
    if (jobData?.status === 'failed') {
      setError('Generation failed');
      setRunState('error');
    }
  }, [jobData, setResult, setRunState, setError, resultJobId]);

  const handleSaveToFiles = useCallback(async (url: string) => {
    setSaving(true);
    try {
      const res = await fetch('/media/replicate/save-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url,
          name: `replicate-${Date.now()}`,
          folderId: store.saveFolderId,
        }),
      });
      const data = await res.json();
      setSavedFileId(data.id);
      if (data.path) {
        setSavedPaths((prev) => ({ ...prev, [url]: data.path }));
      }
    } catch (err) {
      store.setError('Failed to save to Files');
    } finally {
      setSaving(false);
    }
  }, [fetch, store]);

  const handleOpenDesigner = useCallback((url: string) => {
    const storedUrl = savedPaths[url] || url;
    const params = new URLSearchParams({ url: storedUrl, type: 'photo', w: '', h: '' });
    window.open(`/media/designer?${params.toString()}`, '_blank');
  }, [savedPaths]);

  const handleOpenInFiles = useCallback((url: string) => {
    const folderId = store.saveFolderId;
    const target = folderId ? `/files?folderId=${encodeURIComponent(folderId)}` : '/files';
    window.open(target, '_blank');
  }, [store.saveFolderId]);

  const handleCopyTranscript = useCallback((text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      // Could add a toast here
    });
  }, []);

  const handleDownloadTxt = useCallback((text: string) => {
    downloadBlob(text, 'transcript.txt', 'text/plain');
  }, []);

  const handleDownloadSrt = useCallback((segments?: Array<{ text: string; start?: number; end?: number }>, text?: string) => {
    if (segments && segments.length > 0) {
      downloadBlob(generateSrt(segments), 'transcript.srt', 'text/plain');
    } else if (text) {
      downloadBlob(text, 'transcript.txt', 'text/plain');
    }
  }, []);

  const handleGenerate = useCallback(async () => {
    const model = store.selectedModel;
    if (!model) return;

    const category = store.selectedCategory;
    if (!category) return;

    // Required field validation
    const inputSchema = store.selectedModel?.inputSchema as { required?: string[]; properties?: Record<string, unknown> } | undefined;
    const requiredFields = inputSchema?.required || [];
    const missing = requiredFields.filter((field) => {
      const value = store.formInput[field];
      if (value === undefined || value === null || value === '') return true;
      if (typeof value === 'object' && !Array.isArray(value)) {
        const obj = value as Record<string, unknown>;
        return !obj.fileId && !obj.url;
      }
      return false;
    });
    if (missing.length > 0) {
      store.setError(`Missing required fields: ${missing.join(', ')}`);
      store.setRunState('error');
      return;
    }

    // Map category to endpoint (see plan §3 mapping table)
    const syncCategories = ['text-to-image', 'image-to-image', 'background-remove', 'upscale', 'inpaint', 'stt'];
    const asyncCategories = ['restore', 'text-to-video', 'image-to-video', 'video-to-video', 'video-upscale', 'caption', 'tts', 'text-to-music', 'music-to-music', 'voice-clone'];
    const localCategories = ['meme', 'merge'];

    store.setRunState('running');
    store.setError(null);
    store.setResult(null);

    try {
      if (localCategories.includes(category)) {
        // Meme and merge are handled by their own editors
        return;
      }

      let endpoint: string;
      let operation: string;

      if (syncCategories.includes(category)) {
        endpoint = '/run/sync';
        operation = category === 'stt' ? 'stt' : 'image';
      } else if (asyncCategories.includes(category)) {
        endpoint = '/run/async';
        operation = category === 'restore' ? 'image'
          : ['text-to-video', 'image-to-video', 'video-to-video', 'video-upscale', 'caption'].includes(category) ? 'video'
          : 'audio';
      } else {
        throw new Error('Unknown category');
      }

      const res = await fetch(`/media/replicate${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          modelId: model.id,
          versionId: model.versionId || undefined,
          input: store.formInput,
          operation,
          folderId: store.saveFolderId,
        }),
      });

      const data = await res.json();

      if (data.status === 'succeeded') {
        store.setResult(data);
        store.setRunState('success');
        store.addToHistory({ jobId: data.jobId || '', modelId: model.id });
      } else if (data.jobId) {
        store.setResult({ kind: 'image', urls: [], jobId: data.jobId });
        // Stay in 'running' — poll will update
        store.addToHistory({ jobId: data.jobId, modelId: model.id });
      } else {
        throw new Error(data.error || 'Generation failed');
      }
    } catch (err: any) {
      store.setError(err.message || 'Generation failed');
      store.setRunState('error');
    }
  }, [store, fetch]);

  const isFormReady = store.selectedModel && store.selectedCategory;
  const needsFolder = store.selectedCategory && ['text-to-video', 'image-to-video', 'video-to-video', 'video-upscale', 'caption', 'tts', 'text-to-music', 'music-to-music', 'voice-clone', 'restore'].includes(store.selectedCategory);

  return (
    <div className="w-full">
      {/* State: idle */}
      {store.runState === 'idle' && (
        <div className="flex flex-col items-center gap-3">
          {store.selectedModel?.coverImageUrl && (
            <img
              src={store.selectedModel.coverImageUrl}
              alt="Example output"
              className="w-full max-w-xs rounded-xl opacity-50"
            />
          )}
          {isFormReady && (
            <>
              {needsFolder && !store.saveFolderId && (
                <p className="text-xs text-yellow-400">Select a save folder before generating</p>
              )}
              <button
                onClick={handleGenerate}
                disabled={needsFolder && !store.saveFolderId}
                className="px-6 py-2.5 rounded-xl bg-designerAccent text-white font-medium hover:bg-designerAccent/80 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Generate
              </button>
            </>
          )}
        </div>
      )}

      {/* State: running */}
      {store.runState === 'running' && (
        <div className="flex flex-col items-center gap-3">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-designerAccent" />
          <p className="text-sm text-gray-400">
            {store.result?.jobId ? 'Processing...' : 'Generating...'}
          </p>
        </div>
      )}

      {/* State: success */}
      {store.runState === 'success' && store.result && (
        <div className="flex flex-col gap-3">
          {store.selectedCategory === 'caption' && (
            <p className="text-xs text-gray-400">
              Burns captions into your video — the output is an MP4, not a subtitle file.
            </p>
          )}

          {/* Image result */}
          {store.result.kind === 'image' && store.result.urls && store.result.urls.length > 0 && (
            <div className="flex flex-col gap-2">
              {store.result.urls.length > 1 ? (
                <div className="grid grid-cols-2 gap-2">
                  {store.result.urls.map((url, i) => (
                    <div key={i} className="flex flex-col gap-2">
                      <img src={url} alt={`Result ${i + 1}`} className="w-full rounded-xl" />
                      <div className="flex gap-2">
                        {!store.result?.jobId ? (
                          <button
                            onClick={() => handleSaveToFiles(url)}
                            disabled={saving}
                            className="px-3 py-1.5 rounded-lg bg-gray-800 text-white text-xs hover:bg-gray-700 transition-colors"
                          >
                            {saving ? 'Saving...' : 'Save to Files'}
                          </button>
                        ) : (
                          <button
                            onClick={() => handleOpenInFiles(url)}
                            className="px-3 py-1.5 rounded-lg bg-gray-800 text-white text-xs hover:bg-gray-700 transition-colors"
                          >
                            Open in Files
                          </button>
                        )}
                        <button
                          onClick={() => handleOpenDesigner(url)}
                          className="px-3 py-1.5 rounded-lg bg-designerAccent/20 text-designerAccent text-xs hover:bg-designerAccent/30 transition-colors"
                        >
                          Open in Designer
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <>
                  <img src={store.result.urls[0]} alt="Result" className="w-full max-w-md rounded-xl" />
                  <div className="flex gap-2">
                    {!store.result.jobId ? (
                      // Inline-sync: raw Replicate URL, not yet in Files → Save to Files
                      <button
                        onClick={() => handleSaveToFiles(store.result!.urls![0])}
                        disabled={saving}
                        className="px-3 py-1.5 rounded-lg bg-gray-800 text-white text-xs hover:bg-gray-700 transition-colors"
                      >
                        {savedFileId ? 'Saved!' : saving ? 'Saving...' : 'Save to Files'}
                      </button>
                    ) : (
                      // Job-completed: already in Files → Open in Files
                      <button
                        onClick={() => handleOpenInFiles(store.result!.urls![0])}
                        className="px-3 py-1.5 rounded-lg bg-gray-800 text-white text-xs hover:bg-gray-700 transition-colors"
                      >
                        Open in Files
                      </button>
                    )}
                    <button
                      onClick={() => handleOpenDesigner(store.result!.urls![0])}
                      className="px-3 py-1.5 rounded-lg bg-designerAccent/20 text-designerAccent text-xs hover:bg-designerAccent/30 transition-colors"
                    >
                      Open in Designer
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Video result */}
          {store.result.kind === 'video' && store.result.urls && store.result.urls.length > 0 && (
            <div className="flex flex-col gap-2">
              <VideoPlayer src={store.result.urls[0]} />
              <button
                onClick={() => handleOpenInFiles(store.result!.urls![0])}
                className="px-3 py-1.5 rounded-lg bg-gray-800 text-white text-xs hover:bg-gray-700 transition-colors self-start"
              >
                Open in Files
              </button>
            </div>
          )}

          {/* Audio result */}
          {store.result.kind === 'audio' && store.result.urls && store.result.urls.length > 0 && (
            <div className="flex flex-col gap-2">
              <AudioPlayer src={store.result.urls[0]} />
              <button
                onClick={() => handleOpenInFiles(store.result!.urls![0])}
                className="px-3 py-1.5 rounded-lg bg-gray-800 text-white text-xs hover:bg-gray-700 transition-colors self-start"
              >
                Open in Files
              </button>
            </div>
          )}

          {/* Text result (STT) */}
          {store.result.kind === 'text' && store.result.text && (
            <div className="flex flex-col gap-2">
              <div className="p-3 rounded-lg bg-newBgColorInner border border-newBorder max-h-40 overflow-y-auto">
                <p className="text-sm text-white whitespace-pre-wrap">{store.result.text}</p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => handleCopyTranscript(store.result!.text!)}
                  className="px-3 py-1.5 rounded-lg bg-gray-800 text-white text-xs hover:bg-gray-700 transition-colors"
                >
                  Copy
                </button>
                <button
                  onClick={() => handleDownloadTxt(store.result!.text!)}
                  className="px-3 py-1.5 rounded-lg bg-gray-800 text-white text-xs hover:bg-gray-700 transition-colors"
                >
                  Download .txt
                </button>
                <button
                  onClick={() => handleDownloadSrt(store.result!.segments, store.result!.text)}
                  className="px-3 py-1.5 rounded-lg bg-gray-800 text-white text-xs hover:bg-gray-700 transition-colors"
                >
                  Download .srt
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* State: error */}
      {store.runState === 'error' && (
        <div className="flex flex-col items-center gap-3">
          <p className="text-sm text-red-400">{store.error || 'An error occurred'}</p>
          <button
            onClick={handleGenerate}
            className="px-4 py-1.5 rounded-lg bg-gray-800 text-white text-xs hover:bg-gray-700 transition-colors"
          >
            Retry
          </button>
        </div>
      )}
    </div>
  );
}
