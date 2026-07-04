'use client';

import { FC } from 'react';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useContentInsights, ContentFinding } from '../hooks/useContentInsights';
import { TabSkeleton, EmptyState, ErrorState } from '../kit/states';

// Content-attribute intelligence ("what works", 7.4). Ranked findings with the
// sample size always shown; each finding deep-links the posts tab filtered to
// its bucket (best-effort query params). Zero-post org → EmptyState.

// Best-effort deep-link into the posts tab for a finding's bucket. The posts
// tab reads whatever filter params it understands; unknown params are ignored.
function bucketLink(f: ContentFinding): string {
  const params = new URLSearchParams({ tab: 'posts' });
  if (f.dimension) params.set(f.dimension, f.bucket);
  else params.set('bucket', f.bucket);
  return `/analytics?${params.toString()}`;
}

const FindingCard: FC<{ finding: ContentFinding }> = ({ finding }) => {
  const t = useT();
  const outperforms = finding.ratio >= 1;
  const multiple = finding.ratio.toFixed(1);
  const ratioColor = outperforms ? 'text-[var(--positive,#32d583)]' : 'text-amber-600';

  return (
    <a
      href={bucketLink(finding)}
      className="flex items-center justify-between gap-[12px] p-[16px] bg-newBgColorInner border border-newTableBorder rounded-[12px] hover:border-designerAccent/50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-designerAccent/60"
    >
      <div className="min-w-0">
        <div className="text-[14px] font-medium text-textColor">{finding.label}</div>
        <div className="text-[12px] text-newTableText">
          {t('content_insight_sample', 'based on {{count}} posts', {
            count: finding.sampleSize,
          })}
        </div>
      </div>
      <div className={`text-[18px] font-semibold tabular-nums shrink-0 ${ratioColor}`}>
        {multiple}×
      </div>
    </a>
  );
};

export const ContentInsightsSection: FC = () => {
  const t = useT();
  const { data, isLoading, error, mutate } = useContentInsights();

  if (isLoading) {
    return <TabSkeleton variant="list" />;
  }

  if (error) {
    return (
      <ErrorState
        title={t('content_insights_error', 'Failed to load content insights')}
        message={error.message}
        onRetry={() => mutate()}
      />
    );
  }

  if (!data || data.totalPosts === 0 || data.findings.length === 0) {
    return (
      <EmptyState
        title={t('content_insights_empty_title', 'Not enough posts yet')}
        description={t(
          'content_insights_empty_desc',
          'Publish more posts to see which content attributes drive engagement.'
        )}
      />
    );
  }

  return (
    <div className="flex flex-col gap-[12px]">
      <p className="text-[12px] text-newTableText">
        {t('content_insights_intro', 'How each attribute compares to your average post ({{count}} posts analysed).', {
          count: data.totalPosts,
        })}
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-[12px]">
        {data.findings.map((f) => (
          <FindingCard key={`${f.dimension ?? 'bucket'}-${f.bucket}`} finding={f} />
        ))}
      </div>
    </div>
  );
};
