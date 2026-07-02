import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => (_k: string, d: string) => d,
}));

const mockUseBestTime = vi.fn();
vi.mock('../hooks/useBestTime', () => ({
  useBestTime: (integrations?: string[]) => mockUseBestTime(integrations),
}));

import { BestTimeTab } from './best-time.tab';

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const HOUR_LABELS = Array.from({ length: 24 }, (_, i) => `${i}`);

describe('BestTimeTab', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders the loading state', () => {
    mockUseBestTime.mockReturnValue({ data: undefined, isLoading: true, DAY_LABELS, HOUR_LABELS });
    render(<BestTimeTab />);
    expect(screen.getByText('Loading...')).toBeTruthy();
  });

  it('renders the empty state when there is no heatmap', () => {
    mockUseBestTime.mockReturnValue({ data: { heatmap: [] }, isLoading: false, DAY_LABELS, HOUR_LABELS });
    render(<BestTimeTab />);
    expect(screen.getByText(/No data available yet/i)).toBeTruthy();
  });

  it('renders the heatmap grid across the full engagement colour range', () => {
    // Varied avgEngagement / maxAvg ratios exercise every getColorClass branch.
    const heatmap = [0, 0.05, 0.2, 0.4, 0.6, 0.9].map((ratio, i) => ({
      day: i % 7,
      hour: i,
      engagement: ratio * 100,
      postCount: 3,
      avgEngagement: ratio * 100,
    }));
    mockUseBestTime.mockReturnValue({ data: { heatmap }, isLoading: false, DAY_LABELS, HOUR_LABELS });
    render(<BestTimeTab integrations={['i1']} />);

    expect(mockUseBestTime).toHaveBeenCalledWith(['i1']);
    expect(screen.getByText(/Best Time to Post/i)).toBeTruthy();
  });
});
