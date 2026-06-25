'use client';

import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import useSWR from 'swr';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useModals } from '@gitroom/frontend/components/layout/new-modal';
import { MediaSelectorModal } from '@gitroom/frontend/components/media-tools/media-selector-modal';
import { useReplicateStore } from './replicate.store';
import type { FileValue } from './fields/file';

interface CustomFontEntry {
  family: string;
  fileId: string;
  path: string;
  weights: number[];
}

interface TextLayer {
  id: string;
  text: string;
  fontSize: number;
  fontFamily: string;
  x: number;
  y: number;
  fill: string;
  outlineColor: string;
  outlineWidth: number;
  bold: boolean;
  italic: boolean;
}

const DEFAULT_FONTS = ['Impact', 'Arial', 'Comic Sans MS'];
const DEFAULT_COLORS = ['#ffffff', '#000000', '#ff0000', '#00ff00', '#0000ff', '#ffff00'];

function makeId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function buildFontString(layer: TextLayer) {
  const style = layer.italic ? 'italic ' : '';
  const weight = layer.bold ? 'bold ' : '';
  return `${style}${weight}${layer.fontSize}px "${layer.fontFamily}", sans-serif`;
}

export function MemeEditor() {
  const fetch = useFetch();
  const modals = useModals();
  const store = useReplicateStore();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [baseImage, setBaseImage] = useState<FileValue | null>(null);
  const [layers, setLayers] = useState<TextLayer[]>([]);
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedPath, setSavedPath] = useState<string | null>(null);

  const { data: customFonts } = useSWR<CustomFontEntry[]>('replicate-meme-fonts', async () => {
    const res = await fetch('/media/fonts');
    if (!res.ok) return [];
    return res.json();
  });

  const fontOptions = useMemo(() => {
    const custom = (customFonts || []).map((f) => f.family);
    return [...new Set([...DEFAULT_FONTS, ...custom])];
  }, [customFonts]);

  const selectedLayer = useMemo(
    () => layers.find((l) => l.id === selectedLayerId) || null,
    [layers, selectedLayerId]
  );

  const loadFont = useCallback(async (fontFamily: string) => {
    if (typeof document === 'undefined' || !('fonts' in document)) return;
    if (DEFAULT_FONTS.includes(fontFamily)) return;
    const entry = customFonts?.find((f) => f.family === fontFamily);
    if (!entry) return;
    try {
      const existing = Array.from(document.fonts.values()).find(
        (ff: any) => ff.family === fontFamily
      );
      if (existing) return;
      const fontFace = new FontFace(fontFamily, `url(${entry.path})`, {
        weight: entry.weights.map(String).join(', ') || '400',
      });
      const loaded = await fontFace.load();
      document.fonts.add(loaded);
    } catch {
      // Ignore font load errors; canvas will fall back.
    }
  }, [customFonts]);

  const drawMeme = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas || !baseImage?.url) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = async () => {
      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);

      for (const layer of layers) {
        await loadFont(layer.fontFamily);
        ctx.font = buildFontString(layer);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const lines = layer.text.split('\n');
        const lineHeight = layer.fontSize * 1.2;
        lines.forEach((line, i) => {
          const y = layer.y + (i - (lines.length - 1) / 2) * lineHeight;
          ctx.lineWidth = layer.outlineWidth;
          ctx.strokeStyle = layer.outlineColor;
          ctx.strokeText(line.toUpperCase(), layer.x, y);
          ctx.fillStyle = layer.fill;
          ctx.fillText(line.toUpperCase(), layer.x, y);
        });
      }
    };
    img.src = baseImage.url;
  }, [baseImage, layers, loadFont]);

  useEffect(() => {
    drawMeme();
  }, [drawMeme]);

  const handleChooseImage = useCallback(() => {
    modals.openModal({
      title: 'Select base image',
      removeLayout: true,
      children: (close) => (
        <MediaSelectorModal
          open
          onClose={close}
          onSelect={(item) => {
            setBaseImage({ fileId: item.fileId, url: item.url, type: item.type });
            close();
          }}
        />
      ),
    });
  }, [modals]);

  const addLayer = useCallback(() => {
    setLayers((prev) => [
      ...prev,
      {
        id: makeId(),
        text: 'TEXT',
        fontSize: 48,
        fontFamily: fontOptions[0] || 'Impact',
        x: 200,
        y: 200,
        fill: '#ffffff',
        outlineColor: '#000000',
        outlineWidth: 4,
        bold: true,
        italic: false,
      },
    ]);
  }, [fontOptions]);

  const updateLayer = useCallback((id: string, patch: Partial<TextLayer>) => {
    setLayers((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  }, []);

  const removeLayer = useCallback((id: string) => {
    setLayers((prev) => prev.filter((l) => l.id !== id));
    setSelectedLayerId((current) => (current === id ? null : current));
  }, []);

  const handleExport = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    setSaving(true);
    canvas.toBlob(async (blob) => {
      if (!blob) {
        setSaving(false);
        return;
      }

      const formData = new FormData();
      formData.append('file', blob, 'meme.png');
      if (store.saveFolderId) {
        formData.append('folderId', store.saveFolderId);
      }

      try {
        const res = await fetch('/files/upload-simple', {
          method: 'POST',
          body: formData,
        });
        const data = await res.json();
        setSavedPath(data.path || data.name);
      } catch (err) {
        // handle error
      } finally {
        setSaving(false);
      }
    }, 'image/png');
  }, [fetch, store.saveFolderId]);

  const handleOpenDesigner = useCallback(() => {
    if (savedPath) {
      const params = new URLSearchParams({ url: savedPath, type: 'photo', w: '', h: '' });
      window.open(`/media/designer?${params.toString()}`, '_blank');
    }
  }, [savedPath]);

  // Dragging on canvas
  const dragRef = useRef<{ layerId: string | null; startX: number; startY: number; origX: number; origY: number }>({
    layerId: null,
    startX: 0,
    startY: 0,
    origX: 0,
    origY: 0,
  });

  const getCanvasPos = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0]?.clientX ?? e.changedTouches[0]?.clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0]?.clientY ?? e.changedTouches[0]?.clientY : e.clientY;
    return {
      x: (clientX - rect.left) * (canvas.width / rect.width),
      y: (clientY - rect.top) * (canvas.height / rect.height),
    };
  }, []);

  const handlePointerDown = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx || layers.length === 0) return;
    const pos = getCanvasPos(e);

    // Hit-test in reverse draw order
    let hit: TextLayer | null = null;
    for (let i = layers.length - 1; i >= 0; i--) {
      const layer = layers[i];
      ctx.font = buildFontString(layer);
      const lines = layer.text.split('\n');
      const lineHeight = layer.fontSize * 1.2;
      const maxWidth = Math.max(...lines.map((line) => ctx.measureText(line.toUpperCase()).width));
      const halfHeight = (lines.length * lineHeight) / 2;
      if (
        Math.abs(pos.x - layer.x) <= maxWidth / 2 + 10 &&
        Math.abs(pos.y - layer.y) <= halfHeight + 10
      ) {
        hit = layer;
        break;
      }
    }

    if (hit) {
      setSelectedLayerId(hit.id);
      dragRef.current = {
        layerId: hit.id,
        startX: pos.x,
        startY: pos.y,
        origX: hit.x,
        origY: hit.y,
      };
    } else {
      setSelectedLayerId(null);
    }
  }, [layers, getCanvasPos]);

  const handlePointerMove = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (!dragRef.current.layerId) return;
    e.preventDefault();
    const pos = getCanvasPos(e);
    const dx = pos.x - dragRef.current.startX;
    const dy = pos.y - dragRef.current.startY;
    updateLayer(dragRef.current.layerId, {
      x: Math.round(dragRef.current.origX + dx),
      y: Math.round(dragRef.current.origY + dy),
    });
  }, [getCanvasPos, updateLayer]);

  const handlePointerUp = useCallback(() => {
    dragRef.current.layerId = null;
  }, []);

  return (
    <div className="flex flex-col gap-4">
      <div
        className="border border-newBorder rounded-xl overflow-hidden bg-gray-900"
        onMouseMove={handlePointerMove}
        onMouseUp={handlePointerUp}
        onMouseLeave={handlePointerUp}
        onTouchMove={handlePointerMove}
        onTouchEnd={handlePointerUp}
      >
        {baseImage?.url ? (
          <canvas
            ref={canvasRef}
            className="max-w-full cursor-move"
            onMouseDown={handlePointerDown}
            onTouchStart={handlePointerDown}
          />
        ) : (
          <div className="flex items-center justify-center h-64">
            <button
              onClick={handleChooseImage}
              className="px-4 py-2 rounded-lg bg-gray-800 text-white text-sm hover:bg-gray-700"
            >
              Choose Base Image
            </button>
          </div>
        )}
      </div>

      {baseImage?.url && (
        <>
          <div className="flex items-center justify-between">
            <button
              onClick={addLayer}
              className="px-3 py-1.5 rounded-lg bg-gray-800 text-white text-xs hover:bg-gray-700"
            >
              + Add text layer
            </button>
            <button
              onClick={handleChooseImage}
              className="px-3 py-1.5 rounded-lg bg-gray-800 text-white text-xs hover:bg-gray-700"
            >
              Change base image
            </button>
          </div>

          <div className="space-y-3 max-h-64 overflow-y-auto">
            {layers.map((layer) => (
              <div
                key={layer.id}
                className={`p-3 rounded-lg border ${selectedLayerId === layer.id ? 'border-designerAccent' : 'border-newBorder'} bg-newBgColorInner`}
                onClick={() => setSelectedLayerId(layer.id)}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-gray-400">Layer</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      removeLayer(layer.id);
                    }}
                    className="text-xs text-red-400 hover:text-red-300"
                  >
                    Remove
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="col-span-2">
                    <label className="text-[10px] text-gray-600">Text</label>
                    <textarea
                      value={layer.text}
                      onChange={(e) => updateLayer(layer.id, { text: e.target.value })}
                      rows={2}
                      className="w-full px-2 py-1 rounded border border-newBorder bg-gray-800 text-white text-xs resize-none uppercase"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-gray-600">Font</label>
                    <select
                      value={layer.fontFamily}
                      onChange={(e) => updateLayer(layer.id, { fontFamily: e.target.value })}
                      className="w-full px-2 py-1 rounded border border-newBorder bg-gray-800 text-white text-xs"
                    >
                      {fontOptions.map((f) => (
                        <option key={f} value={f}>{f}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] text-gray-600">Size</label>
                    <input
                      type="number"
                      min={8}
                      max={200}
                      value={layer.fontSize}
                      onChange={(e) => updateLayer(layer.id, { fontSize: Number(e.target.value) })}
                      className="w-full px-2 py-1 rounded border border-newBorder bg-gray-800 text-white text-xs"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-gray-600">Fill</label>
                    <div className="flex gap-1 flex-wrap">
                      {DEFAULT_COLORS.map((c) => (
                        <button
                          key={c}
                          onClick={() => updateLayer(layer.id, { fill: c })}
                          className={`w-5 h-5 rounded border ${layer.fill === c ? 'border-designerAccent' : 'border-newBorder'}`}
                          style={{ backgroundColor: c }}
                          aria-label={`Fill ${c}`}
                        />
                      ))}
                      <input
                        type="color"
                        value={layer.fill}
                        onChange={(e) => updateLayer(layer.id, { fill: e.target.value })}
                        className="w-6 h-6 p-0 border-0 bg-transparent"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] text-gray-600">Outline</label>
                    <div className="flex gap-1 items-center">
                      {DEFAULT_COLORS.map((c) => (
                        <button
                          key={c}
                          onClick={() => updateLayer(layer.id, { outlineColor: c })}
                          className={`w-5 h-5 rounded border ${layer.outlineColor === c ? 'border-designerAccent' : 'border-newBorder'}`}
                          style={{ backgroundColor: c }}
                          aria-label={`Outline ${c}`}
                        />
                      ))}
                      <input
                        type="color"
                        value={layer.outlineColor}
                        onChange={(e) => updateLayer(layer.id, { outlineColor: e.target.value })}
                        className="w-6 h-6 p-0 border-0 bg-transparent"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] text-gray-600">Outline width</label>
                    <input
                      type="number"
                      min={0}
                      max={20}
                      value={layer.outlineWidth}
                      onChange={(e) => updateLayer(layer.id, { outlineWidth: Number(e.target.value) })}
                      className="w-full px-2 py-1 rounded border border-newBorder bg-gray-800 text-white text-xs"
                    />
                  </div>
                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-1 text-[10px] text-gray-600">
                      <input
                        type="checkbox"
                        checked={layer.bold}
                        onChange={(e) => updateLayer(layer.id, { bold: e.target.checked })}
                      />
                      Bold
                    </label>
                    <label className="flex items-center gap-1 text-[10px] text-gray-600">
                      <input
                        type="checkbox"
                        checked={layer.italic}
                        onChange={(e) => updateLayer(layer.id, { italic: e.target.checked })}
                      />
                      Italic
                    </label>
                  </div>
                  <div className="flex gap-2">
                    <div>
                      <label className="text-[10px] text-gray-600">X</label>
                      <input
                        type="number"
                        value={layer.x}
                        onChange={(e) => updateLayer(layer.id, { x: Number(e.target.value) })}
                        className="w-full px-2 py-1 rounded border border-newBorder bg-gray-800 text-white text-xs"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-gray-600">Y</label>
                      <input
                        type="number"
                        value={layer.y}
                        onChange={(e) => updateLayer(layer.id, { y: Number(e.target.value) })}
                        className="w-full px-2 py-1 rounded border border-newBorder bg-gray-800 text-white text-xs"
                      />
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="flex gap-3">
            <button
              onClick={handleExport}
              disabled={saving}
              className="px-4 py-2 rounded-lg bg-designerAccent text-white text-sm hover:bg-designerAccent/80 disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save to Files'}
            </button>
            {savedPath && (
              <button
                onClick={handleOpenDesigner}
                className="px-4 py-2 rounded-lg bg-gray-800 text-white text-sm hover:bg-gray-700"
              >
                Open in Designer
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
