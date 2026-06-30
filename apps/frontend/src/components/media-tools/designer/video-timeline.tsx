'use client';

import React, { FC, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { VideoClip, VideoTrack, VideoOutput } from './designer.store';
import { VideoPreviewEngine } from './video-preview';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { useModals } from '@gitroom/frontend/components/layout/new-modal';
import { useMediaToolsStatus } from '@gitroom/frontend/components/layout/use-media-tools-status';
import { VoiceoverDialog } from './voiceover-dialog';

interface VideoTimelineProps {
  store: ReturnType<typeof import('./designer.store').createDesignerStore>;
  sendTimelineAwareness?: (playheadMs: number, selectedClipId: string | null) => void;
}

const TRACK_HEIGHT = 36;
const TRACK_GAP = 4;
const RULER_HEIGHT = 22;
const LABEL_WIDTH = 64;
const MS_PER_PIXEL_DEFAULT = 4;
const SNAP_THRESHOLD_MS = 80;

const TRACK_COLORS: Record<VideoTrack['type'], string> = {
  video: '#4F46E5',
  image: '#059669',
  text: '#D97706',
  caption: '#22C55E',
  audio: '#DC2626',
  sticker: '#9333EA',
};

const TRANSITION_LABELS: Record<string, string> = {
  cut: 'Cut',
  fade: 'Fade',
  dissolve: 'Dissolve',
  slide: 'Slide',
};

const formatTime = (ms: number): string => {
  const totalSec = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSec / 60);
  const seconds = totalSec % 60;
  const millis = Math.floor((ms % 1000) / 10);
  return `${minutes}:${String(seconds).padStart(2, '0')}.${String(millis).padStart(2, '0')}`;
};

const audioContextSingleton =
  typeof window !== 'undefined'
    ? new (window.AudioContext || (window as any).webkitAudioContext)()
    : null;

const waveformCache = new Map<string, number[]>();

async function fetchWaveform(src: string, barCount: number): Promise<number[]> {
  const key = `${src}#${barCount}`;
  const cached = waveformCache.get(key);
  if (cached) return cached;

  const bars = new Array(barCount).fill(0.1);
  try {
    const res = await fetch(src);
    if (!res.ok) throw new Error('fetch failed');
    const arrayBuffer = await res.arrayBuffer();
    const ctx = audioContextSingleton;
    if (!ctx) throw new Error('no audio context');
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
    const channel = audioBuffer.getChannelData(0);
    const step = Math.max(1, Math.floor(channel.length / barCount));
    let max = 0;
    for (let i = 0; i < barCount; i++) {
      let peak = 0;
      const start = i * step;
      const end = Math.min(start + step, channel.length);
      for (let j = start; j < end; j++) {
        const v = Math.abs(channel[j]);
        if (v > peak) peak = v;
      }
      bars[i] = peak;
      if (peak > max) max = peak;
    }
    if (max > 0) {
      for (let i = 0; i < barCount; i++) bars[i] /= max;
    }
  } catch {
    // Leave uniform low bars on failure.
  }
  waveformCache.set(key, bars);
  return bars;
}

function useWaveform(src: string | undefined, barCount: number): number[] | null {
  const [bars, setBars] = useState<number[] | null>(null);
  useEffect(() => {
    if (!src) return;
    let cancelled = false;
    fetchWaveform(src, barCount).then((b) => {
      if (!cancelled) setBars(b);
    });
    return () => {
      cancelled = true;
    };
  }, [src, barCount]);
  return bars;
}

const WaveformBars: FC<{ src: string | undefined; width: number }> = ({ src, width }) => {
  const barCount = Math.max(6, Math.floor(width / 6));
  const bars = useWaveform(src, barCount);
  if (!bars) {
    return (
      <>
        {Array.from({ length: barCount }).map((_, i) => (
          <div
            key={i}
            className="flex-1 bg-white/70 rounded-sm"
            style={{ height: `${20 + ((i * 7) % 80)}%` }}
          />
        ))}
      </>
    );
  }
  return (
    <>
      {bars.map((h, i) => (
        <div
          key={i}
          className="flex-1 bg-white/70 rounded-sm"
          style={{ height: `${Math.max(4, h * 100)}%` }}
        />
      ))}
    </>
  );
};

export const VideoTimeline: FC<VideoTimelineProps> = ({ store, sendTimelineAwareness }) => {
  // Voiceover (TTS) and Captions (STT) hit media-provider endpoints — gate them on the
  // shared status so we don't offer a generation the org has no provider for (it would
  // 409). Optimistic while loading / fail-open on error.
  const { operationAvailable } = useMediaToolsStatus();
  const ttsAvailable = operationAvailable('tts');
  const sttAvailable = operationAvailable('stt');
  const doc = store((s) => s.doc);
  const currentOutput = store((s) => s.currentOutput);
  const playheadMs = store((s) => s.playheadMs);
  const selectedClip = store((s) => s.selectedClip);
  const setPlayhead = useCallback(
    (ms: number) => store.getState().setPlayhead(ms),
    [store],
  );
  const setSelectedClip = useCallback(
    (clip: { outputIndex: number; trackId: string; clipId: string } | null) =>
      store.getState().setSelectedClip(clip),
    [store],
  );

  const [zoomPxPerMs, setZoomPxPerMs] = useState(1 / MS_PER_PIXEL_DEFAULT);
  const [isPlaying, setIsPlaying] = useState(false);
  const [dragging, setDragging] = useState<{
    trackId: string;
    clipId: string;
    edge: 'start' | 'end' | 'move';
    startX: number;
    origStart: number;
    origEnd: number;
  } | null>(null);
  const [transitionPopover, setTransitionPopover] = useState<{
    trackId: string;
    fromClipId: string;
    toClipId: string;
    x: number;
    y: number;
  } | null>(null);
  const [trackSettings, setTrackSettings] = useState<{
    trackId: string;
    x: number;
    y: number;
  } | null>(null);
  const [dragOverTrackId, setDragOverTrackId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const previewRef = useRef<VideoPreviewEngine | null>(null);
  const timelineRef = useRef<HTMLDivElement>(null);

  const fetch = useFetch();
  const toaster = useToaster();
  const modals = useModals();

  const vo = doc.outputs[currentOutput] as VideoOutput | undefined;
  const isVideo = doc.mode === 'video' && !!vo;

  const pixelsPerMs = zoomPxPerMs;
  const totalPixels = isVideo ? vo.durationMs * pixelsPerMs : 0;

  const sortedTrackClips = useMemo(() => {
    if (!isVideo || !vo) return {};
    const map: Record<string, VideoClip[]> = {};
    for (const track of vo.tracks) {
      map[track.id] = [...track.clips].sort((a, b) => a.startMs - b.startMs);
    }
    return map;
  }, [isVideo, vo]);

  const sortedAdjacentPairs = useMemo(() => {
    if (!isVideo || !vo) return {};
    const pairs: Record<string, { from: VideoClip; to: VideoClip }[]> = {};
    for (const track of vo.tracks) {
      const sorted = sortedTrackClips[track.id] || [];
      const trackPairs: { from: VideoClip; to: VideoClip }[] = [];
      for (let i = 0; i < sorted.length - 1; i++) {
        trackPairs.push({ from: sorted[i], to: sorted[i + 1] });
      }
      pairs[track.id] = trackPairs;
    }
    return pairs;
  }, [isVideo, vo, sortedTrackClips]);

  const rulerMarks = useMemo(() => {
    if (!isVideo) return [];
    const marks: { ms: number; label: string; major: boolean }[] = [];
    const stepMs = pixelsPerMs > 0.5 ? 250 : pixelsPerMs > 0.2 ? 500 : 1000;
    for (let t = 0; t <= vo.durationMs; t += stepMs) {
      marks.push({
        ms: t,
        label: t % 1000 === 0 ? `${t / 1000}s` : t % 500 === 0 ? `.${t / 500 * 5}` : '',
        major: t % 1000 === 0,
      });
    }
    return marks;
  }, [isVideo, vo, pixelsPerMs]);

  const scrollToPlayhead = useCallback(() => {
    if (!scrollRef.current) return;
    const playheadPx = playheadMs * pixelsPerMs - 200;
    scrollRef.current.scrollLeft = Math.max(0, playheadPx);
  }, [playheadMs, pixelsPerMs]);

  const handlePlayPause = useCallback(() => {
    if (!isVideo || !vo) return;
    if (isPlaying) {
      previewRef.current?.pause();
      setIsPlaying(false);
      return;
    }
    if (!previewRef.current) {
      previewRef.current = new VideoPreviewEngine(store);
    }
    previewRef.current.play({
      onTick: (ms) => {
        setPlayhead(ms);
      },
      onEnd: () => {
        setIsPlaying(false);
      },
    });
    setIsPlaying(true);
    scrollToPlayhead();
  }, [isVideo, vo, isPlaying, store, setPlayhead, scrollToPlayhead]);

  useEffect(() => {
    return () => {
      previewRef.current?.pause();
      previewRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (isPlaying) scrollToPlayhead();
  }, [playheadMs, isPlaying, scrollToPlayhead]);

  const handleRulerClick = useCallback(
    (e: React.MouseEvent) => {
      if (!scrollRef.current) return;
      const rect = scrollRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left + scrollRef.current.scrollLeft - LABEL_WIDTH;
      const ms = Math.max(0, Math.min(vo?.durationMs ?? 60000, x / pixelsPerMs));
      setPlayhead(ms);
      if (previewRef.current) previewRef.current.seek(ms);
    },
    [pixelsPerMs, setPlayhead, vo?.durationMs],
  );

  const handleZoomIn = useCallback(() => {
    setZoomPxPerMs((z) => Math.min(z * 1.5, 4));
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoomPxPerMs((z) => Math.max(z / 1.5, 0.01));
  }, []);

  const handleClipMouseDown = useCallback(
    (e: React.MouseEvent, trackId: string, clip: VideoClip, edge: 'start' | 'end' | 'move') => {
      e.stopPropagation();
      setDragging({
        trackId,
        clipId: clip.id,
        edge,
        startX: e.clientX,
        origStart: clip.startMs,
        origEnd: clip.endMs,
      });
      setSelectedClip({ outputIndex: currentOutput, trackId, clipId: clip.id });
    },
    [currentOutput, setSelectedClip],
  );

  useEffect(() => {
    if (!dragging || !isVideo || !vo) return;

    const trackAtY = (clientY: number): VideoTrack | undefined => {
      if (!timelineRef.current) return undefined;
      const rect = timelineRef.current.getBoundingClientRect();
      const tracksTop = rect.top + RULER_HEIGHT;
      const relY = clientY - tracksTop + (scrollRef.current?.scrollTop ?? 0);
      const idx = Math.floor(relY / (TRACK_HEIGHT + TRACK_GAP));
      if (idx < 0 || idx >= vo.tracks.length) return undefined;
      return vo.tracks[idx];
    };

    const snapEdges = (value: number, excludeClipId: string): number => {
      const snapCandidates: number[] = [0, vo.durationMs];
      for (const t of vo.tracks) {
        for (const c of t.clips) {
          if (c.id === excludeClipId) continue;
          snapCandidates.push(c.startMs, c.endMs + (c.freezeAtMs || 0));
        }
      }
      const threshold = SNAP_THRESHOLD_MS / pixelsPerMs;
      let best = value;
      let bestDelta = threshold;
      for (const target of snapCandidates) {
        const delta = Math.abs(target - value);
        if (delta < bestDelta) {
          bestDelta = delta;
          best = target;
        }
      }
      return best;
    };

    const handleMouseMove = (e: MouseEvent) => {
      const hovered = trackAtY(e.clientY);
      setDragOverTrackId(hovered?.id ?? null);

      const dx = (e.clientX - dragging.startX) / pixelsPerMs;
      setDragging((prev) => {
        if (!prev) return null;
        let { origStart, origEnd } = prev;
        const duration = origEnd - origStart;

        if (prev.edge === 'move') {
          origStart = Math.max(0, Math.min(vo.durationMs - duration, origStart + dx));
          origEnd = origStart + duration;
        } else if (prev.edge === 'start') {
          origStart = Math.max(0, Math.min(origEnd - 100, origStart + dx));
        } else {
          origEnd = Math.max(origStart + 100, Math.min(vo.durationMs, origEnd + dx));
        }

        origStart = snapEdges(origStart, prev.clipId);
        if (prev.edge !== 'start') {
          origEnd = snapEdges(origEnd, prev.clipId);
        }

        store.getState().updateClip(currentOutput, prev.trackId, prev.clipId, {
          startMs: Math.round(origStart),
          endMs: Math.round(origEnd),
        });

        return { ...prev, origStart, origEnd };
      });
    };

    const handleMouseUp = (e: MouseEvent) => {
      const hovered = trackAtY(e.clientY);
      setDragging(null);
      setDragOverTrackId(null);
      if (hovered && hovered.id !== dragging.trackId) {
        const clip = vo.tracks
          .find((t) => t.id === dragging.trackId)
          ?.clips.find((c) => c.id === dragging.clipId);
        if (clip) {
          store.getState().removeClip(currentOutput, dragging.trackId, dragging.clipId);
          store.getState().addClip(currentOutput, hovered.id, clip);
        }
      }
      store.getState().pushHistory();
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [dragging, isVideo, vo, pixelsPerMs, store, currentOutput]);

  const handleFreezeFrame = useCallback(
    (trackId: string, clipId: string) => {
      const state = store.getState();
      const vo = state.doc.outputs[currentOutput] as VideoOutput | undefined;
      if (!vo) return;

      const track = vo.tracks.find((t) => t.id === trackId);
      const idx = track?.clips.findIndex((c) => c.id === clipId);
      if (idx == null || idx < 0 || !track) return;

      const original = track.clips[idx];
      const freezeDuration = 2000;
      const splitPoint = Math.max(original.startMs + 100, Math.min(original.endMs - 100, playheadMs));

      if (splitPoint <= original.startMs || splitPoint >= original.endMs) return;

      (globalThis as any)._clipCounter = ((globalThis as any)._clipCounter || 0) + 1;
      const ctr = (globalThis as any)._clipCounter;

      const first: VideoClip = {
        ...original,
        id: `el-${Date.now()}-${ctr}`,
        endMs: splitPoint,
      };
      const freeze: VideoClip = {
        id: `el-${Date.now()}-${ctr + 1}`,
        startMs: splitPoint,
        endMs: splitPoint + freezeDuration,
        src: original.src,
        fileId: original.fileId,
        x: original.x,
        y: original.y,
        width: original.width,
        height: original.height,
        rotation: original.rotation,
        opacity: original.opacity,
        naturalWidth: original.naturalWidth,
        naturalHeight: original.naturalHeight,
        speed: 0,
      };
      const second: VideoClip = {
        ...original,
        id: `el-${Date.now()}-${ctr + 2}`,
        startMs: splitPoint + freezeDuration,
        trimInMs: original.trimInMs ? original.trimInMs + (splitPoint - original.startMs) : undefined,
      };

      const clips = [...track.clips];
      clips.splice(idx, 1, first, freeze, second);
      const updated: VideoOutput = {
        ...vo,
        tracks: vo.tracks.map((t) => (t.id === trackId ? { ...t, clips } : t)),
      };
      const outs = [...state.doc.outputs];
      outs[currentOutput] = updated;
      store.setState({ doc: { ...state.doc, outputs: outs }, isDirty: true });
      store.getState().pushHistory();
    },
    [store, currentOutput, playheadMs],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!isVideo || !vo) return;

      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedClip && selectedClip.outputIndex === currentOutput) {
          store.getState().removeClip(currentOutput, selectedClip.trackId, selectedClip.clipId);
          setSelectedClip(null);
        }
      } else if (e.key === ' ' && !(e.target as HTMLElement)?.matches?.('input,textarea')) {
        e.preventDefault();
        handlePlayPause();
      } else if (e.key === 's' && e.ctrlKey && selectedClip && selectedClip.outputIndex === currentOutput) {
        e.preventDefault();
        store.getState().splitClip(currentOutput, selectedClip.trackId, selectedClip.clipId, playheadMs);
      } else if (e.key === 'f' && e.ctrlKey && selectedClip && selectedClip.outputIndex === currentOutput) {
        e.preventDefault();
        handleFreezeFrame(selectedClip.trackId, selectedClip.clipId);
      }
    },
    [isVideo, vo, selectedClip, store, currentOutput, playheadMs, handlePlayPause, setSelectedClip, handleFreezeFrame],
  );

  const isSelected = useCallback(
    (trackId: string, clipId: string) =>
      selectedClip?.outputIndex === currentOutput &&
      selectedClip?.trackId === trackId &&
      selectedClip?.clipId === clipId,
    [selectedClip, currentOutput],
  );

  const activeSelected = selectedClip?.outputIndex === currentOutput ? selectedClip : null;

  useEffect(() => {
    if (sendTimelineAwareness) {
      sendTimelineAwareness(playheadMs, activeSelected?.clipId ?? null);
    }
  }, [playheadMs, activeSelected?.clipId, sendTimelineAwareness]);

  const handleClipContextMenu = useCallback(
    (e: React.MouseEvent, trackId: string, clipId: string) => {
      e.preventDefault();
      e.stopPropagation();
      setSelectedClip({ outputIndex: currentOutput, trackId, clipId: clipId });
    },
    [currentOutput, setSelectedClip],
  );

  const handleSetTransition = useCallback(
    (trackId: string, fromClipId: string, toClipId: string, type: 'cut' | 'fade' | 'dissolve' | 'slide', direction?: 'left' | 'right' | 'up' | 'down') => {
      const state = store.getState();
      const durationMs = type === 'cut' ? 0 : 500;
      state.updateClip(currentOutput, trackId, fromClipId, {
        transitionOut: { type, durationMs, direction },
      });
      state.updateClip(currentOutput, trackId, toClipId, {
        transitionIn: { type, durationMs, direction },
      });
      setTransitionPopover(null);
      store.getState().pushHistory();
    },
    [store, currentOutput],
  );

  const generateVoiceover = useCallback(
    async (text: string, voiceId: string) => {
      if (!vo) return;
      try {
        const res = await fetch('/media/text-to-speech', {
          method: 'POST',
          body: JSON.stringify({ text, voice: voiceId }),
        });
        if (!res.ok) {
          toaster.show('Voiceover generation failed', 'warning');
          return;
        }
        const { id, path } = await res.json();
        const state = store.getState();
        const currentVo = state.doc.outputs[currentOutput] as VideoOutput;
        let audioTrack = currentVo.tracks.find((t) => t.type === 'audio');
        if (!audioTrack) {
          state.addTrack(currentOutput, 'audio');
          audioTrack = (store.getState().doc.outputs[currentOutput] as VideoOutput).tracks.find((t) => t.type === 'audio');
        }
        if (!audioTrack) return;
        const durationMs = 5000;
        const clip: VideoClip = {
          id: `clip-${Date.now()}`,
          startMs: playheadMs,
          endMs: Math.min(playheadMs + durationMs, vo.durationMs),
          src: path,
          fileId: id,
          volume: 1,
        } as VideoClip;
        store.getState().addClip(currentOutput, audioTrack.id, clip);
        store.getState().pushHistory();
        toaster.show('Voiceover added to timeline', 'success');
      } catch {
        toaster.show('Voiceover generation failed', 'warning');
      }
    },
    [vo, playheadMs, currentOutput, store, fetch, toaster]
  );

  const handleGenerateVoiceover = useCallback(() => {
    if (!vo) return;
    modals.openModal({
      children: (
        <VoiceoverDialog
          onClose={() => modals.closeAll()}
          onGenerate={generateVoiceover}
        />
      ),
    });
  }, [vo, modals, generateVoiceover]);

  const handleGenerateCaptions = useCallback(async () => {
    if (!vo) return;
    const audioClips = vo.tracks
      .filter((t) => t.type === 'audio')
      .flatMap((t) => t.clips)
      .filter((c) => c.src);
    if (audioClips.length === 0) {
      toaster.show('No audio clips to transcribe', 'warning');
      return;
    }
    const src = audioClips[0].src;
    try {
      const res = await fetch('/media/speech-to-text-words', {
        method: 'POST',
        body: JSON.stringify({ audioUrl: src }),
      });
      if (!res.ok) {
        toaster.show('Caption generation failed', 'warning');
        return;
      }
      const { words } = await res.json() as { words?: { word: string; start: number; end: number }[] };
      if (!words?.length) {
        toaster.show('No speech detected', 'warning');
        return;
      }
      const state = store.getState();
      const currentVo = state.doc.outputs[currentOutput] as VideoOutput;
      let captionTrack = currentVo.tracks.find((t) => t.type === 'caption');
      if (!captionTrack) {
        state.addTrack(currentOutput, 'caption');
        captionTrack = (store.getState().doc.outputs[currentOutput] as VideoOutput).tracks.find((t) => t.type === 'caption');
      }
      if (!captionTrack) return;
      const audioStart = audioClips[0].startMs;

      // Group words into sentence/phrase chunks so each caption clip carries
      // per-word timing instead of flattening to separate text clips.
      const phrases: { word: string; start: number; end: number }[][] = [];
      let current: { word: string; start: number; end: number }[] = [];
      const maxWordsPerCaption = 6;
      for (const w of words) {
        current.push(w);
        const endsPhrase = /[.!?]$/.test(w.word) || current.length >= maxWordsPerCaption;
        if (endsPhrase) {
          phrases.push(current);
          current = [];
        }
      }
      if (current.length) phrases.push(current);

      for (const phrase of phrases) {
        const phraseStartRel = Math.round(phrase[0].start * 1000);
        const phraseEndRel = Math.round(phrase[phrase.length - 1].end * 1000);
        const startMs = audioStart + phraseStartRel;
        const endMs = audioStart + phraseEndRel;
        if (endMs > vo.durationMs) break;
        const text = phrase.map((w) => w.word).join(' ');
        const wordsTiming = phrase.map((w) => ({
          word: w.word,
          startMs: Math.round(w.start * 1000) - phraseStartRel,
          endMs: Math.round(w.end * 1000) - phraseStartRel,
        }));
        const clip: VideoClip = {
          id: `clip-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          startMs,
          endMs,
          text,
          words: wordsTiming,
          fontFamily: 'Arial',
          fontSize: 28,
          fontWeight: 700,
          fill: '#ffffff',
          x: (vo.width - 300) / 2,
          y: vo.height - 120,
          width: 300,
          height: 70,
        };
        store.getState().addClip(currentOutput, captionTrack.id, clip);
      }
      store.getState().pushHistory();
      toaster.show('Captions added to timeline', 'success');
    } catch {
      toaster.show('Caption generation failed', 'warning');
    }
  }, [vo, currentOutput, store, fetch, toaster]);

  if (!isVideo || !vo) {
    return null;
  }

  return (
    <div
      ref={timelineRef}
      className="shrink-0 border-t border-newBorder bg-newBgColorInner flex flex-col"
      tabIndex={0}
      role="application"
      aria-label="Video timeline"
      onKeyDown={handleKeyDown}
    >
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-newBorder">
        <button
          onClick={handlePlayPause}
          className="w-7 h-7 flex items-center justify-center rounded text-textColor hover:bg-newColColor/30 text-[13px]"
          title={isPlaying ? 'Pause' : 'Play'}
          aria-label={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? '⏸' : '▶'}
        </button>
        <span className="text-[12px] text-textColor font-mono min-w-[70px] tabular-nums">
          {formatTime(playheadMs)}
        </span>
        <span className="text-[11px] text-textColor/40">
          / {formatTime(vo.durationMs)}
        </span>
        <div className="flex-1" />
        <button
          onClick={handleZoomOut}
          className="w-6 h-6 flex items-center justify-center rounded text-textColor/60 hover:text-textColor text-[13px]"
          title="Zoom out"
          aria-label="Zoom out"
        >
          &#x2212;
        </button>
        <button
          onClick={handleZoomIn}
          className="w-6 h-6 flex items-center justify-center rounded text-textColor/60 hover:text-textColor text-[13px]"
          title="Zoom in"
          aria-label="Zoom in"
        >
          +
        </button>
        <button
          onClick={() => store.getState().addTrack(currentOutput, 'video')}
          className="px-2 py-0.5 rounded text-[10px] border border-newBorder text-textColor/60 hover:text-textColor"
          title="Add video track"
        >
          + Track
        </button>
        <button
          onClick={handleGenerateVoiceover}
          disabled={!ttsAvailable}
          className="px-2 py-0.5 rounded text-[10px] border border-newBorder text-textColor/60 hover:text-textColor disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:text-textColor/60"
          title={
            ttsAvailable
              ? 'Generate AI voiceover'
              : 'Configure a text-to-speech provider in Settings → Media'
          }
        >
          Voiceover
        </button>
        <button
          onClick={handleGenerateCaptions}
          disabled={!sttAvailable}
          className="px-2 py-0.5 rounded text-[10px] border border-newBorder text-textColor/60 hover:text-textColor disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:text-textColor/60"
          title={
            sttAvailable
              ? 'Auto-generate captions from audio'
              : 'Configure a speech-to-text provider (e.g. Deepgram) in Settings → Media'
          }
        >
          Captions
        </button>
      </div>

      <div
        ref={scrollRef}
        className="flex-1 overflow-auto"
        style={{ maxHeight: 240 }}
      >
        <div style={{ position: 'relative', width: LABEL_WIDTH + totalPixels + 40, minWidth: '100%' }}>
          {/* Ruler */}
          <div
            className="sticky top-0 z-10 bg-newBgColorInner border-b border-newBorder/40"
            style={{ height: RULER_HEIGHT, marginLeft: LABEL_WIDTH }}
            onMouseDown={handleRulerClick}
          >
            <div className="relative h-full pointer-events-none">
              {rulerMarks.map((m) => (
                <div
                  key={m.ms}
                  className="absolute top-0"
                  style={{ left: m.ms * pixelsPerMs }}
                >
                  <div className={`w-px ${m.major ? 'h-full bg-textColor/30' : 'h-3 bg-textColor/15'}`} />
                  {m.label && (
                    <div className="text-[9px] text-textColor/40 mt-0.5 -translate-x-1/2 select-none">
                      {m.label}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Tracks */}
          {vo.tracks.map((track, ti) => {
            const trackPairs = sortedAdjacentPairs[track.id] || [];
            return (
            <div
              key={track.id}
              className={`flex items-stretch border-b border-newBorder/20 transition-colors ${
                dragOverTrackId === track.id ? 'bg-designerAccent/10' : ''
              }`}
              style={{ height: TRACK_HEIGHT + TRACK_GAP }}
            >
              {/* Track label */}
              <div
                className="flex flex-col items-end justify-center px-2 text-[10px] font-medium uppercase tracking-wider shrink-0 border-r border-newBorder/30 gap-0.5"
                style={{ width: LABEL_WIDTH }}
              >
                <span style={{ color: TRACK_COLORS[track.type] }}>
                  {track.type}
                </span>
                {track.type === 'audio' && (
                  <button
                    className="text-[9px] text-textColor/40 hover:text-textColor"
                    title="Track audio settings"
                    onClick={(e) => {
                      const rect = (e.target as HTMLElement).getBoundingClientRect();
                      setTrackSettings({ trackId: track.id, x: rect.left + rect.width / 2, y: rect.top });
                    }}
                  >
                    ⋮
                  </button>
                )}
              </div>

              {/* Track content area */}
              <div
                className="relative flex-1"
                style={{ width: totalPixels + 40 }}
              >
                {track.clips.map((clip) => {
                  const left = clip.startMs * pixelsPerMs;
                  const effectiveEnd = clip.endMs + (clip.freezeAtMs || 0);
                  const width = Math.max(4, (effectiveEnd - clip.startMs) * pixelsPerMs);
                  const sel = isSelected(track.id, clip.id);

                  return (
                    <div
                      key={clip.id}
                      className={`absolute top-1 rounded-[4px] cursor-pointer group ${
                        sel ? 'ring-2 ring-white/60 z-10' : ''
                      }`}
                      style={{
                        left,
                        width,
                        height: TRACK_HEIGHT - 8,
                        backgroundColor: TRACK_COLORS[track.type],
                        opacity: clip.opacity ?? 0.9,
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedClip({ outputIndex: currentOutput, trackId: track.id, clipId: clip.id });
                      }}
                      onMouseDown={(e) => handleClipMouseDown(e, track.id, clip, 'move')}
                      onContextMenu={(e) => handleClipContextMenu(e, track.id, clip.id)}
                    >
                      <div className="text-[9px] text-white/90 px-1.5 truncate leading-[28px] select-none">
                        {track.type === 'video' && '\uD83C\uDFAC'}
                        {track.type === 'image' && '\uD83D\uDDBC'}
                        {track.type === 'text' && (clip.text?.substring(0, 10) || 'T')}
                        {track.type === 'caption' && (clip.text?.substring(0, 10) || 'CC')}
                        {track.type === 'audio' && '\uD83D\uDD0A'}
                        {clip.speed !== undefined && clip.speed !== 1 && ` ${clip.speed}x`}
                        {clip.reverse && ' \u21A9'}
                        {clip.freezeAtMs && clip.freezeAtMs > 0 && ' \u2744'}
                        {' '}
                        {formatTime(effectiveEnd - clip.startMs)}
                      </div>
                      {track.type === 'audio' && (
                        <div className="absolute inset-x-1 bottom-1 flex items-end gap-px h-3 opacity-60">
                          <WaveformBars src={clip.src} width={width} />
                        </div>
                      )}
                      {/* Freeze indicator */}
                      {clip.freezeAtMs && clip.freezeAtMs > 0 && (
                        <div
                          className="absolute top-0 bottom-0 border-l-2 border-dashed border-white/40"
                          style={{ left: (clip.endMs - clip.startMs) * pixelsPerMs }}
                        />
                      )}
                      {/* Keyframe dots */}
                      {clip.keyframes && clip.keyframes.length > 0 && (
                        <div className="absolute bottom-0.5 left-0 right-0 flex gap-0.5 px-1 justify-center">
                          {clip.keyframes.map((kf, ki) => (
                            <div
                              key={ki}
                              className="w-1.5 h-1.5 rounded-full bg-white/60"
                              style={{
                                left: `${kf.tMs / (effectiveEnd - clip.startMs) * 100}%`,
                              }}
                              title={`KF: ${formatTime(kf.tMs)}`}
                            />
                          ))}
                        </div>
                      )}
                      {/* Drag edges */}
                      <div
                        className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize opacity-0 group-hover:opacity-100 bg-black/20 rounded-l-[4px]"
                        onMouseDown={(e) => handleClipMouseDown(e, track.id, clip, 'start')}
                      />
                      <div
                        className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize opacity-0 group-hover:opacity-100 bg-black/20 rounded-r-[4px]"
                        onMouseDown={(e) => handleClipMouseDown(e, track.id, clip, 'end')}
                      />
                    </div>
                  );
                })}

                {/* Transition handles between adjacent clips */}
                {trackPairs.map(({ from, to }) => {
                  const handleX = from.endMs * pixelsPerMs;
                  const tType = from.transitionOut?.type || to.transitionIn?.type || 'cut';
                  const isTransitioning = tType !== 'cut';
                  return (
                    <div
                      key={`trans-${from.id}-${to.id}`}
                      className="absolute top-1 z-20 group"
                      style={{
                        left: handleX - 4,
                        height: TRACK_HEIGHT - 8,
                      }}
                    >
                      <div
                        className={`w-2 h-full cursor-pointer flex items-center justify-center rounded-sm ${
                          isTransitioning ? 'bg-yellow-500/40 hover:bg-yellow-500/60' : 'bg-transparent hover:bg-white/10'
                        }`}
                        onClick={(e) => {
                          e.stopPropagation();
                          const rect = (e.target as HTMLElement).getBoundingClientRect();
                          setTransitionPopover({
                            trackId: track.id,
                            fromClipId: from.id,
                            toClipId: to.id,
                            x: rect.left + rect.width / 2,
                            y: rect.top,
                          });
                        }}
                        title={`${TRANSITION_LABELS[tType]} transition`}
                      >
                        {isTransitioning && (
                          <div className="w-1 h-3 rounded-full bg-yellow-400" />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )})}

          {/* Playhead */}
          <div
            className="absolute top-0 bottom-0 z-20 pointer-events-none"
            style={{ left: LABEL_WIDTH + playheadMs * pixelsPerMs }}
          >
            <div className="w-0.5 h-full bg-red-500" />
            <div
              className="w-2.5 h-2.5 bg-red-500 rotate-45 -translate-x-1/2 -translate-y-1/2"
              style={{ marginTop: 0 }}
            />
          </div>
        </div>
      </div>

      {/* Duration indicator */}
      <div className="flex items-center justify-end px-3 py-1 text-[10px] text-textColor/40">
        {vo.tracks.length} track{vo.tracks.length !== 1 ? 's' : ''}{' \u00B7 '}
        {vo.tracks.reduce((sum, t) => sum + t.clips.length, 0)} clip
        {vo.tracks.reduce((sum, t) => sum + t.clips.length, 0) !== 1 ? 's' : ''}{' \u00B7 '}
        {formatTime(vo.durationMs)}
      </div>

      {/* Track audio settings popover */}
      {trackSettings && (
        <>
          <div
            className="fixed inset-0 z-50"
            onClick={() => setTrackSettings(null)}
          />
          <div
            className="fixed z-[60] bg-newBgColor border border-newBorder rounded-lg p-2 shadow-xl min-w-[160px]"
            style={{
              left: trackSettings.x,
              top: (trackSettings.y ?? 0) + 8,
              transform: 'translateX(-50%)',
            }}
          >
            {(() => {
              const track = vo.tracks.find((t) => t.id === trackSettings.trackId);
              if (!track) return null;
              return (
                <div className="space-y-2">
                  <div className="text-[11px] font-medium text-textColor/60 mb-1">Track Audio</div>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-textColor/70">Gain</span>
                    <span className="text-[10px] text-textColor/40">{Math.round((track.gain ?? 1) * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={200}
                    value={Math.round((track.gain ?? 1) * 100)}
                    onChange={(e) => store.getState().setTrackGain(currentOutput, track.id, Number(e.target.value) / 100)}
                    className="w-full accent-designerAccent"
                  />
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={!!track.autoDuck}
                      onChange={(e) => store.getState().setTrackAutoDuck(currentOutput, track.id, e.target.checked)}
                      className="accent-designerAccent w-3 h-3"
                    />
                    <span className="text-[10px] text-textColor/70">Auto-duck under voice</span>
                  </label>
                </div>
              );
            })()}
          </div>
        </>
      )}

      {/* Transition popover */}
      {transitionPopover && (
        <>
          <div
            className="fixed inset-0 z-50"
            onClick={() => setTransitionPopover(null)}
          />
          <div
            className="fixed z-[60] bg-newBgColor border border-newBorder rounded-lg p-2 shadow-xl min-w-[140px]"
            style={{
              left: transitionPopover.x,
              top: transitionPopover.y + 8,
              transform: 'translateX(-50%)',
            }}
          >
            <div className="text-[11px] font-medium text-textColor/60 mb-1.5 px-1">Transition</div>
            {(['cut', 'fade', 'dissolve', 'slide'] as const).map((type) => (
              <button
                key={type}
                onClick={() => handleSetTransition(transitionPopover.trackId, transitionPopover.fromClipId, transitionPopover.toClipId, type)}
                className={`w-full text-left px-2 py-1 rounded text-[12px] ${
                  transitionPopover.trackId ? 'hover:bg-newColColor/30 text-textColor' : 'text-textColor'
                }`}
              >
                {TRANSITION_LABELS[type]}
              </button>
            ))}
            {transitionPopover.trackId && (
              <div className="mt-1.5 pt-1.5 border-t border-newBorder">
                <div className="text-[10px] text-textColor/40 mb-1 px-1">Slide direction</div>
                <div className="grid grid-cols-2 gap-1">
                  {(['left', 'right', 'up', 'down'] as const).map((dir) => (
                    <button
                      key={dir}
                      onClick={() => handleSetTransition(transitionPopover.trackId, transitionPopover.fromClipId, transitionPopover.toClipId, 'slide', dir)}
                      className="px-1.5 py-0.5 rounded text-[10px] border border-newBorder text-textColor/60 hover:text-textColor hover:border-newTextColor/40 capitalize"
                    >
                      {dir}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default VideoTimeline;
