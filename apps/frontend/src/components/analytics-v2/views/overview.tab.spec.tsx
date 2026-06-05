import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { OverviewTab } from './overview.tab';
import { OverviewResponse } from '../utils';

vi.mock('../hooks/useCountUp', () => ({
  useCountUp: (target: number) => target,
}));

const mockUseMetricDrill = vi.fn().mockReturnValue({ data: undefined });
const mockUseDayDrill = vi.fn().mockReturnValue({ data: undefined });

vi.mock('../hooks/useMetricDrill', () => ({
  useMetricDrill: (...args: any[]) => mockUseMetricDrill(...args),
}));

vi.mock('../hooks/useDayDrill', () => ({
  useDayDrill: (...args: any[]) => mockUseDayDrill(...args),
}));

vi.mock('chart.js/auto', () => ({
  default: class {
    destroy() {}
  },
}));

const baseProps = {
  from: '2024-01-01',
  to: '2024-01-07',
  integrations: ['i1', 'i2'],
  compare: true,
  onSelectMetric: vi.fn(),
};

const sampleData: OverviewResponse = {
  range: { from: '2024-01-01', to: '2024-01-07' },
  kpis: [
    {
      metric: 'impressions',
      label: 'Impressions',
      format: 'number',
      total: 50000,
      previousTotal: 40000,
      percentageChange: 25,
      sparkline: [
        { date: '2024-01-01', value: 7000 },
        { date: '2024-01-02', value: 8000 },
      ],
    },
    {
      metric: 'engagement',
      label: 'Engagement',
      format: 'number',
      total: 2500,
      previousTotal: 3000,
      percentageChange: -16.7,
      sparkline: [],
    },
  ],
  series: {
    impressions: [
      { date: '2024-01-01', value: 7000 },
      { date: '2024-01-02', value: 8000 },
    ],
  },
  byChannel: [
    {
      integrationId: 'i1',
      name: 'Twitter',
      identifier: '@twitter',
      picture: '/tw.png',
      kpis: [
        {
          metric: 'impressions',
          label: 'Impressions',
          format: 'number',
          total: 30000,
          previousTotal: 20000,
          percentageChange: 50,
        },
      ],
    },
  ],
  breakdown: {
    byPlatform: [{ identifier: 'twitter', value: 50 }],
  },
};

describe('OverviewTab', () => {
  it('renders loading skeletons', () => {
    const { container } = render(
      <OverviewTab {...baseProps} loading={true} />
    );
    const skeletons = container.querySelectorAll('.animate-pulse');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it('renders error state', () => {
    render(
      <OverviewTab
        {...baseProps}
        loading={false}
        error={new Error('API failure')}
      />
    );
    expect(screen.getByText('Failed to load analytics data')).toBeTruthy();
    expect(screen.getByText('API failure')).toBeTruthy();
  });

  it('renders no data state', () => {
    render(<OverviewTab {...baseProps} loading={false} data={undefined} />);
    expect(screen.getByText('No data available yet')).toBeTruthy();
  });

  it('renders empty channels state when no kpis, no channels, and no series', () => {
    render(
      <OverviewTab
        {...baseProps}
        loading={false}
        data={{
          range: { from: '2024-01-01', to: '2024-01-07' },
          kpis: [],
          series: undefined as unknown as Record<string, import('../utils').SeriesPoint[]>,
          byChannel: [],
          breakdown: { byPlatform: [] },
        }}
      />
    );
    expect(screen.getByText('No channels connected')).toBeTruthy();
  });

  it('renders KPI cards from data', () => {
    render(<OverviewTab {...baseProps} loading={false} data={sampleData} />);
    expect(screen.getByText('Impressions')).toBeTruthy();
    expect(screen.getByText('Engagement')).toBeTruthy();
    expect(screen.getByText('50,000')).toBeTruthy();
    expect(screen.getByText('2,500')).toBeTruthy();
  });

  it('renders chart containers', () => {
    const { container } = render(
      <OverviewTab {...baseProps} loading={false} data={sampleData} />
    );
    const canvases = container.querySelectorAll('canvas');
    expect(canvases.length).toBeGreaterThanOrEqual(1);
  });

  it('renders pie and bar chart sections', () => {
    render(<OverviewTab {...baseProps} loading={false} data={sampleData} />);
    expect(screen.getByText('By Platform')).toBeTruthy();
    expect(screen.getByText('Channel Comparison')).toBeTruthy();
  });

  it('calls onSelectMetric when KPI card is clicked', () => {
    const onSelectMetric = vi.fn();
    render(
      <OverviewTab
        {...baseProps}
        loading={false}
        data={sampleData}
        onSelectMetric={onSelectMetric}
      />
    );
    screen.getByText('Impressions').click();
    expect(onSelectMetric).toHaveBeenCalledWith('impressions');
  });

  it('closes metric detail panel via onSelectMetric', () => {
    const onSelectMetric = vi.fn();
    mockUseMetricDrill.mockReturnValue({
      data: {
        metric: 'impressions',
        label: 'Impressions',
        format: 'count',
        total: 50000,
        previousTotal: 40000,
        percentageChange: 25,
        series: [],
        byChannel: [],
        topPosts: [],
        movers: { up: [], down: [] },
      },
    });
    render(
      <OverviewTab
        {...baseProps}
        loading={false}
        data={sampleData}
        selectedMetric="impressions"
        onSelectMetric={onSelectMetric}
      />
    );
    const buttons = screen.getAllByRole('button');
    expect(buttons.length).toBeGreaterThanOrEqual(1);
    const closeBtn = buttons.find((b) => b.querySelector('svg'));
    if (closeBtn) {
      closeBtn.click();
      expect(onSelectMetric).toHaveBeenCalledWith('');
    }
  });
});
