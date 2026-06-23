'use client';

import React, { FC, useCallback, useEffect, useRef, useState } from 'react';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { Slider, SegmentedControl, Stepper } from './controls';
import type { DesignerAnimationType, DesignerElement } from './designer.store';

interface TimelineProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  store: any;
  setMedia?: (media: { id: string; path: string }[]) => void;
}

const ANIM_OPTIONS: { value: DesignerAnimationType; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'fadeIn', label: 'Fade' },
  { value: 'slideLeft', label: 'Slide ←' },
  { value: 'slideRight', label: 'Slide →' },
  { value: 'slideUp', label: 'Slide ↑' },
  { value: 'slideDown', label: 'Slide ↓' },
  { value: 'zoomIn', label: 'Zoom' },
];

// Video & animation timeline (H3). Entrance animations preview live and export
// to WebM via MediaRecorder + canvas.captureStream (no ffmpeg dependency).
export const Timeline: FC<TimelineProps> = ({ store, setMedia }) => {
  const fetch = useFetch();
  const toaster = useToaster();
  const doc = store((s: any) => s.doc);
  const currentPage = store((s: any) => s.currentPage);
  const selectedIds: string[] = store((s: any) => s.selectedIds);
  const setElementAnimation = store((s: any) => s.setElementAnimation);
  const setDuration = store((s: any) => s.setDuration);
  const setPreviewTime = store((s: any) => s.setPreviewTime);
  const [playing, setPlaying] = useState(false);
  const [exporting, setExporting] = useState(false);
  const rafRef = useRef<number | null>(null);
  const duration = doc.durationMs || 5000;

  const selected: DesignerElement | undefined = (doc.pages[currentPage]?.children || []).find(
    (c: DesignerElement) => c.id === selectedIds[0]
  );

  const stopPlayback = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    setPlaying(false);
    setPreviewTime(null);
  }, [setPreviewTime]);

  const play = useCallback(() => {
    setPlaying(true);
    const start = performance.now();
    const tick = () => {
      const elapsed = performance.now() - start;
      if (elapsed >= duration) {
        setPreviewTime(duration);
        rafRef.current = null;
        setPlaying(false);
        // hold the final frame briefly, then clear
        setTimeout(() => setPreviewTime(null), 400);
        return;
      }
      setPreviewTime(elapsed);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }, [duration, setPreviewTime]);

  useEffect(() => () => stopPlayback(), [stopPlayback]);

  const exportWebm = useCallback(async () => {
    const canvas = document.querySelector('.konva-stage canvas') as HTMLCanvasElement | null;
    if (!canvas || typeof (canvas as any).captureStream !== 'function') {
      toaster.show('Video export not supported in this browser', 'warning');
      return;
    }
    if (typeof MediaRecorder === 'undefined') {
      toaster.show('Video export not supported in this browser', 'warning');
      return;
    }
    setExporting(true);
    try {
      const stream = (canvas as any).captureStream(30) as MediaStream;
      const mime = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
        ? 'video/webm;codecs=vp9'
        : 'video/webm';
      const recorder = new MediaRecorder(stream, { mimeType: mime });
      const chunks: BlobPart[] = [];
      recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      const done = new Promise<Blob>((resolve) => {
        recorder.onstop = () => resolve(new Blob(chunks, { type: 'video/webm' }));
      });
      recorder.start();
      // Drive the animation clock for the full duration + a tail hold.
      await new Promise<void>((resolve) => {
        const start = performance.now();
        const tick = () => {
          const elapsed = performance.now() - start;
          if (elapsed >= duration + 500) {
            setPreviewTime(duration);
            resolve();
            return;
          }
          setPreviewTime(Math.min(elapsed, duration));
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });
      recorder.stop();
      const blob = await done;
      setPreviewTime(null);

      const form = new FormData();
      form.append('file', new File([blob], `${doc.designName || 'design'}.webm`, { type: 'video/webm' }));
      const res = await fetch('/files/upload-simple', { method: 'POST', body: form });
      const data = await res.json();
      if (data?.path) {
        toaster.show('Video saved to Files', 'success');
        if (setMedia) setMedia([{ id: data.id, path: data.path }]);
      }
    } catch {
      toaster.show('Video export failed', 'warning');
      setPreviewTime(null);
    } finally {
      setExporting(false);
    }
  }, [duration, doc.designName, fetch, toaster, setMedia, setPreviewTime]);

  return (
    <div className="shrink-0 border-t border-newBorder bg-newBgColorInner px-3 py-2">
      <div className="flex items-center gap-3 flex-wrap">
        <button
          onClick={playing ? stopPlayback : play}
          className="px-3 py-1.5 rounded-md text-[12px] bg-[#2B5CD3] text-white hover:bg-[#2B5CD3]/80"
        >
          {playing ? '■ Stop' : '▶ Preview'}
        </button>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-textColor/50">Duration</span>
          <Stepper
            value={Math.round(duration / 1000)}
            min={1}
            max={60}
            onChange={(n) => setDuration(n * 1000)}
          />
          <span className="text-[11px] text-textColor/50">s</span>
        </div>
        <button
          onClick={exportWebm}
          disabled={exporting}
          className="px-3 py-1.5 rounded-md text-[12px] bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
        >
          {exporting ? 'Exporting…' : '⬇ Export video (WebM)'}
        </button>

        <div className="flex-1 min-w-[220px]">
          {selected ? (
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-textColor/50 shrink-0">Animation</span>
              <SegmentedControl
                value={selected.animation?.type || 'none'}
                options={ANIM_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
                onChange={(v) =>
                  setElementAnimation(selected.id, {
                    type: v as DesignerAnimationType,
                    delay: selected.animation?.delay ?? 0,
                    duration: selected.animation?.duration ?? 800,
                  })
                }
              />
            </div>
          ) : (
            <span className="text-[11px] text-textColor/40">Select an element to animate it</span>
          )}
        </div>
      </div>

      {selected && selected.animation && selected.animation.type !== 'none' && (
        <div className="flex items-center gap-4 mt-2">
          <div className="w-[180px]">
            <Slider
              label="Delay"
              suffix="ms"
              min={0}
              max={duration}
              step={100}
              value={selected.animation.delay}
              onChange={(n) =>
                setElementAnimation(selected.id, { ...selected.animation!, delay: n })
              }
            />
          </div>
          <div className="w-[180px]">
            <Slider
              label="Duration"
              suffix="ms"
              min={100}
              max={4000}
              step={100}
              value={selected.animation.duration}
              onChange={(n) =>
                setElementAnimation(selected.id, { ...selected.animation!, duration: n })
              }
            />
          </div>
        </div>
      )}
    </div>
  );
};
