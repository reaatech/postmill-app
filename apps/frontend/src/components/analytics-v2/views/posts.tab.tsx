'use client';

import { FC, useCallback, useState } from 'react';
import { Post, CANONICAL_METRICS } from '../utils';
import { usePostDetail } from '../hooks/usePostDetail';
import { PostDetailChart } from '../post.detail.chart';

const SortIcon: FC<{ active: boolean; direction: 'asc' | 'desc' }> = ({
  active,
  direction,
}) => (
  <svg
    width="10"
    height="12"
    viewBox="0 0 10 12"
    fill="none"
    className={`ml-[4px] ${active ? 'text-btnText' : 'text-newTableText/40'}`}
  >
    <path
      d="M5 1L9 5H1L5 1Z"
      fill="currentColor"
      opacity={!active || direction === 'asc' ? 1 : 0.3}
    />
    <path
      d="M5 11L1 7H9L5 11Z"
      fill="currentColor"
      opacity={!active || direction === 'desc' ? 1 : 0.3}
    />
  </svg>
);

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

  if (loading) {
    return (
      <div className="animate-pulse space-y-[8px]">
        <div className="h-[44px] bg-newTableHeader rounded-[8px]" />
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-[56px] bg-newTableHeader rounded-[8px]" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-[48px] text-center">
        <p className="text-newTableText text-[14px]">Failed to load posts</p>
      </div>
    );
  }

  if (!posts?.length) {
    return (
      <div className="flex flex-col items-center justify-center py-[48px] text-center">
        <p className="text-newTableText text-[14px]">
          No posts found in this period
        </p>
      </div>
    );
  }

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
                        className="accent-forth"
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
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-newTableBorder">
              <th className="text-left text-[12px] font-medium text-newTableText py-[10px] px-[12px]">
                Content
              </th>
              <th className="text-left text-[12px] font-medium text-newTableText py-[10px] px-[12px]">
                Channel
              </th>
              <th className="text-left text-[12px] font-medium text-newTableText py-[10px] px-[12px]">
                <button
                  onClick={() => handleSort('publishedAt')}
                  className="flex items-center"
                >
                  Date{' '}
                  <SortIcon active={sort === 'publishedAt'} direction={dir} />
                </button>
              </th>
              {metricHeaders.map((h) => (
                <th
                  key={h.key}
                  className="text-right text-[12px] font-medium text-newTableText py-[10px] px-[12px]"
                >
                  <button
                    onClick={() => handleSort(h.key)}
                    className="flex items-center justify-end ml-auto"
                  >
                    {h.label}{' '}
                    <SortIcon active={sort === h.key} direction={dir} />
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {posts.map((post) => (
              <tr
                key={post.postId}
                onClick={() => setSelectedPostId(post.postId)}
                className="border-b border-newTableBorder hover:bg-boxHover transition-colors cursor-pointer"
              >
                <td className="py-[10px] px-[12px] text-[13px] max-w-[240px] truncate">
                  {post.content}
                </td>
                <td className="py-[10px] px-[12px]">
                  <div className="flex items-center gap-[6px]">
                    <img
                      src={post.integration.picture}
                      alt=""
                      className="w-[16px] h-[16px] rounded-[4px]"
                    />
                    <span className="text-[12px]">{post.integration.name}</span>
                  </div>
                </td>
                <td className="py-[10px] px-[12px] text-[12px] text-newTableText tabular-nums whitespace-nowrap">
                  {new Date(post.publishedAt).toLocaleDateString()}
                </td>
                {metricHeaders.map((h) => (
                  <td
                    key={h.key}
                    className="py-[10px] px-[12px] text-[13px] font-medium tabular-nums text-right"
                  >
                    {new Intl.NumberFormat().format(
                      Math.round(post.metrics[h.key] || 0)
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-[16px] px-[12px]">
          <div className="text-[12px] text-newTableText">
            {(page - 1) * limit + 1}–{Math.min(page * limit, total)} of {total}
          </div>
          <div className="flex items-center gap-[4px]">
            <button
              disabled={page <= 1}
              onClick={() => onPageChange(page - 1)}
              className="px-[8px] py-[4px] text-[12px] rounded-[6px] bg-newTableHeader border border-newTableBorder disabled:opacity-30 hover:border-newTableText/30 transition-colors"
            >
              Previous
            </button>
            <button
              disabled={page >= totalPages}
              onClick={() => onPageChange(page + 1)}
              className="px-[8px] py-[4px] text-[12px] rounded-[6px] bg-newTableHeader border border-newTableBorder disabled:opacity-30 hover:border-newTableText/30 transition-colors"
            >
              Next
            </button>
          </div>
        </div>
      )}

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
