'use client';

import React, { FC, useCallback, useMemo, useState } from 'react';
import { useMediaDirectory } from '@gitroom/react/helpers/use.media.directory';
import { hasExtension } from '@gitroom/helpers/utils/has.extension';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import type { FileItem } from './file-manager';
import { DataTable } from '@gitroom/frontend/components/ui/data-table';
import type { Column } from '@gitroom/frontend/components/ui/data-table';

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
  files: FileItem[];
  selectedFiles: FileItem[];
  onToggleSelect: (file: FileItem) => void;
  onFileClick: (file: FileItem) => void;
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
    await fetch(`/files/${id}/rename`, {
      method: 'PUT',
      body: JSON.stringify({ name: renamingName.trim() }),
    });
    setRenamingId(null);
  }, [renamingName, fetch]);

  const columns: Column<FileItem>[] = useMemo(() => [
    {
      key: 'preview',
      header: '',
      width: '40px',
      render: (file: FileItem) => {
        const isVideo = hasExtension(file.path, 'mp4');
        return (
          <div className="w-[36px] h-[36px] rounded-[6px] overflow-hidden bg-newBgColorInner">
            {isVideo ? (
              <video src={mediaDirectory.set(file.path)} className="w-full h-full object-cover" muted preload="metadata" />
            ) : (
              <img src={mediaDirectory.set(file.path)} alt="" className="w-full h-full object-cover" loading="lazy" />
            )}
          </div>
        );
      },
    },
    {
      key: 'name',
      header: 'Name',
      sortable: true,
      render: (file: FileItem) => {
        if (renamingId === file.id) {
          return (
            <input
              autoFocus
              value={renamingName}
              onChange={(e) => setRenamingName(e.target.value)}
              onBlur={() => handleRename(file.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleRename(file.id);
                if (e.key === 'Escape') setRenamingId(null);
              }}
              className="bg-transparent border-b border-[#2B5CD3] text-[13px] text-textColor outline-none"
            />
          );
        }
        return (
          <div
            className="text-[13px] text-textColor cursor-pointer hover:text-[#2B5CD3] truncate max-w-[200px]"
            onDoubleClick={() => { setRenamingId(file.id); setRenamingName(file.name); }}
          >
            {file.originalName || file.name}
          </div>
        );
      },
    },
    { key: 'type', header: 'Type', sortable: true, render: (file: FileItem) => {
      const ext = file.name?.split('.').pop()?.toUpperCase() || file.type?.toUpperCase();
      return <span className="text-[12px] text-textColor/60">{ext}</span>;
    }},
    { key: 'size', header: 'Size', sortable: true, render: (file: FileItem) => (
      <span className="text-[12px] text-textColor/60">{fileSize(file.fileSize)}</span>
    )},
    { key: 'folder', header: 'Folder', render: (file: FileItem) => (
      <span className="text-[12px] text-textColor/60">{file.folder?.name || '-'}</span>
    )},
    { key: 'createdAt', header: 'Created', sortable: true, render: (file: FileItem) => (
      <span className="text-[12px] text-textColor/60 whitespace-nowrap">{formatDate(file.createdAt)}</span>
    )},
  ], [renamingId, renamingName, mediaDirectory]);

  return (
    <DataTable
      columns={columns}
      data={files}
      keyExtractor={(file: FileItem) => file.id}
      selectedIds={selectedFiles.map((f) => f.id)}
      onSelectionChange={(ids) => {
        const toRemove = selectedFiles.filter((sf) => !ids.includes(sf.id));
        const toAdd = files.filter((f) => ids.includes(f.id) && !selectedFiles.find((sf) => sf.id === f.id));
        toRemove.forEach((f) => onToggleSelect(f));
        toAdd.forEach((f) => onToggleSelect(f));
      }}
      sortKey={sortField}
      sortDir={sortOrder as 'asc' | 'desc'}
      onSort={(key) => onSort(key)}
      onRowClick={(file: FileItem) => onToggleSelect(file)}
      emptyState={{ title: 'No files found' }}
    />
  );
};
