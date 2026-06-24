'use client';

import React, { FC, useCallback, useMemo, useRef, useState } from 'react';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { ColorSwatch, Slider, SegmentedControl, Stepper } from '../controls';
import { useBrandColors } from './use-brand-colors';
import { getImageNaturalSize } from '../elements';
import { detectFocalPoint, estimateFocalPoint, smartReflow } from '../reflow';
import type {
  DesignerElement,
  DesignerMask,
  DesignerTextShadow,
} from '../designer.store';
import { MediaSelectorModal } from '../../media-selector-modal';

interface ImageInspectorProps {
  element: DesignerElement;
  ids: string[];
  store: any;
}

const DEFAULT_SHADOW: DesignerTextShadow = {
  color: '#000000',
  blur: 4,
  offsetX: 2,
  offsetY: 2,
};

export const ImageInspector: FC<ImageInspectorProps> = ({
  element,
  ids,
  store,
}) => {
  const toaster = useToaster();
  const fetch = useFetch();
  const brandColors = useBrandColors();
  const brandEnforcement = store((s: any) => s.brandEnforcement);
  const updateElement = store((s: any) => s.updateElement);
  const updateElements = store((s: any) => s.updateElements);

  const [aiLoading, setAiLoading] = useState<string | false>(false);
  const [upscaleScale, setUpscaleScale] = useState(2);
  const [inpaintPrompt, setInpaintPrompt] = useState('');
  const [mediaModalOpen, setMediaModalOpen] = useState(false);

  const [inpaintMaskUrl, setInpaintMaskUrl] = useState<string | null>(null);
  const [masking, setMasking] = useState(false);
  const [brushSize, setBrushSize] = useState(14);
  const [isDrawingMask, setIsDrawingMask] = useState(false);
  const maskCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const previewImgRef = useRef<HTMLImageElement | null>(null);
  const [draggingFocal, setDraggingFocal] = useState(false);

  const set = (u: Partial<DesignerElement>) => updateElements(ids, u);

  const filters = useMemo(() => element.filters || [], [element.filters]);

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
      updateElement(element.id, { filters: enabled ? [...rest, token] : rest });
    },
    [filters, element.id, updateElement],
  );

  const setFilterVal = useCallback(
    (prefix: string, value: number, defaultVal: number) => {
      const rest = filters.filter((f) => !(f === prefix || f.startsWith(prefix + ':')));
      if (value !== defaultVal) rest.push(`${prefix}:${value}`);
      updateElement(element.id, { filters: rest });
    },
    [filters, element.id, updateElement],
  );

  const natural = getImageNaturalSize(element.src);

  const cropInset = (side: 'left' | 'top' | 'right' | 'bottom') => {
    if (!element.crop || !natural) return 0;
    const c = element.crop;
    if (side === 'left')
      return Math.round((c.x / natural.width) * 100);
    if (side === 'top')
      return Math.round((c.y / natural.height) * 100);
    if (side === 'right')
      return Math.round((1 - (c.x + c.width) / natural.width) * 100);
    return Math.round((1 - (c.y + c.height) / natural.height) * 100);
  };

  const applyCrop = (
    side: 'left' | 'top' | 'right' | 'bottom',
    pct: number,
  ) => {
    if (!natural) return;
    const cur = element.crop || {
      x: 0,
      y: 0,
      width: natural.width,
      height: natural.height,
    };
    let { x, y, width, height } = cur;
    const f = pct / 100;
    if (side === 'left') {
      const nx = natural.width * f;
      width = width + (x - nx);
      x = nx;
    } else if (side === 'right') {
      width = natural.width * (1 - f) - x;
    } else if (side === 'top') {
      const ny = natural.height * f;
      height = height + (y - ny);
      y = ny;
    } else {
      height = natural.height * (1 - f) - y;
    }
    updateElement(element.id, {
      crop: {
        x: Math.max(0, x),
        y: Math.max(0, y),
        width: Math.max(1, width),
        height: Math.max(1, height),
      },
    });
  };

  const handleRemoveBackground = async () => {
    if (!element.src) return;
    setAiLoading('remove-bg');
    try {
      const res = await fetch('/media/remove-background', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageUrl: element.src }),
      });
      if (!res.ok) throw new Error('Failed');
      const data = await res.json();
      updateElement(element.id, { src: data.url, fileId: undefined });
    } catch {
      toaster.show('Background removal failed', 'warning');
    } finally {
      setAiLoading(false);
    }
  };

  const handleUpscale = async () => {
    if (!element.src) return;
    setAiLoading('upscale');
    try {
      const res = await fetch('/media/upscale', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageUrl: element.src, scale: upscaleScale }),
      });
      if (!res.ok) throw new Error('Failed');
      const data = await res.json();
      updateElement(element.id, { src: data.url, fileId: undefined });
    } catch {
      toaster.show('Upscale failed', 'warning');
    } finally {
      setAiLoading(false);
    }
  };

  const handleInpaint = async () => {
    if (!element.src || !inpaintPrompt || !inpaintMaskUrl) return;
    setAiLoading('inpaint');
    try {
      const res = await fetch('/media/inpaint', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageUrl: element.src, maskUrl: inpaintMaskUrl, prompt: inpaintPrompt }),
      });
      if (!res.ok) throw new Error('Failed');
      const data = await res.json();
      updateElement(element.id, { src: data.url, fileId: undefined });
    } catch {
      toaster.show('Inpaint failed', 'warning');
    } finally {
      setAiLoading(false);
    }
  };

  const initMaskCanvases = useCallback(() => {
    const img = previewImgRef.current;
    if (!img) return;
    const width = Math.max(1, img.clientWidth);
    const height = Math.max(1, img.clientHeight);
    if (!maskCanvasRef.current) {
      maskCanvasRef.current = document.createElement('canvas');
    }
    maskCanvasRef.current.width = width;
    maskCanvasRef.current.height = height;
    const mctx = maskCanvasRef.current.getContext('2d');
    if (mctx) {
      mctx.fillStyle = '#000000';
      mctx.fillRect(0, 0, width, height);
    }
    const overlay = overlayCanvasRef.current;
    if (overlay) {
      overlay.width = width;
      overlay.height = height;
      const octx = overlay.getContext('2d');
      if (octx) {
        octx.clearRect(0, 0, width, height);
      }
    }
  }, []);

  const clearMask = useCallback(() => {
    const mask = maskCanvasRef.current;
    const overlay = overlayCanvasRef.current;
    if (!mask || !overlay) return;
    const mctx = mask.getContext('2d');
    if (mctx) {
      mctx.fillStyle = '#000000';
      mctx.fillRect(0, 0, mask.width, mask.height);
    }
    const octx = overlay.getContext('2d');
    if (octx) {
      octx.clearRect(0, 0, overlay.width, overlay.height);
    }
  }, []);

  const drawMaskStroke = useCallback(
    (x: number, y: number) => {
      const mask = maskCanvasRef.current;
      const overlay = overlayCanvasRef.current;
      if (!mask || !overlay) return;
      const mctx = mask.getContext('2d');
      if (!mctx) return;
      mctx.beginPath();
      mctx.arc(x, y, brushSize / 2, 0, Math.PI * 2);
      mctx.fillStyle = '#ffffff';
      mctx.fill();

      const octx = overlay.getContext('2d');
      if (!octx) return;
      octx.clearRect(0, 0, overlay.width, overlay.height);
      octx.drawImage(mask, 0, 0);
      octx.globalCompositeOperation = 'source-in';
      octx.fillStyle = 'rgba(255, 0, 0, 0.55)';
      octx.fillRect(0, 0, overlay.width, overlay.height);
      octx.globalCompositeOperation = 'source-over';
    },
    [brushSize]
  );

  const getMaskPos = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const handleMaskPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    setIsDrawingMask(true);
    const { x, y } = getMaskPos(e);
    drawMaskStroke(x, y);
  };

  const handleMaskPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDrawingMask) return;
    const { x, y } = getMaskPos(e);
    drawMaskStroke(x, y);
  };

  const handleMaskPointerUp = useCallback(() => {
    setIsDrawingMask(false);
  }, []);

  const uploadMask = async () => {
    const mask = maskCanvasRef.current;
    if (!mask) return;
    setAiLoading('mask-upload');
    try {
      const blob = await new Promise<Blob | null>((resolve) =>
        mask.toBlob(resolve, 'image/png')
      );
      if (!blob) throw new Error('Mask empty');
      const formData = new FormData();
      formData.append('file', blob, `mask-${Date.now()}.png`);
      const res = await fetch('/files/upload-simple', {
        method: 'POST',
        body: formData,
      });
      if (!res.ok) throw new Error('Upload failed');
      const data = await res.json();
      const url = data.path || data.url;
      if (!url) throw new Error('No mask URL');
      setInpaintMaskUrl(url);
      setMasking(false);
    } catch {
      toaster.show('Mask upload failed', 'warning');
    } finally {
      setAiLoading(false);
    }
  };

  const shadow = element.boxShadow;
  const isSingle = ids.length === 1;

  const updateFocalFromEvent = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    const y = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height));
    set({ focalPoint: { x, y } });
  };

  const handleFocalPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    setDraggingFocal(true);
    updateFocalFromEvent(e);
  };

  const handleFocalPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingFocal) return;
    updateFocalFromEvent(e);
  };

  const handleFocalPointerUp = useCallback(() => {
    setDraggingFocal(false);
  }, []);

  const nudgeFocal = (dx: number, dy: number) => {
    const x = Math.min(1, Math.max(0, (element.focalPoint?.x ?? 0.5) + dx));
    const y = Math.min(1, Math.max(0, (element.focalPoint?.y ?? 0.5) + dy));
    set({ focalPoint: { x, y } });
  };

  const resetFormatLayout = () => {
    const state = store.getState();
    const output = state.doc.outputs[state.currentOutput];
    if (!output) return;
    const source = state.doc.outputs[0] ?? output;
    const reflow = smartReflow(element, source, output);
    const updates: Partial<DesignerElement> = {
      ...reflow,
      crop: undefined,
    };
    if (element.type === 'image') {
      updates.fitMode = 'cover';
      updates.focalPoint = { x: 0.5, y: 0.5 };
    }
    updateElement(element.id, updates);
    store.getState().pushHistory();
  };

  return (
    <>
    <div className="space-y-3">
      <div className="text-[12px] font-medium text-textColor/60 uppercase tracking-wider">
        Image
      </div>

      <button
        onClick={() => setMediaModalOpen(true)}
        className="w-full px-3 py-2 rounded-md text-[12px] border border-designerAccent text-designerAccent hover:bg-designerAccent/10 transition-colors"
      >
        Replace image…
      </button>

      <div>
        <div className="text-[11px] text-textColor/50 mb-1">Fit mode</div>
        <SegmentedControl
          value={element.fitMode || 'fill'}
          options={[
            { value: 'contain', label: 'Fit' },
            { value: 'cover', label: 'Cover' },
            { value: 'fill', label: 'Fill' },
          ]}
          onChange={(v) =>
            set({ fitMode: v as 'contain' | 'cover' | 'fill' })
          }
        />
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-textColor/50">Focal point</span>
          <button
            className="text-[10px] text-designerAccent"
            onClick={() => set({ focalPoint: { x: 0.5, y: 0.5 } })}
          >
            Center
          </button>
        </div>
        <div
          className="relative w-full h-[96px] rounded overflow-hidden border border-newBorder bg-newBgColorInner cursor-crosshair"
          style={{
            backgroundImage: element.src ? `url(${element.src})` : undefined,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
          onPointerDown={handleFocalPointerDown}
          onPointerMove={handleFocalPointerMove}
          onPointerUp={handleFocalPointerUp}
          onPointerLeave={handleFocalPointerUp}
        >
          <div
            className="absolute w-3 h-3 rounded-full border-2 border-white bg-designerAccent shadow pointer-events-none"
            style={{
              left: `calc(${(element.focalPoint?.x ?? 0.5) * 100}% - 6px)`,
              top: `calc(${(element.focalPoint?.y ?? 0.5) * 100}% - 6px)`,
            }}
          />
        </div>
        <div className="grid grid-cols-3 gap-1">
          <div />
          <button
            className="px-2 py-1 bg-newBgColor hover:bg-newColColor/10 rounded border border-newBorder text-xs"
            onClick={() => nudgeFocal(0, -0.02)}
            aria-label="Move focal point up"
          >
            ↑
          </button>
          <div />
          <button
            className="px-2 py-1 bg-newBgColor hover:bg-newColColor/10 rounded border border-newBorder text-xs"
            onClick={() => nudgeFocal(-0.02, 0)}
            aria-label="Move focal point left"
          >
            ←
          </button>
          <button
            className="px-2 py-1 bg-newBgColor hover:bg-newColColor/10 rounded border border-newBorder text-xs"
            onClick={() => nudgeFocal(0, 0.02)}
            aria-label="Move focal point down"
          >
            ↓
          </button>
          <button
            className="px-2 py-1 bg-newBgColor hover:bg-newColColor/10 rounded border border-newBorder text-xs"
            onClick={() => nudgeFocal(0.02, 0)}
            aria-label="Move focal point right"
          >
            →
          </button>
        </div>
      </div>

      <button
        className="w-full px-3 py-2 bg-newBgColor hover:bg-newColColor/10 text-sm rounded border border-newBorder text-left"
        onClick={resetFormatLayout}
      >
        Reset this format’s layout
      </button>

      <div className="grid grid-cols-2 gap-2">
        <Stepper
          label="Focal X"
          min={0}
          max={100}
          step={1}
          value={
            element.focalPoint
              ? Math.round(element.focalPoint.x * 100)
              : 50
          }
          onChange={(n) =>
            set({
              focalPoint: {
                x: n / 100,
                y: element.focalPoint?.y ?? 0.5,
              },
            })
          }
        />
        <Stepper
          label="Focal Y"
          min={0}
          max={100}
          step={1}
          value={
            element.focalPoint
              ? Math.round(element.focalPoint.y * 100)
              : 50
          }
          onChange={(n) =>
            set({
              focalPoint: {
                x: element.focalPoint?.x ?? 0.5,
                y: n / 100,
              },
            })
          }
        />
      </div>

      <button
        className="w-full px-3 py-1.5 text-[12px] border border-newBorder bg-newBgColorInner hover:bg-newBgColor text-textColor/70 hover:text-textColor rounded transition-colors"
        disabled={!!aiLoading}
        onClick={async () => {
          if (!element.src) return;
          setAiLoading('detect-focal');
          try {
            const fp = await detectFocalPoint(element.src, fetch);
            updateElement(element.id, { focalPoint: fp });
          } catch {
            toaster.show('Subject detection failed; using center fallback', 'warning');
          } finally {
            setAiLoading(false);
          }
        }}
      >
        {aiLoading === 'detect-focal' ? 'Detecting…' : 'Auto-detect Subject'}
      </button>

      <Stepper
        label="Border radius"
        min={0}
        value={element.borderRadius || 0}
        onChange={(n) => set({ borderRadius: n })}
      />

      <div className="space-y-2">
        <div className="text-[11px] text-textColor/50">Border</div>
        <ColorSwatch
          label="Color"
          value={element.stroke || '#000000'}
          onChange={(hex) => set({ stroke: hex })}
          brandColors={brandColors}
          brandEnforcement={brandEnforcement}
        />
        <Stepper
          label="Width"
          min={0}
          max={40}
          value={element.strokeWidth || 0}
          onChange={(n) => set({ strokeWidth: n })}
        />
      </div>

      <div className="flex flex-col gap-2 pt-1 border-t border-newBorder">
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-textColor/50">Shadow</span>
          <button
            type="button"
            role="switch"
            aria-checked={!!shadow}
            onClick={() =>
              set({
                boxShadow: shadow ? undefined : { ...DEFAULT_SHADOW },
              } as Partial<DesignerElement>)
            }
            className={`relative w-[40px] h-[22px] rounded-full transition-colors ${
              shadow ? 'bg-designerAccent' : 'bg-newBorder'
            }`}
          >
            <span
              className={`absolute top-[2px] left-[2px] w-[18px] h-[18px] rounded-full bg-white transition-transform ${
                shadow ? 'translate-x-[18px]' : ''
              }`}
            />
          </button>
        </div>
        {shadow && (
          <div className="flex flex-col gap-3">
            <ColorSwatch
              label="Shadow color"
              value={shadow.color || '#000000'}
              onChange={(hex) =>
                set({
                  boxShadow: { ...shadow, color: hex },
                } as Partial<DesignerElement>)
              }
              brandColors={brandColors}
              brandEnforcement={brandEnforcement}
            />
            <Slider
              label="Blur"
              min={0}
              max={40}
              value={shadow.blur}
              onChange={(n) =>
                set({
                  boxShadow: { ...shadow, blur: n },
                } as Partial<DesignerElement>)
              }
            />
            <Slider
              label="Offset X"
              min={-40}
              max={40}
              value={shadow.offsetX}
              onChange={(n) =>
                set({
                  boxShadow: { ...shadow, offsetX: n },
                } as Partial<DesignerElement>)
              }
            />
            <Slider
              label="Offset Y"
              min={-40}
              max={40}
              value={shadow.offsetY}
              onChange={(n) =>
                set({
                  boxShadow: { ...shadow, offsetY: n },
                } as Partial<DesignerElement>)
              }
            />
          </div>
        )}
      </div>

      <div className="flex flex-col gap-2 pt-1 border-t border-newBorder">
        <div className="text-[11px] text-textColor/50">Filters</div>

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

      <div className="space-y-2">
        <div className="text-[11px] text-textColor/50">Mask / Frame</div>
        <div className="grid grid-cols-3 gap-1.5">
          {(
            [
              { shape: 'ellipse', label: 'Circle', icon: '⬮' },
              {
                shape: 'rounded-rect',
                label: 'Rounded',
                icon: '◻',
              },
              { shape: 'triangle', label: 'Triangle', icon: '▲' },
              { shape: 'star', label: 'Star', icon: '★' },
              {
                shape: 'hexagon',
                label: 'Hexagon',
                icon: '⬡',
              },
              { shape: 'heart', label: 'Heart', icon: '♡' },
            ] as const
          ).map(({ shape, label, icon }) => {
            const active =
              element.mask?.type === 'shape' &&
              (element.mask.shape || 'ellipse') === shape;
            return (
              <button
                key={shape}
                type="button"
                title={label}
                onClick={() => {
                  updateElement(element.id, {
                    mask: {
                      type: 'shape',
                      shape,
                      cornerRadius: shape === 'rounded-rect' ? 8 : undefined,
                    },
                  });
                }}
                className={`flex flex-col items-center gap-1 p-2 rounded-lg border text-[20px] transition-all ${
                  active
                    ? 'border-designerAccent bg-designerAccent/10 text-designerAccent'
                    : 'border-newBorder bg-newBgColorInner text-textColor/60 hover:border-designerAccent hover:text-textColor'
                }`}
              >
                <span className="leading-none">{icon}</span>
                <span className="text-[9px] leading-none">{label}</span>
              </button>
            );
          })}
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-[11px] text-textColor/50">
            Photo in text
          </label>
          <input
            type="text"
            value={
              element.mask?.type === 'text' ? element.mask.text || '' : ''
            }
            onChange={(e) => {
              const val = e.target.value;
              if (val.trim()) {
                updateElement(element.id, {
                  mask: { type: 'text', text: val },
                });
              } else if (element.mask?.type === 'text') {
                updateElement(element.id, { mask: undefined });
              } else {
                updateElement(element.id, {
                  mask: { type: 'text', text: '' },
                });
              }
            }}
            placeholder="Enter text for photo-in-text…"
            className="w-full h-[34px] px-[8px] rounded-[6px] bg-newBgColor border border-newBorder text-[13px] text-textColor outline-none focus:border-designerAccent"
          />
        </div>

        {element.mask?.type === 'shape' &&
          element.mask.shape === 'rounded-rect' && (
            <Slider
              label="Corner radius"
              min={0}
              max={Math.min(element.width, element.height) / 2}
              value={element.mask.cornerRadius || 8}
              onChange={(n) =>
                updateElement(element.id, {
                  mask: { ...element.mask!, cornerRadius: n },
                })
              }
            />
          )}

        {element.mask && (
          <button
            onClick={() => updateElement(element.id, { mask: undefined })}
            className="w-full px-3 py-2 rounded-md text-[12px] border border-red-400/40 text-red-400 hover:bg-red-400/10 transition-colors"
          >
            Remove frame
          </button>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-[11px] text-textColor/50">Alt text</label>
        <input
          type="text"
          value={element.alt || ''}
          onChange={(e) =>
            updateElement(element.id, { alt: e.target.value })
          }
          placeholder="Describe this image…"
          className="w-full h-[34px] px-[8px] rounded-[6px] bg-newBgColor border border-newBorder text-[13px] text-textColor outline-none focus:border-designerAccent"
        />
      </div>

      {isSingle && (
        <div className="space-y-2 pt-1">
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-textColor/50">Crop</span>
            {element.crop && (
              <button
                className="text-[10px] text-designerAccent"
                onClick={() =>
                  updateElement(element.id, { crop: undefined })
                }
              >
                Reset
              </button>
            )}
          </div>
          {!natural && (
            <div className="text-[10px] text-textColor/30">
              Loading image…
            </div>
          )}
          {natural && (
            <>
              <Slider
                label="Left"
                suffix="%"
                min={0}
                max={45}
                value={cropInset('left')}
                onChange={(n) => applyCrop('left', n)}
              />
              <Slider
                label="Right"
                suffix="%"
                min={0}
                max={45}
                value={cropInset('right')}
                onChange={(n) => applyCrop('right', n)}
              />
              <Slider
                label="Top"
                suffix="%"
                min={0}
                max={45}
                value={cropInset('top')}
                onChange={(n) => applyCrop('top', n)}
              />
              <Slider
                label="Bottom"
                suffix="%"
                min={0}
                max={45}
                value={cropInset('bottom')}
                onChange={(n) => applyCrop('bottom', n)}
              />
            </>
          )}
        </div>
      )}

      <div className="pt-3 border-t border-newBorder">
        <h4 className="text-xs font-semibold text-gray-400 mb-2 uppercase tracking-wider">AI Tools</h4>
        <div className="space-y-2">
          <button
            className="w-full px-3 py-2 bg-designerAccent/10 hover:bg-designerAccent/20 text-sm rounded border border-designerAccent/30 text-left"
            onClick={handleRemoveBackground}
            disabled={!!aiLoading}
          >
            {aiLoading === 'remove-bg' ? 'Processing...' : 'Remove Background'}
          </button>

          <div className="flex gap-2">
            <select
              className="flex-1 px-2 py-1.5 bg-[#0f0f23] border border-[#2a2a4a] rounded text-sm text-white"
              value={upscaleScale}
              onChange={e => setUpscaleScale(Number(e.target.value))}
            >
              <option value={2}>2× Upscale</option>
              <option value={4}>4× Upscale</option>
            </select>
            <button
              className="px-3 py-1.5 bg-designerAccent/10 hover:bg-designerAccent/20 text-sm rounded border border-designerAccent/30"
              onClick={handleUpscale}
              disabled={!!aiLoading}
            >
              {aiLoading === 'upscale' ? '...' : 'Upscale'}
            </button>
          </div>

          <div className="flex flex-col gap-2">
            <input
              className="w-full px-2 py-1.5 bg-[#0f0f23] border border-[#2a2a4a] rounded text-sm text-white"
              placeholder="Inpaint prompt..."
              value={inpaintPrompt}
              onChange={(e) => setInpaintPrompt(e.target.value)}
            />

            {masking && (
              <div className="flex flex-col gap-2">
                <div
                  className="relative w-full rounded overflow-hidden border border-newBorder cursor-crosshair"
                  onPointerDown={handleMaskPointerDown}
                  onPointerMove={handleMaskPointerMove}
                  onPointerUp={handleMaskPointerUp}
                  onPointerLeave={handleMaskPointerUp}
                >
                  <img
                    ref={previewImgRef}
                    src={element.src}
                    alt=""
                    className="w-full h-auto block"
                    onLoad={initMaskCanvases}
                  />
                  <canvas
                    ref={overlayCanvasRef}
                    className="absolute inset-0 w-full h-full pointer-events-none"
                  />
                </div>
                <Slider
                  label="Brush"
                  suffix="px"
                  min={4}
                  max={48}
                  step={2}
                  value={brushSize}
                  onChange={setBrushSize}
                />
                <div className="flex gap-2">
                  <button
                    className="flex-1 px-2 py-1.5 bg-newBgColor hover:bg-newColColor/10 text-xs rounded border border-newBorder"
                    onClick={clearMask}
                  >
                    Clear
                  </button>
                  <button
                    className="flex-1 px-2 py-1.5 bg-designerAccent/10 hover:bg-designerAccent/20 text-xs rounded border border-designerAccent/30"
                    onClick={uploadMask}
                    disabled={!!aiLoading}
                  >
                    {aiLoading === 'mask-upload' ? 'Uploading…' : 'Done'}
                  </button>
                </div>
              </div>
            )}

            {!masking && (
              <button
                className="w-full px-3 py-1.5 bg-newBgColor hover:bg-newColColor/10 text-sm rounded border border-newBorder text-left"
                onClick={() => setMasking(true)}
                disabled={!!aiLoading}
              >
                {inpaintMaskUrl ? 'Edit mask' : 'Draw mask…'}
              </button>
            )}

            {inpaintMaskUrl && !masking && (
              <div className="text-[10px] text-green-400">Mask ready</div>
            )}

            <button
              className="w-full px-3 py-1.5 bg-designerAccent/10 hover:bg-designerAccent/20 text-sm rounded border border-designerAccent/30 text-left"
              onClick={handleInpaint}
              disabled={!!aiLoading || !inpaintPrompt || !inpaintMaskUrl}
            >
              {aiLoading === 'inpaint' ? '…' : 'Inpaint'}
            </button>
          </div>
        </div>
      </div>
    </div>
    <MediaSelectorModal
      open={mediaModalOpen}
      onClose={() => setMediaModalOpen(false)}
      onSelect={(item) => {
        updateElement(element.id, {
          src: item.url,
          fileId: item.fileId,
          naturalWidth: item.width || undefined,
          naturalHeight: item.height || undefined,
          crop: undefined,
          mask: undefined,
        });
        setMediaModalOpen(false);
      }}
    />
    </>
  );
};
