'use client';

import React, { FC, useCallback, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Stage, Layer, Rect, Image as KonvaImage } from 'react-konva';
import type Konva from 'konva';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { useModals } from '@gitroom/frontend/components/layout/new-modal';
import { CanvasElements, gradientFillProps } from './elements';
import type { DesignerDoc, DesignerPage } from './designer.store';
import { SaveToFilesModal } from '../save-to-files-modal';

interface ExportDialogProps {
  store: any;
  onClose: () => void;
}

type FormatValue = 'png' | 'jpeg' | 'transparent';

const FORMATS: { value: FormatValue; label: string }[] = [
  { value: 'png', label: 'PNG' },
  { value: 'jpeg', label: 'JPEG' },
  { value: 'transparent', label: 'Transparent PNG' },
];

const SCALES = [
  { value: 1, label: '1x' },
  { value: 2, label: '2x' },
  { value: 3, label: '3x' },
];

const mimeFor = (format: FormatValue) =>
  format === 'jpeg' ? 'image/jpeg' : 'image/png';

const extFor = (format: FormatValue) =>
  format === 'jpeg' ? 'jpeg' : 'png';

// Pre-load every image source used by a page so the offscreen Konva stage
// rasterizes fully. Keep crossOrigin='anonymous' so the export canvas stays
// untainted and toBlob() succeeds.
const preloadImages = (page: DesignerPage): Promise<void> => {
  const srcs = new Set<string>();
  if (page.bg?.type === 'image' && page.bg.src) srcs.add(page.bg.src);
  page.children.forEach((el) => {
    if (el.type === 'image' && el.src) srcs.add(el.src);
  });
  if (!srcs.size) return Promise.resolve();
  return Promise.all(
    Array.from(srcs).map(
      (src) =>
        new Promise<void>((resolve) => {
          const img = new Image();
          img.crossOrigin = 'anonymous';
          img.onload = () => resolve();
          img.onerror = () => resolve();
          img.src = src;
        })
    )
  ).then(() => undefined);
};

// Render a single page to an offscreen, zoom-independent Konva stage sized to the
// document, then export at the requested pixelRatio. `transparent` skips the page
// background rect so elements render over alpha.
const renderPageToBlob = async (
  doc: DesignerDoc,
  page: DesignerPage,
  format: FormatValue,
  pixelRatio: number
): Promise<Blob | null> => {
  await preloadImages(page);

  const host = document.createElement('div');
  host.style.position = 'fixed';
  host.style.left = '-100000px';
  host.style.top = '0';
  host.style.width = `${doc.width}px`;
  host.style.height = `${doc.height}px`;
  host.style.pointerEvents = 'none';
  document.body.appendChild(host);

  const root = createRoot(host);
  const stageRef = React.createRef<Konva.Stage>();
  const transparent = format === 'transparent';
  const bg = page.bg;
  const bgGrad =
    bg?.type === 'gradient' ? gradientFillProps(bg.gradient, doc.width, doc.height) : {};
  const bgImageSrc = bg?.type === 'image' ? bg.src : undefined;
  const bgImageEl = (() => {
    if (!bgImageSrc) return null;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = bgImageSrc;
    return img;
  })();

  try {
    await new Promise<void>((resolve) => {
      root.render(
        <Stage ref={stageRef} width={doc.width} height={doc.height}>
          <Layer>
            {!transparent && (
              <Rect
                x={0}
                y={0}
                width={doc.width}
                height={doc.height}
                fill={bg?.type === 'gradient' ? undefined : bg?.color || page.background || '#ffffff'}
                {...bgGrad}
              />
            )}
            {!transparent && bg?.type === 'image' && bgImageEl && (
              <KonvaImage
                image={bgImageEl}
                x={0}
                y={0}
                width={doc.width}
                height={doc.height}
                listening={false}
              />
            )}
            <CanvasElements elements={page.children} onSelect={() => {}} />
          </Layer>
        </Stage>
      );
      // Allow react-konva to mount + the shared image cache to settle.
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });

    const stage = stageRef.current;
    if (!stage) return null;
    stage.draw();

    const blob = await stage.toBlob({ pixelRatio, mimeType: mimeFor(format) });
    return (blob as Blob | null) ?? null;
  } finally {
    root.unmount();
    host.remove();
  }
};

export const ExportDialog: FC<ExportDialogProps> = ({ store, onClose }) => {
  const fetch = useFetch();
  const toaster = useToaster();
  const modal = useModals();
  const [format, setFormat] = useState<FormatValue>('png');
  const [scale, setScale] = useState(1);
  const [allPages, setAllPages] = useState(false);
  const [exporting, setExporting] = useState(false);

  const doc: DesignerDoc = store((s: any) => s.doc);
  const multiPage = doc.pages.length > 1;
  const exportAll = multiPage && allPages;

  // Fire the Unsplash download ping once per export (best-effort, never blocks).
  const pingDownload = useCallback(async () => {
    const attribution = store.getState().doc.attribution;
    if (attribution?.source === 'unsplash' && attribution.downloadLocation) {
      try {
        await fetch('/media/stock/download', {
          method: 'POST',
          body: JSON.stringify({ downloadLocation: attribution.downloadLocation }),
        });
      } catch {
        // Best-effort download ping; never block export.
      }
    }
  }, [store, fetch]);

  // Upload one blob via /files/upload-simple, carrying attribution metadata.
  const uploadBlob = useCallback(
    async (blob: Blob, fileName: string): Promise<{ id: string; path: string } | null> => {
      const attribution = store.getState().doc.attribution;
      const formData = new FormData();
      formData.append('file', blob, fileName);
      if (attribution?.source) formData.append('source', attribution.source);
      if (attribution?.downloadLocation)
        formData.append('downloadLocation', attribution.downloadLocation);
      if (attribution?.author) formData.append('author', attribution.author);
      if (attribution?.authorUrl) formData.append('authorUrl', attribution.authorUrl);

      const res = await fetch('/files/upload-simple', { method: 'POST', body: formData });
      if (!res.ok) return null;
      return res.json();
    },
    [store, fetch]
  );

  // Render the selected page(s) and upload each. Returns an array so the
  // multi-page (carousel) case can hand N images to the composer. Single-page
  // export yields a 1-element array.
  const renderAndUpload = useCallback(async (): Promise<{ id: string; path: string }[]> => {
    const state = store.getState();
    const liveDoc: DesignerDoc = state.doc;
    const baseName = (state.designName || 'design').replace(/[^a-zA-Z0-9]/g, '_');
    const pages = exportAll ? liveDoc.pages : [liveDoc.pages[state.currentPage]];

    await pingDownload();

    const results: { id: string; path: string }[] = [];
    for (let i = 0; i < pages.length; i++) {
      const blob = await renderPageToBlob(liveDoc, pages[i], format, scale);
      if (!blob) continue;
      const suffix = exportAll ? `_${i + 1}` : '';
      const saved = await uploadBlob(blob, `${baseName}${suffix}.${extFor(format)}`);
      if (saved) results.push(saved);
    }
    return results;
  }, [store, exportAll, format, scale, pingDownload, uploadBlob]);

  // Render the current page once and open the shared SaveToFilesModal so the user
  // picks a destination folder (folder tree + storage-mount badges), same as the
  // stock-media flow. The pre-uploaded path is re-imported by /files/import into
  // the chosen folder. Multi-page export bypasses the picker and saves to root.
  const handleSaveToFiles = useCallback(async () => {
    setExporting(true);
    try {
      if (exportAll) {
        const results = await renderAndUpload();
        if (!results.length) {
          toaster.show('Export failed', 'warning');
          return;
        }
        toaster.show(`Exported ${results.length} pages`, 'success');
        onClose();
        return;
      }

      const state = store.getState();
      const liveDoc: DesignerDoc = state.doc;
      const baseName = (state.designName || 'design').replace(/[^a-zA-Z0-9]/g, '_');
      await pingDownload();
      const blob = await renderPageToBlob(
        liveDoc,
        liveDoc.pages[state.currentPage],
        format,
        scale
      );
      if (!blob) {
        toaster.show('Export failed', 'warning');
        return;
      }
      const saved = await uploadBlob(blob, `${baseName}.${extFor(format)}`);
      if (!saved) {
        toaster.show('Export failed', 'warning');
        return;
      }

      onClose();
      modal.openModal({
        title: '',
        closeOnClickOutside: true,
        closeOnEscape: true,
        withCloseButton: true,
        classNames: { modal: 'w-[100%] max-w-[600px] text-textColor' },
        children: (
          <SaveToFilesModal url={saved.path} name={`${baseName}.${extFor(format)}`} />
        ),
        size: 'lg',
      });
    } catch {
      toaster.show('Export failed', 'warning');
    } finally {
      setExporting(false);
    }
  }, [exportAll, renderAndUpload, store, pingDownload, format, scale, uploadBlob, toaster, modal, onClose]);

  // Save & Post: render + upload, then open the composer with all exported
  // images attached (an array for the carousel case, one for single-page).
  const handleSaveAndPost = useCallback(async () => {
    setExporting(true);
    try {
      const saved = await renderAndUpload();
      if (!saved.length) {
        toaster.show('Export failed', 'warning');
        return;
      }

      toaster.show(
        saved.length > 1 ? `Exported ${saved.length} pages` : 'Design exported',
        'success'
      );
      onClose();
      modal.closeAll();

      const dayjs = (await import('dayjs')).default;
      const integrationsRes = await fetch('/integrations');
      if (integrationsRes.ok) {
        const integrations = await integrationsRes.json();
        const { AddEditModal } = await import(
          '@gitroom/frontend/components/new-launch/add.edit.modal'
        );
        modal.openModal({
          fullScreen: true,
          removeLayout: true,
          children: (
            <AddEditModal
              date={dayjs()}
              integrations={integrations}
              allIntegrations={integrations}
              onlyValues={[
                {
                  content: '',
                  id: 'new',
                  image: saved.map((f) => ({ id: f.id, path: f.path })),
                },
              ]}
              mutate={() => {}}
              reopenModal={() => {}}
            />
          ),
        });
      }
    } catch {
      toaster.show('Export failed', 'warning');
    } finally {
      setExporting(false);
    }
  }, [renderAndUpload, fetch, toaster, modal, onClose]);

  return (
    <div className="flex flex-col gap-4 w-[360px] max-w-full">
      <div className="text-[16px] font-semibold text-textColor">
        Export Design
      </div>

      <div className="flex flex-col gap-1">
        <div className="text-[13px] font-medium text-textColor mb-1">Format</div>
        <div className="flex gap-2">
          {FORMATS.map((f) => (
            <button
              key={f.value}
              onClick={() => setFormat(f.value)}
              className={`flex-1 h-[36px] px-2 rounded-[6px] text-[12px] font-medium transition-all ${
                format === f.value
                  ? 'bg-[#2B5CD3] text-white'
                  : 'border border-newBorder text-textColor hover:bg-boxHover'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <div className="text-[13px] font-medium text-textColor mb-1">Scale</div>
        <div className="flex gap-2">
          {SCALES.map((s) => (
            <button
              key={s.value}
              onClick={() => setScale(s.value)}
              className={`flex-1 h-[36px] rounded-[6px] text-[13px] font-medium transition-all ${
                scale === s.value
                  ? 'bg-[#2B5CD3] text-white'
                  : 'border border-newBorder text-textColor hover:bg-boxHover'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {multiPage && (
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={allPages}
            onChange={(e) => setAllPages(e.target.checked)}
            className="accent-[#2B5CD3] w-[16px] h-[16px]"
          />
          <span className="text-[13px] text-textColor">
            Export all {doc.pages.length} pages (carousel)
          </span>
        </label>
      )}

      <div className="flex justify-end gap-2 mt-2">
        <button
          onClick={onClose}
          className="px-4 h-[38px] rounded-[6px] border border-newBorder text-[13px] text-textColor hover:bg-boxHover transition-all"
        >
          Cancel
        </button>
        <button
          onClick={handleSaveToFiles}
          disabled={exporting}
          className="px-4 h-[38px] rounded-[6px] bg-[#2B5CD3] text-white text-[13px] font-medium hover:bg-[#2B5CD3]/80 disabled:opacity-50 transition-all"
        >
          {exporting ? 'Exporting...' : 'Save to Files'}
        </button>
        <button
          onClick={handleSaveAndPost}
          disabled={exporting}
          className="px-4 h-[38px] rounded-[6px] bg-green-600 text-white text-[13px] font-medium hover:bg-green-700 disabled:opacity-50 transition-all"
        >
          {exporting ? 'Exporting...' : 'Save & Post'}
        </button>
      </div>
    </div>
  );
};
