'use client';

import { FC, useCallback, useMemo, useState } from 'react';
import { Post, CANONICAL_METRICS } from '../utils';
import { usePostDetail } from '../hooks/usePostDetail';
import { PostDetailBody } from '../post-analytics.drawer';
import { Drawer } from '../kit/drawer';
import { ChannelAvatar } from '../kit/channel-avatar';
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
            <ChannelAvatar
              src={post.integration.picture}
              name={post.integration.name}
              identifier={post.integration.identifier}
              size={16}
              className="rounded-[4px] object-cover"
            />
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

      <Drawer
        open={!!selectedPostId}
        onClose={() => setSelectedPostId(null)}
        ariaLabel={postDetail?.content || 'Post Detail'}
      >
        <PostDetailBody
          postDetail={postDetail}
          isLoading={postDetailLoading}
          error={postDetailError as Error | undefined}
          onClose={() => setSelectedPostId(null)}
        />
      </Drawer>
    </div>
  );
};
