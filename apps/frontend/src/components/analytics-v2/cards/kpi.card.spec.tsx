import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { KPICard } from './kpi.card';
import { KPI } from '../utils';

vi.mock('../hooks/useCountUp', () => ({
  useCountUp: (target: number) => target,
}));

vi.mock('chart.js/auto', () => ({
  default: class {
    destroy() {}
  },
}));

const baseKpi: KPI = {
  metric: 'impressions',
  label: 'Impressions',
  format: 'number',
  total: 12345,
  previousTotal: 10000,
  percentageChange: 23.45,
  sparkline: [],
};

describe('KPICard', () => {
  it('renders metric label', () => {
    render(<KPICard kpi={baseKpi} />);
    expect(screen.getByText('Impressions')).toBeTruthy();
  });

  it('renders formatted number value', () => {
    render(<KPICard kpi={baseKpi} />);
    expect(screen.getByText('12,345')).toBeTruthy();
  });

  it('renders positive percentage change', () => {
    render(<KPICard kpi={baseKpi} />);
    expect(screen.getByText((content) => content.startsWith('23.4') && content.includes('%'))).toBeTruthy();
  });

  it('renders negative percentage change', () => {
    render(<KPICard kpi={{ ...baseKpi, percentageChange: -15.3 }} />);
    expect(screen.getByText('15.3%')).toBeTruthy();
  });

  it('hides trend block when percentage change is zero', () => {
    render(<KPICard kpi={{ ...baseKpi, percentageChange: 0 }} />);
    expect(screen.queryByText('0.0%')).toBeFalsy();
  });

  it('renders percent format correctly', () => {
    render(<KPICard kpi={{ ...baseKpi, format: 'percent', total: 45.67 }} />);
    expect(screen.getByText('45.7%')).toBeTruthy();
  });

  it('renders currency format correctly', () => {
    render(<KPICard kpi={{ ...baseKpi, format: 'currency', total: 5000 }} />);
    expect(screen.getByText('$5,000')).toBeTruthy();
  });

  it('renders sparkline canvas when data has multiple points', () => {
    const { container } = render(
      <KPICard
        kpi={{
          ...baseKpi,
          sparkline: [
            { date: '2024-01-01', value: 10 },
            { date: '2024-01-02', value: 20 },
          ],
        }}
      />
    );
    expect(container.querySelector('canvas')).toBeTruthy();
  });

  it('does not render sparkline for single data point', () => {
    const { container } = render(
      <KPICard
        kpi={{
          ...baseKpi,
          sparkline: [{ date: '2024-01-01', value: 10 }],
        }}
      />
    );
    expect(container.querySelector('canvas')).toBeFalsy();
  });

  it('calls onClick when card is clicked', () => {
    const onClick = vi.fn();
    render(<KPICard kpi={baseKpi} onClick={onClick} />);
    screen.getByText('Impressions').closest('[class*="cursor-pointer"]')!.click();
    expect(onClick).toHaveBeenCalledOnce();
  });
});
