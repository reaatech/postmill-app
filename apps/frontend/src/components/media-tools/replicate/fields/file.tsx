'use client';

import React, { useMemo } from 'react';
import { useModals } from '@gitroom/frontend/components/layout/new-modal';
import { MediaSelectorModal } from '@gitroom/frontend/components/media-tools/media-selector-modal';

export interface FileValue {
  fileId?: string;
  url?: string;
  type?: 'image' | 'video' | 'audio';
}

interface FileInputProps {
  value?: FileValue | string;
  onChange: (value: FileValue | undefined) => void;
  label?: string;
  required?: boolean;
  acceptType?: 'image' | 'video' | 'audio';
}

export function FileInput({ value, onChange, label, required, acceptType = 'image' }: FileInputProps) {
  const modals = useModals();

  const selected = useMemo<FileValue | undefined>(() => {
    if (!value) return undefined;
    if (typeof value === 'string') return { url: value };
    return value;
  }, [value]);

  const display = selected?.url || selected?.fileId;

  const handleChooseFile = () => {
    modals.openModal({
      title: `Select ${acceptType} file`,
      removeLayout: true,
      children: (close) => (
        <MediaSelectorModal
          open
          onClose={close}
          onSelect={(item) => {
            onChange({
              fileId: item.fileId,
              url: item.url,
              type: item.type,
            });
            close();
          }}
        />
      ),
    });
  };

  const handleClear = () => {
    onChange(undefined);
  };

  return (
    <div className="mb-3">
      {label && (
        <label className="block text-xs text-gray-400 mb-1">
          {label}
          {required && <span className="text-red-400 ml-1">*</span>}
        </label>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleChooseFile}
          className="flex-1 px-3 py-2 rounded-lg border border-newBorder bg-newBgColorInner text-gray-400 text-sm text-left hover:bg-boxHover transition-colors"
        >
          {display ? (
            <span className="truncate block">{display}</span>
          ) : (
            `Choose ${acceptType} file...`
          )}
        </button>
        {display && (
          <button
            type="button"
            onClick={handleClear}
            className="px-2 py-2 rounded-lg text-gray-500 hover:text-red-400 transition-colors"
            aria-label="Clear file"
          >
            ✕
          </button>
        )}
      </div>
      {selected?.url && acceptType === 'image' && (
        <img src={selected.url} alt="Preview" className="mt-2 w-full max-h-32 object-cover rounded-lg" />
      )}
    </div>
  );
}
