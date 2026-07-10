'use client';

import React, { useCallback, useState } from 'react';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useModals } from '@gitroom/frontend/components/layout/new-modal';
import { MediaSelectorModal } from '@gitroom/frontend/components/media-tools/media-selector-modal';
import { useReplicateStore } from './replicate.store';
import { MaskPainter } from './mask-painter';
import { EditorShell, toolbarBtn, toolbarPrimary } from './editor-shell';
import type { FileValue } from './fields/file';

/**
 * Inpaint mask painting, re-homed into the hero stage as a framed editor: pick a
 * source image, paint the mask on the big canvas, and the result (image + mask) is
 * written into the form input for the Generate flow in the controls column.
 */
export function InpaintMaskEditor() {
  const fetch = useFetch();
  const modals = useModals();
  const setError = useReplicateStore((s) => s.setError);
  const updateFormField = useReplicateStore((s) => s.updateFormField);
  const saveFolderId = useReplicateStore((s) => s.saveFolderId);
  const formImage = useReplicateStore((s) => (s.formInput as Record<string, unknown>).image);
  const formMask = useReplicateStore((s) => (s.formInput as Record<string, unknown>).mask);
  const [source, setSource] = useState<FileValue | null>(null);
  const [uploading, setUploading] = useState(false);

  const openSourcePicker = useCallback(() => {
    modals.openModal({
      title: 'Select source image',
      removeLayout: true,
      children: (close) => (
        <MediaSelectorModal
          open
          onClose={close}
          onSelect={(item) => {
            setSource({ fileId: item.fileId, url: item.url, type: item.type });
            close();
          }}
        />
      ),
    });
  }, [modals]);

  const handleMaskReady = useCallback(
    async (maskFile: File) => {
      if (!source?.fileId || !source.url) {
        setError('Select a source image before using a mask');
        return;
      }
      setUploading(true);
      setError(null);
      try {
        const formData = new FormData();
        formData.append('file', maskFile, 'mask.png');
        if (saveFolderId) formData.append('folderId', saveFolderId);
        const res = await fetch('/files/upload-simple', { method: 'POST', body: formData });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || 'Mask upload failed');
        updateFormField('image', source);
        updateFormField('mask', { fileId: data.id, url: data.path, type: 'image' });
      } catch (err: any) {
        setError(err.message || 'Failed to upload mask');
      } finally {
        setUploading(false);
      }
    },
    [fetch, source, saveFolderId, setError, updateFormField]
  );

  const maskApplied = !!formImage && !!formMask;

  const toolbar = (
    <>
      {maskApplied && <span className="text-xs text-green-700 dark:text-green-400">✓ Mask applied — ready to generate</span>}
      <button onClick={openSourcePicker} className={source ? toolbarBtn : toolbarPrimary}>
        {source ? 'Change image' : 'Select image'}
      </button>
    </>
  );

  return (
    <EditorShell title="Inpaint Mask" toolbar={toolbar}>
      {source?.url ? (
        <div className="w-full flex flex-col items-center gap-3">
          <MaskPainter sourceImage={source.url} onMaskReady={handleMaskReady} />
          {uploading && <p className="text-xs text-gray-400">Applying mask…</p>}
          <p className="text-[11px] text-gray-500 text-center max-w-md">
            Paint the area to regenerate, then “Use Mask”. Set your prompt and press Generate in the
            left panel.
          </p>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3">
          <span className="text-5xl opacity-40">🖌️</span>
          <button onClick={openSourcePicker} className={toolbarPrimary}>
            Select a source image to paint a mask
          </button>
        </div>
      )}
    </EditorShell>
  );
}
