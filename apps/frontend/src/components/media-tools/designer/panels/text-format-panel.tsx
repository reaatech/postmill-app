'use client';

import React, { FC, useCallback, useMemo } from 'react';
import type {
  DesignerElement,
  DesignerTextShadow,
} from '../designer.store';
import {
  ColorSwatch,
  Slider,
  SegmentedControl,
  Stepper,
  FontPicker,
} from '../controls';
import { FONT_FAMILIES, ensureFontLoaded } from '../fonts';

const WEIGHTS = [300, 400, 500, 600, 700, 800, 900];

interface TextFormatPanelProps {
  store: ReturnType<typeof import('../designer.store').createDesignerStore>;
}

const isValidHex = (value: string) => /^#[0-9a-fA-F]{6}$/.test(value);

const DEFAULT_SHADOW: DesignerTextShadow = {
  color: '#000000',
  blur: 4,
  offsetX: 2,
  offsetY: 2,
};

export const TextFormatPanel: FC<TextFormatPanelProps> = ({ store }) => {
  const selectedIds = store((s) => s.selectedIds);
  const doc = store((s) => s.doc);
  const currentPage = store((s) => s.currentPage);

  // All currently-selected text elements (multi-select aware).
  const textElements = useMemo<DesignerElement[]>(() => {
    const children = doc.pages[currentPage]?.children ?? [];
    return children.filter(
      (c) => selectedIds.includes(c.id) && c.type === 'text'
    );
  }, [selectedIds, doc, currentPage]);

  // The "primary" element drives the displayed control values.
  const element = textElements[0] ?? null;

  const update = useCallback(
    (updates: Partial<DesignerElement>) => {
      if (!textElements.length) return;
      store.getState().updateElements(
        textElements.map((el) => el.id),
        updates
      );
    },
    [store, textElements]
  );

  if (!element) {
    return null;
  }

  const fill = element.fill || '#000000';
  const safeColor = isValidHex(fill) ? fill : '#000000';

  const isBold = (element.fontWeight ?? 400) >= 600;
  const isItalic = element.fontStyle === 'italic';
  const styleValue = `${isBold ? 'b' : ''}${isItalic ? 'i' : ''}` || 'n';

  const shadow = element.textShadow;
  const outline = element.textStroke;

  return (
    <div
      className="flex flex-col gap-4"
      role="region"
      aria-label="Text formatting"
    >
      <div className="text-[12px] font-medium text-textColor/60 uppercase tracking-wider">
        Text Format
      </div>

      {/* Font family (C2) */}
      <div className="flex flex-col gap-1.5">
        <label className="text-[11px] text-newTextColor/40">Font family</label>
        <FontPicker
          value={element.fontFamily || 'Arial'}
          fonts={FONT_FAMILIES}
          onChange={(family) => {
            void ensureFontLoaded(family);
            update({ fontFamily: family });
          }}
        />
      </div>

      {/* Bold / Italic (C2) */}
      <div className="flex flex-col gap-1.5">
        <label className="text-[11px] text-newTextColor/40">Style</label>
        <SegmentedControl
          value={styleValue}
          options={[
            { value: 'n', label: 'Normal' },
            { value: 'b', label: <span className="font-bold">B</span> },
            { value: 'i', label: <span className="italic">I</span> },
            { value: 'bi', label: <span className="font-bold italic">BI</span> },
          ]}
          onChange={(v) => {
            const bold = v.includes('b');
            const italic = v.includes('i');
            update({
              fontWeight: bold ? 700 : 400,
              fontStyle: italic ? 'italic' : 'normal',
            });
          }}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <label className="text-[11px] text-newTextColor/40">Size</label>
          <input
            type="number"
            min={1}
            max={999}
            value={element.fontSize || 16}
            onChange={(e) => {
              const value = parseInt(e.target.value, 10);
              if (!Number.isNaN(value) && value > 0) {
                update({ fontSize: value });
              }
            }}
            className="w-full h-[34px] px-[8px] rounded-[6px] bg-newBgColor border border-newBorder text-[13px] text-textColor outline-none focus:border-[#2B5CD3]"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-[11px] text-newTextColor/40">Weight</label>
          <select
            value={element.fontWeight || 400}
            onChange={(e) => {
              const value = parseInt(e.target.value, 10);
              update({ fontWeight: value });
            }}
            className="w-full h-[34px] px-[8px] rounded-[6px] bg-newBgColor border border-newBorder text-[13px] text-textColor outline-none focus:border-[#2B5CD3]"
          >
            {WEIGHTS.map((w) => (
              <option key={w} value={w}>
                {w}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <ColorSwatch
          label="Color"
          value={safeColor}
          onChange={(hex) => update({ fill: hex })}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-[11px] text-newTextColor/40">Align</label>
        <div className="flex rounded-[6px] border border-newBorder overflow-hidden">
          {(['left', 'center', 'right'] as const).map((align) => (
            <button
              key={align}
              type="button"
              onClick={() => update({ align })}
              className={`flex-1 h-[34px] text-[13px] text-textColor hover:bg-boxHover transition-colors ${
                (element.align || 'left') === align
                  ? 'bg-[#2B5CD3]/20 text-[#2B5CD3]'
                  : 'bg-newBgColor'
              }`}
              aria-pressed={(element.align || 'left') === align}
            >
              {align === 'left' && '⇤'}
              {align === 'center' && '⇔'}
              {align === 'right' && '⇥'}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <label className="text-[11px] text-newTextColor/40">Line height</label>
          <input
            type="number"
            step={0.1}
            min={0.1}
            max={5}
            value={element.lineHeight ?? 1.2}
            onChange={(e) => {
              const value = parseFloat(e.target.value);
              if (!Number.isNaN(value) && value > 0) {
                update({ lineHeight: value });
              }
            }}
            className="w-full h-[34px] px-[8px] rounded-[6px] bg-newBgColor border border-newBorder text-[13px] text-textColor outline-none focus:border-[#2B5CD3]"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-[11px] text-newTextColor/40">
            Letter spacing
          </label>
          <input
            type="number"
            step={0.5}
            value={element.letterSpacing ?? 0}
            onChange={(e) => {
              const value = parseFloat(e.target.value);
              if (!Number.isNaN(value)) {
                update({ letterSpacing: value });
              }
            }}
            className="w-full h-[34px] px-[8px] rounded-[6px] bg-newBgColor border border-newBorder text-[13px] text-textColor outline-none focus:border-[#2B5CD3]"
          />
        </div>
      </div>

      {/* Text effects: drop shadow (C2) */}
      <div className="flex flex-col gap-2 pt-1 border-t border-newBorder">
        <div className="flex items-center justify-between">
          <span className="text-[12px] font-medium text-textColor/60 uppercase tracking-wider">
            Drop shadow
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={!!shadow}
            onClick={() =>
              update({ textShadow: shadow ? undefined : { ...DEFAULT_SHADOW } })
            }
            className={`relative w-[40px] h-[22px] rounded-full transition-colors ${
              shadow ? 'bg-[#2B5CD3]' : 'bg-newBorder'
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
              value={isValidHex(shadow.color) ? shadow.color : '#000000'}
              onChange={(hex) =>
                update({ textShadow: { ...shadow, color: hex } })
              }
            />
            <Slider
              label="Blur"
              min={0}
              max={40}
              value={shadow.blur}
              onChange={(n) => update({ textShadow: { ...shadow, blur: n } })}
            />
            <Slider
              label="Offset X"
              min={-40}
              max={40}
              value={shadow.offsetX}
              onChange={(n) => update({ textShadow: { ...shadow, offsetX: n } })}
            />
            <Slider
              label="Offset Y"
              min={-40}
              max={40}
              value={shadow.offsetY}
              onChange={(n) => update({ textShadow: { ...shadow, offsetY: n } })}
            />
          </div>
        )}
      </div>

      {/* Text effects: outline (C2) */}
      <div className="flex flex-col gap-2 pt-1 border-t border-newBorder">
        <div className="flex items-center justify-between">
          <span className="text-[12px] font-medium text-textColor/60 uppercase tracking-wider">
            Outline
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={!!outline}
            onClick={() =>
              update({
                textStroke: outline ? undefined : { color: '#000000', width: 2 },
              })
            }
            className={`relative w-[40px] h-[22px] rounded-full transition-colors ${
              outline ? 'bg-[#2B5CD3]' : 'bg-newBorder'
            }`}
          >
            <span
              className={`absolute top-[2px] left-[2px] w-[18px] h-[18px] rounded-full bg-white transition-transform ${
                outline ? 'translate-x-[18px]' : ''
              }`}
            />
          </button>
        </div>
        {outline && (
          <div className="flex flex-col gap-3">
            <ColorSwatch
              label="Outline color"
              value={isValidHex(outline.color) ? outline.color : '#000000'}
              onChange={(hex) =>
                update({ textStroke: { ...outline, color: hex } })
              }
            />
            <Stepper
              label="Width"
              min={0}
              max={20}
              step={1}
              value={outline.width}
              onChange={(n) => update({ textStroke: { ...outline, width: n } })}
            />
          </div>
        )}
      </div>
    </div>
  );
};
