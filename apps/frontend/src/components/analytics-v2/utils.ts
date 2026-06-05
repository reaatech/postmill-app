export interface KPI {
  metric: string;
  label: string;
  format: 'number' | 'percent' | 'currency' | 'time';
  total: number;
  previousTotal: number;
  percentageChange: number;
  sparkline: { date: string; value: number }[];
}

export interface SeriesPoint {
  date: string;
  value: number;
  previousValue?: number;
}

export interface ChannelKPI {
  integrationId: string;
  name: string;
  identifier: string;
  picture: string;
  kpis: { metric: string; label: string; format: string; total: number; previousTotal: number; percentageChange: number }[];
  value?: number;
}

export interface ByPlatform {
  identifier: string;
  value: number;
}

export interface OverviewResponse {
  range: { from: string; to: string };
  kpis: KPI[];
  series: Record<string, SeriesPoint[]>;
  byChannel: ChannelKPI[];
  breakdown: { byPlatform: ByPlatform[] };
}

export interface ChannelDetailResponse {
  kpis: KPI[];
  series: Record<string, SeriesPoint[]>;
  topPosts: Post[];
}

export interface Post {
  postId: string;
  content: string;
  integration: { id: string; name: string; identifier: string; picture: string };
  publishedAt: string;
  metrics: Record<string, number>;
}

export interface PostsResponse {
  posts: Post[];
  total: number;
}

export interface PostDetail {
  postId: string;
  content: string;
  integration: { id: string; name: string; identifier: string; picture: string };
  publishedAt: string;
  metrics: Record<string, number>;
  series: Record<string, SeriesPoint[]>;
}

export interface MetricDetailResponse {
  metric: string;
  label: string;
  format: 'number' | 'percent' | 'currency' | 'time';
  total: number;
  previousTotal: number;
  percentageChange: number;
  series: SeriesPoint[];
  byChannel: ChannelKPI[];
  topPosts: Post[];
  movers: { up: { integrationId: string; name: string; change: number }[]; down: { integrationId: string; name: string; change: number }[] };
}

export interface DayDetailResponse {
  date: string;
  metric: string;
  value: number;
  byChannel: { integrationId: string; name: string; identifier: string; picture: string; value: number }[];
  posts: Post[];
}

export interface DrillState {
  metric?: string;
  focusIntegration?: string;
  focusDate?: string;
  focusPost?: string;
  tab?: 'overview' | 'channels' | 'posts';
}

export function formatCompactNumber(value: number): string {
  if (value >= 1_000_000_000) return (value / 1_000_000_000).toFixed(1) + 'B';
  if (value >= 1_000_000) return (value / 1_000_000).toFixed(1) + 'M';
  if (value >= 1_000) return (value / 1_000).toFixed(1) + 'K';
  return value.toLocaleString();
}

export function formatPercent(value: number): string {
  return value.toFixed(1) + '%';
}
