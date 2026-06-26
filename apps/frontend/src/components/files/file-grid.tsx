'use client';

import React, { FC, useCallback } from 'react';
import { useMediaDirectory } from '@gitroom/react/helpers/use.media.directory';
import { hasExtension } from '@gitroom/helpers/utils/has.extension';
import clsx from 'clsx';
import type { FileItem } from './file-manager';

const formatDate = (d: string) => {
  try {
    return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return '';
  }
};

const fileSize = (bytes: number) => {
  if (!bytes) return '';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
};

export const FileGrid: FC<{
  files: FileItem[];
  selectedFiles: FileItem[];
  onToggleSelect: (file: FileItem) => void;
  onFileClick: (file: FileItem) => void;
  standalone?: boolean;
  onSelect?: (items: FileItem[]) => void;
}> = ({ files, selectedFiles, onToggleSelect, onFileClick, onSelect }) => {
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
        const isAudio = hasExtension(file.path, 'mp3', 'wav', 'ogg', 'm4a');
        const tags = file.tags ? JSON.parse(file.tags) : [];

        return (
          <div
            key={file.id}
            draggable
            onDragStart={(e) => handleDragStart(e, file.id)}
            className={clsx(
              'group relative w-[calc(12.5%-3px)] min-w-[120px] rounded-[8px] cursor-grab active:cursor-grabbing border-[3px] transition-all',
              isSelected ? 'border-[#2B5CD3]' : 'border-transparent hover:border-[#2B5CD3]/40'
            )}
            onClick={() => {
              if (onSelect) {
                onSelect([file]);
              } else {
                onToggleSelect(file);
              }
            }}
            onDoubleClick={() => !onSelect && onFileClick(file)}
          >
            <div className="w-full aspect-square overflow-hidden rounded-t-[5px] bg-newBgColorInner relative">
              {isAudio ? (
                // Compact audio tile; the full waveform player opens in the modal.
                <div className="flex flex-col items-center justify-center gap-[10px] w-full h-full bg-newBgColorInner text-newTextColor/70">
                  <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 18V5l12-2v13" />
                    <circle cx="6" cy="18" r="3" />
                    <circle cx="18" cy="16" r="3" />
                  </svg>
                  <div className="flex items-end gap-[2px] h-[18px]">
                    {[6, 12, 9, 16, 8, 14, 5, 11, 7].map((h, i) => (
                      <span key={i} style={{ height: h }} className="w-[3px] rounded-full bg-[#2B5CD3]/60" />
                    ))}
                  </div>
                </div>
              ) : isVideo ? (
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

            </div>

            <div className="px-[7px] py-[6px] bg-newBgColorInner rounded-b-[5px] border-t border-newBorder">
              <div
                className="text-[11px] text-textColor truncate"
                title={file.originalName || file.name}
              >
                {file.originalName || file.name}
              </div>
              <div className="text-[10px] text-newTextColor/50 truncate">
                {formatDate(file.createdAt)}
                {file.fileSize ? ` · ${fileSize(file.fileSize)}` : ''}
              </div>
              {tags.length > 0 && (
                <div className="flex gap-[4px] mt-[3px] flex-wrap">
                  {tags.slice(0, 2).map((tag: string, i: number) => (
                    <span key={i} className="text-[9px] px-[4px] py-[1px] rounded-[3px] bg-[#2B5CD3]/15 text-[#2B5CD3]">{tag}</span>
                  ))}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};
