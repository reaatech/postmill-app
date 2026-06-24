'use client';

import React, { FC, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createDesignerStore, migrateDoc, type DesignerStore, type DesignerDoc, type DesignerAttribution } from './designer.store';
import { useCollaboration } from './collaboration';
import type { TimelineAwareness, ImageAwareness } from './collaboration';
import { CollaborationCursors, type PeerTimelineState } from './collaboration-cursors';
import { DesignerCanvas } from './canvas';
import { setImageFetch } from './elements';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useModals } from '@gitroom/frontend/components/layout/new-modal';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { useDebounce } from 'use-debounce';
import { useAiActive } from '@gitroom/frontend/components/layout/use-ai-active';
import { CHANNEL_PRESETS } from '@gitroom/nestjs-libraries/integrations/social/channel-presets';
import { TemplatesPanel } from './panels/templates-panel';
import { MyDesignsPanel } from './panels/my-designs-panel';
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
import { OutputTabs } from './output-tabs';
import { ShortcutsOverlay } from './shortcuts';
import { CommandPalette } from './command-palette';
import { ExportDialog } from './export-dialog';
import { VideoTimeline } from './video-timeline';
import { fitWithin } from './panels/fit-within';
import { getBrandViolations } from './brand-compliance';
import { useBrandColors } from './panels/use-brand-colors';
import { useBrandFonts } from './panels/use-brand-fonts';
import { useUser } from '@gitroom/frontend/components/layout/user.context';

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
    // The chosen CANVAS size (drives the doc).
    width?: number;
    height?: number;
    // The image's NATURAL pixel size — used to place it aspect-correct inside
    // the doc (same as adding a photo from a panel). Falls back to filling the
    // canvas when absent.
    naturalWidth?: number;
    naturalHeight?: number;
  };
  designId?: string;
}

export const getThumbnailDataUrl = (canvas: HTMLCanvasElement | null, maxDim = 400): string | undefined => {
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

const StartScreen: FC<{
  store: ReturnType<typeof createDesignerStore>;
  onStart: () => void;
  fetchFn: ReturnType<typeof useFetch>;
}> = ({ store, onStart, fetchFn }) => {
  const [tab, setTab] = useState<'my-designs' | 'templates'>('my-designs');
  const [showFormatPicker, setShowFormatPicker] = useState(false);
  const [selectedPresets, setSelectedPresets] = useState<string[]>([]);
  const [mode, setMode] = useState<'image' | 'video'>('image');

  const allPresets = useMemo(
    () => CHANNEL_PRESETS.filter((p) => p.category !== 'custom' && p.category === (mode === 'video' ? 'video' : mode === 'image' ? 'social' : mode)),
    [mode],
  );

  const handleStartBlank = useCallback(() => {
    store.getState().reset(1080, 1080);
    if (mode === 'video') {
      store.getState().setMode('video');
    }
    onStart();
  }, [store, onStart, mode]);

  const handleStartFromFormats = useCallback(() => {
    if (selectedPresets.length === 0) return;
    store.getState().reset();
    if (mode === 'video') {
      store.getState().setMode('video');
    }
    const found = allPresets.filter((p) => selectedPresets.includes(p.id));
    found.forEach((p) => store.getState().addOutput({ formatId: p.id, name: p.name, width: p.width, height: p.height }));
    store.getState().setCurrentOutput(0);
    onStart();
  }, [store, onStart, selectedPresets, allPresets, mode]);

  const handleOpenDesign = useCallback(async (design: { id: string }) => {
    const res = await fetchFn(`/media/designs/${design.id}`);
    if (!res.ok) return;
    const full = await res.json();
    store.getState().loadDesign(full.doc, full.id, full.name, null);
    onStart();
  }, [store, onStart, fetchFn]);

  const togglePreset = useCallback((id: string) => {
    setSelectedPresets((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );
  }, []);

  if (showFormatPicker) {
    return (
      <div className="flex items-center justify-center h-full bg-newBgColorInner">
        <div className="max-w-3xl w-full p-8">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-textColor">Select Formats</h2>
            <button
              onClick={() => setShowFormatPicker(false)}
              className="text-[13px] text-textColor/60 hover:text-textColor transition-colors"
            >
              ← Back
            </button>
          </div>
          <p className="text-[13px] text-newTextColor/60 mb-4 text-center">
            Pick one or more formats — each becomes a linked output tab in the design.
          </p>
          <div className="grid grid-cols-3 gap-4">
            {allPresets.map((preset) => {
              const isSelected = selectedPresets.includes(preset.id);
              return (
                <button
                  key={preset.id}
                  onClick={() => togglePreset(preset.id)}
                  className={`flex flex-col items-center gap-3 p-6 rounded-xl border transition-all group ${
                    isSelected
                      ? 'border-designerAccent bg-designerAccent/10'
                      : 'border-newBorder bg-newBgColorInner hover:border-designerAccent hover:bg-newColColor/10'
                  }`}
                >
                  <div
                    className="rounded-lg border border-newBorder overflow-hidden flex items-center justify-center bg-white relative"
                    style={{
                      width: Math.min(preset.width / 10, 120),
                      height: Math.min(preset.height / 10, 120),
                    }}
                  >
                    <div className="text-[10px] text-gray-400 text-center px-1 leading-tight">
                      {preset.width}×{preset.height}
                    </div>
                    {isSelected && (
                      <div className="absolute inset-0 bg-designerAccent/20 flex items-center justify-center">
                        <span className="text-white text-[16px]">✓</span>
                      </div>
                    )}
                  </div>
                  <span className="text-[13px] font-medium text-textColor">{preset.name}</span>
                </button>
              );
            })}
          </div>
          <div className="mt-6 flex justify-center">
            <button
              onClick={handleStartFromFormats}
              disabled={selectedPresets.length === 0}
              className="px-6 py-2.5 rounded-lg text-[14px] font-medium bg-designerAccent text-white hover:bg-designerAccent/80 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Create Design ({selectedPresets.length} format{selectedPresets.length !== 1 ? 's' : ''})
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-newBgColorInner">
      <div className="p-6 border-b border-newBorder">
        <h2 className="text-xl font-bold text-textColor mb-4">Start a new design</h2>
        <div className="flex gap-3 mb-4">
          <button
            onClick={() => setMode('image')}
            className={`px-4 py-2 rounded-lg text-[13px] font-medium transition-colors ${
              mode === 'image'
                ? 'bg-designerAccent text-white'
                : 'border border-newBorder text-textColor hover:border-designerAccent hover:bg-boxHover'
            }`}
          >
            Image
          </button>
          <button
            onClick={() => setMode('video')}
            className={`px-4 py-2 rounded-lg text-[13px] font-medium transition-colors ${
              mode === 'video'
                ? 'bg-designerAccent text-white'
                : 'border border-newBorder text-textColor hover:border-designerAccent hover:bg-boxHover'
            }`}
          >
            Video
          </button>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => setShowFormatPicker(true)}
            className="px-4 py-2 rounded-lg text-[13px] font-medium bg-designerAccent text-white hover:bg-designerAccent/80 transition-colors"
          >
            Start from a Format
          </button>
          <button
            onClick={handleStartBlank}
            className="px-4 py-2 rounded-lg text-[13px] font-medium border border-newBorder text-textColor hover:border-designerAccent hover:bg-boxHover transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-designerAccent"
            aria-label="Start blank design"
          >
            Start Blank
          </button>
          <button
            onClick={() => setTab('templates')}
            className="px-4 py-2 rounded-lg text-[13px] font-medium border border-newBorder text-textColor hover:border-designerAccent hover:bg-boxHover transition-colors"
          >
            Start from a Template
          </button>
        </div>
      </div>

      <div className="flex border-b border-newBorder">
        <button
          onClick={() => setTab('my-designs')}
          className={`flex-1 py-3 text-[13px] font-medium transition-colors ${
            tab === 'my-designs'
              ? 'text-designerAccent border-b-2 border-designerAccent'
              : 'text-textColor/50 hover:text-textColor/80'
          }`}
        >
          My Designs
        </button>
        <button
          onClick={() => setTab('templates')}
          className={`flex-1 py-3 text-[13px] font-medium transition-colors ${
            tab === 'templates'
              ? 'text-designerAccent border-b-2 border-designerAccent'
              : 'text-textColor/50 hover:text-textColor/80'
          }`}
        >
          Templates
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {tab === 'my-designs' && <MyDesignsPanel onOpen={handleOpenDesign} />}
        {tab === 'templates' && <TemplatesPanel store={store as any} onClose={onStart} />}
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
  const [inspectorCollapsed, setInspectorCollapsed] = useState(false);
  const aiActive = useAiActive();
  const user = useUser();
  const brandColors = useBrandColors();
  const brandFonts = useBrandFonts();
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
    const s = createDesignerStore(w, h, attribution, fetch);
    storeRef.current = s;
    return s;
  }, []);

  const designName = store((s) => s.designName);
  const currentDesignId = store((s) => s.designId);
  const isDirty = store((s) => s.isDirty);
  const isSaving = store((s) => s.isSaving);
  const doc = store((s) => s.doc);
  const currentOutput = store((s) => s.currentOutput);
  const selectedIds = store((s) => s.selectedIds);
  const selectedClip = store((s) => s.selectedClip);
  const editFormatOnly = store((s) => s.editFormatOnly);
  const brandEnforcement = store((s) => s.brandEnforcement);
  const brandAdminOverride = store((s) => s.brandAdminOverride);
  const undo = store((s) => s.undo);
  const redo = store((s) => s.redo);

  const [collabEnabled, setCollabEnabled] = useState(false);
  const [connectedCount, setConnectedCount] = useState(0);
  const [peerTimelines, setPeerTimelines] = useState<PeerTimelineState[]>([]);
  const [peerImages, setPeerImages] = useState<ImageAwareness[]>([]);

  const collabData = useCollaboration({
    designId: currentDesignId,
    enabled: collabEnabled,
    onRemoteDoc: (remoteDoc: any) => {
      store.getState().setDoc(migrateDoc(remoteDoc));
    },
    onConnectedChange: (count) => setConnectedCount(count),
    onPeerTimeline: (peers: TimelineAwareness[]) => {
      const colors = ['#f43f5e', '#8b5cf6', '#06b6d4', '#f59e0b', '#22c55e', '#ec4899'];
      setPeerTimelines(
        peers.map((p, i) => ({
          playheadMs: p.playheadMs,
          selectedClipId: p.selectedClipId,
          color: colors[i % colors.length],
        })),
      );
    },
    onPeerImage: (peers: ImageAwareness[]) => {
      setPeerImages(peers);
    },
  });

  useEffect(() => {
    if (!collabEnabled || !currentDesignId) return;
    collabData.sendUpdate(doc);
  }, [doc, collabEnabled, currentDesignId, collabData.sendUpdate]);

  // Let the canvas image loader use the authenticated proxy for cross-origin
  // hosts (stock images) that don't send CORS headers (otherwise blank canvas).
  useEffect(() => {
    setImageFetch(fetch);
    return () => setImageFetch(null);
  }, [fetch]);

  // Best-matching channel preset for safe-zone overlays (E7).
  const safeZonePreset = useMemo(
    () => doc.outputs[currentOutput]?.formatId || null,
    [doc.outputs, currentOutput]
  );

  const brandViolations = useMemo(
    () =>
      getBrandViolations(doc, {
        enforcement: brandEnforcement,
        adminOverride: brandAdminOverride,
        brandColors,
        brandFonts,
      }),
    [doc, brandEnforcement, brandAdminOverride, brandColors, brandFonts]
  );
  const canAdminOverride = user?.role === 'owner' || user?.role === 'admin';
  const isBrandCompliant = brandViolations.length === 0 || brandAdminOverride;

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

  const handleExport = useCallback(() => {
    const s = store.getState();
    if (s.brandEnforcement && !s.brandAdminOverride && brandViolations.length > 0) {
      toaster.show('Export blocked: off-brand elements detected. Fix them or use admin override.', 'warning');
      return;
    }
    modals.openModal({
      children: <ExportDialog store={store} onClose={() => modals.closeAll()} />,
    });
  }, [modals, store, brandViolations, toaster]);

  const handleSave = useCallback(async () => {
    const s = store.getState();
    if (s.brandEnforcement && !s.brandAdminOverride && brandViolations.length > 0) {
      toaster.show('Save blocked: off-brand elements detected. Fix them or use admin override.', 'warning');
      return;
    }
    s.setSaving(true);
    try {
      const stageEl = document.querySelector('.konva-stage canvas') as HTMLCanvasElement;
      const previewDataUrl = getThumbnailDataUrl(stageEl);
      let previewFileId: string | undefined;
      if (previewDataUrl) {
        try {
          const blob = await (await fetch(previewDataUrl)).blob();
          const form = new FormData();
          form.append('file', blob, 'thumbnail.jpg');
          const uploadRes = await fetch('/files/upload-simple', { method: 'POST', body: form });
          if (uploadRes.ok) {
            const uploadData = await uploadRes.json();
            previewFileId = uploadData.id;
          }
        } catch {
          // Fall back to storing the data URL below.
        }
      }
      const payload: Record<string, unknown> = {
        name: s.designName,
        doc: s.doc,
        width: s.doc.outputs[0]?.width,
        height: s.doc.outputs[0]?.height,
        previewDataUrl,
      };
      if (previewFileId) payload.previewFileId = previewFileId;
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
  }, [fetch, toaster, store, brandViolations]);

  const handleSaveAsTemplate = useCallback(async () => {
    const s = store.getState();
    if (s.brandEnforcement && !s.brandAdminOverride && brandViolations.length > 0) {
      toaster.show('Save blocked: off-brand elements detected. Fix them or use admin override.', 'warning');
      return;
    }
    s.setSaving(true);
    try {
      const stageEl = document.querySelector('.konva-stage canvas') as HTMLCanvasElement;
      const previewDataUrl = getThumbnailDataUrl(stageEl);
      let thumbnailFileId: string | undefined;
      if (previewDataUrl) {
        try {
          const blob = await (await fetch(previewDataUrl)).blob();
          const form = new FormData();
          form.append('file', blob, 'thumbnail.jpg');
          const uploadRes = await fetch('/files/upload-simple', { method: 'POST', body: form });
          if (uploadRes.ok) {
            const uploadData = await uploadRes.json();
            thumbnailFileId = uploadData.id;
          }
        } catch {}
      }
      const payload: Record<string, unknown> = {
        name: s.designName,
        category: s.doc.outputs[0]?.formatId || 'custom',
        doc: s.doc,
      };
      if (thumbnailFileId) payload.thumbnailFileId = thumbnailFileId;
      if (s.templateId) {
        const res = await fetch(`/media/design-templates/${s.templateId}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error('Save as template failed');
      } else {
        const res = await fetch('/media/design-templates', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error('Save as template failed');
        const data = await res.json();
        s.setTemplateId(data.id);
      }
      toaster.show('Saved as template', 'success');
    } catch {
      toaster.show('Failed to save as template', 'warning');
    } finally {
      s.setSaving(false);
    }
  }, [fetch, toaster, store, brandViolations]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        handleSave();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleSave]);

  useEffect(() => {
    if (initialAsset && initialAsset.url) {
      const imgUrl = initialAsset.type === 'video'
        ? (initialAsset.thumbUrl || initialAsset.url)
        : initialAsset.url;
      const state = store.getState();
      const active = state.doc.outputs[state.currentOutput];
      // Place the asset aspect-correct and centred — identical to adding a
      // photo from a panel. Only fills the canvas when natural dims are unknown
      // or the image already matches the canvas (e.g. "Original size").
      const { width: w, height: h } = fitWithin(
        initialAsset.naturalWidth || active.width,
        initialAsset.naturalHeight || active.height,
        active.width,
        active.height
      );
      store.getState().addElement({
        id: '',
        type: 'image',
        x: (active.width - w) / 2,
        y: (active.height - h) / 2,
        width: w,
        height: h,
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
    return <StartScreen store={store} onStart={() => setShowPresetPicker(false)} fetchFn={fetch} />;
  }

  return (
    <div className="flex flex-col h-full w-full overflow-hidden bg-newBgColorInner">
      <div className="flex items-center justify-between px-4 py-2 border-b border-newBorder bg-newBgColorInner shrink-0">
        <div className="flex items-center gap-3">
          <input
            value={designName}
            onChange={(e) => store.getState().setDesignName(e.target.value)}
            className="bg-transparent border-none text-textColor text-[14px] font-medium outline-none focus:border-b focus:border-designerAccent px-1 py-0.5"
          />
          {isSaving && (
            <span className="text-[11px] text-newTextColor/40">Saving…</span>
          )}
          {!isSaving && !isDirty && currentDesignId && (
            <span className="text-[11px] text-green-500">All changes saved</span>
          )}
          {!isSaving && isDirty && (
            <span className="text-[11px] text-amber-400">Unsaved changes</span>
          )}
        </div>
         <div className="flex items-center gap-2">
          <button
            onClick={() => {
              const currentMode = store.getState().doc.mode;
              const targetMode = currentMode === 'image' ? 'video' : 'image';
              const confirmMsg = currentMode === 'image'
                ? 'Convert to video mode? All image elements will be lost.'
                : 'Convert to image mode? All video tracks and clips will be lost.';
              if (window.confirm(confirmMsg)) {
                store.getState().setMode(targetMode);
              }
            }}
            className="px-2 py-1 rounded text-[10px] text-textColor/40 hover:text-amber-400 hover:bg-amber-400/10 border border-transparent hover:border-amber-400/20 transition-colors"
            title={`Convert to ${doc.mode === 'image' ? 'video' : 'image'} mode`}
          >
            {doc.mode === 'image' ? '→ Video' : '→ Image'}
          </button>
          <button
            onClick={() => undo()}
            className="w-8 h-8 flex items-center justify-center rounded text-textColor hover:bg-newColColor/30 text-[13px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-designerAccent"
            title="Undo (Ctrl+Z)"
            aria-label="Undo (Ctrl+Z)"
          >
            ↩
          </button>
          <button
            onClick={() => redo()}
            className="w-8 h-8 flex items-center justify-center rounded text-textColor hover:bg-newColColor/30 text-[13px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-designerAccent"
            title="Redo (Ctrl+Shift+Z)"
            aria-label="Redo (Ctrl+Shift+Z)"
          >
            ↪
          </button>
          <button
            onClick={() => setShowSafeZones((v) => !v)}
            className={`w-8 h-8 flex items-center justify-center rounded text-[13px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-designerAccent ${
              showSafeZones ? 'bg-designerAccent/20 text-designerAccent' : 'text-textColor hover:bg-newColColor/30'
            }`}
            title="Toggle safe zones"
            aria-label="Toggle safe zones"
          >
            ⊡
          </button>
          <button
            onClick={() => store.getState().setEditFormatOnly(!editFormatOnly)}
            className={`px-3 py-1.5 text-xs rounded border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-designerAccent ${
              editFormatOnly
                ? 'bg-orange-500/20 border-orange-500/30 text-orange-400'
                : 'border-[#2a2a4a] text-gray-400 hover:text-white'
            }`}
            title={editFormatOnly ? 'Edits stay in this format only' : 'Edits apply to all formats (default)'}
            aria-label={editFormatOnly ? 'Format-only editing (edits stay in this format only)' : 'All formats editing (edits apply to all formats)'}
          >
            {editFormatOnly ? 'Format-only' : 'All Formats'}
          </button>
          <button
            onClick={() => store.getState().setBrandEnforcement(!brandEnforcement)}
            className={`px-3 py-1.5 text-xs rounded border transition-colors ${
              brandEnforcement
                ? 'bg-purple-500/20 border-purple-500/30 text-purple-400'
                : 'border-[#2a2a4a] text-gray-400 hover:text-white'
            }`}
            title={brandEnforcement ? 'Brand restrictions active' : 'Free editing'}
          >
            {brandEnforcement ? '🔒 Brand' : 'Brand'}
          </button>
          {currentDesignId && (
            <button
              className={`px-2.5 py-1 text-xs rounded border transition-colors ${
                collabEnabled
                  ? 'bg-green-500/20 border-green-500/30 text-green-400'
                  : 'border-[#2a2a4a] text-gray-400 hover:text-white'
              }`}
              onClick={() => setCollabEnabled(!collabEnabled)}
              title={collabEnabled ? `${connectedCount} connected` : 'Enable real-time collaboration'}
            >
              {collabEnabled ? `👥 ${connectedCount}` : 'Share'}
            </button>
          )}
          <button
            onClick={() =>
              modals.openModal({ children: <ShortcutsOverlay onClose={() => modals.closeAll()} /> })
            }
            className="w-8 h-8 flex items-center justify-center rounded text-textColor hover:bg-newColColor/30 text-[13px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-designerAccent"
            title="Keyboard shortcuts"
            aria-label="Keyboard shortcuts"
          >
            ?
          </button>
          <div className="w-px h-6 bg-newBorder mx-1" />
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="px-3 py-1.5 rounded-md text-[12px] border border-newColColor text-textColor hover:bg-boxHover disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-designerAccent"
            aria-label="Save (Ctrl+S)"
          >
            Save
          </button>
          <button
            onClick={handleSaveAsTemplate}
            disabled={isSaving}
            className="px-3 py-1.5 rounded-md text-[12px] border border-dashed border-newBorder text-textColor/60 hover:bg-boxHover hover:text-textColor disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-designerAccent"
            title="Promote this design to a reusable template"
            aria-label="Save as template"
          >
            Save as template
          </button>
          <button
            onClick={handleExport}
            disabled={isSaving}
            className="px-4 py-1.5 rounded-md text-[12px] bg-designerAccent text-white hover:bg-designerAccent/80 disabled:opacity-50 font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            Export
          </button>
          {setMedia && (
            <button
              onClick={handleExport}
              disabled={isSaving}
              className="px-4 py-1.5 rounded-md text-[12px] bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
              aria-label="Use in post"
            >
              Use in post
            </button>
          )}
          {closeModal && (
            <>
              <div className="w-px h-6 bg-newBorder mx-1" />
              <button
                onClick={closeModal}
                className="w-8 h-8 flex items-center justify-center rounded text-textColor hover:bg-newColColor/30 text-[15px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-designerAccent"
                title="Close"
                aria-label="Close designer"
              >
                ✕
              </button>
            </>
          )}
        </div>
      </div>

      <div className="relative flex flex-1 min-h-0 w-full overflow-hidden">
        <div className="w-[48px] shrink-0 flex flex-col items-center pt-2 gap-1 border-r border-newBorder bg-newBgColorInner z-30">
          {panels.map((p) => (
            <button
              key={p.id}
              tabIndex={0}
              onClick={() => setActivePanel(activePanel === p.id ? null : p.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setActivePanel(activePanel === p.id ? null : p.id);
                }
              }}
              className={`w-9 h-9 flex items-center justify-center rounded-lg text-[15px] transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-designerAccent ${
                activePanel === p.id
                  ? 'bg-designerAccent/20 text-designerAccent'
                  : 'text-textColor/60 hover:bg-newColColor/30 hover:text-textColor'
              }`}
              title={p.label}
              aria-label={`${p.label} panel`}
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
              onAddImage={() => setActivePanel('photos')}
              sendImageAwareness={collabEnabled ? collabData.sendImageAwareness : undefined}
            />
            <SelectionToolbar store={store} />
            <CollaborationCursors
              connectedCount={connectedCount}
              peers={doc.mode === 'video' ? peerTimelines : undefined}
              peerImages={doc.mode === 'image' ? peerImages : undefined}
              mode={doc.mode}
              durationMs={doc.mode === 'video' ? (doc.outputs[currentOutput] as any)?.durationMs : undefined}
              store={store}
            />
          </div>
          {doc.mode === 'video' && <VideoTimeline store={store} sendTimelineAwareness={collabData.sendTimelineAwareness} />}
          <OutputTabs store={store} />
        </div>

        {(selectedIds.length >= 1 || (doc.mode === 'video' && selectedClip)) && !inspectorCollapsed && (
          <div className="absolute right-0 top-0 bottom-0 w-[280px] z-20 border-l border-newBorder bg-newBgColorInner overflow-y-auto p-3 shadow-xl">
            <div className="flex items-center justify-between mb-3">
              <div className="text-[12px] font-medium text-textColor/60 uppercase tracking-wider">
                Inspector
              </div>
              <button
                onClick={() => setInspectorCollapsed(true)}
                className="w-6 h-6 flex items-center justify-center rounded text-textColor/60 hover:bg-newColColor/30 hover:text-textColor text-[14px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-designerAccent"
                title="Collapse inspector"
                aria-label="Collapse inspector panel"
              >
                ›
              </button>
            </div>
            <InspectorPanel store={store} />
          </div>
        )}

        {(selectedIds.length >= 1 || (doc.mode === 'video' && selectedClip)) && inspectorCollapsed && (
          <button
            onClick={() => setInspectorCollapsed(false)}
            className="absolute right-0 top-2 z-20 px-1.5 py-3 rounded-l-md border border-r-0 border-newBorder bg-newBgColorInner text-textColor/60 hover:text-textColor shadow-xl text-[14px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-designerAccent focus-visible:ring-inset"
            title="Show inspector"
            aria-label="Expand inspector panel"
          >
            ‹
          </button>
        )}
      </div>
      <CommandPalette
        store={store}
        onExport={handleExport}
        onSave={handleSave}
        onSaveAsTemplate={handleSaveAsTemplate}
        showSafeZones={showSafeZones}
        onToggleSafeZones={() => setShowSafeZones((v) => !v)}
        onAddImage={() => setActivePanel('photos')}
      />
    </div>
  );
};

export default Designer;
