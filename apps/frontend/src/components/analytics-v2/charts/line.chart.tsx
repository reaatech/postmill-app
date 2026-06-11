'use client';

import { FC, useEffect, useRef, useState } from 'react';
import DrawChart from 'chart.js/auto';
import { SeriesPoint } from '../utils';

function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace('#', '');
  if (clean.length === 3) {
    const r = parseInt(clean[0] + clean[0], 16);
    const g = parseInt(clean[1] + clean[1], 16);
    const b = parseInt(clean[2] + clean[2], 16);
    return `rgba(${r},${g},${b},${alpha})`;
  }
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function resolveCSSVar(value: string): string {
  if (typeof document === 'undefined') return value;
  const match = value.match(/^var\(--([^,]+)(?:,\s*([^)]+))?\)$/);
  if (match) {
    const cssVar = `--${match[1]}`;
    const computed = getComputedStyle(document.documentElement).getPropertyValue(cssVar).trim();
    return computed || match[2]?.trim() || value;
  }
  return value;
}

function useCSSToken(token: string, fallback: string): string {
  const [resolved, setResolved] = useState(() => resolveCSSVar(token) || fallback);
  useEffect(() => {
    const observer = new MutationObserver(() => {
      setResolved(resolveCSSVar(token) || fallback);
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, [token, fallback]);
  return resolved;
}

interface LineChartProps {
  series: SeriesPoint[];
  comparisonSeries?: SeriesPoint[];
  color?: string;
  comparisonColor?: string;
  height?: number;
  format?: 'number' | 'percent' | 'currency' | 'time';
  onPointClick?: (date: string) => void;
}

export const LineChart: FC<LineChartProps> = ({
  series,
  comparisonSeries,
  color = 'var(--chart-1, #2b5cd3)',
  comparisonColor = 'var(--chart-muted, #71767b)',
  height = 300,
  format = 'number',
  onPointClick,
}) => {
  const ref = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<DrawChart | null>(null);
  const resolvedColor = useCSSToken(color, '#2b5cd3');
  const resolvedComparisonColor = useCSSToken(comparisonColor, '#71767b');
  const bgColor = useCSSToken('var(--new-bgColorInner)', '#1a1919');
  const textColor = useCSSToken('var(--new-btn-text)', '#ffffff');
  const tableText = useCSSToken('var(--new-table-text)', '#9c9c9c');
  const borderColor = useCSSToken('var(--new-table-border)', '#2b2b2b');
  const gridColor = useCSSToken('var(--new-bgLineColor)', '#212121');
  const gridDottedColor = (() => {
    const c = resolveCSSVar('var(--new-table-border)') || '#2b2b2b';
    return hexToRgba(c, 0.4);
  })();

  useEffect(() => {
    if (!ref.current) return;

    const ctx = ref.current.getContext('2d');
    if (!ctx) return;

    const labels = series.map(p => p.date);

    const datasets: Record<string, unknown>[] = [];

    if (comparisonSeries && comparisonSeries.length) {
      const comparisonLabels = comparisonSeries.map(p => p.date);
      const allLabels = Array.from(new Set([...labels, ...comparisonLabels])).sort();
      datasets.push({
        label: 'Previous period',
          data: allLabels.map(d => comparisonSeries.find(p => p.date === d)?.value ?? null),
          borderColor: resolvedComparisonColor,
          backgroundColor: 'transparent',
          borderWidth: 2,
          borderDash: [6, 3],
          pointRadius: 0,
          pointHoverRadius: 4,
          tension: 0.3,
          fill: false,
        });
      }

      datasets.push({
        label: 'Current period',
        data: series.map(p => p.value),
          borderColor: resolvedColor,
          backgroundColor: (() => {
            if (!ctx) return 'transparent';
            const g = ctx.createLinearGradient(0, 0, 0, height);
            g.addColorStop(0, hexToRgba(resolvedColor, 0.15));
            g.addColorStop(1, hexToRgba(resolvedColor, 0.01));
            return g;
          })(),
          borderWidth: 2.5,
          pointRadius: 0,
          pointHoverRadius: 5,
          pointHoverBackgroundColor: resolvedColor,
          pointHoverBorderColor: bgColor,
          pointHoverBorderWidth: 2,
          tension: 0.3,
          fill: true,
      });

      chartRef.current = new DrawChart(ref.current, {
        type: 'line',
        data: {
          labels,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          datasets: datasets as any[],
        },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        onClick: (_event: unknown, elements: { index: number }[]) => {
          if (elements.length > 0 && onPointClick) {
            onPointClick(labels[elements[0].index]);
          }
        },
        animation: { duration: 600, easing: 'easeOutQuart' },
        interaction: {
          mode: 'index',
          intersect: false,
        },
        layout: {
          padding: { top: 8, right: 16, bottom: 4, left: 4 },
        },
        scales: {
          y: {
            beginAtZero: true,
            grid: {
              color: gridDottedColor,
            },
            border: { display: false },
            ticks: {
              color: tableText,
              font: { size: 12 },
              maxTicksLimit: 6,
              callback(value) {
                const v = Number(value);
                if (v >= 1_000_000) return (v / 1_000_000).toFixed(1) + 'M';
                if (v >= 1_000) return (v / 1_000).toFixed(1) + 'K';
                return v.toLocaleString();
              },
            },
          },
          x: {
            grid: { display: false },
            border: { display: false },
            ticks: {
              color: tableText,
              font: { size: 12 },
              maxTicksLimit: labels.length > 120 ? 12 : 8,
              maxRotation: 0,
            },
          },
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            enabled: true,
            backgroundColor: bgColor,
            titleColor: textColor,
            bodyColor: tableText,
            borderColor,
            borderWidth: 1,
            padding: 12,
            cornerRadius: 8,
            displayColors: true,
            boxPadding: 4,
            titleFont: { size: 12, weight: 'normal' },
            bodyFont: { size: 12, weight: 'bold' },
            callbacks: {
              label(context) {
                const label = context.dataset.label || '';
                const value = context.parsed.y;
                let formatted: string;
                if (format === 'percent') {
                  formatted = value.toFixed(1) + '%';
                } else if (format === 'currency') {
                  formatted = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(value);
                } else {
                  formatted = new Intl.NumberFormat().format(Math.round(value));
                }
                return label ? `${label}: ${formatted}` : formatted;
              },
            },
          },
        },
      },
    });

    return () => {
      chartRef.current?.destroy();
    };
  }, [series, comparisonSeries, color, comparisonColor, height, format, onPointClick, resolvedColor, resolvedComparisonColor, bgColor, textColor, tableText, gridColor, borderColor, gridDottedColor]);

  return <canvas ref={ref} style={{ width: '100%', height }} />;
};
