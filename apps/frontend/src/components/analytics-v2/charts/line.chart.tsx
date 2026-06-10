'use client';

import { FC, useEffect, useRef, useState } from 'react';
import DrawChart from 'chart.js/auto';
import { SeriesPoint } from '../utils';

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
  const gridColor = useCSSToken('var(--new-bgLineColor)', '#212121');
  const borderColor = useCSSToken('var(--new-table-border)', '#2b2b2b');

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
        backgroundColor: 'transparent',
        borderWidth: 2.5,
        pointRadius: 0,
        pointHoverRadius: 5,
        pointHoverBackgroundColor: resolvedColor,
        pointHoverBorderColor: bgColor,
        pointHoverBorderWidth: 2,
        tension: 0.3,
        fill: false,
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
              color: gridColor,
            },
            border: { display: false },
            ticks: {
              color: tableText,
              font: { size: 11 },
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
              font: { size: 10 },
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
            padding: 10,
            cornerRadius: 8,
            displayColors: true,
            boxPadding: 4,
            titleFont: { size: 12, weight: 'normal' },
            bodyFont: { size: 13, weight: 'bold' },
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
  }, [series, comparisonSeries, color, comparisonColor, height, format, onPointClick, resolvedColor, resolvedComparisonColor, bgColor, textColor, tableText, gridColor, borderColor]);

  return <canvas ref={ref} style={{ width: '100%', height }} />;
};
