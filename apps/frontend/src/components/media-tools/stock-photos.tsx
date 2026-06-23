'use client';

import React, { FC, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import useSWR from 'swr';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useDebounce } from 'use-debounce';
import { useModals } from '@gitroom/frontend/components/layout/new-modal';
import { StockPreviewModal } from './stock-preview-modal';

export interface StockPhotoItem {
  id: string;
  url: string;
  thumbUrl: string;
  description: string | null;
  author: string;
  authorUrl: string;
  sourceUrl: string;
  downloadLocation: string | null;
  width: number;
  height: number;
  color: string | null;
}

const COLOR_SWATCHES: { value: string; label: string; swatch: string }[] = [
  { value: 'black_and_white', label: 'B&W', swatch: 'linear-gradient(135deg, #000 0 50%, #fff 50% 100%)' },
  { value: 'black', label: 'Black', swatch: '#111111' },
  { value: 'white', label: 'White', swatch: '#ffffff' },
  { value: 'blue', label: 'Blue', swatch: '#2563eb' },
  { value: 'green', label: 'Green', swatch: '#16a34a' },
  { value: 'red', label: 'Red', swatch: '#dc2626' },
];

const SUGGESTED_SEARCHES = ['Nature', 'City', 'Technology', 'People', 'Abstract'];

export const StockPhotos: FC = () => {
  const fetch = useFetch();
  const modal = useModals();
  const [query, setQuery] = useState('');
  const [debouncedQuery] = useDebounce(query, 300);
  const [page, setPage] = useState(1);
  const [orientation, setOrientation] = useState('');
  const [color, setColor] = useState('');
  const [accumulated, setAccumulated] = useState<StockPhotoItem[]>([]);

  // Reset the accumulated list whenever a filter/search changes.
  useEffect(() => {
    setPage(1);
    setAccumulated([]);
  }, [debouncedQuery, orientation, color]);

  const params = new URLSearchParams();
  if (debouncedQuery) params.set('query', debouncedQuery);
  params.set('page', String(page));
  if (orientation) params.set('orientation', orientation);
  if (color) params.set('color', color);

  const { data, error, isLoading, isValidating, mutate } = useSWR(
    `stock-photos-${debouncedQuery}-${page}-${orientation}-${color}`,
    async () => {
      const res = await fetch(`/media/stock/photos?${params}`);
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
      const seen = new Set(prev.map((p) => p.id));
      const next = (data.results as StockPhotoItem[]).filter((p) => !seen.has(p.id));
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

  const openPhoto = useCallback(
    (photo: StockPhotoItem) =>
      modal.openModal({
        title: '',
        closeOnClickOutside: true,
        closeOnEscape: true,
        withCloseButton: true,
        classNames: { modal: 'w-[100%] max-w-[1100px] text-textColor' },
        children: <StockPreviewModal item={photo} type="photo" />,
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
            placeholder="Search photos..."
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
      </div>

      {/* Color swatch filters (F4) */}
      <div className="flex items-center flex-wrap gap-[8px]">
        <button
          type="button"
          onClick={() => setColor('')}
          aria-pressed={color === ''}
          className={`h-[30px] px-[12px] rounded-full border text-[12px] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2B5CD3] ${
            color === ''
              ? 'border-[#2B5CD3] bg-[#2B5CD3]/15 text-[#2B5CD3] font-[500]'
              : 'border-newColColor text-newTextColor/70 hover:text-textColor hover:border-newTextColor/40'
          }`}
        >
          All
        </button>
        {COLOR_SWATCHES.map((c) => (
          <button
            key={c.value}
            type="button"
            onClick={() => setColor((cur) => (cur === c.value ? '' : c.value))}
            aria-pressed={color === c.value}
            aria-label={`Color: ${c.label}`}
            title={c.label}
            className={`relative w-[30px] h-[30px] rounded-full border transition-transform focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2B5CD3] hover:scale-110 ${
              color === c.value ? 'border-[#2B5CD3] ring-2 ring-[#2B5CD3]/40' : 'border-newColColor'
            }`}
          >
            <span
              className="absolute inset-[3px] rounded-full"
              style={{ background: c.swatch }}
            />
          </button>
        ))}
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
              : "We couldn't reach the photo library. Give it another go in a moment."}
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
        <div className="columns-2 sm:columns-3 lg:columns-4 xl:columns-5 gap-[12px]">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="mb-[12px] break-inside-avoid rounded-[8px] overflow-hidden border border-newBorder bg-newBgColorInner">
              <div
                className="bg-newColColor/20 animate-pulse rounded-[8px]"
                style={{ aspectRatio: i % 3 === 0 ? '3 / 4' : i % 3 === 1 ? '4 / 3' : '1 / 1' }}
              />
              <div className="p-[8px]">
                <div className="h-[11px] bg-newColColor/20 animate-pulse rounded-[4px] w-[60%]" />
              </div>
            </div>
          ))}
        </div>
      ) : showEmpty ? (
        <div className="flex flex-col items-center justify-center h-[320px] gap-[10px] text-center px-[20px]">
          <svg className="w-[44px] h-[44px] text-newTextColor/30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M18 4.5h.008v.008H18V4.5zm.75 0a.75.75 0 11-1.5 0 .75.75 0 011.5 0zM4.5 19.5h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15A2.25 2.25 0 002.25 6.75v10.5A2.25 2.25 0 004.5 19.5z" />
          </svg>
          <div className="text-[15px] font-[600] text-textColor">
            {debouncedQuery ? `No photos for "${debouncedQuery}"` : 'Find the perfect photo'}
          </div>
          <div className="text-[13px] text-newTextColor/50 max-w-[340px]">
            {debouncedQuery
              ? 'Try a different keyword or one of these popular searches.'
              : 'Search millions of free, high-quality photos from Unsplash to get started.'}
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
          {/* Masonry photo grid (F1) — CSS columns preserve each tile's aspect ratio */}
          <div className="columns-2 sm:columns-3 lg:columns-4 xl:columns-5 gap-[12px]">
            {items.map((photo) => (
              <button
                key={photo.id}
                type="button"
                onClick={() => openPhoto(photo)}
                className="group block w-full mb-[12px] break-inside-avoid text-left rounded-[8px] overflow-hidden border border-newBorder bg-newBgColorInner cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2B5CD3]"
              >
                <div
                  className="relative overflow-hidden"
                  style={{ aspectRatio: photo.width && photo.height ? `${photo.width} / ${photo.height}` : '4 / 3' }}
                >
                  <img
                    src={photo.thumbUrl}
                    alt={photo.description || ''}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                    loading="lazy"
                  />
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
                      href={photo.authorUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={e => e.stopPropagation()}
                      className="text-[#2B5CD3] hover:underline"
                    >
                      {photo.author}
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
                <div className="columns-2 sm:columns-3 lg:columns-4 xl:columns-5 gap-[12px]">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="mb-[12px] break-inside-avoid rounded-[8px] overflow-hidden border border-newBorder bg-newBgColorInner">
                      <div
                        className="bg-newColColor/20 animate-pulse rounded-[8px]"
                        style={{ aspectRatio: i % 2 === 0 ? '3 / 4' : '4 / 3' }}
                      />
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
