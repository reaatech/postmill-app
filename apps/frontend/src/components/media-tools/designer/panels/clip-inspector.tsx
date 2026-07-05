'use client';

import React, { FC, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Slider, Stepper } from '../controls';
import type { VideoClip } from '../designer.store';
import { TEXT_ANIMATION_PRESETS } from '../text-animation-presets';
import type { EaseType } from '../video-preview';

interface ClipInspectorProps {
  store: any;
  outputIndex: number;
  trackId: string;
  clipId: string;
}

const PRESET_STEPS: number[] = [0.25, 0.5, 1, 2, 4];

interface KeyframeLike {
  tMs: number;
  props: Record<string, number>;
  ease?: 'linear' | 'easeInOut' | 'easeIn' | 'easeOut';
}

const EASE_OPTIONS: { value: KeyframeLike['ease']; label: string }[] = [
  { value: 'linear', label: 'Linear' },
  { value: 'easeInOut', label: 'Ease In-Out' },
  { value: 'easeIn', label: 'Ease In' },
  { value: 'easeOut', label: 'Ease Out' },
];

function useKeyframeDrag(
  containerRef: React.RefObject<HTMLDivElement | null>,
  totalMs: number,
  onMove: (oldTMs: number, newTMs: number) => void,
) {
  const [dragging, setDragging] = useState<{ oldTMs: number; startX: number } | null>(null);
  // The dragged keyframe's tMs changes after each move, so match on its CURRENT
  // tMs (not the fixed mousedown value) or it moves one tick then freezes.
  const currentTMsRef = useRef(0);
  const movedRef = useRef(false);
  // True for the trailing `click` a browser fires after a drag, so marker
  // remove / timeline add handlers can ignore it.
  const justDraggedRef = useRef(false);

  useEffect(() => {
    if (!dragging) return;
    currentTMsRef.current = dragging.oldTMs;
    movedRef.current = false;
    const handleMove = (e: MouseEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const dx = e.clientX - dragging.startX;
      if (Math.abs(dx) > 2) movedRef.current = true;
      const dMs = (dx / rect.width) * totalMs;
      const clamped = Math.max(0, Math.min(totalMs, dragging.oldTMs + dMs));
      onMove(currentTMsRef.current, clamped);
      currentTMsRef.current = clamped;
    };
    const handleUp = () => {
      if (movedRef.current) {
        justDraggedRef.current = true;
        // Clear after the synthetic click has had a chance to fire.
        setTimeout(() => {
          justDraggedRef.current = false;
        }, 0);
      }
      setDragging(null);
    };
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, [dragging, totalMs, onMove, containerRef]);

  return { setDragging, justDraggedRef };
}

const MiniKeyframeTimeline: FC<{
  keyframes: KeyframeLike[];
  totalMs: number;
  onAdd: (prop: string, tMs: number) => void;
  onMove: (oldTMs: number, newTMs: number) => void;
}> = ({ keyframes, totalMs, onAdd, onMove }) => {
  const ref = useRef<HTMLDivElement>(null);
  const { setDragging, justDraggedRef } = useKeyframeDrag(ref, totalMs, onMove);
  return (
    <div
      ref={ref}
      className="relative h-5 bg-newBgColorInner border border-newBorder/30 rounded overflow-hidden cursor-crosshair"
      onClick={(e) => {
        if (justDraggedRef.current) return; // ignore the click that follows a drag
        if (!ref.current) return;
        const rect = ref.current.getBoundingClientRect();
        const pct = (e.clientX - rect.left) / rect.width;
        const tMs = Math.round(pct * totalMs);
        onAdd('x', tMs);
      }}
    >
      {keyframes.map((kf, ki) => (
        <div
          key={ki}
          className="absolute top-0 bottom-0 w-0.5 bg-designerAccent cursor-ew-resize"
          style={{ left: `${(kf.tMs / totalMs) * 100}%` }}
          title={`Keyframe at ${kf.tMs}ms`}
          onMouseDown={(e) => {
            e.stopPropagation();
            setDragging({ oldTMs: kf.tMs, startX: e.clientX });
          }}
        />
      ))}
    </div>
  );
};

const KeyframePropRow: FC<{
  prop: string;
  clip: VideoClip;
  keyframes: KeyframeLike[];
  totalMs: number;
  onAdd: (prop: string, tMs: number) => void;
  onMove: (oldTMs: number, newTMs: number) => void;
  onRemove: (tMs: number, prop?: string) => void;
  onEase: (tMs: number, ease: 'linear' | 'easeInOut' | 'easeIn' | 'easeOut') => void;
}> = ({ prop, clip, keyframes, totalMs, onAdd, onMove, onRemove, onEase }) => {
  const ref = useRef<HTMLDivElement>(null);
  const { setDragging, justDraggedRef } = useKeyframeDrag(ref, totalMs, onMove);
  const propKeyframes = keyframes.filter((kf) => kf.props[prop] !== undefined);
  const currentVal =
    prop === 'x' ? (clip.x ?? 0)
    : prop === 'y' ? (clip.y ?? 0)
    : prop === 'width' ? (clip.width ?? 1)
    : prop === 'height' ? (clip.height ?? 1)
    : prop === 'rotation' ? (clip.rotation ?? 0)
    : prop === 'opacity' ? (clip.opacity ?? 1)
    : 0;

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-textColor/50 capitalize">{prop}</span>
        <span className="text-[10px] text-textColor/30">
          {prop === 'opacity' ? `${Math.round(currentVal * 100)}%` : Math.round(currentVal)}
        </span>
      </div>
      <div
        ref={ref}
        className="relative h-3 bg-newBgColorInner border border-newBorder/30 rounded overflow-hidden"
        onClick={(e) => {
          if (justDraggedRef.current) return; // ignore the click that follows a drag
          if (!ref.current) return;
          const rect = ref.current.getBoundingClientRect();
          const pct = (e.clientX - rect.left) / rect.width;
          const tMs = Math.round(pct * totalMs);
          onAdd(prop, tMs);
        }}
      >
        {propKeyframes.map((kf, ki) => (
          <div
            key={ki}
            className="absolute top-0 bottom-0 w-2 h-2 rounded-full bg-designerAccent -translate-x-1/2 -translate-y-1/2 top-1/2 cursor-pointer hover:scale-125 transition-transform"
            style={{ left: `${(kf.tMs / totalMs) * 100}%` }}
            title={`${prop}: ${kf.props[prop]} at ${kf.tMs}ms`}
            onMouseDown={(e) => {
              e.stopPropagation();
              setDragging({ oldTMs: kf.tMs, startX: e.clientX });
            }}
            onClick={(e) => {
              e.stopPropagation();
              if (justDraggedRef.current) return; // a drag ends in a click — don't delete
              onRemove(kf.tMs, prop);
            }}
          />
        ))}
      </div>
      {propKeyframes.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {propKeyframes.map((kf) => (
            <select
              key={kf.tMs}
              value={kf.ease || 'linear'}
              onChange={(e) => onEase(kf.tMs, e.target.value as KeyframeLike['ease'])}
              className="h-5 px-1 rounded text-[9px] bg-newBgColor border border-newBorder text-textColor outline-none"
            >
              {EASE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          ))}
        </div>
      )}
    </div>
  );
};

export const ClipInspector: FC<ClipInspectorProps> = ({ store, outputIndex, trackId, clipId }) => {
  const doc = store((s: any) => s.doc);
  const vo = doc.outputs[outputIndex];

  const clip: VideoClip | undefined = useMemo(() => {
    if (!vo?.tracks) return undefined;
    const track = vo.tracks.find((t: any) => t.id === trackId);
    return track?.clips.find((c: any) => c.id === clipId);
  }, [vo, trackId, clipId]);

  const parentTrack = useMemo(() => {
    if (!vo?.tracks) return undefined;
    return vo.tracks.find((t: any) => t.id === trackId);
  }, [vo, trackId]);

  const clipTrackType = parentTrack?.type;
  const keyframes = useMemo(() => clip?.keyframes || [], [clip?.keyframes]);
  const filters = useMemo(() => clip?.filters || [], [clip?.filters]);
  const totalMs = clip ? (clip.endMs + (clip.freezeAtMs || 0)) - clip.startMs : 1;

  const updateClip = useCallback(
    (updates: Partial<VideoClip>) => {
      store.getState().updateClip(outputIndex, trackId, clipId, updates);
    },
    [store, outputIndex, trackId, clipId],
  );

  const hasFilter = useCallback(
    (prefix: string) => filters.some((f) => f === prefix || f.startsWith(prefix + ':')),
    [filters],
  );

  const getFilterVal = useCallback(
    (prefix: string, fallback: number): number => {
      const match = filters.find((f) => f.startsWith(prefix + ':'));
      return match ? parseFloat(match.slice(prefix.length + 1)) : fallback;
    },
    [filters],
  );

  const toggleFilter = useCallback(
    (token: string, enabled: boolean) => {
      const rest = filters.filter((f) => f !== token);
      updateClip({ filters: enabled ? [...rest, token] : rest });
    },
    [filters, updateClip],
  );

  const setFilterVal = useCallback(
    (prefix: string, value: number, defaultVal: number) => {
      const rest = filters.filter((f) => !(f === prefix || f.startsWith(prefix + ':')));
      if (value !== defaultVal) rest.push(`${prefix}:${value}`);
      updateClip({ filters: rest });
    },
    [filters, updateClip],
  );

  const handleAddKeyframe = useCallback(
    (prop: string, tMs: number) => {
      if (!clip) return;
      const existing = [...keyframes];
      const currentVal =
        prop === 'x' ? (clip.x ?? 0)
        : prop === 'y' ? (clip.y ?? 0)
        : prop === 'width' ? (clip.width ?? 1)
        : prop === 'height' ? (clip.height ?? 1)
        : prop === 'scale' ? ((clip.width ?? 1) / (clip.naturalWidth || 100))
        : prop === 'rotation' ? (clip.rotation ?? 0)
        : prop === 'opacity' ? (clip.opacity ?? 1)
        : 0;

      const idx = existing.findIndex((kf) => kf.tMs === tMs);
      if (idx >= 0) {
        existing[idx] = { tMs, props: { ...existing[idx].props, [prop]: currentVal } };
      } else {
        existing.push({ tMs, props: { [prop]: currentVal } });
      }
      updateClip({ keyframes: existing });
    },
    [keyframes, clip, updateClip],
  );

  const handleRemoveKeyframe = useCallback(
    (tMs: number, prop?: string) => {
      const existing = keyframes
        .map((kf) => {
          if (kf.tMs === tMs) {
            if (prop) {
              const next = { ...kf.props };
              delete next[prop];
              if (Object.keys(next).length === 0) return null;
              return { tMs: kf.tMs, props: next };
            }
            return null;
          }
          return kf;
        })
        .filter(Boolean) as { tMs: number; props: Record<string, number> }[];
      updateClip({ keyframes: existing });
    },
    [keyframes, updateClip],
  );

  const handleMoveKeyframe = useCallback(
    (oldTMs: number, newTMs: number) => {
      const clamped = Math.max(0, Math.min(totalMs, newTMs));
      const existing = keyframes.map((kf) =>
        kf.tMs === oldTMs ? { ...kf, tMs: clamped } : kf
      );
      updateClip({ keyframes: existing });
    },
    [keyframes, totalMs, updateClip]
  );

  const handleSetEase = useCallback(
    (tMs: number, ease: EaseType) => {
      const existing = keyframes.map((kf) =>
        kf.tMs === tMs ? { ...kf, ease } : kf
      );
      updateClip({ keyframes: existing });
    },
    [keyframes, updateClip]
  );

  const handleKenBurns = useCallback(() => {
    if (!clip) return;
    const duration = totalMs;
    const startX = clip.x ?? 0;
    const startY = clip.y ?? 0;
    const w = clip.width ?? 1;
    const h = clip.height ?? 1;
    const zoomEnd = Math.min(w * 1.1, (clip.naturalWidth || w));

    updateClip({
      keyframes: [
        {
          tMs: 0,
          props: {
            x: startX,
            y: startY,
            width: w,
            height: h,
            rotation: clip.rotation ?? 0,
            opacity: clip.opacity ?? 1,
          },
        },
        {
          tMs: duration,
          props: {
            x: startX - (zoomEnd - w) / 2,
            y: startY - (zoomEnd / (w / h) - h) / 2,
            width: zoomEnd,
            height: zoomEnd / (w / h),
            rotation: clip.rotation ?? 0,
            opacity: clip.opacity ?? 1,
          },
        },
      ],
    });
  }, [clip, totalMs, updateClip]);

  const keyframeProps = useMemo(() => {
    const props = new Set<string>();
    for (const kf of keyframes) {
      for (const key of Object.keys(kf.props)) {
        props.add(key);
      }
    }
    return Array.from(props);
  }, [keyframes]);

  const handleApplyTextAnimation = useCallback((presetName: string) => {
    if (clipTrackType !== 'text' || !clip) return;
    const preset = TEXT_ANIMATION_PRESETS.find((p) => p.name === presetName);
    if (!preset) return;
    const baseX = clip.x ?? 0;
    const baseY = clip.y ?? 0;
    const shifted = preset.keyframes?.map((kf) => ({
      ...kf,
      props: {
        ...kf.props,
        x: kf.props.x !== undefined ? baseX + kf.props.x : undefined,
        y: kf.props.y !== undefined ? baseY + kf.props.y : undefined,
      },
    })).filter((kf) => Object.keys(kf.props).length > 0);
    updateClip({ keyframes: shifted });
  }, [clip, clipTrackType, updateClip]);

  if (!clip) return null;

  return (
    <div className="space-y-3">
      <div className="text-[12px] font-medium text-textColor/60 uppercase tracking-wider">
        Video Clip
      </div>

      {/* Position & Size */}
      <div className="grid grid-cols-2 gap-2">
        <Stepper
          label="X"
          value={Math.round(clip.x ?? 0)}
          onChange={(n) => updateClip({ x: n })}
        />
        <Stepper
          label="Y"
          value={Math.round(clip.y ?? 0)}
          onChange={(n) => updateClip({ y: n })}
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Stepper
          label="Width"
          min={1}
          value={Math.round(clip.width ?? 1)}
          onChange={(n) => updateClip({ width: n })}
        />
        <Stepper
          label="Height"
          min={1}
          value={Math.round(clip.height ?? 1)}
          onChange={(n) => updateClip({ height: n })}
        />
      </div>

      <Slider
        label="Rotation"
        suffix="\u00B0"
        min={0}
        max={360}
        value={Math.round(clip.rotation ?? 0)}
        onChange={(n) => updateClip({ rotation: n })}
      />

      <Slider
        label="Opacity"
        suffix="%"
        min={0}
        max={100}
        value={Math.round((clip.opacity ?? 1) * 100)}
        onChange={(n) => updateClip({ opacity: n / 100 })}
      />

      {/* Audio */}
      <div className="pt-1 border-t border-newBorder">
        <div className="text-[11px] text-textColor/50 mb-1">Audio</div>
        <Slider
          label="Volume"
          suffix="%"
          min={0}
          max={100}
          value={Math.round((clip.volume ?? 1) * 100)}
          onChange={(n) => updateClip({ volume: n / 100 })}
        />
        <Slider
          label="Fade In"
          suffix="ms"
          min={0}
          max={3000}
          step={100}
          value={clip.fadeInMs || 0}
          onChange={(n) => updateClip({ fadeInMs: n })}
        />
        <Slider
          label="Fade Out"
          suffix="ms"
          min={0}
          max={3000}
          step={100}
          value={clip.fadeOutMs || 0}
          onChange={(n) => updateClip({ fadeOutMs: n })}
        />
      </div>

      {/* Speed / Reverse / Freeze */}
      <div className="pt-1 border-t border-newBorder space-y-2">
        <div className="text-[11px] text-textColor/50">Speed</div>
        <div className="flex gap-1">
          {PRESET_STEPS.map((s) => (
            <button
              key={s}
              onClick={() => updateClip({ speed: s, reverse: false })}
              className={`flex-1 h-7 rounded text-[11px] font-medium transition-all ${
                clip.speed === s && !clip.reverse
                  ? 'bg-designerAccent text-white'
                  : 'border border-newBorder text-textColor hover:bg-boxHover'
              }`}
            >
              {s}x
            </button>
          ))}
        </div>

        <div className="flex items-center justify-between pt-1">
          <span className="text-[11px] text-textColor/70">Reverse</span>
          <button
            type="button"
            role="switch"
            aria-checked={!!clip.reverse}
            onClick={() => updateClip({ reverse: !clip.reverse })}
            className={`relative w-[40px] h-[22px] rounded-full transition-colors ${
              clip.reverse ? 'bg-designerAccent' : 'bg-newBorder'
            }`}
          >
            <span
              className={`absolute top-[2px] left-[2px] w-[18px] h-[18px] rounded-full bg-white transition-transform ${
                clip.reverse ? 'translate-x-[18px]' : ''
              }`}
            />
          </button>
        </div>

        <Stepper
          label="Freeze frame (ms)"
          min={0}
          max={10000}
          step={500}
          value={clip.freezeAtMs || 0}
          onChange={(n) => updateClip({ freezeAtMs: n > 0 ? n : undefined })}
        />
      </div>

      {/* Filters */}
      <div className="pt-1 border-t border-newBorder space-y-2">
        <div className="text-[11px] text-textColor/50">Filters</div>
        <div className="text-[9px] text-amber-400/70 mb-1">
          Filters will be applied during export.
        </div>

        <div className="flex items-center justify-between">
          <span className="text-[11px] text-textColor/70">Grayscale</span>
          <button
            type="button"
            role="switch"
            aria-checked={hasFilter('grayscale')}
            onClick={() => toggleFilter('grayscale', !hasFilter('grayscale'))}
            className={`relative w-[40px] h-[22px] rounded-full transition-colors ${
              hasFilter('grayscale') ? 'bg-designerAccent' : 'bg-newBorder'
            }`}
          >
            <span
              className={`absolute top-[2px] left-[2px] w-[18px] h-[18px] rounded-full bg-white transition-transform ${
                hasFilter('grayscale') ? 'translate-x-[18px]' : ''
              }`}
            />
          </button>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-[11px] text-textColor/70">Sepia</span>
          <button
            type="button"
            role="switch"
            aria-checked={hasFilter('sepia')}
            onClick={() => toggleFilter('sepia', !hasFilter('sepia'))}
            className={`relative w-[40px] h-[22px] rounded-full transition-colors ${
              hasFilter('sepia') ? 'bg-designerAccent' : 'bg-newBorder'
            }`}
          >
            <span
              className={`absolute top-[2px] left-[2px] w-[18px] h-[18px] rounded-full bg-white transition-transform ${
                hasFilter('sepia') ? 'translate-x-[18px]' : ''
              }`}
            />
          </button>
        </div>

        <Slider
          label="Blur"
          suffix="px"
          min={0}
          max={20}
          step={0.5}
          value={getFilterVal('blur', 0)}
          onChange={(n) => setFilterVal('blur', n, 0)}
        />
        <Slider
          label="Brightness"
          min={0}
          max={3}
          step={0.05}
          value={getFilterVal('brightness', 1)}
          onChange={(n) => setFilterVal('brightness', n, 1)}
        />
        <Slider
          label="Contrast"
          min={0}
          max={3}
          step={0.05}
          value={getFilterVal('contrast', 1)}
          onChange={(n) => setFilterVal('contrast', n, 1)}
        />
        <Slider
          label="Saturate"
          min={0}
          max={3}
          step={0.05}
          value={getFilterVal('saturate', 1)}
          onChange={(n) => setFilterVal('saturate', n, 1)}
        />
      </div>

      {/* Text animation presets */}
      {clipTrackType === 'text' && (
        <div className="pt-1 border-t border-newBorder space-y-2">
          <div className="text-[11px] text-textColor/50">Text Animations</div>
          <div className="flex flex-wrap gap-1">
            {TEXT_ANIMATION_PRESETS.map((preset) => (
              <button
                key={preset.name}
                onClick={() => handleApplyTextAnimation(preset.name)}
                className="px-2 py-1 rounded text-[10px] border border-newBorder text-textColor hover:border-designerAccent hover:bg-boxHover transition-all"
              >
                {preset.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Keyframes */}
      <div className="pt-1 border-t border-newBorder space-y-2">
        <div className="flex items-center justify-between">
          <div className="text-[11px] text-textColor/50">Keyframes</div>
          <span className="text-[10px] text-textColor/30">{keyframes.length}</span>
        </div>

        {(clipTrackType === 'image' || clipTrackType === 'text') && (
          <button
            onClick={handleKenBurns}
            className="w-full px-2 py-1.5 rounded text-[11px] border border-designerAccent/30 text-designerAccent hover:bg-designerAccent/10"
          >
            Ken Burns Preset
          </button>
        )}

        {/* Mini timeline for keyframe placement */}
        <MiniKeyframeTimeline
          keyframes={keyframes}
          totalMs={totalMs}
          onAdd={handleAddKeyframe}
          onMove={handleMoveKeyframe}
        />

        {/* Per-property keyframe controls */}
        {keyframeProps.map((prop) => (
          <KeyframePropRow
            key={prop}
            prop={prop}
            clip={clip}
            keyframes={keyframes}
            totalMs={totalMs}
            onAdd={handleAddKeyframe}
            onMove={handleMoveKeyframe}
            onRemove={handleRemoveKeyframe}
            onEase={handleSetEase}
          />
        ))}

        {keyframes.length > 0 && (
          <button
            onClick={() => updateClip({ keyframes: [] })}
            className="w-full px-2 py-1 rounded text-[11px] border border-red-400/40 text-red-400 hover:bg-red-400/5"
          >
            Clear all keyframes
          </button>
        )}
      </div>
    </div>
  );
};
