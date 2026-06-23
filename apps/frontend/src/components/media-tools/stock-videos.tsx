'use client';

import React, { FC, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import useSWR from 'swr';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useDebounce } from 'use-debounce';
import { useModals } from '@gitroom/frontend/components/layout/new-modal';
import { StockPreviewModal } from './stock-preview-modal';

export interface StockVideoItem {
  id: string;
  url: string;
  thumbUrl: string;
  description: string | null;
  author: string;
  authorUrl: string;
  sourceUrl: string;
  width: number;
  height: number;
  duration: number;
}

const SUGGESTED_SEARCHES = ['Nature', 'City', 'Technology', 'Ocean', 'Abstract'];

export const StockVideos: FC = () => {
  const fetch = useFetch();
  const modal = useModals();
  const [query, setQuery] = useState('');
  const [debouncedQuery] = useDebounce(query, 300);
  const [page, setPage] = useState(1);
  const [orientation, setOrientation] = useState('');
  const [size, setSize] = useState('');
  const [accumulated, setAccumulated] = useState<StockVideoItem[]>([]);

  // Reset the accumulated list whenever a filter/search changes.
  useEffect(() => {
    setPage(1);
    setAccumulated([]);
  }, [debouncedQuery, orientation, size]);

  const params = new URLSearchParams();
  if (debouncedQuery) params.set('query', debouncedQuery);
  params.set('page', String(page));
  if (orientation) params.set('orientation', orientation);
  if (size) params.set('size', size);

  const { data, error, isLoading, isValidating, mutate } = useSWR(
    `stock-videos-${debouncedQuery}-${page}-${orientation}-${size}`,
    async () => {
      const res = await fetch(`/media/stock/videos?${params}`);
      if (!res.ok) {
        const err: any = new Error(`Request failed (HTTP ${res.status})`);
        err.status = res.status;
        throw err;
      }
      return res.json();
    },
    { keepPreviousData: true }
  );

  // Accumulate fetched pages into a single list.
  useEffect(() => {
    if (!data?.results) return;
    setAccumulated((prev) => {
      if (page === 1) return data.results;
      const seen = new Set(prev.map((v) => v.id));
      const next = (data.results as StockVideoItem[]).filter((v) => !seen.has(v.id));
      return next.length ? [...prev, ...next] : prev;
    });
  }, [data, page]);

  const totalPages = data?.totalPages || 1;
  const hasMore = page < totalPages;

  // Infinite-scroll sentinel.
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !hasMore || isLoading || isValidating) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) setPage((p) => p + 1);
      },
      { rootMargin: '400px' }
    );
    observer.observe(node);
    return () => observer.disconnect();
    // `accumulated.length` is required: data arrives (isLoading flips false)
    // one render BEFORE the accumulate effect mounts the grid + sentinel, so
    // without it this effect runs while sentinelRef is still null and never
    // re-runs to attach once the sentinel appears.
  }, [hasMore, isLoading, isValidating, accumulated.length]);

  const openVideo = useCallback(
    (video: StockVideoItem) =>
      modal.openModal({
        title: '',
        closeOnClickOutside: true,
        closeOnEscape: true,
        withCloseButton: true,
        classNames: { modal: 'w-[100%] max-w-[1100px] text-textColor' },
        children: <StockPreviewModal item={video} type="video" />,
        size: '80%',
      }),
    [modal]
  );

  const items = useMemo(() => accumulated, [accumulated]);
  const initialLoading = isLoading && items.length === 0 && !error;
  const showEmpty = !initialLoading && !error && items.length === 0;
  const isFirstFetch = page === 1;

  if (data && !data.configured) {
    return (
      <div className="flex items-center justify-center h-full text-newTextColor/60">
        Stock browsing isn't configured
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-[15px]">
      {/* Toolbar — always mounted in every state */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-[12px]">
        <div className="relative flex-1">
          <svg className="absolute left-[14px] top-1/2 -translate-y-1/2 w-[16px] h-[16px] text-newTextColor/40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z" />
          </svg>
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search videos..."
            className="w-full h-[44px] pl-[38px] pr-[34px] rounded-[8px] bg-newBgColorInner border border-newColColor text-[14px] outline-none focus:border-[#2B5CD3] text-textColor"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label="Clear search"
              className="absolute right-[10px] top-1/2 -translate-y-1/2 w-[20px] h-[20px] flex items-center justify-center text-newTextColor/40 hover:text-newTextColor rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2B5CD3]"
            >
              ✕
            </button>
          )}
        </div>
        <div className="relative">
          <select
            value={orientation}
            onChange={e => setOrientation(e.target.value)}
            className="appearance-none h-[44px] w-full sm:w-auto pl-[12px] pr-[32px] rounded-[8px] bg-newBgColorInner border border-newColColor text-[13px] text-textColor outline-none cursor-pointer"
          >
            <option value="">All orientations</option>
            <option value="landscape">Landscape</option>
            <option value="portrait">Portrait</option>
            <option value="square">Square</option>
          </select>
          <svg className="absolute right-[10px] top-1/2 -translate-y-1/2 w-[14px] h-[14px] text-newTextColor/40 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
        <div className="relative">
          <select
            value={size}
            onChange={e => setSize(e.target.value)}
            className="appearance-none h-[44px] w-full sm:w-auto pl-[12px] pr-[32px] rounded-[8px] bg-newBgColorInner border border-newColColor text-[13px] text-textColor outline-none cursor-pointer"
          >
            <option value="">All sizes</option>
            <option value="small">Small</option>
            <option value="medium">Medium</option>
            <option value="large">Large</option>
          </select>
          <svg className="absolute right-[10px] top-1/2 -translate-y-1/2 w-[14px] h-[14px] text-newTextColor/40 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>

      {/* Content states */}
      {error && items.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-[320px] gap-[10px] text-center px-[20px]">
          <svg className="w-[44px] h-[44px] text-newTextColor/30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m0 3.75h.008M10.34 3.94l-7.5 12.99A1.5 1.5 0 004.14 19.5h15.72a1.5 1.5 0 001.3-2.25l-7.5-12.99a1.5 1.5 0 00-2.6 0z" />
          </svg>
          <div className="text-[15px] font-[600] text-textColor">
            Something went wrong{error.status ? ` (HTTP ${error.status})` : ''}
          </div>
          <div className="text-[13px] text-newTextColor/50 max-w-[320px]">
            {error.status === 401 || error.status === 403
              ? 'Your session may have expired — try signing in again.'
              : "We couldn't reach the video library. Give it another go in a moment."}
          </div>
          <button
            type="button"
            onClick={() => mutate()}
            className="mt-[6px] px-[16px] h-[36px] rounded-[8px] bg-[#2B5CD3] text-white text-[13px] hover:bg-[#1e4ab5] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2B5CD3]"
          >
            Try again
          </button>
        </div>
      ) : initialLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-[12px]">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="rounded-[8px] overflow-hidden border border-newBorder bg-newBgColorInner">
              <div className="aspect-video bg-newColColor/20 animate-pulse rounded-[8px]" />
              <div className="p-[8px]">
                <div className="h-[11px] bg-newColColor/20 animate-pulse rounded-[4px] w-[60%]" />
              </div>
            </div>
          ))}
        </div>
      ) : showEmpty ? (
        <div className="flex flex-col items-center justify-center h-[320px] gap-[10px] text-center px-[20px]">
          <svg className="w-[44px] h-[44px] text-newTextColor/30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25h-9A2.25 2.25 0 002.25 7.5v9a2.25 2.25 0 002.25 2.25z" />
          </svg>
          <div className="text-[15px] font-[600] text-textColor">
            {debouncedQuery ? `No videos for "${debouncedQuery}"` : 'Find the perfect clip'}
          </div>
          <div className="text-[13px] text-newTextColor/50 max-w-[340px]">
            {debouncedQuery
              ? 'Try a different keyword or one of these popular searches.'
              : 'Search thousands of free, high-quality stock videos from Pexels to get started.'}
          </div>
          <div className="flex items-center flex-wrap justify-center gap-[8px] mt-[4px]">
            {SUGGESTED_SEARCHES.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setQuery(s)}
                className="h-[30px] px-[14px] rounded-full border border-newColColor text-[12px] text-newTextColor/70 hover:text-[#2B5CD3] hover:border-[#2B5CD3] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2B5CD3]"
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <>
          {/* Responsive aspect-video grid (F6) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-[12px]">
            {items.map((video) => (
              <button
                key={video.id}
                type="button"
                onClick={() => openVideo(video)}
                className="group text-left rounded-[8px] overflow-hidden border border-newBorder bg-newBgColorInner cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2B5CD3]"
              >
                <div className="aspect-video relative overflow-hidden bg-black">
                  <img
                    src={video.thumbUrl}
                    alt=""
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                    loading="lazy"
                  />
                  <div className="absolute bottom-[8px] right-[8px] px-[6px] py-[2px] rounded-[4px] bg-black/70 text-[11px] text-white pointer-events-none z-10">
                    {Math.floor(video.duration / 60)}:{(video.duration % 60).toString().padStart(2, '0')}
                  </div>
                  <div className="absolute inset-0 pointer-events-none">
                    <div className="absolute bottom-0 left-0 right-0 h-[70px] bg-gradient-to-t from-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                    <div className="absolute bottom-[8px] right-[8px] opacity-0 group-hover:opacity-100 transition-opacity">
                      <svg className="w-[18px] h-[18px] text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                      </svg>
                    </div>
                  </div>
                </div>
                <div className="p-[8px]">
                  <div className="text-[11px] text-newTextColor/60 truncate">
                    by{' '}
                    <a
                      href={video.authorUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={e => e.stopPropagation()}
                      className="text-[#2B5CD3] hover:underline"
                    >
                      {video.author}
                    </a>
                  </div>
                </div>
              </button>
            ))}
          </div>

          {/* Infinite-scroll sentinel + skeleton tail (F2) */}
          {hasMore && (
            <div ref={sentinelRef}>
              {!isFirstFetch && isValidating && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-[12px] mt-[12px]">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="rounded-[8px] overflow-hidden border border-newBorder bg-newBgColorInner">
                      <div className="aspect-video bg-newColColor/20 animate-pulse rounded-[8px]" />
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
};
