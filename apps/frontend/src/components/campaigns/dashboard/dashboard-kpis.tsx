'use client';

import { FC, useMemo } from 'react';
import { useT } from '@gitroom/react/translation/get.transation.service.client';

interface DashboardKpisProps {
  dashboard: {
    engagement?: {
      totalViews?: number;
      totalLikes?: number;
      totalComments?: number;
      avgViews?: number;
      avgLikes?: number;
      avgComments?: number;
      clickTotal?: number;
    };
    stateCounts?: Record<string, number>;
    clickTotal?: number;
    goals?: Array<{ metric: string; target: number; current: number; pct: number }>;
    campaign?: {
      goals?: Array<{ metric: string; target: number }>;
    };
  };
}

const MetricLabel: Record<string, string> = {
  impressions: 'Impressions',
  likes: 'Likes',
  comments: 'Replies',
  clicks: 'Clicks',
  posts: 'Posts',
  followers: 'Followers',
};

export const DashboardKpis: FC<DashboardKpisProps> = ({ dashboard }) => {
  const t = useT();

  const goals = useMemo(() => {
    if (dashboard?.goals) {
      return dashboard.goals;
    }
    // Fallback for older dashboard responses without computed progress.
    const engagement = dashboard?.engagement || {};
    const stateCounts = dashboard?.stateCounts || {};
    const clickTotal = dashboard?.clickTotal ?? engagement?.clickTotal ?? 0;
    const list = dashboard?.campaign?.goals || [];
    return list.map((g) => {
      let current = 0;
      switch (g.metric) {
        case 'impressions':
          current = engagement.totalViews || 0;
          break;
        case 'likes':
          current = engagement.totalLikes || 0;
          break;
        case 'comments':
          current = engagement.totalComments || 0;
          break;
        case 'clicks':
          current = clickTotal;
          break;
        case 'posts':
          current = (stateCounts.DRAFT || 0) + (stateCounts.QUEUE || 0) + (stateCounts.PUBLISHED || 0);
          break;
        default:
          current = 0;
      }
      const target = Number(g.target) || 0;
      const pct = target ? Math.min(100, Math.round((current / target) * 100)) : 0;
      return { metric: g.metric, target, current, pct };
    });
  }, [dashboard]);

  const engagement = dashboard?.engagement || {};
  const stateCounts = dashboard?.stateCounts || {};
  const clickTotal = dashboard?.clickTotal ?? engagement?.clickTotal ?? 0;

  const kpis = [
    { label: t('views', 'Views'), value: Math.round(engagement.totalViews || 0).toLocaleString() },
    { label: t('likes', 'Likes'), value: Math.round(engagement.totalLikes || 0).toLocaleString() },
    { label: t('replies', 'Replies'), value: Math.round(engagement.totalComments || 0).toLocaleString() },
    { label: t('clicks', 'Clicks'), value: Math.round(clickTotal || 0).toLocaleString() },
  ];

  const states = [
    { key: 'DRAFT', label: t('draft', 'Draft'), color: 'bg-newTableText/20 text-newTableText' },
    { key: 'QUEUE', label: t('scheduled', 'Scheduled'), color: 'bg-blue-500/10 text-blue-400' },
    { key: 'PUBLISHED', label: t('published', 'Published'), color: 'bg-green-500/10 text-green-400' },
  ];

  return (
    <div className="flex flex-col gap-[16px]">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-[16px]">
        {kpis.map((kpi) => (
          <div key={kpi.label} className="p-[16px] border border-newTableBorder rounded-[12px] bg-newBgColor">
            <div className="text-[24px] font-semibold text-textColor">{kpi.value}</div>
            <div className="text-[12px] text-newTableText uppercase">{kpi.label}</div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-[12px]">
        {states.map((s) => (
          <div
            key={s.key}
            className={`flex items-center gap-[8px] px-[12px] py-[6px] rounded-[8px] text-[13px] ${s.color}`}
          >
            <span className="font-semibold">{stateCounts[s.key] || 0}</span>
            <span>{s.label}</span>
          </div>
        ))}
      </div>

      {goals.length > 0 && (
        <div className="p-[16px] border border-newTableBorder rounded-[12px] bg-newBgColor flex flex-col gap-[12px]">
          <h3 className="text-[14px] font-semibold text-textColor">{t('goals', 'Goals')}</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-[12px]">
            {goals.map((g, idx) => (
              <div key={`${g.metric}-${idx}`} className="flex flex-col gap-[4px]">
                <div className="flex justify-between text-[12px] text-newTableText">
                  <span>{MetricLabel[g.metric] || g.metric}</span>
                  <span>
                    {Math.round(g.current).toLocaleString()} / {Math.round(g.target).toLocaleString()}
                  </span>
                </div>
                <div className="h-[8px] bg-newTableBorder/30 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-btnPrimary rounded-full transition-all"
                    style={{ width: `${g.pct}%` }}
                  />
                </div>
                <div className="text-[11px] text-newTableText text-right">{g.pct}%</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
