'use client';

import React, { FC, useCallback, useState, useEffect, useRef } from 'react';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useToaster } from '@gitroom/react/toaster/toaster';
import useSWR from 'swr';
import clsx from 'clsx';
import ProviderIcon from '@gitroom/frontend/components/shared/provider-icon';

type StorageProviderInfo = {
  type: string;
  name: string;
};

type FolderItem = {
  id: string;
  name: string;
  color: string | null;
  tags: string | null;
  description: string | null;
  parentId: string | null;
  children: FolderItem[];
  _count: { files: number; children: number };
  storageProviderId?: string | null;
};

export const FolderTree: FC<{
  folders: FolderItem[];
  selectedFolderId: string | null;
  onSelectFolder: (id: string | null) => void;
  onRefresh: () => void;
  onFileMoved?: () => void;
}> = ({ folders, selectedFolderId, onSelectFolder, onRefresh, onFileMoved }) => {
  const fetch = useFetch();
  const toaster = useToaster();
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [newFolderParent, setNewFolderParent] = useState<string | null>(null);
  const [newFolderName, setNewFolderName] = useState('');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renamingName, setRenamingName] = useState('');
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; folderId: string } | null>(null);
  const [dragOverFolderId, setDragOverFolderId] = useState<string | null>(null);
  const dragCounterRef = useRef<Map<string, number>>(new Map());

  const fetchProviders = useCallback(async () => {
    const res = await fetch('/settings/storage');
    if (!res.ok) return {};
    const providers = await res.json();
    const map: Record<string, StorageProviderInfo> = {};
    for (const p of providers) {
      map[p.id] = { type: p.type, name: p.name };
    }
    return map;
  }, [fetch]);

  const { data: providersMap } = useSWR<Record<string, StorageProviderInfo>>(
    'folder-tree-storage-providers',
    fetchProviders,
    { revalidateOnFocus: false, dedupingInterval: 60000 }
  );

  const toggleCollapse = (id: string) => {
    setCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleCreateFolder = useCallback(async (parentId: string | null) => {
    if (!newFolderName.trim()) return;
    await fetch('/files/folders', {
      method: 'POST',
      body: JSON.stringify({ name: newFolderName.trim(), parentId }),
    });
    setNewFolderName('');
    setNewFolderParent(null);
    onRefresh();
    toaster.show('Folder created', 'success');
  }, [newFolderName, fetch, onRefresh, toaster]);

  const handleRename = useCallback(async (id: string) => {
    if (!renamingName.trim()) return;
    await fetch(`/files/folders/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ name: renamingName.trim() }),
    });
    setRenamingId(null);
    setRenamingName('');
    onRefresh();
  }, [renamingName, fetch, onRefresh]);

  const handleDelete = useCallback(async (id: string) => {
    const res = await fetch(`/files/folders/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      const text = await res.text();
      toaster.show(text || 'Cannot delete non-empty folder', 'warning');
    } else {
      toaster.show('Folder deleted', 'success');
      if (selectedFolderId === id) onSelectFolder(null);
    }
    onRefresh();
    setContextMenu(null);
  }, [fetch, onRefresh, toaster, selectedFolderId, onSelectFolder]);

  const handleDrop = useCallback(async (e: React.DragEvent, targetFolderId: string | null) => {
    e.preventDefault();
    setDragOverFolderId(null);
    dragCounterRef.current.delete(targetFolderId || '__all__');

    const fileId = e.dataTransfer.getData('text/plain');
    if (!fileId) return;

    const res = await fetch(`/files/${fileId}/move`, {
      method: 'PUT',
      body: JSON.stringify({ folderId: targetFolderId }),
    });

    if (!res.ok) {
      toaster.show('Failed to move file', 'warning');
      return;
    }

    toaster.show('File moved successfully', 'success');
    onRefresh();
    onFileMoved?.();
  }, [fetch, onRefresh, onFileMoved, toaster]);

  const handleDragOver = useCallback((e: React.DragEvent, folderId: string | null) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  const handleDragEnter = useCallback((folderId: string | null) => {
    const key = folderId || '__all__';
    const count = (dragCounterRef.current.get(key) || 0) + 1;
    dragCounterRef.current.set(key, count);
    setDragOverFolderId(folderId);
  }, []);

  const handleDragLeave = useCallback((folderId: string | null) => {
    const key = folderId || '__all__';
    const count = (dragCounterRef.current.get(key) || 0) - 1;
    if (count <= 0) {
      dragCounterRef.current.delete(key);
      setDragOverFolderId(prev => prev === folderId ? null : prev);
    } else {
      dragCounterRef.current.set(key, count);
    }
  }, []);

  const handleContextMenu = (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, folderId: id });
  };

  useEffect(() => {
    const close = () => setContextMenu(null);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, []);

  const renderFolder = (folder: FolderItem, depth: number = 0) => {
    const isCollapsed = collapsed.has(folder.id);
    const isSelected = selectedFolderId === folder.id;
    const isDragOver = dragOverFolderId === folder.id;
    const hasChildren = folder.children && folder.children.length > 0;
    const folderColor = folder.color || '#2B5CD3';
    const providerInfo = folder.storageProviderId && providersMap?.[folder.storageProviderId];

    return (
      <div key={folder.id}>
        <div
          className={clsx(
            'flex items-center gap-[6px] px-[8px] py-[6px] rounded-[6px] cursor-pointer group transition-all text-[13px]',
            isSelected
              ? 'bg-[#2B5CD3]/20 text-white'
              : isDragOver
                ? 'bg-[#2B5CD3]/30 text-white'
                : 'text-textColor hover:bg-newColColor/50'
          )}
          style={{ paddingLeft: `${12 + depth * 16}px` }}
          onClick={() => onSelectFolder(folder.id)}
          onContextMenu={(e) => handleContextMenu(e, folder.id)}
          onDragOver={(e) => handleDragOver(e, folder.id)}
          onDragEnter={() => handleDragEnter(folder.id)}
          onDragLeave={() => handleDragLeave(folder.id)}
          onDrop={(e) => handleDrop(e, folder.id)}
        >
          <button
            onClick={(e) => { e.stopPropagation(); toggleCollapse(folder.id); }}
            className={clsx('w-[16px] h-[16px] flex items-center justify-center transition-transform', hasChildren ? 'visible' : 'invisible')}
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" className={clsx('transition-transform', isCollapsed ? '' : 'rotate-90')}>
              <path d="M3 1L7 5L3 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>

          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M2 4.5C2 3.39543 2.89543 2.5 4 2.5H5.93934C6.46977 2.5 6.97848 2.71071 7.35355 3.08579L8 3.73223C8.18935 3.92156 8.44705 4.02708 8.71573 4.02708H12C13.1046 4.02708 14 4.92251 14 6.02708V11.5C14 12.6046 13.1046 13.5 12 13.5H4C2.89543 13.5 2 12.6046 2 11.5V4.5Z"
              fill={isSelected ? folderColor : 'none'} stroke={isSelected ? folderColor : 'currentColor'} strokeWidth="1.3" />
          </svg>

          {renamingId === folder.id ? (
            <input
              autoFocus
              value={renamingName}
              onChange={(e) => setRenamingName(e.target.value)}
              onBlur={() => handleRename(folder.id)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleRename(folder.id); if (e.key === 'Escape') setRenamingId(null); }}
              className="flex-1 bg-transparent border-b border-[#2B5CD3] text-textColor text-[13px] outline-none"
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <span className="flex-1 truncate">{folder.name}</span>
          )}

          {providerInfo && (
            <span className="inline-flex items-center gap-[4px] bg-[#2B5CD3]/15 rounded-[4px] px-[5px] py-[2px] text-[11px] text-newTextColor/70">
              <ProviderIcon identifier={providerInfo.type} name={providerInfo.name} size={14} />
              {providerInfo.type}
            </span>
          )}

          <span className="text-[11px] text-newTextColor/40 group-hover:text-newTextColor/60">{folder._count?.files || 0}</span>
        </div>

        {hasChildren && !isCollapsed && (
          <div>
            {folder.children.map((child) => renderFolder(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="w-[240px] shrink-0 flex flex-col bg-newBgColorInner rounded-[12px] border border-newBorder">
      <div className="flex items-center justify-between px-[12px] py-[12px] border-b border-newBorder">
        <div className="text-[13px] font-[600] text-textColor">Folders</div>
        <button
          onClick={() => { setNewFolderParent(null); setNewFolderName(''); }}
          className="p-[4px] rounded-[4px] text-newTextColor/60 hover:text-textColor hover:bg-boxHover transition-all"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M7 1V13M1 7H13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar scrollbar-thumb-newColColor scrollbar-track-transparent py-[4px]">
        <div
          onClick={() => onSelectFolder(null)}
          onDragOver={(e) => handleDragOver(e, null)}
          onDragEnter={() => handleDragEnter(null)}
          onDragLeave={() => handleDragLeave(null)}
          onDrop={(e) => handleDrop(e, null)}
          className={clsx(
            'flex items-center gap-[8px] px-[12px] py-[8px] cursor-pointer text-[13px] transition-all',
            selectedFolderId === null
              ? 'bg-[#2B5CD3]/20 text-white'
              : dragOverFolderId === null
                ? 'bg-[#2B5CD3]/30 text-white'
                : 'text-textColor hover:bg-newColColor/50'
          )}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <rect x="1" y="2" width="14" height="12" rx="2" stroke="currentColor" strokeWidth="1.3" />
            <path d="M1 6H15" stroke="currentColor" strokeWidth="1.3" />
          </svg>
          <span className="flex-1 truncate">All Files</span>
        </div>

        {folders.map((folder) => renderFolder(folder))}

        {newFolderParent !== null && (
          <div className="flex items-center gap-[6px] px-[12px] py-[6px]" style={{ paddingLeft: '20px' }}>
            <input
              autoFocus
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              onBlur={() => handleCreateFolder(newFolderParent)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreateFolder(newFolderParent);
                if (e.key === 'Escape') { setNewFolderParent(null); setNewFolderName(''); }
              }}
              placeholder="Folder name..."
              className="flex-1 bg-transparent border-b border-[#2B5CD3] text-textColor text-[13px] outline-none placeholder:text-newTextColor/30"
            />
          </div>
        )}
      </div>

      {contextMenu && (
        <div
          className="fixed z-[1000] bg-newBgColorInner border border-newBorder rounded-[8px] shadow-menu py-[4px] min-w-[160px]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button
            onClick={() => {
              setRenamingId(contextMenu.folderId);
              const f = findFolder(folders, contextMenu.folderId);
              setRenamingName(f?.name || '');
              setContextMenu(null);
            }}
            className="w-full text-left px-[12px] py-[8px] text-[13px] text-textColor hover:bg-boxHover transition-all"
          >
            Rename
          </button>
          <button
            onClick={() => {
              setNewFolderParent(contextMenu.folderId);
              setNewFolderName('');
              setContextMenu(null);
            }}
            className="w-full text-left px-[12px] py-[8px] text-[13px] text-textColor hover:bg-boxHover transition-all"
          >
            New Subfolder
          </button>
          <div className="border-t border-newBorder my-[4px]" />
          <button
            onClick={() => handleDelete(contextMenu.folderId)}
            className="w-full text-left px-[12px] py-[8px] text-[13px] text-red-400 hover:bg-boxHover transition-all"
          >
            Delete
          </button>
        </div>
      )}
    </div>
  );
};

function findFolder(folders: FolderItem[], id: string): FolderItem | null {
  for (const f of folders) {
    if (f.id === id) return f;
    if (f.children) {
      const found = findFolder(f.children, id);
      if (found) return found;
    }
  }
  return null;
}
