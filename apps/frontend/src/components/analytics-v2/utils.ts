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
  tab?: 'overview' | 'channels' | 'posts' | 'best-time' | 'recommendations' | 'watchlist' | 'shortlinks';
}

export interface ChannelMetricResponse {
  metric: string;
  label: string;
  format: 'count' | 'percent' | 'currency';
  total: number;
  previousTotal: number;
  percentageChange: number;
  series: SeriesPoint[];
  topPosts: Post[];
  byDay: { date: string; value: number }[];
}

export const CANONICAL_METRICS: { key: string; label: string }[] = [
  { key: 'impressions', label: 'Impressions' },
  { key: 'unique_impressions', label: 'Unique Impressions' },
  { key: 'reach', label: 'Reach' },
  { key: 'engagement', label: 'Engagement' },
  { key: 'likes', label: 'Likes' },
  { key: 'comments', label: 'Comments' },
  { key: 'shares', label: 'Shares' },
  { key: 'saves', label: 'Saves' },
  { key: 'replies', label: 'Replies' },
  { key: 'retweets', label: 'Retweets' },
  { key: 'quotes', label: 'Quotes' },
  { key: 'bookmarks', label: 'Bookmarks' },
  { key: 'views', label: 'Views' },
  { key: 'clicks', label: 'Clicks' },
  { key: 'followers', label: 'Followers' },
  { key: 'page_views', label: 'Page Views' },
  { key: 'video_views', label: 'Video Views' },
  { key: 'minutes_watched', label: 'Estimated Minutes Watched' },
  { key: 'avg_view_duration', label: 'Average View Duration' },
  { key: 'avg_view_percentage', label: 'Average View Percentage' },
  { key: 'subscribers_gained', label: 'Subscribers Gained' },
  { key: 'subscribers_lost', label: 'Subscribers Lost' },
  { key: 'pin_clicks', label: 'Pin Clicks' },
  { key: 'pin_click_rate', label: 'Pin Click Rate' },
  { key: 'website_clicks', label: 'Website Clicks' },
  { key: 'phone_calls', label: 'Phone Calls' },
  { key: 'direction_requests', label: 'Direction Requests' },
  { key: 'desktop_map_views', label: 'Desktop Map Views' },
  { key: 'mobile_map_views', label: 'Mobile Map Views' },
  { key: 'organic_followers', label: 'Organic Followers' },
  { key: 'paid_followers', label: 'Paid Followers' },
  { key: 'reposts', label: 'Reposts' },
  { key: 'post_impressions', label: 'Post Impressions' },
  { key: 'total_likes', label: 'Total Likes' },
  { key: 'reactions', label: 'Reactions' },
  { key: 'outbound_clicks', label: 'Outbound Clicks' },
  { key: 'favorites', label: 'Favorites' },
];

export function formatCompactNumber(value: number): string {
  if (value >= 1_000_000_000) return (value / 1_000_000_000).toFixed(1) + 'B';
  if (value >= 1_000_000) return (value / 1_000_000).toFixed(1) + 'M';
  if (value >= 1_000) return (value / 1_000).toFixed(1) + 'K';
  return value.toLocaleString();
}

export function formatPercent(value: number): string {
  return value.toFixed(1) + '%';
}
