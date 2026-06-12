'use client';

import { FC } from 'react';
import { KPI } from '../utils';
import { useCountUp } from '../hooks/useCountUp';
import { AreaChart } from '../charts/area.chart';

interface KPICardProps {
  kpi: KPI;
  color?: string;
  onClick?: () => void;
}

export const KPICard: FC<KPICardProps> = ({ kpi, color = 'var(--chart-1, #2b5cd3)', onClick }) => {
  const animatedTotal = useCountUp(kpi.total, 800, true);
  const isPositive = kpi.percentageChange >= 0;

  const displayValue = (() => {
    if (kpi.format === 'percent') return animatedTotal.toFixed(1) + '%';
    if (kpi.format === 'currency') return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(Math.round(animatedTotal));
    return new Intl.NumberFormat().format(Math.round(animatedTotal));
  })();

  return (
    <div
      onClick={onClick}
      className="group cursor-pointer bg-newBgColorInner border border-newTableBorder rounded-[12px] overflow-hidden transition-all duration-200 hover:border-newTableText/30 flex flex-col"
    >
      <div className="px-[16px] pt-[14px] pb-[8px] flex items-center justify-between">
        <span className="text-[13px] font-medium text-newTableText uppercase tracking-wide">
          {kpi.label}
        </span>
        {kpi.percentageChange !== 0 && (
          <div className={`flex items-center gap-[4px] text-[13px] font-medium ${isPositive ? 'text-[var(--positive,#32d583)]' : 'text-[var(--negative,#f97066)]'}`}>
            <svg
              width="10"
              height="10"
              viewBox="0 0 12 12"
              fill="none"
              className={isPositive ? '' : 'rotate-180'}
            >
              <path d="M6 2.5L10 7.5H2L6 2.5Z" fill="currentColor" />
            </svg>
            <span className="tabular-nums">
              {Math.abs(kpi.percentageChange).toFixed(1)}
              {kpi.format === 'percent' ? 'pp' : '%'}
            </span>
          </div>
        )}
      </div>
      <div className="px-[16px]">
        <div className="text-[32px] leading-[40px] font-semibold tracking-tight tabular-nums">
          {displayValue}
        </div>
      </div>
      {kpi.sparkline.length > 1 && (
        <div className="mt-[8px] px-[4px]">
          <div className="h-[48px]">
            <AreaChart
              data={kpi.sparkline}
              color={color}
              height={48}
              format={kpi.format === 'percent' ? 'percent' : 'number'}
            />
          </div>
        </div>
      )}
      <div className="px-[16px] pb-[14px]" />
    </div>
  );
};

// Lightweight label/value stat card (no chart/sparkline) for simple KPIs.
// Accepts an optional accent `color` (a chart-palette token) to match the
// look of the analytics KPICard without needing sparkline data.
export const KpiCard: FC<{ label: string; value: string; color?: string }> = ({
  label,
  value,
  color,
}) => (
  <div className="group relative flex-1 overflow-hidden bg-newBgColorInner border border-newTableBorder rounded-[12px] px-[16px] py-[14px] flex flex-col gap-[6px] transition-all duration-200 hover:border-newTableText/30">
    {color && (
      <>
        <span
          className="pointer-events-none absolute inset-x-0 top-0 h-[3px]"
          style={{ background: color }}
        />
        <span
          className="pointer-events-none absolute inset-0 opacity-[0.07] transition-opacity duration-200 group-hover:opacity-[0.12]"
          style={{ background: color }}
        />
      </>
    )}
    <span className="relative text-[13px] font-medium text-newTableText uppercase tracking-wide">
      {label}
    </span>
    <span className="relative text-[32px] leading-[40px] font-semibold tracking-tight tabular-nums">
      {value}
    </span>
  </div>
);
