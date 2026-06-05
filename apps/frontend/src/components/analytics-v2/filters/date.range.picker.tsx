'use client';

import { FC, useCallback, useMemo, useState } from 'react';
import dayjs from 'dayjs';

interface Preset {
  label: string;
  days: number | 'mtd' | 'qtd' | 'ytd';
}

const presets: Preset[] = [
  { label: '7 days', days: 7 },
  { label: '30 days', days: 30 },
  { label: '90 days', days: 90 },
  { label: '365 days', days: 365 },
  { label: 'MTD', days: 'mtd' },
  { label: 'QTD', days: 'qtd' },
  { label: 'YTD', days: 'ytd' },
];

function getDateRange(preset: number | 'mtd' | 'qtd' | 'ytd'): {
  from: string;
  to: string;
} {
  const now = dayjs();
  let from: dayjs.Dayjs;

  if (preset === 'mtd') {
    from = now.startOf('month');
  } else if (preset === 'qtd') {
    const q = Math.floor(now.month() / 3);
    from = now.month(q * 3).startOf('month');
  } else if (preset === 'ytd') {
    from = now.startOf('year');
  } else {
    from = now.subtract(preset, 'day');
  }

  return {
    from: from.format('YYYY-MM-DD'),
    to: now.format('YYYY-MM-DD'),
  };
}

interface DateRangePickerProps {
  from: string;
  to: string;
  compare: boolean;
  onChange: (range: { from: string; to: string; compare: boolean }) => void;
}

export const DateRangePicker: FC<DateRangePickerProps> = ({
  from,
  to,
  compare,
  onChange,
}) => {
  const [custom, setCustom] = useState(false);

  const activePreset = useMemo(() => {
    if (custom) return 'Custom';
    for (const p of presets) {
      const range = getDateRange(p.days);
      if (range.from === from && range.to === to) return p.label;
    }
    return custom ? 'Custom' : null;
  }, [from, to, custom]);

  const handlePreset = useCallback(
    (p: Preset) => {
      setCustom(false);
      const range = getDateRange(p.days);
      onChange({ ...range, compare });
    },
    [compare, onChange]
  );

  const handleCustomChange = useCallback(
    (newFrom: string, newTo: string) => {
      setCustom(true);
      onChange({ from: newFrom, to: newTo, compare });
    },
    [compare, onChange]
  );

  const toggleCompare = useCallback(() => {
    onChange({ from, to, compare: !compare });
  }, [from, to, compare, onChange]);

  return (
    <div className="flex items-center gap-[8px] flex-wrap">
      {presets.map((p) => (
        <button
          key={p.label}
          onClick={() => handlePreset(p)}
          className={`px-[10px] py-[5px] text-[12px] font-medium rounded-[6px] transition-colors ${
            activePreset === p.label
              ? 'bg-forth text-white'
              : 'bg-newTableHeader text-newTableText hover:text-btnText border border-newTableBorder'
          }`}
        >
          {p.label}
        </button>
      ))}
      <button
        onClick={() => setCustom(!custom)}
        className={`px-[10px] py-[5px] text-[12px] font-medium rounded-[6px] transition-colors ${
          activePreset === 'Custom'
            ? 'bg-forth text-white'
            : 'bg-newTableHeader text-newTableText hover:text-btnText border border-newTableBorder'
        }`}
      >
        Custom
      </button>
      {custom && (
        <div className="flex items-center gap-[6px]">
          <input
            type="date"
            value={from}
            onChange={(e) => handleCustomChange(e.target.value, to)}
            className="px-[8px] py-[4px] text-[12px] bg-newTableHeader border border-newTableBorder rounded-[6px] text-newTableText"
          />
          <span className="text-[12px] text-newTableText">to</span>
          <input
            type="date"
            value={to}
            onChange={(e) => handleCustomChange(from, e.target.value)}
            className="px-[8px] py-[4px] text-[12px] bg-newTableHeader border border-newTableBorder rounded-[6px] text-newTableText"
          />
        </div>
      )}
      <div className="w-[1px] h-[20px] bg-newTableBorder mx-[4px]" />
      <label className="flex items-center gap-[6px] text-[12px] text-newTableText cursor-pointer select-none">
        <input
          type="checkbox"
          checked={compare}
          onChange={toggleCompare}
          className="accent-forth w-[14px] h-[14px]"
        />
        Compare
      </label>
    </div>
  );
};
