'use client';

import React, { FC, useCallback } from 'react';
import { useMediaDirectory } from '@gitroom/react/helpers/use.media.directory';
import { hasExtension } from '@gitroom/helpers/utils/has.extension';
import clsx from 'clsx';
import type { FileItem } from './file-manager';

export const FileGrid: FC<{
  files: FileItem[];
  selectedFiles: FileItem[];
  onToggleSelect: (file: FileItem) => void;
  onFileClick: (file: FileItem) => void;
  standalone?: boolean;
  onSelect?: (items: FileItem[]) => void;
}> = ({ files, selectedFiles, onToggleSelect, onFileClick }) => {
  const mediaDirectory = useMediaDirectory();

  const handleDragStart = useCallback((e: React.DragEvent, fileId: string) => {
    e.dataTransfer.setData('text/plain', fileId);
    e.dataTransfer.effectAllowed = 'move';
  }, []);

  if (!files?.length) return null;

  return (
    <div className="flex flex-wrap gap-[3px]">
      {files.map((file) => {
        const isSelected = !!selectedFiles.find(f => f.id === file.id);
        const isVideo = hasExtension(file.path, 'mp4');
        const tags = file.tags ? JSON.parse(file.tags) : [];

        return (
          <div
            key={file.id}
            draggable
            onDragStart={(e) => handleDragStart(e, file.id)}
            className={clsx(
              'group relative w-[calc(12.5%-3px)] min-w-[120px] aspect-square rounded-[8px] overflow-hidden cursor-grab active:cursor-grabbing border-[3px] transition-all',
              isSelected ? 'border-[#2B5CD3]' : 'border-transparent hover:border-[#2B5CD3]/40'
            )}
            onClick={() => onToggleSelect(file)}
            onDoubleClick={() => onFileClick(file)}
          >
            <div className="w-full h-full bg-newBgColorInner relative">
              {isVideo ? (
                <video
                  src={mediaDirectory.set(file.path)}
                  className="w-full h-full object-cover"
                  muted
                  preload="metadata"
                />
              ) : (
                <img
                  src={mediaDirectory.set(file.path)}
                  alt={file.alt || file.name}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
              )}

              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-all pointer-events-none" />

              {isSelected && (
                <div className="absolute top-[6px] right-[6px] w-[22px] h-[22px] bg-[#2B5CD3] rounded-full flex items-center justify-center">
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <path d="M2.5 6L5 8.5L9.5 3.5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
              )}

              <div className="absolute bottom-0 left-0 right-0 p-[6px] bg-gradient-to-t from-black/80 to-transparent opacity-0 group-hover:opacity-100 transition-all pointer-events-none">
                <div className="text-[11px] text-white truncate">{file.originalName || file.name}</div>
                {tags.length > 0 && (
                  <div className="flex gap-[4px] mt-[2px] flex-wrap">
                    {tags.slice(0, 2).map((tag: string, i: number) => (
                      <span key={i} className="text-[9px] px-[4px] py-[1px] rounded-[3px] bg-[#2B5CD3]/40 text-white/80">{tag}</span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};
