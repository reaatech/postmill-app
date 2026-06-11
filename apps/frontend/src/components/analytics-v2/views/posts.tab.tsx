'use client';

import { FC, useCallback, useMemo, useState } from 'react';
import { Post, CANONICAL_METRICS } from '../utils';
import { usePostDetail } from '../hooks/usePostDetail';
import { PostDetailChart } from '../post.detail.chart';
import { DataTable } from '@gitroom/frontend/components/ui/data-table';
import type { Column } from '@gitroom/frontend/components/ui/data-table';

interface PostsTabProps {
  posts?: Post[];
  total: number;
  loading: boolean;
  error?: Error;
  page: number;
  limit: number;
  sort: string;
  dir: 'asc' | 'desc';
  onPageChange: (page: number) => void;
  onSortChange: (sort: string, dir: 'asc' | 'desc') => void;
}

export const PostsTab: FC<PostsTabProps> = ({
  posts,
  total,
  loading,
  error,
  page,
  limit,
  sort,
  dir,
  onPageChange,
  onSortChange,
}) => {
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null);
  const [showMetrics, setShowMetrics] = useState(false);
  const [selectedColumns, setSelectedColumns] = useState<string[]>([
    'impressions',
    'engagement',
    'likes',
    'comments',
    'shares',
  ]);
  const {
    data: postDetail,
    isLoading: postDetailLoading,
    error: postDetailError,
  } = usePostDetail(selectedPostId || '');

  const totalPages = Math.ceil(total / limit);

  const handleSort = useCallback(
    (key: string) => {
      if (sort === key) {
        onSortChange(key, dir === 'asc' ? 'desc' : 'asc');
      } else {
        onSortChange(key, 'desc');
      }
    },
    [sort, dir, onSortChange]
  );

  const metricHeaders = selectedColumns.map((key) => {
    const found = CANONICAL_METRICS.find((m) => m.key === key);
    return { key, label: found?.label || key };
  });

  const METRICS_LIST = CANONICAL_METRICS;

  const columns: Column<Post>[] = useMemo(() => {
    const base: Column<Post>[] = [
      {
        key: 'content',
        header: 'Content',
        render: (post: Post) => (
          <span className="max-w-[240px] truncate block">{post.content}</span>
        ),
      },
      {
        key: 'channel',
        header: 'Channel',
        render: (post: Post) => (
          <div className="flex items-center gap-[6px]">
            <img src={post.integration.picture} alt="" className="w-[16px] h-[16px] rounded-[4px]" />
            <span className="text-[12px]">{post.integration.name}</span>
          </div>
        ),
      },
      {
        key: 'publishedAt',
        header: 'Date',
        sortable: true,
        render: (post: Post) => (
          <span className="text-[12px] text-newTableText tabular-nums whitespace-nowrap">
            {new Date(post.publishedAt).toLocaleDateString()}
          </span>
        ),
      },
    ];

    selectedColumns.forEach((key) => {
      base.push({
        key,
        header: CANONICAL_METRICS.find((m) => m.key === key)?.label || key,
        align: 'right',
        sortable: true,
        render: (post: Post) =>
          new Intl.NumberFormat().format(Math.round(post.metrics[key] || 0)),
      });
    });

    return base;
  }, [selectedColumns]);

  return (
    <div>
      <div className="flex items-center justify-end mb-[8px]">
        <div className="relative">
          <button
            onClick={() => setShowMetrics(!showMetrics)}
            className="px-[10px] py-[5px] text-[12px] font-medium rounded-[6px] bg-newTableHeader border border-newTableBorder text-newTableText hover:text-btnText hover:border-newTableText/30 transition-colors flex items-center gap-[6px]"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <rect x="1" y="1" width="4" height="4" rx="1" stroke="currentColor" strokeWidth="1.5" />
              <rect x="7" y="1" width="4" height="4" rx="1" stroke="currentColor" strokeWidth="1.5" />
              <rect x="1" y="7" width="4" height="4" rx="1" stroke="currentColor" strokeWidth="1.5" />
              <rect x="7" y="7" width="4" height="4" rx="1" stroke="currentColor" strokeWidth="1.5" />
            </svg>
            Columns ({selectedColumns.length})
          </button>
          {showMetrics && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowMetrics(false)} />
              <div className="absolute right-0 top-full mt-[4px] z-50 bg-newBgColorInner border border-newTableBorder rounded-[8px] shadow-lg overflow-hidden min-w-[200px] max-h-[320px] overflow-y-auto">
                {METRICS_LIST.map((m) => {
                  const checked = selectedColumns.includes(m.key);
                  return (
                    <label
                      key={m.key}
                      className="flex items-center gap-[8px] px-[12px] py-[6px] text-[12px] cursor-pointer hover:bg-boxHover transition-colors"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => {
                          setSelectedColumns((prev) =>
                            checked
                              ? prev.filter((k) => k !== m.key)
                              : [...prev, m.key]
                          );
                        }}
                        className="accent-btnPrimary"
                      />
                      {m.label}
                    </label>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>

      <DataTable
        columns={columns}
        data={posts || []}
        keyExtractor={(post: Post) => post.postId}
        loading={loading}
        error={error || undefined}
        sortKey={sort}
        sortDir={dir}
        onSort={handleSort}
        page={page}
        total={total}
        limit={limit}
        onPageChange={onPageChange}
        onRowClick={(post: Post) => setSelectedPostId(post.postId)}
        emptyState={{ title: 'No posts found in this period' }}
      />

      {selectedPostId && (
        <div
          className="fixed inset-0 z-[100] flex justify-end"
          onClick={() => setSelectedPostId(null)}
        >
          <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" />
          <div
            className="relative w-full max-w-[520px] bg-newBgColorInner border-l border-newTableBorder h-full overflow-y-auto animate-fadeIn"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 bg-newBgColorInner border-b border-newTableBorder px-[20px] py-[14px] flex items-center justify-between z-10">
              <h3 className="text-[16px] font-semibold truncate">
                {postDetailLoading
                  ? 'Loading...'
                  : postDetail?.content || 'Post Detail'}
              </h3>
              <button
                onClick={() => setSelectedPostId(null)}
                className="p-[6px] hover:bg-boxHover rounded-[6px] shrink-0"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path
                    d="M4 4L12 12M12 4L4 12"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            </div>
            <div className="p-[20px] space-y-[16px]">
              {postDetailLoading && (
                <div className="animate-pulse space-y-[12px]">
                  <div className="flex items-center gap-[8px]">
                    <div className="w-[24px] h-[24px] rounded-[6px] bg-newTableHeader" />
                    <div className="space-y-[6px]">
                      <div className="w-[120px] h-[14px] bg-newTableHeader rounded-[4px]" />
                      <div className="w-[180px] h-[11px] bg-newTableHeader rounded-[4px]" />
                    </div>
                  </div>
                  <div className="space-y-[8px]">
                    <div className="w-full h-[14px] bg-newTableHeader rounded-[4px]" />
                    <div className="w-3/4 h-[14px] bg-newTableHeader rounded-[4px]" />
                  </div>
                  <div className="grid grid-cols-2 gap-[8px]">
                    {[1, 2, 3, 4].map((i) => (
                      <div
                        key={i}
                        className="h-[64px] bg-newTableHeader rounded-[8px]"
                      />
                    ))}
                  </div>
                </div>
              )}
              {postDetailError && (
                <div className="flex flex-col items-center justify-center py-[24px] text-center">
                  <p className="text-[var(--negative,#f97066)] text-[14px] mb-[4px]">
                    Failed to load post details
                  </p>
                  <p className="text-[12px] text-newTableText/60">
                    {postDetailError.message}
                  </p>
                </div>
              )}
              {postDetail && (
                <>
                  <div className="flex items-center gap-[8px]">
                    <img
                      src={postDetail.integration.picture}
                      alt=""
                      className="w-[24px] h-[24px] rounded-[6px]"
                    />
                    <div>
                      <div className="text-[14px] font-medium">
                        {postDetail.integration.name}
                      </div>
                      <div className="text-[11px] text-newTableText">
                        {new Date(postDetail.publishedAt).toLocaleString()}
                      </div>
                    </div>
                  </div>
                  <div className="text-[13px] leading-relaxed whitespace-pre-wrap max-h-[200px] overflow-y-auto">
                    {postDetail.content}
                  </div>
                  <div className="grid grid-cols-2 gap-[8px]">
                    {Object.entries(postDetail.metrics).map(([key, value]) => (
                      <div
                        key={key}
                        className="px-[12px] py-[10px] bg-newTableHeader rounded-[8px]"
                      >
                        <div className="text-[11px] text-newTableText capitalize">
                          {key}
                        </div>
                        <div className="text-[18px] font-semibold tabular-nums">
                          {new Intl.NumberFormat().format(Math.round(value))}
                        </div>
                      </div>
                    ))}
                  </div>
                  <PostDetailChart series={postDetail.series} />
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
