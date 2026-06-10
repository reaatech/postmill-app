'use client';

import React, { FC, useCallback, useState } from 'react';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useToaster } from '@gitroom/react/toaster/toaster';
import clsx from 'clsx';
import type { MediaItem } from './media-manager';

type FolderItem = {
  id: string;
  name: string;
  color: string | null;
  parentId: string | null;
  children: FolderItem[];
  _count: { media: number; children: number };
};

export const BulkToolbar: FC<{
  selectedFiles: MediaItem[];
  onClearSelection: () => void;
  onRefresh: () => void;
  foldersData: FolderItem[];
}> = ({ selectedFiles, onClearSelection, onRefresh, foldersData }) => {
  const fetch = useFetch();
  const toaster = useToaster();
  const [showMoveDialog, setShowMoveDialog] = useState(false);
  const [targetFolderId, setTargetFolderId] = useState<string | null>(null);

  const handleBulkDelete = useCallback(async () => {
    if (selectedFiles.length === 0) return;
    await fetch('/media/bulk/delete', {
      method: 'POST',
      body: JSON.stringify({ ids: selectedFiles.map(f => f.id) }),
    });
    onClearSelection();
    onRefresh();
    toaster.show(`${selectedFiles.length} files deleted`, 'success');
  }, [selectedFiles, fetch, onClearSelection, onRefresh, toaster]);

  const handleBulkMove = useCallback(async () => {
    if (selectedFiles.length === 0) return;
    await fetch('/media/bulk/move', {
      method: 'POST',
      body: JSON.stringify({
        ids: selectedFiles.map(f => f.id),
        folderId: targetFolderId,
      }),
    });
    setShowMoveDialog(false);
    onClearSelection();
    onRefresh();
    toaster.show(`${selectedFiles.length} files moved`, 'success');
  }, [selectedFiles, targetFolderId, fetch, onClearSelection, onRefresh, toaster]);

  const collectFolders = (items: FolderItem[], depth = 0): { id: string; name: string; depth: number }[] => {
    const result: { id: string; name: string; depth: number }[] = [];
    for (const item of items) {
      result.push({ id: item.id, name: item.name, depth });
      if (item.children) result.push(...collectFolders(item.children, depth + 1));
    }
    return result;
  };

  if (selectedFiles.length === 0) return null;

  return (
    <div className="flex items-center gap-[8px] px-[12px] py-[8px] mb-[10px] bg-[#2B5CD3]/10 rounded-[8px] border border-[#2B5CD3]/20">
      <div className="text-[13px] text-textColor font-[500]">
        {selectedFiles.length} selected
      </div>
      <div className="flex-1" />
      <button
        onClick={() => setShowMoveDialog(true)}
        className="px-[12px] py-[6px] rounded-[6px] text-[12px] text-textColor border border-newColColor hover:bg-forth transition-all"
      >
        Move to Folder
      </button>
      <button
        onClick={handleBulkDelete}
        className="px-[12px] py-[6px] rounded-[6px] text-[12px] text-red-400 border border-newColColor hover:bg-forth transition-all"
      >
        Delete
      </button>
      <button
        onClick={onClearSelection}
        className="px-[12px] py-[6px] rounded-[6px] text-[12px] text-textColor/60 hover:text-textColor transition-all"
      >
        Clear
      </button>

      {showMoveDialog && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/50" onClick={() => setShowMoveDialog(false)}>
          <div className="bg-newBgColorInner border border-newBorder rounded-[12px] p-[20px] min-w-[300px] shadow-menu" onClick={(e) => e.stopPropagation()}>
            <div className="text-[14px] font-[600] text-textColor mb-[12px]">Move to Folder</div>
            <div className="space-y-[4px] max-h-[250px] overflow-y-auto scrollbar scrollbar-thumb-newColColor">
              <button
                onClick={() => setTargetFolderId(null)}
                className={clsx(
                  'w-full text-left px-[10px] py-[6px] rounded-[6px] text-[13px] transition-all',
                  targetFolderId === null ? 'bg-[#2B5CD3]/20 text-white' : 'text-textColor hover:bg-forth'
                )}
              >
                Root (no folder)
              </button>
              {collectFolders(foldersData).map((f) => (
                <button
                  key={f.id}
                  onClick={() => setTargetFolderId(f.id)}
                  className={clsx(
                    'w-full text-left px-[10px] py-[6px] rounded-[6px] text-[13px] transition-all',
                    targetFolderId === f.id ? 'bg-[#2B5CD3]/20 text-white' : 'text-textColor hover:bg-forth'
                  )}
                  style={{ paddingLeft: `${10 + f.depth * 16}px` }}
                >
                  {f.name}
                </button>
              ))}
            </div>
            <div className="flex justify-end gap-[8px] mt-[16px]">
              <button
                onClick={() => setShowMoveDialog(false)}
                className="px-[14px] py-[8px] rounded-[8px] text-[13px] text-textColor border border-newColColor hover:bg-forth transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleBulkMove}
                className="px-[14px] py-[8px] rounded-[8px] text-[13px] text-white bg-[#2B5CD3] hover:bg-[#2B5CD3]/80 transition-all"
              >
                Move
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

