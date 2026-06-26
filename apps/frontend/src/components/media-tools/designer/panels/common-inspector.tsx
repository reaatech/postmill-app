'use client';

import React, { FC, useState } from 'react';
import { Slider, SegmentedControl, Stepper } from '../controls';
import type { DesignerElement } from '../designer.store';

interface CommonInspectorProps {
  selected: DesignerElement[];
  ids: string[];
  store: any;
}

const ALIGN_CENTER = 'center' as const;

export const CommonInspector: FC<CommonInspectorProps> = ({
  selected,
  ids,
  store,
}) => {
  const updateElement = store((s: any) => s.updateElement);
  const updateElements = store((s: any) => s.updateElements);
  const reorder = store((s: any) => s.reorder);
  const pushHistory = store((s: any) => s.pushHistory);
  const currentOutput = store((s: any) => s.currentOutput);
  const doc = store((s: any) => s.doc);

  const output = doc.outputs[currentOutput];
  const primary = selected[0];
  const canvasW = output.width;
  const canvasH = output.height;

  const [aspectLocked, setAspectLocked] = useState(false);
  const aspectRatio =
    primary.naturalWidth && primary.naturalHeight
      ? primary.naturalWidth / primary.naturalHeight
      : primary.width / (primary.height || 1);

  const set = (u: Partial<DesignerElement>) => updateElements(ids, u);

  const handleWidthChange = (n: number) => {
    if (aspectLocked) {
      const h = Math.round(n / aspectRatio);
      updateElements(ids, { width: n, height: h });
    } else {
      updateElements(ids, { width: n });
    }
  };

  const handleHeightChange = (n: number) => {
    if (aspectLocked) {
      const w = Math.round(n * aspectRatio);
      updateElements(ids, { width: w, height: n });
    } else {
      updateElements(ids, { height: n });
    }
  };

  const isMulti = selected.length > 1;

  const alignH = (pos: 'left' | 'center' | 'right') => {
    if (isMulti) {
      const minX = Math.min(...selected.map((s) => s.x));
      const maxX = Math.max(...selected.map((s) => s.x + s.width));
      selected.forEach((el) => {
        let x: number;
        if (pos === 'left') x = minX;
        else if (pos === 'right') x = maxX - el.width;
        else x = Math.round(minX + (maxX - minX) / 2 - el.width / 2);
        updateElement(el.id, { x });
      });
    } else {
      selected.forEach((el) => {
        let x: number;
        if (pos === 'left') x = 0;
        else if (pos === 'right') x = canvasW - el.width;
        else x = Math.round((canvasW - el.width) / 2);
        updateElement(el.id, { x });
      });
    }
    pushHistory();
  };

  const alignV = (pos: 'top' | 'middle' | 'bottom') => {
    if (isMulti) {
      const minY = Math.min(...selected.map((s) => s.y));
      const maxY = Math.max(...selected.map((s) => s.y + s.height));
      selected.forEach((el) => {
        let y: number;
        if (pos === 'top') y = minY;
        else if (pos === 'bottom') y = maxY - el.height;
        else y = Math.round(minY + (maxY - minY) / 2 - el.height / 2);
        updateElement(el.id, { y });
      });
    } else {
      selected.forEach((el) => {
        let y: number;
        if (pos === 'top') y = 0;
        else if (pos === 'bottom') y = canvasH - el.height;
        else y = Math.round((canvasH - el.height) / 2);
        updateElement(el.id, { y });
      });
    }
    pushHistory();
  };

  const distributeHorizontal = () => {
    const sorted = [...selected].sort((a, b) => a.x - b.x);
    const minX = sorted[0].x;
    const maxX = sorted[sorted.length - 1].x + sorted[sorted.length - 1].width;
    const totalWidth = sorted.reduce((sum, s) => sum + s.width, 0);
    const gap = (maxX - minX - totalWidth) / (sorted.length - 1);
    let x = minX;
    for (const s of sorted) {
      updateElement(s.id, { x });
      x += s.width + gap;
    }
    pushHistory();
  };

  const distributeVertical = () => {
    const sorted = [...selected].sort((a, b) => a.y - b.y);
    const minY = sorted[0].y;
    const maxY = sorted[sorted.length - 1].y + sorted[sorted.length - 1].height;
    const totalHeight = sorted.reduce((sum, s) => sum + s.height, 0);
    const gap = (maxY - minY - totalHeight) / (sorted.length - 1);
    let y = minY;
    for (const s of sorted) {
      updateElement(s.id, { y });
      y += s.height + gap;
    }
    pushHistory();
  };

  const resetToOriginal = () => {
    selected.forEach((el) => {
      if (el.naturalWidth && el.naturalHeight) {
        updateElement(el.id, {
          width: el.naturalWidth,
          height: el.naturalHeight,
        });
      }
    });
    pushHistory();
  };

  const hasImageWithNatural = selected.some(
    (el) => el.naturalWidth && el.naturalHeight,
  );

  return (
    <div className="space-y-3 pt-2 border-t border-newBorder">
      <div className="text-[12px] font-medium text-textColor/60 uppercase tracking-wider">
        Common
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Stepper
          label="X"
          value={Math.round(primary.x)}
          onChange={(n) => set({ x: n })}
        />
        <Stepper
          label="Y"
          value={Math.round(primary.y)}
          onChange={(n) => set({ y: n })}
        />
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-textColor/50">Size</span>
          <button
            onClick={() => setAspectLocked((v) => !v)}
            className={`text-[10px] px-2 py-0.5 rounded transition-colors ${
              aspectLocked
                ? 'bg-designerAccent/20 text-designerAccent'
                : 'text-textColor/40 hover:text-textColor'
            }`}
          >
            {aspectLocked ? 'Locked' : 'Unlocked'}
          </button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Stepper
            label="W"
            min={1}
            value={Math.round(primary.width)}
            onChange={handleWidthChange}
          />
          <Stepper
            label="H"
            min={1}
            value={Math.round(primary.height)}
            onChange={handleHeightChange}
          />
        </div>
      </div>

      <Slider
        label="Rotation"
        suffix="°"
        min={0}
        max={360}
        value={Math.round(primary.rotation)}
        onChange={(n) => set({ rotation: n })}
      />

      <Slider
        label="Opacity"
        suffix="%"
        min={0}
        max={100}
        value={Math.round((primary.opacity ?? 1) * 100)}
        onChange={(n) => set({ opacity: n / 100 })}
      />

      <div className="flex items-center justify-between">
        <span className="text-[11px] text-textColor/50">Lock</span>
        <button
          type="button"
          role="switch"
          aria-checked={!!primary.locked}
          onClick={() => set({ locked: !primary.locked })}
          className={`relative w-[40px] h-[22px] rounded-full transition-colors ${
            primary.locked ? 'bg-designerAccent' : 'bg-newBorder'
          }`}
        >
          <span
            className={`absolute top-[2px] left-[2px] w-[18px] h-[18px] rounded-full bg-white transition-transform ${
              primary.locked ? 'translate-x-[18px]' : ''
            }`}
          />
        </button>
      </div>

      <div>
        <div className="text-[11px] text-textColor/50 mb-1">Flip</div>
        <SegmentedControl
          value={primary.flipX ? 'h' : primary.flipY ? 'v' : 'none'}
          options={[
            { value: 'none', label: 'None' },
            { value: 'h', label: 'H-Flip' },
            { value: 'v', label: 'V-Flip' },
          ]}
          onChange={(v) => set({ flipX: v === 'h', flipY: v === 'v' })}
        />
      </div>

      <div>
        <div className="text-[11px] text-textColor/50 mb-1">
          {isMulti ? 'Align to selection' : 'Align to canvas'}
        </div>
        <div className="flex gap-1">
          <button
            onClick={() => alignV('top')}
            aria-label={isMulti ? 'Align tops' : 'Align top'}
            className="flex-1 h-7 rounded text-[11px] border border-newBorder text-textColor hover:bg-newColColor/30"
          >
            ↑ Top
          </button>
          <button
            onClick={() => alignV('middle')}
            aria-label={isMulti ? 'Align vertical centers' : 'Align vertical center'}
            className="flex-1 h-7 rounded text-[11px] border border-newBorder text-textColor hover:bg-newColColor/30"
          >
            ↕ Middle
          </button>
          <button
            onClick={() => alignV('bottom')}
            aria-label={isMulti ? 'Align bottoms' : 'Align bottom'}
            className="flex-1 h-7 rounded text-[11px] border border-newBorder text-textColor hover:bg-newColColor/30"
          >
            ↓ Bottom
          </button>
        </div>
        <div className="flex gap-1 mt-1">
          <button
            onClick={() => alignH('left')}
            aria-label={isMulti ? 'Align left edges' : 'Align left'}
            className="flex-1 h-7 rounded text-[11px] border border-newBorder text-textColor hover:bg-newColColor/30"
          >
            ← Left
          </button>
          <button
            onClick={() => alignH(ALIGN_CENTER)}
            aria-label={isMulti ? 'Align horizontal centers' : 'Align horizontal center'}
            className="flex-1 h-7 rounded text-[11px] border border-newBorder text-textColor hover:bg-newColColor/30"
          >
            ↔ Center
          </button>
          <button
            onClick={() => alignH('right')}
            aria-label={isMulti ? 'Align right edges' : 'Align right'}
            className="flex-1 h-7 rounded text-[11px] border border-newBorder text-textColor hover:bg-newColColor/30"
          >
            → Right
          </button>
        </div>
        {selected.length >= 3 && (
          <div className="flex gap-1 mt-1">
            <button
              onClick={distributeHorizontal}
              aria-label="Distribute horizontally"
              className="flex-1 h-7 rounded text-[11px] border border-newBorder text-textColor hover:bg-newColColor/30"
            >
              ↔ H
            </button>
            <button
              onClick={distributeVertical}
              aria-label="Distribute vertically"
              className="flex-1 h-7 rounded text-[11px] border border-newBorder text-textColor hover:bg-newColColor/30"
            >
              ↕ V
            </button>
          </div>
        )}
      </div>

      <div>
        <div className="text-[11px] text-textColor/50 mb-1">Layer order</div>
        <div className="flex gap-1">
          <button
            onClick={() => reorder(ids, 'back')}
            aria-label="Send to back"
            className="flex-1 h-7 rounded text-[11px] border border-newBorder text-textColor hover:bg-newColColor/30"
          >
            ⤒ Back
          </button>
          <button
            onClick={() => reorder(ids, 'backward')}
            aria-label="Send backward"
            className="flex-1 h-7 rounded text-[11px] border border-newBorder text-textColor hover:bg-newColColor/30"
          >
            ↓ Bwd
          </button>
          <button
            onClick={() => reorder(ids, 'forward')}
            aria-label="Bring forward"
            className="flex-1 h-7 rounded text-[11px] border border-newBorder text-textColor hover:bg-newColColor/30"
          >
            ↑ Fwd
          </button>
          <button
            onClick={() => reorder(ids, 'front')}
            aria-label="Bring to front"
            className="flex-1 h-7 rounded text-[11px] border border-newBorder text-textColor hover:bg-newColColor/30"
          >
            ⤓ Front
          </button>
        </div>
      </div>

      {hasImageWithNatural && (
        <button
          onClick={resetToOriginal}
          className="w-full px-3 py-2 rounded-md text-[12px] border border-newBorder text-textColor hover:bg-newColColor/30"
        >
          Reset to original size
        </button>
      )}
    </div>
  );
};
