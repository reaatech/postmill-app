'use client';

import { FC, useEffect, useRef } from 'react';
import DrawChart from 'chart.js/auto';

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
  const match = value.match(/var\(--[^,]+,\s*([^)]+)\)/);
  return match ? match[1].trim() : value;
}

interface AreaChartProps {
  data: { date: string; value: number }[];
  color?: string;
  height?: number;
  format?: 'number' | 'percent';
}

export const AreaChart: FC<AreaChartProps> = ({
  data,
  color = '#612bd3',
  height = 200,
  format = 'number',
}) => {
  const ref = useRef<HTMLCanvasElement>(null);
  const chart = useRef<DrawChart | null>(null);

  useEffect(() => {
    if (!ref.current || !data.length) return;

    const ctx = ref.current.getContext('2d');
    if (!ctx) return;

    const fallbackHex = resolveCSSVar(color);
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, hexToRgba(fallbackHex, 0.2));
    gradient.addColorStop(1, hexToRgba(fallbackHex, 0.02));

    chart.current = new DrawChart(ref.current, {
      type: 'line',
      data: {
        labels: data.map(p => p.date),
        datasets: [{
          label: 'Value',
          data: data.map(p => p.value),
          borderColor: color,
          backgroundColor: gradient,
          borderWidth: 2,
          fill: true,
          pointRadius: 0,
          tension: 0.3,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 500, easing: 'easeOutQuart' },
        interaction: { mode: 'index', intersect: false },
        layout: { padding: { top: 4, right: 4, bottom: 0, left: 0 } },
        scales: {
          y: {
            beginAtZero: true,
            display: false,
            grid: { display: false },
            border: { display: false },
          },
          x: {
            display: false,
            grid: { display: false },
            border: { display: false },
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
            padding: 8,
            cornerRadius: 6,
            displayColors: false,
            titleFont: { size: 11, weight: 'normal' },
            bodyFont: { size: 12, weight: 'bold' },
            callbacks: {
              label(context) {
                const value = context.parsed.y;
                if (format === 'percent') return value.toFixed(1) + '%';
                return new Intl.NumberFormat().format(Math.round(value));
              },
            },
          },
        },
      },
    });

    return () => {
      chart.current?.destroy();
    };
  }, [data, color, height, format]);

  return <canvas ref={ref} style={{ width: '100%', height }} />;
};
