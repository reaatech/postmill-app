# Analytics

The Analytics dashboard (`/analytics`) provides multi-channel performance metrics, powered by daily
snapshots collected from all connected channels. It replaces the legacy single-channel analytics
with a unified, filterable dashboard.

## Data Population

Analytics data is collected by a background Inngest function (`analyticsCollection`).
The backend must have `USE_INNGEST=true` and valid Inngest Cloud credentials (or `INNGEST_DEV=1`
for local development). The sweep runs once per day, gathering metrics for all connected channels
and storing them as `AnalyticsSnapshot` and `PostAnalyticsSnapshot` records.

Snapshot freshness follows a 24-hour cycle. Data for "today" may be incomplete until the next
sweep.

For setup and operational details, see [Inngest and Cron](../operations-guide/inngest-and-cron.md).
For the underlying API endpoints, see [Analytics API](../developer-docs/analytics-api.md).

## Dashboard Tabs

The analytics page has six tabs, accessible from the tab bar at the top.

### 1. Overview

The landing tab shows high-level KPIs for your organization:

- **KPI Cards**: Total followers, total engagement, and total posts published in the selected
  period.
- **Period-over-Period Comparison**: Percentage change compared to the previous period of equal
  length (e.g., last 30 days vs. the 30 days before that). Displayed as a green up arrow or red
  down arrow next to each KPI.
- **Engagement Chart**: A time-series line chart showing engagement (likes + comments + shares)
  over the selected date range.
- **Channel Distribution**: A breakdown of posts and engagement by channel.

Use the date range selector and channel filter at the top to narrow the view. Overview data is
cached in Redis for 60 seconds when the end date is not today.

### 2. Channels

A per-channel breakdown showing:

- **Channel List**: Each connected channel with current follower count, posts this period, and
  engagement total.
- **Slide-Out Detail Panel**: Click a channel to open a detailed view with per-metric time-series
  charts (followers over time, engagement over time, posts per day).

### 3. Posts

A sortable, filterable table of individual posts:

- **Metric Column Picker**: Choose which metrics to display as columns (views, likes, comments,
  shares, clicks).
- **Time-Series Charts**: Toggle a chart view for any post to see its metrics over time.
- **Sorting**: Sort by any metric column or by publish date, ascending or descending.
- **Pagination**: 20 posts per page (configurable, up to 100).

### 4. Best Time

A day-by-hour heatmap showing when your audience engages most:

- **Heatmap Grid**: Days of the week (rows) vs. hours of the day (columns). Darker cells indicate
  higher average engagement.
- **Channel Filter**: Narrow the heatmap to specific channels.
- **Best Slots List**: A ranked list of the top time slots (day + hour) with their average
  engagement values.

Use this data to schedule posts during peak engagement windows.

### 5. Recommendations

AI-powered action cards that analyze your analytics and suggest improvements:

- **Underperforming Channels**: Channels with declining engagement, with a link to review their
  recent posts.
- **Top Patterns**: Content patterns (post type, time of day, media usage) correlated with high
  engagement.
- **Best-Time Opportunities**: Time slots where your audience is active but you are not publishing.
- **Missing Coverage**: Days of the week or hours where you have no scheduled posts.
- **Comment Backlog**: Channels with unanswered comments, with a link to the comments inbox.

Each card includes a deep link to the relevant view (e.g., clicking "Comment Backlog" opens the
comments inbox filtered to that channel).

### 6. Export

Download analytics data for external reporting:

- **Format**: Choose CSV or JSON.
- **Date Range**: Select the period to export.
- **Channel Filter**: Export data for specific channels or all channels.
- **Comparison**: Include period-over-period comparison data (`compare=true`).

The export endpoint returns a downloadable file with the appropriate content type and filename
(`analytics-export.csv` or `analytics-export.json`).

## Legacy Fallback

Analytics are primarily sourced from `AnalyticsSnapshot` and `PostAnalyticsSnapshot` tables.
However, for posts or channels that do not yet have snapshots, Postmill falls back to live
platform queries through the provider integration layer. This ensures you always see the most
current available data.

## Watchlist

Competitor tracking integrates with the analytics dashboard. Watched accounts are probed during
the analytics collection sweep, and their metrics appear in the analytics views alongside your own
channel data. Watched-account metrics also appear in the **Recommendations** tab, compared
against channel performance for competitive insights. See [Watchlist](watchlist.md) for setup
and configuration.

> Verified against v3.7.0
