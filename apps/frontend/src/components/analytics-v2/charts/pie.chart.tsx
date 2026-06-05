'use client';

import { FC, useEffect, useRef } from 'react';
import DrawChart from 'chart.js/auto';

const CHART_COLORS = [
  'var(--chart-1, #612bd3)',
  'var(--chart-2, #32d583)',
  'var(--chart-3, #1d9bf0)',
  'var(--chart-4, #f97066)',
  'var(--chart-5, #ffac30)',
  'var(--chart-6, #8b90ff)',
  'var(--chart-7, #b69dec)',
  'var(--chart-8, #e4b895)',
];

interface PieChartProps {
  data: { label: string; value: number }[];
  height?: number;
  maxSlices?: number;
  centerLabel?: string;
  onSliceClick?: (label: string) => void;
}

export const PieChart: FC<PieChartProps> = ({
  data,
  height = 250,
  maxSlices = 8,
  centerLabel,
  onSliceClick,
}) => {
  const ref = useRef<HTMLCanvasElement>(null);
  const chart = useRef<DrawChart | null>(null);
  const centerRef = useRef<HTMLDivElement>(null);

  const processed = (() => {
    const sorted = [...data].sort((a, b) => b.value - a.value);
    if (sorted.length <= maxSlices) return sorted;
    const top = sorted.slice(0, maxSlices - 1);
    const other = sorted.slice(maxSlices - 1);
    const otherSum = other.reduce((s, i) => s + i.value, 0);
    return [...top, { label: 'Other', value: otherSum }];
  })();

  useEffect(() => {
    if (!ref.current || !processed.length) return;

    chart.current = new DrawChart(ref.current, {
      type: 'doughnut',
      data: {
        labels: processed.map((p) => p.label),
        datasets: [
          {
            data: processed.map((p) => p.value),
            backgroundColor: processed.map(
              (_, i) => CHART_COLORS[i % CHART_COLORS.length]
            ),
            borderColor: 'var(--new-bgColorInner)',
            borderWidth: 2,
            hoverOffset: 6,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '70%',
        animation: { duration: 500, easing: 'easeOutQuart' },
        layout: { padding: 8 },
        onClick: (_event: unknown, elements: { index: number }[]) => {
          if (elements.length > 0 && onSliceClick) {
            const index = elements[0].index;
            onSliceClick(processed[index]?.label || '');
          }
        },
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              color: 'var(--new-table-text)',
              font: { size: 11 },
              padding: 12,
              usePointStyle: true,
              pointStyle: 'circle',
              boxWidth: 8,
              boxHeight: 8,
            },
          },
          tooltip: {
            enabled: true,
            backgroundColor: 'var(--new-bgColorInner)',
            titleColor: 'var(--new-btn-text)',
            bodyColor: 'var(--new-table-text)',
            borderColor: 'var(--new-table-border)',
            borderWidth: 1,
            padding: 8,
            cornerRadius: 6,
            bodyFont: { size: 12, weight: 'bold' },
            callbacks: {
              label(context) {
                const total = (context.dataset.data as number[]).reduce(
                  (a, b) => a + b,
                  0
                );
                const value = context.parsed;
                const pct =
                  total > 0 ? ((value / total) * 100).toFixed(1) : '0';
                return `${context.label}: ${new Intl.NumberFormat().format(
                  Math.round(value)
                )} (${pct}%)`;
              },
            },
          },
        },
      },
    });

    return () => {
      chart.current?.destroy();
    };
  }, [processed, height]);

  const total = processed.reduce((s, i) => s + i.value, 0);

  return (
    <div className="relative" style={{ height }}>
      <canvas ref={ref} style={{ width: '100%', height: '100%' }} />
      {centerLabel !== undefined && (
        <div
          ref={centerRef}
          className="absolute inset-0 flex items-center justify-center pointer-events-none"
        >
          <div className="text-center">
            <div className="text-[24px] font-semibold leading-tight tabular-nums">
              {new Intl.NumberFormat().format(Math.round(total))}
            </div>
            {centerLabel && (
              <div className="text-[11px] text-newTableText mt-[2px]">
                {centerLabel}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
