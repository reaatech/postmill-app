'use client';

import React, { FC, useCallback, useState } from 'react';
import useSWR from 'swr';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useDebounce } from 'use-debounce';
import type { DesignerElement } from '../designer.store';
import { PanelSkeletonGrid, PanelError } from './panel-states';
import { fitWithin } from './fit-within';

interface PhotosPanelProps {
  store: ReturnType<typeof import('../designer.store').createDesignerStore>;
  onClose?: () => void;
}

interface StockPhotoItem {
  id: string;
  url: string;
  thumbUrl: string;
  description: string | null;
  author: string;
  authorUrl: string;
  width: number;
  height: number;
}

interface StockVideoItem {
  id: string;
  url: string;
  thumbUrl: string;
  description: string | null;
  author: string;
  authorUrl: string;
  width: number;
  height: number;
}

type TabType = 'photos' | 'videos';

export const PhotosPanel: FC<PhotosPanelProps> = ({ store, onClose }) => {
  const fetch = useFetch();
  const [tab, setTab] = useState<TabType>('photos');
  const [query, setQuery] = useState('');
  const [debouncedQuery] = useDebounce(query, 300);
  const [page, setPage] = useState(1);

  const params = new URLSearchParams();
  if (debouncedQuery) params.set('query', debouncedQuery);
  params.set('page', String(page));

  const key = tab === 'photos' ? 'stock-photos' : 'stock-videos';
  const endpoint = tab === 'photos' ? '/media/stock/photos' : '/media/stock/videos';

  const { data, error, isLoading, mutate } = useSWR(
    `${key}-${debouncedQuery}-${page}`,
    async () => {
      const res = await fetch(`${endpoint}?${params}`);
      if (!res.ok) throw new Error('Failed to load');
      return res.json();
    },
    { keepPreviousData: true }
  );

  const addToCanvas = useCallback((item: StockPhotoItem | StockVideoItem) => {
    const state = store.getState();
    const { width: imgW, height: imgH } = fitWithin(
      item.width || 400,
      item.height || 400,
      state.doc.width * 0.8,
      state.doc.height * 0.8
    );
    const cx = (state.doc.width - imgW) / 2;
    const cy = (state.doc.height - imgH) / 2;

    const el: DesignerElement = {
      id: '',
      type: 'image',
      x: cx,
      y: cy,
      width: imgW,
      height: imgH,
      rotation: 0,
      opacity: 1,
      locked: false,
      hidden: false,
      src: item.thumbUrl,
    };

    state.addElement(el);
    onClose?.();
  }, [store, onClose]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-1 bg-newColColor/10 rounded-lg p-1">
        <button
          onClick={() => { setTab('photos'); setPage(1); }}
          className={`flex-1 py-1.5 rounded-md text-[12px] font-medium transition-all ${
            tab === 'photos' ? 'bg-[#2B5CD3] text-white' : 'text-textColor/60 hover:text-textColor'
          }`}
        >
          Photos
        </button>
        <button
          onClick={() => { setTab('videos'); setPage(1); }}
          className={`flex-1 py-1.5 rounded-md text-[12px] font-medium transition-all ${
            tab === 'videos' ? 'bg-[#2B5CD3] text-white' : 'text-textColor/60 hover:text-textColor'
          }`}
        >
          Videos
        </button>
      </div>

      <input
        type="text"
        value={query}
        onChange={e => { setQuery(e.target.value); setPage(1); }}
        placeholder={`Search ${tab}...`}
        className="w-full h-[36px] px-3 rounded-lg bg-newBgColorInner border border-newColColor text-[13px] outline-none focus:border-[#2B5CD3] text-textColor"
      />

      {isLoading && !data ? (
        <PanelSkeletonGrid count={6} />
      ) : error && !data ? (
        <PanelError message={`Couldn't load ${tab}`} onRetry={() => mutate()} />
      ) : data && !data.configured ? (
        <div className="text-[12px] text-newTextColor/40 text-center py-4">
          Stock browsing isn't configured
        </div>
      ) : !(data?.results || []).length ? (
        <div className="text-[12px] text-newTextColor/40 text-center py-4">
          No {tab} found{debouncedQuery ? ` for "${debouncedQuery}"` : ''}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {(data?.results || []).map((item: StockPhotoItem | StockVideoItem) => (
            <button
              key={item.id}
              onClick={() => addToCanvas(item)}
              draggable
              onDragStart={(e) => {
                const state = store.getState();
                const fit = fitWithin(
                  item.width || 400,
                  item.height || 400,
                  state.doc.width * 0.8,
                  state.doc.height * 0.8
                );
                e.dataTransfer.setData(
                  'application/x-designer-element',
                  JSON.stringify({
                    type: 'image',
                    src: item.thumbUrl,
                    width: fit.width,
                    height: fit.height,
                  })
                );
              }}
              className="group rounded-lg overflow-hidden border border-newBorder bg-newBgColorInner hover:border-[#2B5CD3] transition-all"
            >
              <div className="aspect-[4/3] relative overflow-hidden">
                <img
                  src={item.thumbUrl}
                  alt={item.description || ''}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                  loading="lazy"
                />
              </div>
              <div className="p-1.5">
                <div className="text-[10px] text-newTextColor/40 truncate">
                  by{' '}
                  <a href={item.authorUrl} target="_blank" rel="noopener noreferrer" className="text-[#2B5CD3] hover:underline">
                    {item.author}
                  </a>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {(data?.totalPages || 0) > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button
            disabled={page <= 1}
            onClick={() => setPage(p => Math.max(1, p - 1))}
            className="px-3 py-1 rounded border border-newColColor text-[12px] text-textColor hover:bg-boxHover disabled:opacity-30"
          >
            Prev
          </button>
          <span className="text-[11px] text-newTextColor/60">{page} / {data?.totalPages || 1}</span>
          <button
            disabled={page >= (data?.totalPages || 1)}
            onClick={() => setPage(p => p + 1)}
            className="px-3 py-1 rounded border border-newColColor text-[12px] text-textColor hover:bg-boxHover disabled:opacity-30"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
};
