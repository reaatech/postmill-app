'use client';

import React, { FC, useCallback, useEffect, useState } from 'react';
import useSWR from 'swr';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useDebounce } from 'use-debounce';
import { FolderTree } from '@gitroom/frontend/components/media/folder-tree';
import { FileGrid } from '@gitroom/frontend/components/media/file-grid';
import { FileList } from '@gitroom/frontend/components/media/file-list';
import { FileDetailsPanel } from '@gitroom/frontend/components/media/file-details-panel';
import { BulkToolbar } from '@gitroom/frontend/components/media/bulk-toolbar';
import { MediaUploader } from '@gitroom/frontend/components/media/media-uploader';
import { LoadingComponent } from '@gitroom/frontend/components/layout/loading';
import { TrashComponent } from '@gitroom/frontend/components/media/trash.component';
import clsx from 'clsx';
import { PageHeader } from '@gitroom/frontend/components/ui/page-header';

type ViewMode = 'grid' | 'list';

const GridIcon: FC<{ className?: string }> = ({ className }) => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className={className}>
    <rect x="1" y="1" width="5.5" height="5.5" rx="1" stroke="currentColor" strokeWidth="1.5" />
    <rect x="9.5" y="1" width="5.5" height="5.5" rx="1" stroke="currentColor" strokeWidth="1.5" />
    <rect x="1" y="9.5" width="5.5" height="5.5" rx="1" stroke="currentColor" strokeWidth="1.5" />
    <rect x="9.5" y="9.5" width="5.5" height="5.5" rx="1" stroke="currentColor" strokeWidth="1.5" />
  </svg>
);

const ListViewIcon: FC<{ className?: string }> = ({ className }) => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className={className}>
    <rect x="1" y="1" width="14" height="3.5" rx="1" stroke="currentColor" strokeWidth="1.5" />
    <rect x="1" y="6.25" width="14" height="3.5" rx="1" stroke="currentColor" strokeWidth="1.5" />
    <rect x="1" y="11.5" width="14" height="3.5" rx="1" stroke="currentColor" strokeWidth="1.5" />
  </svg>
);

export type MediaItem = {
  id: string;
  name: string;
  originalName: string | null;
  path: string;
  thumbnail: string | null;
  alt: string | null;
  thumbnailTimestamp: number | null;
  fileSize: number;
  type: string;
  tags: string | null;
  description: string | null;
  folderId: string | null;
  createdAt: string;
  folder?: { id: string; name: string } | null;
};

export const MediaManager: FC<{ standalone?: boolean; onSelect?: (items: MediaItem[]) => void }> = ({
  standalone,
  onSelect,
}) => {
  const fetch = useFetch();
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');
  const [debouncedSearch] = useDebounce(search, 300);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<MediaItem[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [sortField, setSortField] = useState('createdAt');
  const [sortOrder, setSortOrder] = useState('desc');
  const [filterType, setFilterType] = useState('');
  const [filterTag, setFilterTag] = useState('');
  const [detailsFile, setDetailsFile] = useState<MediaItem | null>(null);
  const [showTrash, setShowTrash] = useState(false);

  useEffect(() => { setPage(0); }, [debouncedSearch, selectedFolderId, filterType, filterTag]);

  const params = new URLSearchParams({ page: String(page + 1) });
  if (debouncedSearch.trim()) params.set('search', debouncedSearch.trim());
  if (selectedFolderId) params.set('folderId', selectedFolderId);
  else params.set('folderId', 'null');
  if (filterType) params.set('type', filterType);
  if (filterTag) params.set('tag', filterTag);
  if (sortField) params.set('sort', sortField);
  if (sortOrder) params.set('order', sortOrder);
  params.set('limit', '24');

  const { data, mutate, isLoading } = useSWR(
    `media-${page}-${debouncedSearch}-${selectedFolderId || 'root'}-${filterType}-${filterTag}-${sortField}-${sortOrder}`,
    async () => (await fetch(`/media?${params.toString()}`)).json()
  );

  const { data: foldersData, mutate: mutateFolders } = useSWR(
    'media-folders',
    async () => (await fetch('/media/folders')).json()
  );

  const toggleFileSelection = useCallback((file: MediaItem) => {
    setSelectedFiles(prev => {
      const exists = prev.find(f => f.id === file.id);
      if (exists) return prev.filter(f => f.id !== file.id);
      return [...prev, file];
    });
  }, []);

  const clearSelection = useCallback(() => setSelectedFiles([]), []);

  const handleFolderSelect = useCallback((folderId: string | null) => {
    setSelectedFolderId(folderId);
    setSelectedFiles([]);
    setDetailsFile(null);
    setPage(0);
  }, []);

  const refresh = useCallback(() => {
    mutate();
    mutateFolders();
  }, [mutate, mutateFolders]);

  const pages = data?.pages || 0;

  return (
    <div className="flex flex-1 h-full gap-[15px]">
      <FolderTree
        folders={foldersData || []}
        selectedFolderId={selectedFolderId}
        onSelectFolder={handleFolderSelect}
        onRefresh={mutateFolders}
        onFileMoved={refresh}
      />

      <div className="flex-1 flex flex-col min-w-0">
        <PageHeader title="Media Library" description="Manage your images, videos, and files" />
        <div className="flex items-center gap-[12px] mb-[15px]">
          <div className="flex-1 relative">
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search files by name, tags..."
              className="w-full h-[44px] pl-[40px] pr-[14px] rounded-[8px] bg-newBgColorInner border border-newColColor text-[14px] outline-none focus:border-[#2B5CD3] text-textColor"
            />
            <svg
              className="absolute left-[12px] top-[50%] -translate-y-[50%] text-newTextColor/40"
              width="16" height="16" viewBox="0 0 16 16" fill="none"
            >
              <circle cx="6.5" cy="6.5" r="4.5" stroke="currentColor" strokeWidth="1.5" />
              <path d="M10 10L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </div>

          <div className="flex items-center gap-[8px]">
            <select
              value={filterType}
              onChange={e => setFilterType(e.target.value)}
              className="h-[44px] px-[12px] rounded-[8px] bg-newBgColorInner border border-newColColor text-[13px] text-textColor outline-none focus:border-[#2B5CD3]"
            >
              <option value="">All types</option>
              <option value="image">Images</option>
              <option value="video">Videos</option>
              <option value="audio">Audio</option>
              <option value="document">Documents</option>
            </select>

            <button
              onClick={() => setViewMode('grid')}
              className={clsx('p-[10px] rounded-[8px] border transition-all', viewMode === 'grid'
                ? 'border-[#2B5CD3] text-[#2B5CD3] bg-[#2B5CD3]/10'
                : 'border-newColColor text-textColor hover:bg-boxHover')}
            >
              <GridIcon />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={clsx('p-[10px] rounded-[8px] border transition-all', viewMode === 'list'
                ? 'border-[#2B5CD3] text-[#2B5CD3] bg-[#2B5CD3]/10'
                : 'border-newColColor text-textColor hover:bg-boxHover')}
            >
              <ListViewIcon />
            </button>

            <button
              onClick={() => setShowTrash(!showTrash)}
              className="px-[12px] h-[44px] rounded-[8px] border border-newColColor text-[13px] text-textColor hover:bg-boxHover transition-colors"
            >
              🗑️ Trash
            </button>
          </div>
        </div>

        <BulkToolbar
          selectedFiles={selectedFiles}
          onClearSelection={clearSelection}
          onRefresh={refresh}
          foldersData={foldersData || []}
        />

        <MediaUploader
          folderId={selectedFolderId}
          onUploadComplete={refresh}
        />

        <div className="flex-1 relative min-h-0">
          {isLoading ? (
            <LoadingComponent />
          ) : !data?.results?.length ? (
            <div className="flex flex-col items-center justify-center h-full gap-[15px] text-textColor/60">
              <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
                <rect x="8" y="12" width="48" height="40" rx="6" stroke="currentColor" strokeWidth="2" strokeOpacity="0.3" />
                <circle cx="24" cy="28" r="4" stroke="currentColor" strokeWidth="2" strokeOpacity="0.3" />
                <path d="M8 44L22 32L34 44L44 34L56 44" stroke="currentColor" strokeWidth="2" strokeOpacity="0.3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <div className="text-[16px] font-[500]">
                {debouncedSearch ? 'No media matches your search' : 'This folder is empty'}
              </div>
            </div>
          ) : viewMode === 'grid' ? (
            <FileGrid
              files={data.results}
              selectedFiles={selectedFiles}
              onToggleSelect={toggleFileSelection}
              onFileClick={setDetailsFile}
              standalone={standalone}
              onSelect={onSelect}
            />
          ) : (
            <FileList
              files={data.results}
              selectedFiles={selectedFiles}
              onToggleSelect={toggleFileSelection}
              onFileClick={setDetailsFile}
              sortField={sortField}
              sortOrder={sortOrder}
              onSort={(field) => {
                if (sortField === field) {
                  setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
                } else {
                  setSortField(field);
                  setSortOrder('asc');
                }
              }}
            />
          )}
        </div>

        {(pages || 0) > 1 && (
          <div className="flex items-center justify-center gap-[8px] mt-[15px]">
            <button
              disabled={page === 0}
              onClick={() => setPage(p => Math.max(0, p - 1))}
              className={clsx('p-[8px] rounded-[6px] border border-newColColor transition-all',
                page === 0 ? 'opacity-30 cursor-not-allowed' : 'hover:bg-boxHover text-textColor')}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M10 12L6 8L10 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>
            {Array.from({ length: Math.min(pages, 7) }, (_, i) => {
              let pageNum: number;
              if (pages <= 7) {
                pageNum = i;
              } else if (page < 3) {
                pageNum = i;
              } else if (page > pages - 4) {
                pageNum = pages - 7 + i;
              } else {
                pageNum = page - 3 + i;
              }
              return (
                <button
                  key={pageNum}
                  onClick={() => setPage(pageNum)}
                  className={clsx('w-[36px] h-[36px] rounded-[6px] text-[13px] font-medium transition-all',
                    page === pageNum
                      ? 'bg-[#2B5CD3] text-white'
                      : 'text-textColor hover:bg-boxHover border border-newColColor')}
                >
                  {pageNum + 1}
                </button>
              );
            })}
            <button
              disabled={page >= pages - 1}
              onClick={() => setPage(p => Math.min(pages - 1, p + 1))}
              className={clsx('p-[8px] rounded-[6px] border border-newColColor transition-all',
                page >= pages - 1 ? 'opacity-30 cursor-not-allowed' : 'hover:bg-boxHover text-textColor')}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M6 4L10 8L6 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>
          </div>
        )}
      </div>

      {detailsFile && (
        <FileDetailsPanel
          file={detailsFile}
          onClose={() => setDetailsFile(null)}
          onRefresh={refresh}
        />
      )}

      {showTrash && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-[20px]">
          <div className="bg-newBgColorInner rounded-[12px] w-full max-w-4xl max-h-[80vh] overflow-auto p-[24px]">
            <TrashComponent onClose={() => setShowTrash(false)} />
          </div>
        </div>
      )}
    </div>
  );
};
