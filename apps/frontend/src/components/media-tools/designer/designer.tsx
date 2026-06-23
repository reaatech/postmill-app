'use client';

import React, { FC, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createDesignerStore, type DesignerStore, type DesignerDoc, type DesignerAttribution } from './designer.store';
import { DesignerCanvas } from './canvas';
import { setImageFetch } from './elements';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useModals } from '@gitroom/frontend/components/layout/new-modal';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { useDebounce } from 'use-debounce';
import { useAiActive } from '@gitroom/frontend/components/layout/use-ai-active';
import { CHANNEL_PRESETS, type ChannelPreset } from '@gitroom/nestjs-libraries/integrations/social/channel-presets';
import { TemplatesPanel } from './panels/templates-panel';
import { TextPanel } from './panels/text-panel';
import { ElementsPanel } from './panels/elements-panel';
import { PhotosPanel } from './panels/photos-panel';
import { UploadsPanel } from './panels/uploads-panel';
import { BackgroundPanel } from './panels/background-panel';
import { LayersPanel } from './panels/layers-panel';
import { AiPanel } from './panels/ai-panel';
import { BrandPanel } from './panels/brand-panel';
import { IconsPanel } from './panels/icons-panel';
import { InspectorPanel } from './panels/inspector-panel';
import { SelectionToolbar } from './selection-toolbar';
import { PagesStrip } from './pages-strip';
import { MagicResize } from './magic-resize';
import { ShortcutsOverlay } from './shortcuts';
import { Timeline } from './timeline';
import { ExportDialog } from './export-dialog';

interface DesignerProps {
  setMedia?: (media: { id: string; path: string }[]) => void;
  closeModal?: () => void;
  width?: number;
  height?: number;
  initialAsset?: {
    url: string;
    thumbUrl?: string;
    type: 'photo' | 'video';
    author?: string;
    authorUrl?: string;
    downloadLocation?: string;
    source?: string;
    width?: number;
    height?: number;
  };
  designId?: string;
}

const getThumbnailDataUrl = (canvas: HTMLCanvasElement | null, maxDim = 400): string | undefined => {
  if (!canvas) return undefined;
  const ratio = Math.min(1, maxDim / Math.max(canvas.width, canvas.height));
  const w = Math.round(canvas.width * ratio);
  const h = Math.round(canvas.height * ratio);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  if (!ctx) return undefined;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(canvas, 0, 0, w, h);
  return c.toDataURL('image/jpeg', 0.85);
};

const PresetPicker: FC<{
  onSelect: (preset: ChannelPreset) => void;
}> = ({ onSelect }) => {
  return (
    <div className="flex items-center justify-center h-full bg-newBgColorInner">
      <div className="max-w-3xl w-full p-8">
        <h2 className="text-2xl font-bold text-textColor mb-6 text-center">New Design</h2>
        <div className="grid grid-cols-3 gap-4">
          {CHANNEL_PRESETS.filter((p) => p.category !== 'custom').map((preset) => (
            <button
              key={preset.id}
              onClick={() => onSelect(preset)}
              className="flex flex-col items-center gap-3 p-6 rounded-xl bg-newBgColorInner border border-newBorder hover:border-[#2B5CD3] hover:bg-newColColor/10 transition-all group"
            >
              <div
                className="rounded-lg border border-newBorder overflow-hidden flex items-center justify-center bg-white"
                style={{
                  width: Math.min(preset.width / 10, 120),
                  height: Math.min(preset.height / 10, 120),
                }}
              >
                <div className="text-[10px] text-gray-400 text-center px-1 leading-tight">
                  {preset.width}×{preset.height}
                </div>
              </div>
              <span className="text-[13px] font-medium text-textColor">{preset.name}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export const Designer: FC<DesignerProps> = ({
  setMedia,
  closeModal,
  width,
  height,
  initialAsset,
  designId,
}) => {
  const fetch = useFetch();
  const toaster = useToaster();
  const modals = useModals();
  const [activePanel, setActivePanel] = useState<string | null>(null);
  const [showPresetPicker, setShowPresetPicker] = useState(!initialAsset && !designId);
  const [showSafeZones, setShowSafeZones] = useState(false);
  const [showTimeline, setShowTimeline] = useState(false);
  const aiActive = useAiActive();
  const storeRef = useRef<ReturnType<typeof createDesignerStore> | null>(null);

  const store = useMemo(() => {
    let w = width || 1080;
    let h = height || 1080;
    if (initialAsset?.width && initialAsset?.height) {
      w = initialAsset.width;
      h = initialAsset.height;
    }
    const attribution: DesignerAttribution | undefined = initialAsset?.url
      ? {
          source: initialAsset.source,
          url: initialAsset.url,
          downloadLocation: initialAsset.downloadLocation,
          author: initialAsset.author,
          authorUrl: initialAsset.authorUrl,
        }
      : undefined;
    const s = createDesignerStore(w, h, attribution);
    storeRef.current = s;
    return s;
  }, []);

  const designName = store((s) => s.designName);
  const currentDesignId = store((s) => s.designId);
  const isDirty = store((s) => s.isDirty);
  const isSaving = store((s) => s.isSaving);
  const doc = store((s) => s.doc);
  const currentPage = store((s) => s.currentPage);
  const selectedIds = store((s) => s.selectedIds);
  const undo = store((s) => s.undo);
  const redo = store((s) => s.redo);

  // Let the canvas image loader use the authenticated proxy for cross-origin
  // hosts (stock images) that don't send CORS headers (otherwise blank canvas).
  useEffect(() => {
    setImageFetch(fetch);
    return () => setImageFetch(null);
  }, [fetch]);

  // Best-matching channel preset for safe-zone overlays (E7).
  const safeZonePreset = useMemo(
    () => CHANNEL_PRESETS.find((p) => p.width === doc.width && p.height === doc.height)?.id,
    [doc.width, doc.height]
  );

  // Warn on tab-close while there are unsaved changes. Re-subscribes when
  // `isDirty` changes — but must NOT reset the doc here (that cleanup would run
  // on every isDirty change and wipe the canvas the moment anything is added).
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty]);

  // Reset the store ONLY on real unmount (store is stable from useMemo, so this
  // cleanup runs once when the Designer closes — never on edits).
  useEffect(() => {
    return () => {
      store.getState().reset();
    };
  }, [store]);

  useEffect(() => {
    if (designId) {
      fetch(`/media/designs/${designId}`)
        .then((res) => res.json())
        .then((design) => {
          if (design) {
            store.getState().loadDesign(design.doc as DesignerDoc, design.id, design.name);
          }
        })
        .catch(() => {});
    }
  }, [designId]);

  const [debouncedDoc] = useDebounce(doc, 2000);

  useEffect(() => {
    if (!debouncedDoc || !currentDesignId || !isDirty) return;
    store.getState().setSaving(true);
    fetch(`/media/designs/${currentDesignId}`, {
      method: 'PUT',
      body: JSON.stringify({ doc: debouncedDoc }),
    })
      .then((res) => res.json())
      .then(() => store.getState().markSaved())
      .catch(() => {
        store.getState().setSaving(false);
      });
  }, [debouncedDoc, currentDesignId, isDirty, fetch]);

  const handleNewFromPreset = useCallback(
    (preset: ChannelPreset) => {
      store.getState().reset(preset.width, preset.height);
      setShowPresetPicker(false);
    },
    [store]
  );

  const handleExport = useCallback(() => {
    modals.openModal({
      children: <ExportDialog store={store} onClose={() => modals.closeAll()} />,
    });
  }, [modals, store]);

  const handleMagicResize = useCallback(() => {
    modals.openModal({
      children: <MagicResize store={store} onComplete={() => modals.closeAll()} />,
    });
  }, [modals, store]);

  const handleSave = useCallback(async () => {
    const s = store.getState();
    s.setSaving(true);
    try {
      const stageEl = document.querySelector('.konva-stage canvas') as HTMLCanvasElement;
      const previewDataUrl = getThumbnailDataUrl(stageEl);
      const payload = {
        name: s.designName,
        doc: s.doc,
        width: s.doc.width,
        height: s.doc.height,
        previewDataUrl,
      };
      if (s.designId) {
        const res = await fetch(`/media/designs/${s.designId}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error('Save failed');
      } else {
        const res = await fetch('/media/designs', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error('Save failed');
        const data = await res.json();
        s.setDesignId(data.id);
      }
      s.markSaved();
      toaster.show('Design saved', 'success');
    } catch {
      toaster.show('Save failed', 'warning');
    } finally {
      s.setSaving(false);
    }
  }, [fetch, toaster, store]);

  useEffect(() => {
    if (initialAsset && initialAsset.url) {
      const imgUrl = initialAsset.type === 'video'
        ? (initialAsset.thumbUrl || initialAsset.url)
        : initialAsset.url;
      store.getState().addElement({
        id: '',
        type: 'image',
        x: 0,
        y: 0,
        width: store.getState().doc.width,
        height: store.getState().doc.height,
        rotation: 0,
        opacity: 1,
        locked: false,
        hidden: false,
        src: imgUrl,
      });
    }
  }, []);

  const panels = [
    { id: 'templates', icon: '◧', label: 'Templates' },
    { id: 'text', icon: 'T', label: 'Text' },
    { id: 'elements', icon: '◇', label: 'Elements' },
    { id: 'icons', icon: '★', label: 'Icons' },
    { id: 'photos', icon: '▣', label: 'Photos' },
    { id: 'uploads', icon: '☰', label: 'Uploads' },
    { id: 'background', icon: '◨', label: 'Background' },
    { id: 'layers', icon: '≡', label: 'Layers' },
    // AI panel only when the org has an active AI provider (E4).
    ...(aiActive ? [{ id: 'ai', icon: '✦', label: 'AI' }] : []),
    { id: 'brand', icon: '♥', label: 'Brand' },
  ];

  if (showPresetPicker) {
    return <PresetPicker onSelect={handleNewFromPreset} />;
  }

  return (
    <div className="flex flex-col h-full w-full overflow-hidden bg-newBgColorInner">
      <div className="flex items-center justify-between px-4 py-2 border-b border-newBorder bg-newBgColorInner shrink-0">
        <div className="flex items-center gap-3">
          <input
            value={designName}
            onChange={(e) => store.getState().setDesignName(e.target.value)}
            className="bg-transparent border-none text-textColor text-[14px] font-medium outline-none focus:border-b focus:border-[#2B5CD3] px-1 py-0.5"
          />
          {isSaving && (
            <span className="text-[11px] text-newTextColor/40">Saving…</span>
          )}
          {!isSaving && !isDirty && currentDesignId && (
            <span className="text-[11px] text-green-500">Saved</span>
          )}
          {!isSaving && isDirty && (
            <span className="text-[11px] text-newTextColor/40">Unsaved</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => undo()}
            className="w-8 h-8 flex items-center justify-center rounded text-textColor hover:bg-newColColor/30 text-[13px]"
            title="Undo"
          >
            ↩
          </button>
          <button
            onClick={() => redo()}
            className="w-8 h-8 flex items-center justify-center rounded text-textColor hover:bg-newColColor/30 text-[13px]"
            title="Redo"
          >
            ↪
          </button>
          <button
            onClick={() => setShowSafeZones((v) => !v)}
            className={`w-8 h-8 flex items-center justify-center rounded text-[13px] ${
              showSafeZones ? 'bg-[#2B5CD3]/20 text-[#2B5CD3]' : 'text-textColor hover:bg-newColColor/30'
            }`}
            title="Toggle safe zones"
          >
            ⊡
          </button>
          <button
            onClick={handleMagicResize}
            className="w-8 h-8 flex items-center justify-center rounded text-textColor hover:bg-newColColor/30 text-[13px]"
            title="Magic resize"
          >
            ⤢
          </button>
          <button
            onClick={() => setShowTimeline((v) => !v)}
            className={`w-8 h-8 flex items-center justify-center rounded text-[13px] ${
              showTimeline ? 'bg-[#2B5CD3]/20 text-[#2B5CD3]' : 'text-textColor hover:bg-newColColor/30'
            }`}
            title="Animation timeline"
          >
            ⏱
          </button>
          <button
            onClick={() =>
              modals.openModal({ children: <ShortcutsOverlay onClose={() => modals.closeAll()} /> })
            }
            className="w-8 h-8 flex items-center justify-center rounded text-textColor hover:bg-newColColor/30 text-[13px]"
            title="Keyboard shortcuts"
          >
            ?
          </button>
          <div className="w-px h-6 bg-newBorder mx-1" />
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="px-3 py-1.5 rounded-md text-[12px] border border-newColColor text-textColor hover:bg-boxHover disabled:opacity-50"
          >
            Save
          </button>
          <button
            onClick={handleExport}
            disabled={isSaving}
            className="px-4 py-1.5 rounded-md text-[12px] bg-[#2B5CD3] text-white hover:bg-[#2B5CD3]/80 disabled:opacity-50 font-medium"
          >
            Export
          </button>
          {setMedia && (
            <button
              onClick={handleExport}
              disabled={isSaving}
              className="px-4 py-1.5 rounded-md text-[12px] bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 font-medium"
            >
              Use in post
            </button>
          )}
        </div>
      </div>

      <div className="relative flex flex-1 min-h-0 w-full overflow-hidden">
        <div className="w-[48px] shrink-0 flex flex-col items-center pt-2 gap-1 border-r border-newBorder bg-newBgColorInner z-30">
          {panels.map((p) => (
            <button
              key={p.id}
              onClick={() => setActivePanel(activePanel === p.id ? null : p.id)}
              className={`w-9 h-9 flex items-center justify-center rounded-lg text-[15px] transition-all ${
                activePanel === p.id
                  ? 'bg-[#2B5CD3]/20 text-[#2B5CD3]'
                  : 'text-textColor/60 hover:bg-newColColor/30 hover:text-textColor'
              }`}
              title={p.label}
            >
              {p.icon}
            </button>
          ))}
        </div>

        {activePanel && (
          <div className="absolute left-[48px] top-0 bottom-0 w-[260px] z-20 border-r border-newBorder bg-newBgColorInner overflow-y-auto p-3 shadow-xl">
            <div className="text-[12px] font-medium text-textColor/60 uppercase tracking-wider mb-3">
              {panels.find((p) => p.id === activePanel)?.label}
            </div>
            {activePanel === 'templates' && <TemplatesPanel store={store as any} />}
            {activePanel === 'text' && <TextPanel store={store as any} />}
            {activePanel === 'elements' && <ElementsPanel store={store as any} />}
            {activePanel === 'icons' && <IconsPanel store={store as any} />}
            {activePanel === 'photos' && <PhotosPanel store={store as any} />}
            {activePanel === 'uploads' && <UploadsPanel store={store as any} />}
            {activePanel === 'background' && <BackgroundPanel store={store as any} />}
            {activePanel === 'layers' && <LayersPanel store={store as any} />}
            {activePanel === 'ai' && <AiPanel store={store as any} />}
            {activePanel === 'brand' && <BrandPanel store={store as any} />}
          </div>
        )}

        <div className="flex-1 flex flex-col min-w-0">
          <div className="relative flex-1 flex min-h-0 min-w-0">
            <DesignerCanvas
              store={store}
              showSafeZones={showSafeZones}
              safeZonePreset={safeZonePreset}
            />
            <SelectionToolbar store={store} />
          </div>
          <PagesStrip store={store} />
          {showTimeline && <Timeline store={store} setMedia={setMedia} />}
        </div>

        {selectedIds.length >= 1 && (
          <div className="absolute right-0 top-0 bottom-0 w-[280px] z-20 border-l border-newBorder bg-newBgColorInner overflow-y-auto p-3 shadow-xl">
            <div className="text-[12px] font-medium text-textColor/60 uppercase tracking-wider mb-3">
              Inspector
            </div>
            <InspectorPanel store={store} />
          </div>
        )}
      </div>
    </div>
  );
};

export default Designer;
