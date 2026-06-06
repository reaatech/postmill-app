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
  it('renders the filter bar with DateRangePicker', () => {
    render(<AnalyticsDashboard />);

    expect(screen.getByText('7 days')).toBeTruthy();
    expect(screen.getByText('30 days')).toBeTruthy();
    expect(screen.getByText('90 days')).toBeTruthy();
    expect(screen.getByText('Custom')).toBeTruthy();
    expect(screen.getByText('Compare')).toBeTruthy();
  });

  it('renders the ChannelMultiSelect', () => {
    render(<AnalyticsDashboard />);

    expect(screen.getByText('All channels')).toBeTruthy();
  });

  it('renders analytics tab buttons', () => {
    render(<AnalyticsDashboard />);

    expect(screen.getByRole('button', { name: 'Overview' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Channels' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Posts' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Best time' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Recommendations' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Watchlist' })).toBeTruthy();
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
