import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AnalyticsDashboard } from './analytics.dashboard';
import { useOverview } from './hooks/useOverview';
import { usePosts } from './hooks/usePosts';
import type { OverviewResponse, PostsResponse } from './utils';

const mockReplace = vi.fn();
let mockSearchParams = new URLSearchParams('from=2024-01-01&to=2024-01-07');

vi.mock('next/navigation', () => ({
  useSearchParams: () => mockSearchParams,
  useRouter: () => ({ replace: mockReplace }),
}));

vi.mock('@gitroom/helpers/utils/custom.fetch', () => ({
  useFetch: () => vi.fn(),
}));

vi.mock('./hooks/useOverview');
vi.mock('./hooks/usePosts');
vi.mock('@gitroom/frontend/components/launches/helpers/use.integration.list', () => ({
  useIntegrationList: () => ({
    data: [
      { id: 'i1', name: 'Twitter', identifier: '@twitter', picture: '/tw.png' },
      { id: 'i2', name: 'Instagram', identifier: '@insta', picture: '/ig.png' },
    ],
  }),
}));

vi.mock('./views/overview.tab', () => ({
  OverviewTab: ({ loading, error }: any) => (
    <div data-testid="overview-tab" data-loading={loading} data-error={!!error}>
      {loading ? 'Loading overview...' : error ? 'Overview error' : 'Overview Content'}
    </div>
  ),
}));

vi.mock('./views/channels.tab', () => ({
  ChannelsTab: ({ loading, error }: any) => (
    <div data-testid="channels-tab" data-loading={loading} data-error={!!error}>
      {loading ? 'Loading channels...' : error ? 'Channels error' : 'Channels Content'}
    </div>
  ),
}));

vi.mock('./views/posts.tab', () => ({
  PostsTab: ({ loading, error }: any) => (
    <div data-testid="posts-tab" data-loading={loading} data-error={!!error}>
      {loading ? 'Loading posts...' : error ? 'Posts error' : 'Posts Content'}
    </div>
  ),
}));

vi.mock('./views/insights.tab', () => ({
  InsightsTab: ({ section }: any) => (
    <div data-testid="insights-tab" data-section={section || ''}>
      Insights Content
    </div>
  ),
}));

// The filter drawer embeds the Mantine range calendar; stub it (no provider in tests).
vi.mock('@mantine/dates', () => ({
  RangeCalendar: () => <div data-testid="range-calendar" />,
}));

const mockUseOverview = vi.mocked(useOverview);
const mockUsePosts = vi.mocked(usePosts);

const overviewData: OverviewResponse = {
  range: { from: '2024-01-01', to: '2024-01-07' },
  kpis: [],
  series: {},
  byChannel: [],
  breakdown: { byPlatform: [] },
};

const postsData: PostsResponse = {
  posts: [],
  total: 0,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockSearchParams = new URLSearchParams('from=2024-01-01&to=2024-01-07');

  mockUseOverview.mockReturnValue({
    data: overviewData,
    isLoading: false,
    error: undefined,
    isValidating: false,
    mutate: vi.fn(),
  } as any);

  mockUsePosts.mockReturnValue({
    data: postsData,
    isLoading: false,
    error: undefined,
    isValidating: false,
    mutate: vi.fn(),
  } as any);
});

describe('AnalyticsDashboard', () => {
  it('renders the timeframe filter controls', () => {
    render(<AnalyticsDashboard />);

    expect(screen.getByText('Timeframe')).toBeTruthy();
    expect(screen.getByText('Day')).toBeTruthy();
    expect(screen.getByText('Week')).toBeTruthy();
    expect(screen.getByText('Month')).toBeTruthy();
    expect(screen.getByText('Compare to previous period')).toBeTruthy();
  });

  it('renders the filter button', () => {
    render(<AnalyticsDashboard />);

    expect(screen.getByRole('button', { name: /^Filter/ })).toBeTruthy();
  });

  it('renders the six inline analytics tab buttons (no kebab)', () => {
    render(<AnalyticsDashboard />);

    expect(screen.getByRole('button', { name: 'Overview' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Channels' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Posts' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Insights' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Links' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Watchlist' })).toBeTruthy();
    // Best time / Recommendations are now Insights sections, not top-level tabs.
    expect(screen.queryByRole('button', { name: 'Best time' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Recommendations' })).toBeNull();
  });

  it('shows InsightsTab when tab=insights', () => {
    mockSearchParams = new URLSearchParams('from=2024-01-01&to=2024-01-07&tab=insights');
    render(<AnalyticsDashboard />);
    expect(screen.getByTestId('insights-tab')).toBeTruthy();
  });

  it('maps legacy ?tab=best-time to the Insights tab with a section anchor', () => {
    mockSearchParams = new URLSearchParams('from=2024-01-01&to=2024-01-07&tab=best-time');
    render(<AnalyticsDashboard />);
    const insights = screen.getByTestId('insights-tab');
    expect(insights).toBeTruthy();
    expect(insights.getAttribute('data-section')).toBe('best-time');
  });

  it('maps legacy ?tab=recommendations to the Insights tab with a section anchor', () => {
    mockSearchParams = new URLSearchParams('from=2024-01-01&to=2024-01-07&tab=recommendations');
    render(<AnalyticsDashboard />);
    const insights = screen.getByTestId('insights-tab');
    expect(insights.getAttribute('data-section')).toBe('recommendations');
  });

  it('shows OverviewTab by default', () => {
    render(<AnalyticsDashboard />);

    expect(screen.getByTestId('overview-tab')).toBeTruthy();
    expect(screen.queryByTestId('channels-tab')).toBeNull();
    expect(screen.queryByTestId('posts-tab')).toBeNull();
  });

  it('shows ChannelsTab when tab=channels', () => {
    mockSearchParams = new URLSearchParams('from=2024-01-01&to=2024-01-07&tab=channels');

    render(<AnalyticsDashboard />);

    expect(screen.getByTestId('channels-tab')).toBeTruthy();
    expect(screen.queryByTestId('overview-tab')).toBeNull();
    expect(screen.queryByTestId('posts-tab')).toBeNull();
  });

  it('shows PostsTab when tab=posts', () => {
    mockSearchParams = new URLSearchParams('from=2024-01-01&to=2024-01-07&tab=posts');

    render(<AnalyticsDashboard />);

    expect(screen.getByTestId('posts-tab')).toBeTruthy();
    expect(screen.queryByTestId('overview-tab')).toBeNull();
    expect(screen.queryByTestId('channels-tab')).toBeNull();
  });

  it('passes loading state to the active tab', () => {
    mockUseOverview.mockReturnValue({
      data: undefined,
      isLoading: true,
      error: undefined,
      isValidating: false,
      mutate: vi.fn(),
    } as any);

    render(<AnalyticsDashboard />);

    const tab = screen.getByTestId('overview-tab');
    expect(tab.getAttribute('data-loading')).toBe('true');
    expect(tab.textContent).toContain('Loading overview...');
  });

  it('threads selected campaigns into the overview fetch (1.6)', () => {
    mockSearchParams = new URLSearchParams(
      'from=2024-01-01&to=2024-01-07&campaigns=c1,c2'
    );

    render(<AnalyticsDashboard />);

    const call = mockUseOverview.mock.calls[mockUseOverview.mock.calls.length - 1][0] as any;
    expect(call.campaigns).toEqual(['c1', 'c2']);
  });

  it('shows the campaign-scope note when the overview reports campaign-posts scope (1.6)', () => {
    mockUseOverview.mockReturnValue({
      data: { ...overviewData, scope: 'campaign-posts' },
      isLoading: false,
      error: undefined,
      isValidating: false,
      mutate: vi.fn(),
    } as any);

    render(<AnalyticsDashboard />);
    expect(screen.getByText(/Post metrics only/i)).toBeTruthy();
  });

  it('hides the campaign-scope note when the overview is unscoped', () => {
    render(<AnalyticsDashboard />);
    expect(screen.queryByText(/Post metrics only/i)).toBeNull();
  });

  it('passes error state to the active tab', () => {
    mockUseOverview.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error('API error'),
      isValidating: false,
      mutate: vi.fn(),
    } as any);

    render(<AnalyticsDashboard />);

    const tab = screen.getByTestId('overview-tab');
    expect(tab.getAttribute('data-error')).toBe('true');
    expect(tab.textContent).toContain('Overview error');
  });
});
