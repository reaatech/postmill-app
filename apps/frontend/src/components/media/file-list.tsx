'use client';

import React, { FC, useCallback, useState } from 'react';
import { useMediaDirectory } from '@gitroom/react/helpers/use.media.directory';
import { hasExtension } from '@gitroom/helpers/utils/has.extension';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import clsx from 'clsx';
import type { MediaItem } from './media-manager';

const formatDate = (dateStr: string) => {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

const fileSize = (bytes: number) => {
  if (!bytes) return '-';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
};

export const FileList: FC<{
  files: MediaItem[];
  selectedFiles: MediaItem[];
  onToggleSelect: (file: MediaItem) => void;
  onFileClick: (file: MediaItem) => void;
  sortField: string;
  sortOrder: string;
  onSort: (field: string) => void;
}> = ({ files, selectedFiles, onToggleSelect, onFileClick, sortField, sortOrder, onSort }) => {
  const mediaDirectory = useMediaDirectory();
  const fetch = useFetch();
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renamingName, setRenamingName] = useState('');

  const handleRename = useCallback(async (id: string) => {
    if (!renamingName.trim()) return;
    await fetch(`/media/${id}/rename`, {
      method: 'PUT',
      body: JSON.stringify({ name: renamingName.trim() }),
    });
    setRenamingId(null);
  }, [renamingName, fetch]);

  const SortHeader: FC<{ field: string; label: string }> = ({ field, label }) => (
    <th
      className="px-[12px] py-[10px] text-left text-[12px] font-[500] text-textColor/60 uppercase tracking-wider cursor-pointer select-none hover:text-textColor transition-all"
      onClick={() => onSort(field)}
    >
      <div className="flex items-center gap-[4px]">
        {label}
        {sortField === field && (
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" className={clsx('transition-transform', sortOrder === 'desc' && 'rotate-180')}>
            <path d="M5 1L9 7H1L5 1Z" fill="currentColor" />
          </svg>
        )}
      </div>
    </th>
  );

  if (!files?.length) return null;

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b border-newBorder">
            <th className="w-[40px] px-[12px] py-[10px]"></th>
            <th className="w-[40px]"></th>
            <SortHeader field="name" label="Name" />
            <SortHeader field="type" label="Type" />
            <SortHeader field="size" label="Size" />
            <th className="px-[12px] py-[10px] text-left text-[12px] font-[500] text-textColor/60 uppercase tracking-wider">Folder</th>
            <SortHeader field="createdAt" label="Created" />
          </tr>
        </thead>
        <tbody>
          {files.map((file) => {
            const isSelected = !!selectedFiles.find(f => f.id === file.id);
            const isVideo = hasExtension(file.path, 'mp4');
            const ext = file.name?.split('.').pop()?.toUpperCase() || file.type?.toUpperCase();

            return (
              <tr
                key={file.id}
                className={clsx(
                  'border-b border-newBorder/50 transition-all cursor-pointer',
                  isSelected ? 'bg-[#612BD3]/10' : 'hover:bg-newColColor/30'
                )}
                onClick={() => onToggleSelect(file)}
                onDoubleClick={() => onFileClick(file)}
              >
                <td className="px-[12px] py-[8px]">
                  <div
                    className={clsx(
                      'w-[18px] h-[18px] rounded-[4px] border-2 flex items-center justify-center transition-all',
                      isSelected ? 'bg-[#612BD3] border-[#612BD3]' : 'border-newColColor'
                    )}
                  >
                    {isSelected && (
                      <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                        <path d="M2 5L4 7L8 3" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </div>
                </td>
                <td className="px-[12px] py-[8px]">
                  <div className="w-[36px] h-[36px] rounded-[6px] overflow-hidden bg-newBgColorInner">
                    {isVideo ? (
                      <video src={mediaDirectory.set(file.path)} className="w-full h-full object-cover" muted preload="metadata" />
                    ) : (
                      <img src={mediaDirectory.set(file.path)} alt="" className="w-full h-full object-cover" loading="lazy" />
                    )}
                  </div>
                </td>
                <td className="px-[12px] py-[8px]">
                  {renamingId === file.id ? (
                    <input
                      autoFocus
                      value={renamingName}
                      onChange={(e) => setRenamingName(e.target.value)}
                      onBlur={() => handleRename(file.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleRename(file.id);
                        if (e.key === 'Escape') setRenamingId(null);
                      }}
                      className="bg-transparent border-b border-[#612BD3] text-[13px] text-textColor outline-none"
                      onClick={(e) => e.stopPropagation()}
                    />
                  ) : (
                    <div
                      className="text-[13px] text-textColor cursor-pointer hover:text-[#612BD3] truncate max-w-[200px]"
                      onDoubleClick={(e) => { e.stopPropagation(); setRenamingId(file.id); setRenamingName(file.name); }}
                    >
                      {file.originalName || file.name}
                    </div>
                  )}
                </td>
                <td className="px-[12px] py-[8px] text-[12px] text-textColor/60">{ext}</td>
                <td className="px-[12px] py-[8px] text-[12px] text-textColor/60">{fileSize(file.fileSize)}</td>
                <td className="px-[12px] py-[8px] text-[12px] text-textColor/60">{file.folder?.name || '-'}</td>
                <td className="px-[12px] py-[8px] text-[12px] text-textColor/60 whitespace-nowrap">{formatDate(file.createdAt)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};
