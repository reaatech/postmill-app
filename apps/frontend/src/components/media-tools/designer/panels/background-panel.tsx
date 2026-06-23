'use client';

import React, { FC, useCallback, useState } from 'react';
import useSWR from 'swr';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import type { DesignerGradient } from '../designer.store';
import { ColorSwatch, Slider, SegmentedControl } from '../controls';
import { PanelSkeletonGrid, PanelError } from './panel-states';

interface BackgroundPanelProps {
  store: ReturnType<typeof import('../designer.store').createDesignerStore>;
  onClose?: () => void;
}

interface FileItem {
  id: string;
  path: string;
  name: string;
}

const colorPresets = [
  { label: 'White', color: '#ffffff' },
  { label: 'Black', color: '#000000' },
  { label: 'Blue', color: '#2B5CD3' },
  { label: 'Dark Blue', color: '#1e2a4a' },
  { label: 'Red', color: '#e53935' },
  { label: 'Green', color: '#43a047' },
  { label: 'Purple', color: '#7b1fa2' },
  { label: 'Orange', color: '#fb8c00' },
  { label: 'Gray', color: '#9e9e9e' },
  { label: 'Light Gray', color: '#f5f5f5' },
];

type Mode = 'color' | 'gradient' | 'image';

export const BackgroundPanel: FC<BackgroundPanelProps> = ({ store }) => {
  const fetch = useFetch();
  const [mode, setMode] = useState<Mode>('color');
  const currentBg = store((s) => s.doc.pages[s.currentPage]?.background || '#ffffff');

  // Gradient builder state.
  const [stop0, setStop0] = useState('#2B5CD3');
  const [stop1, setStop1] = useState('#1e2a4a');
  const [angle, setAngle] = useState(90);
  const [gradientType, setGradientType] = useState<'linear' | 'radial'>('linear');

  // Image-from-URL state.
  const [imageUrl, setImageUrl] = useState('');

  const setColor = useCallback(
    (color: string) => {
      store.getState().setPageBackground({ type: 'color', color });
    },
    [store]
  );

  const applyGradient = useCallback(() => {
    const gradient: DesignerGradient = {
      type: gradientType,
      angle,
      stops: [
        { offset: 0, color: stop0 },
        { offset: 1, color: stop1 },
      ],
    };
    store.getState().setPageBackground({ type: 'gradient', gradient });
  }, [store, gradientType, angle, stop0, stop1]);

  const setImage = useCallback(
    (src: string, fileId?: string) => {
      if (!src) return;
      store.getState().setPageBackground({ type: 'image', src, fileId });
    },
    [store]
  );

  // CSS preview of the gradient.
  const gradientCss =
    gradientType === 'linear'
      ? `linear-gradient(${angle}deg, ${stop0}, ${stop1})`
      : `radial-gradient(circle, ${stop0}, ${stop1})`;

  const { data, error, isLoading, mutate } = useSWR(
    mode === 'image' ? 'background-files-page-1' : null,
    async () => {
      const res = await fetch('/files?page=1&limit=20');
      if (!res.ok) throw new Error('Failed to load files');
      return res.json() as Promise<{ data: FileItem[]; total: number }>;
    },
    { keepPreviousData: true }
  );

  return (
    <div className="flex flex-col gap-3">
      <SegmentedControl
        value={mode}
        options={[
          { value: 'color', label: 'Color' },
          { value: 'gradient', label: 'Gradient' },
          { value: 'image', label: 'Image' },
        ]}
        onChange={(v) => setMode(v as Mode)}
      />

      {mode === 'color' && (
        <>
          <div className="grid grid-cols-5 gap-2">
            {colorPresets.map((preset) => (
              <button
                key={preset.color}
                onClick={() => setColor(preset.color)}
                title={preset.label}
                className={`w-full aspect-square rounded-lg border-2 transition-all ${
                  currentBg === preset.color
                    ? 'border-[#2B5CD3] ring-1 ring-[#2B5CD3]'
                    : 'border-newBorder hover:border-[#2B5CD3]'
                }`}
              >
                <div
                  className="w-full h-full rounded-[5px]"
                  style={{ backgroundColor: preset.color }}
                />
              </button>
            ))}
          </div>

          <ColorSwatch
            label="Custom color"
            value={/^#[0-9a-fA-F]{6}$/.test(currentBg) ? currentBg : '#ffffff'}
            onChange={setColor}
          />
        </>
      )}

      {mode === 'gradient' && (
        <div className="flex flex-col gap-3">
          <div
            className="w-full h-16 rounded-lg border border-newBorder"
            style={{ background: gradientCss }}
          />

          <SegmentedControl
            value={gradientType}
            options={[
              { value: 'linear', label: 'Linear' },
              { value: 'radial', label: 'Radial' },
            ]}
            onChange={(v) => setGradientType(v as 'linear' | 'radial')}
          />

          <div className="grid grid-cols-2 gap-3">
            <ColorSwatch label="Start" value={stop0} onChange={setStop0} />
            <ColorSwatch label="End" value={stop1} onChange={setStop1} />
          </div>

          {gradientType === 'linear' && (
            <Slider
              label="Angle"
              min={0}
              max={360}
              suffix="°"
              value={angle}
              onChange={setAngle}
            />
          )}

          <button
            onClick={applyGradient}
            className="w-full px-3 py-2 rounded-lg text-[12px] font-medium bg-[#2B5CD3] text-white hover:bg-[#2B5CD3]/80"
          >
            Apply gradient
          </button>
        </div>
      )}

      {mode === 'image' && (
        <div className="flex flex-col gap-3">
          <div className="flex gap-2">
            <input
              type="text"
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              placeholder="Image URL…"
              className="flex-1 h-[36px] px-3 rounded-lg bg-newBgColorInner border border-newBorder text-[13px] outline-none focus:border-[#2B5CD3] text-textColor"
            />
            <button
              onClick={() => setImage(imageUrl.trim())}
              disabled={!imageUrl.trim()}
              className="px-[12px] h-[36px] rounded-lg bg-[#2B5CD3] text-white text-[13px] font-medium hover:bg-[#2B5CD3]/80 disabled:opacity-50 shrink-0"
            >
              Use
            </button>
          </div>

          <div className="text-[11px] text-newTextColor/40">From your files</div>

          {isLoading && !data ? (
            <PanelSkeletonGrid count={4} />
          ) : error && !data ? (
            <PanelError
              message="Couldn't load files"
              onRetry={() => mutate()}
            />
          ) : !data?.data?.length ? (
            <div className="text-[12px] text-newTextColor/40 text-center py-4">
              No files found
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {data.data.map((file) => (
                <button
                  key={file.id}
                  onClick={() => setImage(file.path, file.id)}
                  className="group rounded-lg overflow-hidden border border-newBorder bg-newBgColorInner hover:border-[#2B5CD3] transition-all"
                >
                  <div className="aspect-[4/3] relative overflow-hidden bg-newColColor/10">
                    <img
                      src={file.path}
                      alt={file.name}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                      loading="lazy"
                    />
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
