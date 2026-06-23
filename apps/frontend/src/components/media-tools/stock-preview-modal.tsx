'use client';

import React, { FC, useCallback, useState } from 'react';
import useSWR from 'swr';
import { useRouter } from 'next/navigation';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useModals } from '@gitroom/frontend/components/layout/new-modal';
import { StockPhotoItem } from './stock-photos';
import { StockVideoItem } from './stock-videos';
import { SaveToFilesModal } from './save-to-files-modal';

interface StockPreviewModalProps {
  item: StockPhotoItem | StockVideoItem;
  type: 'photo' | 'video';
}

export const StockPreviewModal: FC<StockPreviewModalProps> = ({ item: initialItem, type }) => {
  const fetch = useFetch();
  const modal = useModals();
  const router = useRouter();
  const [item, setItem] = useState(initialItem);

  // "Open in Designer" navigates to the full /media/designer page with the
  // asset in the query string — there is no Designer modal. `w/h` are the chosen
  // canvas size (drives the doc); `nw/nh` are the image's real pixel size so it
  // is placed aspect-correct inside that canvas.
  const openDesignerWith = useCallback(
    (width: number, height: number) => {
      const params = new URLSearchParams();
      params.set('url', item.url);
      params.set('type', type);
      params.set('source', type === 'photo' ? 'unsplash' : 'pexels');
      params.set('w', String(width));
      params.set('h', String(height));
      params.set('nw', String(item.width));
      params.set('nh', String(item.height));
      if (item.author) params.set('author', item.author);
      if (item.authorUrl) params.set('authorUrl', item.authorUrl);
      if (type === 'video' && (item as StockVideoItem).thumbUrl) {
        // The canvas image is the POSTER (thumbUrl), never the .mp4.
        params.set('thumbUrl', (item as StockVideoItem).thumbUrl);
      }
      if (type === 'photo' && (item as StockPhotoItem).downloadLocation) {
        params.set('downloadLocation', (item as StockPhotoItem).downloadLocation!);
      }
      modal.closeAll();
      router.push(`/media/designer?${params.toString()}`);
    },
    [router, modal, item, type]
  );

  // Straight to the Designer at the image's original size — no size picker.
  const handleOpenInDesigner = useCallback(() => {
    openDesignerWith(item.width, item.height);
  }, [openDesignerWith, item]);

  const relatedKey = type === 'photo'
    ? `stock-photos-${(item as StockPhotoItem).id}-related`
    : `stock-videos-${(item as StockVideoItem).id}-related`;

  const { data: related } = useSWR(relatedKey, async () => {
    const endpoint = type === 'photo'
      ? `/media/stock/photos/${(item as StockPhotoItem).id}/related`
      : `/media/stock/videos/${(item as StockVideoItem).id}/related`;
    const res = await fetch(endpoint);
    if (!res.ok) return [];
    return res.json();
  });

  const handleSaveToFiles = useCallback(() => {
    modal.closeAll();
    modal.openModal({
      title: '',
      closeOnClickOutside: true,
      closeOnEscape: true,
      withCloseButton: true,
      classNames: { modal: 'w-[100%] max-w-[600px] text-textColor' },
      children: (
        <SaveToFilesModal
          url={item.url}
          name={type === 'photo' ? `unsplash-${item.id}.jpg` : `pexels-${item.id}.mp4`}
          source={type === 'photo' ? 'unsplash' : 'pexels'}
          downloadLocation={type === 'photo' ? (item as StockPhotoItem).downloadLocation || undefined : undefined}
        />
      ),
      size: 'lg',
    });
  }, [modal, item, type]);

  return (
    <div className="flex flex-col gap-[20px] max-w-4xl">
      <div className="flex gap-[20px]">
        <div className="flex-1 min-w-0">
          {type === 'photo' ? (
            <img
              src={(item as StockPhotoItem).url}
              alt={(item as StockPhotoItem).description || ''}
              className="w-full rounded-[8px] max-h-[60vh] object-contain"
            />
          ) : (
            <video
              src={(item as StockVideoItem).url}
              poster={(item as StockVideoItem).thumbUrl}
              controls
              className="w-full rounded-[8px] max-h-[60vh]"
            />
          )}
        </div>
        <div className="w-[240px] shrink-0 flex flex-col gap-[12px]">
          <div className="text-[12px] text-newTextColor/40 uppercase tracking-wider font-[600]">
            {type === 'photo' ? 'Photo' : 'Video'}
          </div>
          {type === 'photo' && (
            <div className="text-[13px] text-textColor">
              {(item as StockPhotoItem).width} × {(item as StockPhotoItem).height}
            </div>
          )}
          {type === 'video' && (
            <div className="text-[13px] text-textColor">
              {(item as StockVideoItem).width} × {(item as StockVideoItem).height}
            </div>
          )}
          <div className="text-[13px] text-textColor">
            by{' '}
            <a
              href={item.authorUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#2B5CD3] hover:underline"
            >
              {item.author}
            </a>
          </div>
          <div className="flex gap-[8px] items-center">
            <span className="px-[8px] py-[2px] rounded-[4px] bg-[#2B5CD3]/20 text-[11px] text-[#2B5CD3] font-[500]">
              {type === 'photo' ? 'Unsplash' : 'Pexels'}
            </span>
          </div>
          <div className="text-[12px] text-newTextColor/60">
            {item.description}
          </div>
          <button
            onClick={handleOpenInDesigner}
            className="px-[16px] py-[10px] rounded-[8px] bg-green-600 text-white text-[13px] font-[500] hover:bg-green-700 transition-all flex items-center gap-[6px]"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
            </svg>
            Open in Designer
          </button>
          <button
            onClick={handleSaveToFiles}
            className="px-[16px] py-[10px] rounded-[8px] border border-newColColor text-textColor text-[13px] font-[500] hover:bg-boxHover transition-all"
          >
            Save to Files
          </button>
        </div>
      </div>

      {related && related.length > 0 && (
        <div>
          <div className="text-[14px] font-[600] text-textColor mb-[12px]">Related</div>
          <div className="flex gap-[10px] overflow-x-auto pb-[8px]">
            {(related.results || related).slice(0, 8).map((rel: any) => (
              <button
                key={rel.id}
                type="button"
                onClick={() => setItem(rel)}
                className="w-[120px] shrink-0 cursor-pointer rounded-[6px] overflow-hidden border border-newBorder hover:border-[#2B5CD3] transition-all"
              >
                <div className="aspect-square">
                  <img
                    src={rel.thumbUrl}
                    alt={rel.description || ''}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
