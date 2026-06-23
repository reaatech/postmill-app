'use client';

import React, { FC, useCallback, useState } from 'react';
import useSWR from 'swr';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useModals } from '@gitroom/frontend/components/layout/new-modal';
import { StockPhotoItem } from './stock-photos';
import { StockVideoItem } from './stock-videos';
import dynamic from 'next/dynamic';
import { SaveToFilesModal } from './save-to-files-modal';
import { CHANNEL_PRESETS } from '@gitroom/nestjs-libraries/integrations/social/channel-presets';

// Client-only: Konva touches `window`/`canvas` at module-eval, so the Designer
// must never load on the server and should only pull its bundle when opened.
const Designer = dynamic(
  () => import('./designer/designer').then((m) => m.Designer),
  { ssr: false }
);

interface StockPreviewModalProps {
  item: StockPhotoItem | StockVideoItem;
  type: 'photo' | 'video';
}

export const StockPreviewModal: FC<StockPreviewModalProps> = ({ item: initialItem, type }) => {
  const fetch = useFetch();
  const modal = useModals();
  const [item, setItem] = useState(initialItem);

  const openDesignerWith = useCallback(
    (width: number, height: number) => {
      modal.closeAll();
      modal.openModal({
        title: '',
        closeOnClickOutside: true,
        closeOnEscape: true,
        withCloseButton: true,
        fullScreen: true,
        children: (
          <Designer
            initialAsset={{
              url: item.url,
              // For video, the canvas image is the POSTER (thumbUrl), never the
              // .mp4 — Konva can't draw a video file as an image.
              thumbUrl: type === 'video' ? (item as StockVideoItem).thumbUrl : undefined,
              type,
              author: item.author,
              authorUrl: item.authorUrl,
              downloadLocation: type === 'photo' ? (item as StockPhotoItem).downloadLocation || undefined : undefined,
              source: type === 'photo' ? 'unsplash' : 'pexels',
              width,
              height,
            }}
          />
        ),
      });
    },
    [modal, item, type]
  );

  // B7 — let the user pick the canvas size (image-native vs a social preset)
  // before opening the Designer.
  const handleOpenInDesigner = useCallback(() => {
    modal.openModal({
      title: 'Open in Designer',
      closeOnClickOutside: true,
      closeOnEscape: true,
      withCloseButton: true,
      children: (
        <div className="p-4 w-[360px] max-w-full">
          <button
            onClick={() => openDesignerWith(item.width, item.height)}
            className="w-full mb-3 px-4 py-3 rounded-lg bg-green-600 text-white text-[13px] font-medium hover:bg-green-700"
          >
            Original size · {item.width} × {item.height}
          </button>
          <div className="text-[11px] text-textColor/40 uppercase tracking-wider mb-2">Or a channel size</div>
          <div className="grid grid-cols-2 gap-2">
            {CHANNEL_PRESETS.filter((p) => p.category !== 'custom').map((p) => (
              <button
                key={p.id}
                onClick={() => openDesignerWith(p.width, p.height)}
                className="px-3 py-2 rounded-md border border-newBorder text-textColor text-[12px] hover:border-[#2B5CD3] hover:bg-newColColor/20 text-left"
              >
                {p.name}
                <span className="block text-[10px] text-textColor/40">
                  {p.width} × {p.height}
                </span>
              </button>
            ))}
          </div>
        </div>
      ),
    });
  }, [modal, item, openDesignerWith]);

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
