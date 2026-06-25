'use client';

import React, { FC, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useDebounce } from 'use-debounce';
import { useModals } from '@gitroom/frontend/components/layout/new-modal';
import { SaveToFilesModal } from './save-to-files-modal';
import { StockAudioItem, stockSourceLabel } from './stock.types';
import { useStockSearch } from './use-stock-search';
import { AudioPlayer } from './audio-player';

const SUGGESTED_SEARCHES = ['Upbeat', 'Cinematic', 'Lo-fi', 'Ambient', 'Corporate'];

interface StockAudioProps {
  mode?: 'browse' | 'select';
  onSelect?: (item: { url: string; name?: string }) => void;
}

export const StockAudio: FC<StockAudioProps> = ({ mode = 'browse', onSelect }) => {
  const modal = useModals();
  const [query, setQuery] = useState('');
  const [debouncedQuery] = useDebounce(query, 300);

  const filters = useMemo(() => ({}), []);

  const {
    items,
    lastPage,
    error,
    isLoading,
    isValidating,
    size,
    setSize,
    mutate,
  } = useStockSearch<StockAudioItem>('/media/stock/audio', debouncedQuery, filters);

  const totalPages = lastPage?.totalPages || 1;
  const hasMore = size < totalPages;

  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !hasMore || isLoading || isValidating) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) setSize((s) => s + 1);
      },
      { rootMargin: '400px' }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, isLoading, isValidating, setSize, items.length]);

  const saveToFiles = useCallback(
    (item: StockAudioItem) => {
      modal.openModal({
        title: '',
        closeOnClickOutside: true,
        closeOnEscape: true,
        withCloseButton: true,
        classNames: { modal: 'w-[100%] max-w-[600px] text-textColor' },
        children: (
          <SaveToFilesModal
            url={item.downloadUrl || item.url}
            name={`${item.source || 'jamendo'}-${item.id}.mp3`}
            source={item.source || 'jamendo'}
            type="audio"
            attribution={item.attribution}
            allowPost={false}
          />
        ),
        size: 'lg',
      });
    },
    [modal]
  );

  const initialLoading = isLoading && items.length === 0 && !error;
  const showEmpty = !initialLoading && !error && items.length === 0;

  if (lastPage && !lastPage.configured) {
    return (
      <div className="flex items-center justify-center h-full text-newTextColor/60">
        Stock audio isn&apos;t configured
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-[15px]">
      <div className="relative">
        <svg className="absolute left-[14px] top-1/2 -translate-y-1/2 w-[16px] h-[16px] text-newTextColor/40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z" />
        </svg>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search music & audio..."
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

      {error && items.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-[320px] gap-[10px] text-center px-[20px]">
          <div className="text-[15px] font-[600] text-textColor">
            Something went wrong{error.status ? ` (HTTP ${error.status})` : ''}
          </div>
          <button
            type="button"
            onClick={() => mutate()}
            className="mt-[6px] px-[16px] h-[36px] rounded-[8px] bg-[#2B5CD3] text-white text-[13px] hover:bg-[#1e4ab5]"
          >
            Try again
          </button>
        </div>
      ) : initialLoading ? (
        <div className="flex flex-col gap-[8px]">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-[64px] rounded-[8px] border border-newBorder bg-newColColor/10 animate-pulse" />
          ))}
        </div>
      ) : showEmpty ? (
        <div className="flex flex-col items-center justify-center h-[320px] gap-[10px] text-center px-[20px]">
          <div className="text-[15px] font-[600] text-textColor">
            {debouncedQuery ? `No audio for "${debouncedQuery}"` : 'Find the perfect track'}
          </div>
          <div className="text-[13px] text-newTextColor/50 max-w-[340px]">
            {debouncedQuery
              ? 'Try a different keyword or one of these popular searches.'
              : 'Search thousands of free tracks from Jamendo to get started.'}
          </div>
          <div className="flex items-center flex-wrap justify-center gap-[8px] mt-[4px]">
            {SUGGESTED_SEARCHES.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setQuery(s)}
                className="h-[30px] px-[14px] rounded-full border border-newColColor text-[12px] text-newTextColor/70 hover:text-[#2B5CD3] hover:border-[#2B5CD3] transition-colors"
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-[8px]">
            {items.map((item) => (
              <div
                key={item.id}
                className="flex items-center gap-[12px] p-[10px] rounded-[8px] border border-newBorder bg-newBgColorInner"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline justify-between gap-[10px]">
                    <div className="text-[13px] text-textColor truncate">{item.name}</div>
                    <div className="text-[11px] text-newTextColor/50 shrink-0 truncate">
                      {item.author} · {stockSourceLabel(item.source)}
                    </div>
                  </div>
                  <div className="mt-[6px]">
                    <AudioPlayer src={item.url} lazy height={36} />
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    mode === 'select' && onSelect
                      ? onSelect({ url: item.url, name: item.name })
                      : saveToFiles(item)
                  }
                  className="shrink-0 px-[14px] py-[8px] rounded-[8px] bg-[#2B5CD3] text-white text-[12px] font-[500] hover:bg-[#2B5CD3]/80 transition-all flex items-center gap-[6px]"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
                  </svg>
                  {mode === 'select' ? 'Use' : 'Save'}
                </button>
              </div>
            ))}
          </div>

          {hasMore && (
            <div ref={sentinelRef} className="h-[40px] flex items-center justify-center text-[12px] text-newTextColor/40">
              {isValidating ? 'Loading…' : ''}
            </div>
          )}
        </>
      )}
    </div>
  );
};
