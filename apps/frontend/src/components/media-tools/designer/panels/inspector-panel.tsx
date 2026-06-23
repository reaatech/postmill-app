'use client';

import React, { FC, useMemo, useRef } from 'react';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { ColorSwatch, Slider, SegmentedControl, Stepper } from '../controls';
import { getImageNaturalSize } from '../elements';
import { TextFormatPanel } from './text-format-panel';
import type { DesignerElement } from '../designer.store';

interface InspectorProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  store: any;
}

// Right-docked, selection-aware inspector (A1). Hosts opacity (A4), flip (A5),
// replace (A6), crop (A7) and the premium control vocabulary (A3/M4).
export const InspectorPanel: FC<InspectorProps> = ({ store }) => {
  const fetch = useFetch();
  const doc = store((s: any) => s.doc);
  const currentPage = store((s: any) => s.currentPage);
  const selectedIds = store((s: any) => s.selectedIds);
  const updateElement = store((s: any) => s.updateElement);
  const updateElements = store((s: any) => s.updateElements);
  const fileInput = useRef<HTMLInputElement>(null);

  const selected: DesignerElement[] = useMemo(
    () => (doc.pages[currentPage]?.children || []).filter((c: DesignerElement) => selectedIds.includes(c.id)),
    [doc, currentPage, selectedIds]
  );

  if (!selected.length) return null;
  const primary = selected[0];
  const ids = selected.map((s) => s.id);
  const isImage = selected.every((s) => s.type === 'image');
  const isText = primary.type === 'text';
  const set = (u: Partial<DesignerElement>) => updateElements(ids, u);

  const handleReplace = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const form = new FormData();
    form.append('file', file);
    try {
      const res = await fetch('/files/upload-simple', { method: 'POST', body: form });
      const data = await res.json();
      if (data?.path) updateElement(primary.id, { src: data.path, fileId: data.id, crop: undefined });
    } catch {
      /* ignore */
    } finally {
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  // Crop is expressed as percentage insets that map to source pixels.
  const natural = getImageNaturalSize(primary.src);
  const cropInset = (side: 'left' | 'top' | 'right' | 'bottom') => {
    if (!primary.crop || !natural) return 0;
    const c = primary.crop;
    if (side === 'left') return Math.round((c.x / natural.width) * 100);
    if (side === 'top') return Math.round((c.y / natural.height) * 100);
    if (side === 'right') return Math.round((1 - (c.x + c.width) / natural.width) * 100);
    return Math.round((1 - (c.y + c.height) / natural.height) * 100);
  };
  const applyCrop = (side: 'left' | 'top' | 'right' | 'bottom', pct: number) => {
    if (!natural) return;
    const cur = primary.crop || { x: 0, y: 0, width: natural.width, height: natural.height };
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
    updateElement(primary.id, {
      crop: {
        x: Math.max(0, x),
        y: Math.max(0, y),
        width: Math.max(1, width),
        height: Math.max(1, height),
      },
    });
  };

  return (
    <div className="space-y-4">
      <div className="text-[11px] text-textColor/40">
        {selected.length > 1 ? `${selected.length} selected` : primary.type}
      </div>

      {/* Position & size */}
      <div className="grid grid-cols-2 gap-2">
        <Stepper label="X" value={Math.round(primary.x)} onChange={(n) => set({ x: n })} />
        <Stepper label="Y" value={Math.round(primary.y)} onChange={(n) => set({ y: n })} />
        <Stepper label="W" min={1} value={Math.round(primary.width)} onChange={(n) => set({ width: n })} />
        <Stepper label="H" min={1} value={Math.round(primary.height)} onChange={(n) => set({ height: n })} />
      </div>

      <Slider label="Rotation" suffix="°" min={0} max={360} value={Math.round(primary.rotation)} onChange={(n) => set({ rotation: n })} />
      <Slider label="Opacity" suffix="%" min={0} max={100} value={Math.round((primary.opacity ?? 1) * 100)} onChange={(n) => set({ opacity: n / 100 })} />

      {(primary.type === 'shape' || isText) && (
        <ColorSwatch label="Fill" value={primary.fill || '#2B5CD3'} onChange={(hex) => set({ fill: hex })} />
      )}

      {primary.type === 'shape' && (
        <Stepper label="Corner radius" min={0} value={primary.borderRadius || 0} onChange={(n) => set({ borderRadius: n })} />
      )}

      {isImage && (
        <div className="space-y-3">
          <div>
            <div className="text-[11px] text-textColor/50 mb-1">Flip</div>
            <SegmentedControl
              value={primary.flipX ? 'h' : primary.flipY ? 'v' : 'none'}
              options={[
                { value: 'none', label: 'None' },
                { value: 'h', label: 'Horizontal' },
                { value: 'v', label: 'Vertical' },
              ]}
              onChange={(v) => set({ flipX: v === 'h', flipY: v === 'v' })}
            />
          </div>
          <button
            onClick={() => fileInput.current?.click()}
            className="w-full px-3 py-2 rounded-md text-[12px] border border-newBorder text-textColor hover:bg-newColColor/30"
          >
            Replace image…
          </button>
          <input ref={fileInput} type="file" accept="image/*" className="hidden" onChange={handleReplace} />

          {selected.length === 1 && (
            <div className="space-y-2 pt-1">
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-textColor/50">Crop</span>
                {primary.crop && (
                  <button className="text-[10px] text-[#2B5CD3]" onClick={() => updateElement(primary.id, { crop: undefined })}>
                    Reset
                  </button>
                )}
              </div>
              {!natural && <div className="text-[10px] text-textColor/30">Loading image…</div>}
              {natural && (
                <>
                  <Slider label="Left" suffix="%" min={0} max={45} value={cropInset('left')} onChange={(n) => applyCrop('left', n)} />
                  <Slider label="Right" suffix="%" min={0} max={45} value={cropInset('right')} onChange={(n) => applyCrop('right', n)} />
                  <Slider label="Top" suffix="%" min={0} max={45} value={cropInset('top')} onChange={(n) => applyCrop('top', n)} />
                  <Slider label="Bottom" suffix="%" min={0} max={45} value={cropInset('bottom')} onChange={(n) => applyCrop('bottom', n)} />
                </>
              )}
            </div>
          )}
        </div>
      )}

      {isText && selected.length === 1 && (
        <div className="pt-2 border-t border-newBorder">
          <TextFormatPanel store={store} />
        </div>
      )}
    </div>
  );
};
