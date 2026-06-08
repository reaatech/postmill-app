'use client';

import { FC, useEffect, useRef } from 'react';
import DrawChart from 'chart.js/auto';
import { SeriesPoint } from '../utils';

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
  color = 'var(--chart-1, #612bd3)',
  comparisonColor = 'var(--chart-muted, #71767b)',
  height = 300,
  format = 'number',
  onPointClick,
}) => {
  const ref = useRef<HTMLCanvasElement>(null);
  const chart = useRef<DrawChart | null>(null);

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
          borderColor: comparisonColor,
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
        borderColor: color,
        backgroundColor: 'transparent',
        borderWidth: 2.5,
        pointRadius: 0,
        pointHoverRadius: 5,
        pointHoverBackgroundColor: color,
        pointHoverBorderColor: 'var(--new-bgColorInner)',
        pointHoverBorderWidth: 2,
        tension: 0.3,
        fill: false,
      });

      chart.current = new DrawChart(ref.current, {
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
              color: 'var(--new-bgLineColor)',
            },
            border: { display: false },
            ticks: {
              color: 'var(--new-table-text)',
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
              color: 'var(--new-table-text)',
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
            backgroundColor: 'var(--new-bgColorInner)',
            titleColor: 'var(--new-btn-text)',
            bodyColor: 'var(--new-table-text)',
            borderColor: 'var(--new-table-border)',
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
      chart.current?.destroy();
    };
  }, [series, comparisonSeries, color, comparisonColor, height, format, onPointClick]);

  return <canvas ref={ref} style={{ width: '100%', height }} />;
};
