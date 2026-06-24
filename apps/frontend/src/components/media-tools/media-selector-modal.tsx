'use client';

import React, { useEffect, useRef, useState } from 'react';
import { StockPhotos } from './stock-photos';
import { StockVideos } from './stock-videos';
import { FileManager } from '@gitroom/frontend/components/files/file-manager';
import type { FileItem } from '@gitroom/frontend/components/files/file-manager';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useToaster } from '@gitroom/react/toaster/toaster';

const TABS = ['Stock Photos', 'Stock Videos', 'My Files'] as const;

const useFocusTrap = (
  containerRef: React.RefObject<HTMLElement | null>,
  open: boolean,
  onClose: () => void,
) => {
  const returnRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    returnRef.current = document.activeElement as HTMLElement | null;
    const el = containerRef.current;
    if (!el) return;
    const focusable = el.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    const first = focusable[0] as HTMLElement | undefined;
    const last = focusable[focusable.length - 1] as HTMLElement | undefined;

    const keyHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === 'Tab') {
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };

    el.addEventListener('keydown', keyHandler);
    const t = setTimeout(() => first?.focus(), 0);
    return () => {
      clearTimeout(t);
      el.removeEventListener('keydown', keyHandler);
      returnRef.current?.focus?.();
    };
  }, [open, onClose, containerRef]);
};

interface MediaSelectorModalProps {
  open: boolean;
  onClose: () => void;
  onSelect: (item: {
    source: 'stock' | 'file';
    url: string;
    fileId?: string;
    width: number;
    height: number;
    type: 'image' | 'video';
  }) => void;
}

export const MediaSelectorModal: React.FC<MediaSelectorModalProps> = ({
  open,
  onClose,
  onSelect,
}) => {
  const fetch = useFetch();
  const toaster = useToaster();
  const [activeTab, setActiveTab] = useState<string>('Stock Photos');
  const [myFilesFolderId, setMyFilesFolderId] = useState<string | null>(null);
  const [myFilesRefreshKey, setMyFilesRefreshKey] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  useFocusTrap(containerRef, open, onClose);
  if (!open) return null;

  const handleStockSelect = (item: {
    url: string;
    width: number;
    height: number;
    thumbnail?: string;
    type: 'image' | 'video';
  }) => {
    onSelect({
      source: 'stock',
      url: item.url,
      width: item.width,
      height: item.height,
      type: item.type,
    });
    onClose();
  };

  const handleFileSelect = (items: FileItem[]) => {
    const item = items[0];
    if (!item) return;
    onSelect({
      source: 'file',
      url: item.path,
      fileId: item.id,
      width: 0,
      height: 0,
      type: item.type?.startsWith('video') ? 'video' : 'image',
    });
    onClose();
  };

  const uploadFiles = async (files: FileList | null) => {
    const fileList = files ? Array.from(files) : [];
    if (fileList.length === 0) return;
    setIsUploading(true);
    try {
      for (const file of fileList) {
        const formData = new FormData();
        formData.append('file', file);
        if (myFilesFolderId) {
          formData.append('folderId', myFilesFolderId);
        }
        const res = await fetch('/files/upload-simple', {
          method: 'POST',
          body: formData,
        });
        if (!res.ok) {
          const text = await res.text().catch(() => 'Upload failed');
          throw new Error(text);
        }
      }
      toaster.show(`Uploaded ${fileList.length} file${fileList.length === 1 ? '' : 's'}`, 'success');
      setMyFilesRefreshKey((k) => k + 1);
    } catch (err) {
      toaster.show((err as Error).message || 'Upload failed', 'warning');
    } finally {
      setIsUploading(false);
      setIsDragOver(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    uploadFiles(e.target.files);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    uploadFiles(e.dataTransfer.files);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50"
      onClick={onClose}
      role="presentation"
    >
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-label="Select media"
        className="bg-[#1a1a2e] border border-[#2a2a4a] rounded-xl w-[720px] max-h-[600px] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-[#2a2a4a]">
          <div className="flex gap-1" role="tablist" aria-label="Media source">
            {TABS.map((tab) => (
              <button
                key={tab}
                role="tab"
                aria-selected={activeTab === tab}
                aria-label={tab}
                className={`px-4 py-1.5 rounded text-sm font-medium transition-colors ${
                  activeTab === tab
                    ? 'bg-[#2B5CD3] text-white'
                    : 'text-gray-400 hover:text-white'
                }`}
                onClick={() => setActiveTab(tab)}
              >
                {tab}
              </button>
            ))}
          </div>
          <button
            className="text-gray-400 hover:text-white text-lg"
            onClick={onClose}
            aria-label="Close media selector"
            title="Close media selector"
          >
            ✕
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {activeTab === 'Stock Photos' && (
            <StockPhotos mode="select" onSelect={handleStockSelect} />
          )}
          {activeTab === 'Stock Videos' && (
            <StockVideos mode="select" onSelect={handleStockSelect} />
          )}
          {activeTab === 'My Files' && (
            <div className="flex flex-col gap-3">
              <div
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onClick={() => !isUploading && fileInputRef.current?.click()}
                className={`relative flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-6 text-center cursor-pointer transition-colors ${
                  isDragOver
                    ? 'border-designerAccent bg-designerAccent/10'
                    : 'border-newColColor bg-newBgColorInner hover:border-designerAccent/60'
                } ${isUploading ? 'opacity-60 cursor-not-allowed' : ''}`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  className="hidden"
                  onChange={handleFileInputChange}
                  disabled={isUploading}
                />
                {isUploading ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span className="text-sm text-textColor">Uploading…</span>
                  </>
                ) : (
                  <>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="text-newTextColor/60">
                      <path d="M12 16V4M12 4L7 9M12 4L17 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      <path d="M20 16V18C20 19.1046 19.1046 20 18 20H6C4.89543 20 4 19.1046 4 18V16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    <span className="text-sm text-textColor">
                      Drop files here or click to upload
                    </span>
                    <span className="text-xs text-newTextColor/50">
                      {myFilesFolderId ? 'Uploading to the selected folder' : 'Uploading to All Files'}
                    </span>
                  </>
                )}
              </div>
              <FileManager
                onSelect={handleFileSelect}
                onFolderChange={setMyFilesFolderId}
                refreshKey={myFilesRefreshKey}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
