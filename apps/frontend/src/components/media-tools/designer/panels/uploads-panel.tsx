'use client';

import React, { FC, useCallback } from 'react';
import useSWR from 'swr';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import type { DesignerElement } from '../designer.store';
import { PanelSkeletonGrid, PanelError } from './panel-states';

interface UploadsPanelProps {
  store: ReturnType<typeof import('../designer.store').createDesignerStore>;
  onClose?: () => void;
}

interface FileItem {
  id: string;
  path: string;
  name: string;
  width?: number;
  height?: number;
}

export const UploadsPanel: FC<UploadsPanelProps> = ({ store, onClose }) => {
  const fetch = useFetch();

  const { data, error, isLoading, mutate } = useSWR(
    'uploads-page-1',
    async () => {
      const res = await fetch('/files?page=1&limit=20');
      if (!res.ok) throw new Error('Failed to load files');
      return res.json() as Promise<{ data: FileItem[]; total: number }>;
    },
    { keepPreviousData: true }
  );

  const addToCanvas = useCallback((file: FileItem) => {
    const state = store.getState();
    const w = Math.min(file.width || 400, state.doc.width * 0.8);
    const h = Math.min(file.height || 400, state.doc.height * 0.8);
    const cx = (state.doc.width - w) / 2;
    const cy = (state.doc.height - h) / 2;

    const el: DesignerElement = {
      id: '',
      type: 'image',
      x: cx,
      y: cy,
      width: w,
      height: h,
      rotation: 0,
      opacity: 1,
      locked: false,
      hidden: false,
      src: file.path,
      fileId: file.id,
    };

    state.addElement(el);
    onClose?.();
  }, [store, onClose]);

  return (
    <div className="flex flex-col gap-3">
      {isLoading && !data ? (
        <PanelSkeletonGrid count={6} />
      ) : error && !data ? (
        <PanelError message="Couldn't load uploads" onRetry={() => mutate()} />
      ) : !data?.data?.length ? (
        <div className="text-[12px] text-newTextColor/40 text-center py-4">
          No uploaded files found
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {data.data.map((file) => (
            <button
              key={file.id}
              onClick={() => addToCanvas(file)}
              draggable
              onDragStart={(e) =>
                e.dataTransfer.setData(
                  'application/x-designer-element',
                  JSON.stringify({
                    type: 'image',
                    src: file.path,
                    fileId: file.id,
                    width: file.width || 400,
                    height: file.height || 400,
                  })
                )
              }
              className="group rounded-lg overflow-hidden border border-newBorder bg-newBgColorInner hover:border-[#2B5CD3] transition-all"
            >
              <div className="aspect-[4/3] relative overflow-hidden bg-newColColor/10">
                <img
                  src={file.path}
                  alt={file.name}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                  loading="lazy"
                />
              </div>
              <div className="p-1.5">
                <div className="text-[10px] text-newTextColor/60 truncate">{file.name}</div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
