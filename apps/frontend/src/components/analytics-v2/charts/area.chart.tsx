'use client';

import { FC, useEffect, useRef, useState } from 'react';
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

interface AreaChartProps {
  data: { date: string; value: number }[];
  color?: string;
  height?: number;
  format?: 'number' | 'percent';
}

export const AreaChart: FC<AreaChartProps> = ({
  data,
  color = '#2b5cd3',
  height = 200,
  format = 'number',
}) => {
  const ref = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<DrawChart | null>(null);
  const bgColor = useCSSToken('var(--new-bgColorInner)', '#1a1919');
  const textColor = useCSSToken('var(--new-btn-text)', '#ffffff');
  const tableText = useCSSToken('var(--new-table-text)', '#9c9c9c');
  const borderColor = useCSSToken('var(--new-table-border)', '#2b2b2b');

  useEffect(() => {
    if (!ref.current || !data.length) return;

    const ctx = ref.current.getContext('2d');
    if (!ctx) return;

    const resolvedColor = resolveCSSVar(color);
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, hexToRgba(resolvedColor, 0.2));
    gradient.addColorStop(1, hexToRgba(resolvedColor, 0.02));

    chartRef.current = new DrawChart(ref.current, {
      type: 'line',
      data: {
        labels: data.map(p => p.date),
        datasets: [{
          label: 'Value',
          data: data.map(p => p.value),
          borderColor: resolvedColor,
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
            backgroundColor: bgColor,
            titleColor: textColor,
            bodyColor: tableText,
            borderColor,
            borderWidth: 1,
            padding: 12,
            cornerRadius: 8,
            displayColors: false,
            titleFont: { size: 12, weight: 'normal' },
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
      chartRef.current?.destroy();
    };
  }, [data, color, height, format, bgColor, textColor, tableText, borderColor]);

  return <canvas ref={ref} style={{ width: '100%', height }} />;
};
