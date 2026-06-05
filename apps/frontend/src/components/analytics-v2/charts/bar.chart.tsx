'use client';

import { FC, useEffect, useRef } from 'react';
import DrawChart from 'chart.js/auto';

interface BarChartProps {
  labels: string[];
  values: number[];
  color?: string;
  height?: number;
  format?: 'number' | 'percent';
  horizontal?: boolean;
  onBarClick?: (index: number) => void;
}

export const BarChart: FC<BarChartProps> = ({
  labels,
  values,
  color = 'var(--chart-1, #612bd3)',
  height = 250,
  format = 'number',
  horizontal = false,
  onBarClick,
}) => {
  const ref = useRef<HTMLCanvasElement>(null);
  const chart = useRef<DrawChart | null>(null);

  useEffect(() => {
    if (!ref.current) return;

    chart.current = new DrawChart(ref.current, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            data: values,
            backgroundColor: color,
            borderColor: color,
            borderWidth: 0,
            borderRadius: 4,
            borderSkipped: false,
          },
        ],
      },
      options: {
        indexAxis: horizontal ? 'y' : 'x',
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 500, easing: 'easeOutQuart' },
        layout: { padding: { top: 8, right: 16, bottom: 4, left: 4 } },
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
              maxRotation: 0,
            },
          },
        },
        onClick: (_event: unknown, elements: { index: number }[]) => {
          if (elements.length > 0 && onBarClick) {
            onBarClick(elements[0].index);
          }
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
            bodyFont: { size: 12, weight: 'bold' },
            callbacks: {
              label(context) {
                const value = context.parsed[horizontal ? 'x' : 'y'];
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
  }, [labels, values, color, height, format, horizontal]);

  return <canvas ref={ref} style={{ width: '100%', height }} />;
};
