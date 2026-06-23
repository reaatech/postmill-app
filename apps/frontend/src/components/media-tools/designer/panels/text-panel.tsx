'use client';

import React, { FC, useCallback, useState } from 'react';
import type { DesignerElement } from '../designer.store';
import { FontPicker } from '../controls';
import { FONT_FAMILIES, ensureFontLoaded, SYSTEM_FONT_FAMILY } from '../fonts';

interface TextPanelProps {
  store: ReturnType<typeof import('../designer.store').createDesignerStore>;
  onClose?: () => void;
}

interface TextPreset {
  label: string;
  fontSize: number;
  fontWeight: number;
  text: string;
}

const presets: TextPreset[] = [
  { label: 'Heading', fontSize: 32, fontWeight: 700, text: 'Heading' },
  { label: 'Subheading', fontSize: 24, fontWeight: 500, text: 'Subheading' },
  { label: 'Body', fontSize: 16, fontWeight: 400, text: 'Body text goes here' },
];

export const TextPanel: FC<TextPanelProps> = ({ store, onClose }) => {
  // Font applied to newly-added text (C2). Defaults to the safe system font.
  const [fontFamily, setFontFamily] = useState(SYSTEM_FONT_FAMILY);

  const addText = useCallback(
    (preset: TextPreset) => {
      const state = store.getState();
      const cx = state.doc.width / 2 - 100;
      const cy = state.doc.height / 2 - 16;

      void ensureFontLoaded(fontFamily);

      const el: DesignerElement = {
        id: '',
        type: 'text',
        x: cx,
        y: cy,
        width: 200,
        height: 40,
        rotation: 0,
        opacity: 1,
        locked: false,
        hidden: false,
        text: preset.text,
        fontSize: preset.fontSize,
        fontWeight: preset.fontWeight,
        fontFamily,
        fill: '#000000',
        align: 'center',
      };

      state.addElement(el);
      onClose?.();
    },
    [store, onClose, fontFamily]
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <label className="text-[11px] text-newTextColor/40">Font</label>
        <FontPicker
          value={fontFamily}
          fonts={FONT_FAMILIES}
          onChange={(family) => {
            void ensureFontLoaded(family);
            setFontFamily(family);
          }}
        />
      </div>

      {presets.map((preset) => (
        <button
          key={preset.label}
          onClick={() => addText(preset)}
          className="w-full rounded-lg border border-newBorder bg-newBgColorInner p-4 text-left hover:border-[#2B5CD3] hover:bg-newColColor/10 transition-all group"
        >
          <div className="text-[11px] text-newTextColor/40 mb-1">
            {preset.label}
          </div>
          <div
            className="text-textColor"
            style={{
              fontSize: `${preset.fontSize}px`,
              fontWeight: preset.fontWeight,
              fontFamily: `"${fontFamily}"`,
            }}
          >
            {preset.text}
          </div>
        </button>
      ))}
    </div>
  );
};
