'use client';

import React, { FC, useCallback, useMemo, useState } from 'react';
import useSWR from 'swr';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useToaster } from '@gitroom/react/toaster/toaster';
import ProviderIcon from '@gitroom/frontend/components/shared/provider-icon';
import { PanelSkeletonGrid, PanelError } from './panel-states';

interface BrandProfile {
  id: string;
  name: string;
  palette?: string[];
  fontFamilies?: string[];
  logoFileIds?: string[];
  isDefault: boolean;
}

interface FileItem {
  id: string;
  path: string;
  name: string;
}

interface BrandPanelProps {
  store: any;
}

export const BrandPanel: FC<BrandPanelProps> = ({ store }) => {
  const fetch = useFetch();
  const toaster = useToaster();
  const selectedIds = store((s: any) => s.selectedIds);
  const doc = store((s: any) => s.doc);
  const currentPage = store((s: any) => s.currentPage);
  const [saving, setSaving] = useState(false);

  const { data: brands, mutate } = useSWR<BrandProfile[]>(
    'brands-list',
    async () => {
      const res = await fetch('/brands');
      if (!res.ok) return [];
      return res.json();
    },
    { revalidateOnFocus: false, keepPreviousData: true }
  );

  const activeBrand = useMemo(
    () => brands?.find((b) => b.isDefault) || brands?.[0] || null,
    [brands]
  );

  const selectedElement = useMemo(() => {
    if (selectedIds.length !== 1) return null;
    return doc.pages[currentPage]?.children.find(
      (el: any) => el.id === selectedIds[0]
    );
  }, [selectedIds, doc, currentPage]);

  const palette: string[] = useMemo(
    () => (Array.isArray(activeBrand?.palette) ? activeBrand!.palette! : []),
    [activeBrand]
  );

  const fontFamilies: string[] = useMemo(
    () =>
      Array.isArray(activeBrand?.fontFamilies)
        ? activeBrand!.fontFamilies!
        : [],
    [activeBrand]
  );

  const logoFileIds: string[] = useMemo(
    () =>
      Array.isArray(activeBrand?.logoFileIds) ? activeBrand!.logoFileIds! : [],
    [activeBrand]
  );

  // Org files for the logo picker.
  const {
    data: files,
    error: filesError,
    isLoading: filesLoading,
    mutate: mutateFiles,
  } = useSWR(
    'brand-logo-files',
    async () => {
      const res = await fetch('/files?page=1&limit=20');
      if (!res.ok) throw new Error('Failed to load files');
      return res.json() as Promise<{ data: FileItem[]; total: number }>;
    },
    { keepPreviousData: true }
  );

  const fileById = useMemo(() => {
    const map = new Map<string, FileItem>();
    (files?.data || []).forEach((f) => map.set(f.id, f));
    return map;
  }, [files]);

  const handleColorClick = useCallback(
    (color: string) => {
      if (!selectedElement) return;
      store.getState().updateElement(selectedElement.id, { fill: color });
    },
    [store, selectedElement]
  );

  const handleFontClick = useCallback(
    (font: string) => {
      if (!selectedElement || selectedElement.type !== 'text') return;
      store.getState().updateElement(selectedElement.id, { fontFamily: font });
    },
    [store, selectedElement]
  );

  const persist = useCallback(
    async (patch: Partial<BrandProfile>) => {
      if (!activeBrand) return;
      setSaving(true);
      try {
        const res = await fetch(`/brands/${activeBrand.id}`, {
          method: 'PUT',
          body: JSON.stringify({
            logoFileIds: activeBrand.logoFileIds || [],
            palette: activeBrand.palette || [],
            fontFamilies: activeBrand.fontFamilies || [],
            ...patch,
          }),
        });
        if (!res.ok) {
          toaster.show('Failed to save brand kit', 'warning');
          return;
        }
        toaster.show('Brand kit saved', 'success');
        mutate();
      } finally {
        setSaving(false);
      }
    },
    [activeBrand, fetch, toaster, mutate]
  );

  const toggleLogo = useCallback(
    (fileId: string) => {
      const next = logoFileIds.includes(fileId)
        ? logoFileIds.filter((id) => id !== fileId)
        : [...logoFileIds, fileId];
      persist({ logoFileIds: next });
    },
    [logoFileIds, persist]
  );

  const addLogoToCanvas = useCallback(
    (file: FileItem) => {
      const state = store.getState();
      const w = Math.min(300, state.doc.width * 0.5);
      state.addElement({
        id: '',
        type: 'image',
        x: (state.doc.width - w) / 2,
        y: (state.doc.height - w) / 2,
        width: w,
        height: w,
        rotation: 0,
        opacity: 1,
        locked: false,
        hidden: false,
        src: file.path,
        fileId: file.id,
      });
    },
    [store]
  );

  if (!brands || brands.length === 0) {
    return (
      <div className="text-newTextColor/40 text-[12px] text-center py-8">
        No brand profiles found. Create one in Settings &rarr; Brands.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between">
          <div className="text-[12px] font-medium text-textColor/60 uppercase tracking-wider">
            Brand Profile
          </div>
          {saving && (
            <span className="text-[11px] text-newTextColor/40">Saving…</span>
          )}
        </div>
        <select
          value={activeBrand?.id || ''}
          onChange={() => {
            // Brand selection is informational; palette/fonts are reactive.
          }}
          className="w-full h-[34px] px-[8px] rounded-[6px] bg-newBgColor border border-newBorder text-[13px] text-textColor outline-none focus:border-[#2B5CD3]"
        >
          {brands.map((brand) => (
            <option key={brand.id} value={brand.id}>
              {brand.name}
            </option>
          ))}
        </select>
      </div>

      {/* Logos (E5) */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <ProviderIcon identifier="LOCAL" name="Storage" size={16} />
          <span className="text-[12px] font-medium text-textColor/60 uppercase tracking-wider">
            Logos
          </span>
        </div>

        {logoFileIds.length > 0 && (
          <div className="grid grid-cols-3 gap-2">
            {logoFileIds.map((id) => {
              const file = fileById.get(id);
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => file && addLogoToCanvas(file)}
                  title={file ? `Add ${file.name} to canvas` : id}
                  className="group relative aspect-square rounded-lg overflow-hidden border border-[#2B5CD3] bg-newBgColorInner"
                >
                  {file ? (
                    <img
                      src={file.path}
                      alt={file.name}
                      className="w-full h-full object-contain p-1"
                      loading="lazy"
                    />
                  ) : (
                    <span className="flex items-center justify-center w-full h-full text-[10px] text-newTextColor/40">
                      ?
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}

        <div className="text-[11px] text-newTextColor/40">Pick from files</div>
        {filesLoading && !files ? (
          <PanelSkeletonGrid count={3} columnsClassName="grid-cols-3" aspectClassName="aspect-square" />
        ) : filesError && !files ? (
          <PanelError message="Couldn't load files" onRetry={() => mutateFiles()} />
        ) : !files?.data?.length ? (
          <div className="text-[12px] text-newTextColor/40 text-center py-2">
            No files found
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {files.data.map((file) => {
              const picked = logoFileIds.includes(file.id);
              return (
                <button
                  key={file.id}
                  type="button"
                  onClick={() => toggleLogo(file.id)}
                  aria-pressed={picked}
                  title={file.name}
                  className={`relative aspect-square rounded-lg overflow-hidden border-2 transition-all ${
                    picked
                      ? 'border-[#2B5CD3] ring-1 ring-[#2B5CD3]'
                      : 'border-newBorder hover:border-[#2B5CD3]'
                  }`}
                >
                  <img
                    src={file.path}
                    alt={file.name}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                  {picked && (
                    <span className="absolute top-1 right-1 w-4 h-4 rounded-full bg-[#2B5CD3] text-white text-[10px] flex items-center justify-center">
                      ✓
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Palette (E5) */}
      {palette.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="text-[12px] font-medium text-textColor/60 uppercase tracking-wider">
            Palette
          </div>
          <div className="flex flex-wrap gap-2">
            {palette.map((color, i) => (
              <button
                key={i}
                onClick={() => handleColorClick(color)}
                disabled={!selectedElement}
                className={`w-8 h-8 rounded-[6px] border-2 border-newBorder hover:scale-110 transition-all ${
                  !selectedElement ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'
                }`}
                style={{ backgroundColor: color }}
                title={color}
              />
            ))}
          </div>
          {!selectedElement && (
            <div className="text-[11px] text-newTextColor/40">
              Select an element to apply color
            </div>
          )}
        </div>
      )}

      {/* Fonts (E5) */}
      {fontFamilies.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="text-[12px] font-medium text-textColor/60 uppercase tracking-wider">
            Fonts
          </div>
          <div className="flex flex-col gap-1">
            {fontFamilies.map((font, i) => (
              <button
                key={i}
                onClick={() => handleFontClick(font)}
                disabled={!selectedElement || selectedElement.type !== 'text'}
                className={`text-left px-3 py-2 rounded-[6px] border border-newBorder text-[13px] transition-all ${
                  !selectedElement || selectedElement.type !== 'text'
                    ? 'opacity-40 cursor-not-allowed text-textColor/60'
                    : 'text-textColor hover:border-[#2B5CD3] hover:bg-boxHover cursor-pointer'
                }`}
                style={{ fontFamily: font }}
              >
                {font}
              </button>
            ))}
          </div>
          {(!selectedElement || selectedElement.type !== 'text') && (
            <div className="text-[11px] text-newTextColor/40">
              Select a text element to apply font
            </div>
          )}
        </div>
      )}

      {palette.length === 0 &&
        fontFamilies.length === 0 &&
        logoFileIds.length === 0 && (
          <div className="text-newTextColor/40 text-[12px]">
            This brand has no palette, fonts, or logos configured yet.
          </div>
        )}
    </div>
  );
};
