'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { deleteDialog } from '@gitroom/react/helpers/delete.dialog';

export const TrashComponent: React.FC<{ onClose?: () => void }> = ({ onClose }) => {
  const fetch = useFetch();
  const toast = useToaster();
  const [trashedMedia, setTrashedMedia] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const loadTrash = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/media/trash');
      if (res.ok) {
        const data = await res.json();
        setTrashedMedia(data || []);
      } else {
        toast.show('Failed to load trash', 'warning');
      }
    } catch {
      toast.show('Failed to load trash', 'warning');
    } finally {
      setLoading(false);
    }
  }, [fetch, toast]);

  useEffect(() => {
    loadTrash();
  }, [loadTrash]);

  const handleRestore = async (id: string) => {
    try {
      const res = await fetch(`/media/${id}/restore`, { method: 'POST' });
      if (res.ok) {
        setTrashedMedia((prev) => prev.filter((m) => m.id !== id));
        toast.show('Media restored successfully', 'success');
      } else {
        toast.show('Failed to restore media', 'warning');
      }
    } catch {
      toast.show('Failed to restore media', 'warning');
    }
  };

  const handlePermanentDelete = async (id: string) => {
    const confirmed = await deleteDialog(
      'Permanently delete this media? This action cannot be undone.',
      'Permanently Delete',
      'Delete'
    );
    if (!confirmed) return;

    try {
      const res = await fetch(`/media/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setTrashedMedia((prev) => prev.filter((m) => m.id !== id));
        toast.show('Media permanently deleted', 'success');
      } else {
        toast.show('Failed to delete media', 'warning');
      }
    } catch {
      toast.show('Failed to delete media', 'warning');
    }
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleString();
  };

  return (
    <div className="flex flex-col gap-[20px]">
      <div className="flex items-center justify-between">
        <h3 className="text-[18px] text-textColor font-semibold">Trash</h3>
        {onClose && (
          <button
            onClick={onClose}
            className="text-customColor18 hover:text-textColor transition-colors"
          >
            ✕
          </button>
        )}
      </div>

      {loading ? (
        <div className="text-[14px] text-customColor18">Loading trash...</div>
      ) : trashedMedia.length === 0 ? (
        <div className="text-[14px] text-customColor18 text-center py-[40px]">
          Your trash is empty.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-[16px]">
          {trashedMedia.map((media) => (
            <div
              key={media.id}
              className="rounded-[8px] bg-customColor8 overflow-hidden border border-customColor20"
            >
              {media.path && (
                <div className="aspect-square bg-customColor20 flex items-center justify-center">
                  <img
                    src={media.path}
                    alt={media.name}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = 'none';
                    }}
                  />
                </div>
              )}
              <div className="p-[12px]">
                <div className="text-[13px] text-textColor font-medium truncate mb-[4px]">
                  {media.name}
                </div>
                <div className="text-[11px] text-customColor18 mb-[8px]">
                  Deleted: {formatDate(media.deletedAt)}
                </div>
                <div className="flex gap-[8px]">
                  <button
                    onClick={() => handleRestore(media.id)}
                    className="flex-1 px-[8px] py-[6px] rounded-[4px] bg-customColor4 text-textColor text-[12px] font-medium hover:bg-customColor4/80 transition-colors"
                  >
                    Restore
                  </button>
                  <button
                    onClick={() => handlePermanentDelete(media.id)}
                    className="flex-1 px-[8px] py-[6px] rounded-[4px] bg-red-600 text-white text-[12px] font-medium hover:bg-red-700 transition-colors"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
