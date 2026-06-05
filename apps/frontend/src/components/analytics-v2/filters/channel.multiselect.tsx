'use client';

import { FC, useCallback, useEffect, useMemo, useRef, useState } from 'react';

interface ChannelMultiSelectProps {
  channels: {
    integrationId: string;
    name: string;
    identifier: string;
    picture: string;
  }[];
  selected: string[];
  onChange: (selected: string[]) => void;
}

export const ChannelMultiSelect: FC<ChannelMultiSelectProps> = ({
  channels,
  selected,
  onChange,
}) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const allSelected = selected.length === channels.length;

  const toggleChannel = useCallback(
    (id: string) => {
      const next = selected.includes(id)
        ? selected.filter((s) => s !== id)
        : [...selected, id];
      onChange(next.length === channels.length ? [] : next);
    },
    [selected, channels.length, onChange]
  );

  const toggleAll = useCallback(() => {
    onChange(allSelected ? [] : channels.map((c) => c.integrationId));
  }, [allSelected, channels, onChange]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const displayLabel = useMemo(() => {
    if (!selected.length || allSelected) return 'All channels';
    if (selected.length === 1) {
      const ch = channels.find((c) => c.integrationId === selected[0]);
      return ch?.name || '1 channel';
    }
    return `${selected.length} channels`;
  }, [selected, channels, allSelected]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-[8px] px-[12px] py-[6px] text-[13px] font-medium bg-newTableHeader border border-newTableBorder rounded-[8px] text-newTableText hover:text-btnText transition-colors"
      >
        <span>{displayLabel}</span>
        <svg
          width="10"
          height="6"
          viewBox="0 0 10 6"
          fill="none"
          className={`transition-transform ${open ? 'rotate-180' : ''}`}
        >
          <path
            d="M1 1L5 5L9 1"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      {open && (
        <div className="absolute top-full mt-[4px] left-0 z-50 min-w-[220px] bg-newBgColorInner border border-newTableBorder rounded-[10px] shadow-menu py-[4px]">
          <button
            onClick={toggleAll}
            className="w-full flex items-center gap-[8px] px-[12px] py-[7px] text-[13px] text-newTableText hover:bg-boxHover transition-colors"
          >
            <div
              className={`w-[16px] h-[16px] rounded-[4px] border flex items-center justify-center ${
                allSelected ? 'bg-forth border-forth' : 'border-newTableBorder'
              }`}
            >
              {allSelected && (
                <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                  <path
                    d="M1 4L3.5 6.5L9 1"
                    stroke="white"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              )}
            </div>
            All channels
          </button>
          <div className="h-[1px] bg-newTableBorder mx-[8px] my-[4px]" />
          {channels.map((ch) => (
            <button
              key={ch.integrationId}
              onClick={() => toggleChannel(ch.integrationId)}
              className="w-full flex items-center gap-[8px] px-[12px] py-[7px] text-[13px] text-newTableText hover:bg-boxHover transition-colors"
            >
              <div
                className={`w-[16px] h-[16px] rounded-[4px] border flex items-center justify-center ${
                  selected.includes(ch.integrationId)
                    ? 'bg-forth border-forth'
                    : 'border-newTableBorder'
                }`}
              >
                {selected.includes(ch.integrationId) && (
                  <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                    <path
                      d="M1 4L3.5 6.5L9 1"
                      stroke="white"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                )}
              </div>
              <img
                src={ch.picture}
                alt=""
                className="w-[18px] h-[18px] rounded-[4px]"
              />
              <span className="truncate">{ch.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
