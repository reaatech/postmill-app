'use client';

import React, { FC, useCallback, useState } from 'react';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { CHANNEL_PRESETS } from '@gitroom/nestjs-libraries/integrations/social/channel-presets';

interface MagicResizeProps {
  store: any;
  onComplete?: (results: { id: string; path: string }[]) => void;
}

export const MagicResize: FC<MagicResizeProps> = ({ store, onComplete }) => {
  const fetch = useFetch();
  const toaster = useToaster();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [resizing, setResizing] = useState(false);

  const presets = CHANNEL_PRESETS.filter((p) => p.category !== 'custom');

  const togglePreset = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleResize = useCallback(async () => {
    const state = store.getState();
    const doc = state.doc;
    const oldWidth = doc.width;
    const oldHeight = doc.height;
    const children = doc.pages[0]?.children || [];

    if (selectedIds.size === 0) {
      toaster.show('Select at least one target size', 'warning');
      return;
    }

    setResizing(true);
    const results: { id: string; path: string }[] = [];

    try {
      for (const presetId of selectedIds) {
        const preset = CHANNEL_PRESETS.find((p) => p.id === presetId);
        if (!preset) continue;

        const scaleX = preset.width / oldWidth;
        const scaleY = preset.height / oldHeight;

        const newChildren = children.map((el: any) => ({
          ...el,
          x: Math.round(el.x * scaleX),
          y: Math.round(el.y * scaleY),
          width: Math.max(Math.round(el.width * scaleX), 10),
          height: Math.max(Math.round(el.height * scaleY), 10),
          id: el.id,
        }));

        const newDoc = {
          ...doc,
          width: preset.width,
          height: preset.height,
          pages: [
            {
              ...doc.pages[0],
              children: newChildren,
            },
          ],
        };

        const res = await fetch('/media/designs', {
          method: 'POST',
          body: JSON.stringify({
            name: `${state.designName} (${preset.name})`,
            doc: newDoc,
            width: preset.width,
            height: preset.height,
          }),
        });

        if (res.ok) {
          const data = await res.json();
          results.push({ id: data.id, path: `/media/designs/${data.id}` });
        }
      }

      toaster.show(`${results.length} design(s) created`, 'success');
      onComplete?.(results);
    } catch {
      toaster.show('Resize failed', 'warning');
    } finally {
      setResizing(false);
    }
  }, [store, selectedIds, fetch, toaster, onComplete]);

  return (
    <div className="flex flex-col gap-3">
      <div className="text-[14px] font-medium text-textColor">
        Magic Resize
      </div>
      <div className="text-[12px] text-newTextColor/40">
        Select target channel sizes to create new designs with proportionally
        scaled elements.
      </div>

      <div className="flex flex-col gap-1 max-h-[300px] overflow-y-auto">
        {presets.map((preset) => (
          <label
            key={preset.id}
            className="flex items-center gap-3 px-3 py-2 rounded-[6px] hover:bg-boxHover cursor-pointer transition-all text-[13px] text-textColor"
          >
            <input
              type="checkbox"
              checked={selectedIds.has(preset.id)}
              onChange={() => togglePreset(preset.id)}
              className="w-4 h-4 rounded border-newBorder accent-[#2B5CD3]"
            />
            <div className="flex-1">{preset.name}</div>
            <div className="text-[11px] text-newTextColor/40">
              {preset.width}&times;{preset.height}
            </div>
          </label>
        ))}
      </div>

      <button
        onClick={handleResize}
        disabled={resizing || selectedIds.size === 0}
        className="w-full h-[36px] rounded-[6px] bg-[#2B5CD3] text-white text-[13px] font-medium hover:bg-[#2B5CD3]/80 disabled:opacity-50 transition-all"
      >
        {resizing ? 'Resizing...' : `Resize to ${selectedIds.size} preset(s)`}
      </button>
    </div>
  );
};
