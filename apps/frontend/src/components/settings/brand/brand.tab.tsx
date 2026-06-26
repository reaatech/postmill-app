'use client';

import React, { useState, useCallback } from 'react';
import useSWR, { useSWRConfig } from 'swr';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { BrandVoice } from '@gitroom/frontend/components/settings/brand/brand-voice';
import { BrandAssets } from '@gitroom/frontend/components/settings/brand/brand-assets';
import { KnowledgeBase } from '@gitroom/frontend/components/settings/brand/knowledge-base';
import { deleteDialog } from '@gitroom/react/helpers/delete.dialog';

interface BrandAsset {
  fileId?: string;
  url: string;
  caption?: string;
}

interface Brand {
  id: string;
  name: string;
  instructions?: string;
  language?: string;
  platformInstructions?: Record<string, string>;
  enabled: boolean;
  isDefault: boolean;
  createdAt: string;
  palette?: string[];
  assets?: BrandAsset[];
  enforcement?: { enabled?: boolean } & Record<string, any>;
}

const useBrands = () => {
  const fetch = useFetch();
  const load = useCallback(async () => {
    const res = await fetch('/brands');
    if (!res.ok) return [];
    return res.json();
  }, [fetch]);
  return useSWR<Brand[]>('brands-list', load, {
    revalidateOnFocus: false,
  });
};

export const BrandTab = () => {
  const t = useT();
  const fetch = useFetch();
  const toaster = useToaster();
  const { mutate } = useSWRConfig();
  const { data: brands, isLoading, mutate: refetchBrands } = useBrands();
  const [subtab, setSubtab] = useState<'list' | 'edit' | 'knowledge'>('list');
  const [editTab, setEditTab] = useState<'voice' | 'kit' | 'knowledge'>('voice');
  const [editingBrand, setEditingBrand] = useState<Brand | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  const [newName, setNewName] = useState('');
  const [showCreate, setShowCreate] = useState(false);

  const handleCreate = useCallback(async () => {
    if (!newName.trim()) {
      toaster.show(t('name_required', 'Name is required'), 'warning');
      return;
    }
    const res = await fetch('/brands', {
      method: 'POST',
      body: JSON.stringify({ name: newName.trim() }),
    });
    if (!res.ok) {
      toaster.show(t('create_failed', 'Failed to create brand'), 'warning');
      return;
    }
    setNewName('');
    setShowCreate(false);
    refetchBrands();
    toaster.show(t('brand_created', 'Brand created'), 'success');
  }, [newName, fetch, toaster, t, refetchBrands]);

  const handleDelete = useCallback(async (brand: Brand) => {
    if (!(await deleteDialog(t('confirm_delete_brand', `Delete "${brand.name}"?`)))) return;
    const res = await fetch(`/brands/${brand.id}`, { method: 'DELETE' });
    if (!res.ok) {
      toaster.show(t('delete_failed', 'Failed to delete brand'), 'warning');
      return;
    }
    refetchBrands();
    toaster.show(t('brand_deleted', 'Brand deleted'), 'success');
  }, [fetch, toaster, t, refetchBrands]);

  const handleSetDefault = useCallback(async (brand: Brand) => {
    const res = await fetch(`/brands/${brand.id}/default`, { method: 'POST' });
    if (!res.ok) {
      toaster.show(t('set_default_failed', 'Failed to set default'), 'warning');
      return;
    }
    refetchBrands();
    toaster.show(t('default_set', 'Default brand updated'), 'success');
  }, [fetch, toaster, t, refetchBrands]);

  if (isLoading) {
    return (
      <div className="my-[16px] bg-newBgColorInner border-newTableBorder border rounded-[12px] p-[24px]">
        <div className="animate-pulse">{t('loading', 'Loading...')}</div>
      </div>
    );
  }

  if (subtab === 'edit' && editingBrand) {
    const editTabs: { key: 'voice' | 'kit' | 'knowledge'; label: string; hint: string }[] = [
      { key: 'voice', label: t('tab_voice', 'Voice & Tone'), hint: t('tab_voice_hint', 'How the AI writes for you') },
      { key: 'kit', label: t('tab_kit', 'Brand Kit'), hint: t('tab_kit_hint', 'Your logo & colours') },
      { key: 'knowledge', label: t('tab_knowledge', 'Knowledge'), hint: t('tab_knowledge_hint', 'What the AI knows about you') },
    ];
    return (
      <div className="flex flex-col">
        <div className="flex items-center gap-[12px] mb-[8px]">
          <button
            onClick={() => { setSubtab('list'); setEditingBrand(null); setIsCreating(false); }}
            className="text-[13px] text-newTableText hover:text-textColor"
          >
            ← {t('back_to_brands', 'Back to Brands')}
          </button>
          <h3 className="text-[20px]">{editingBrand.name}</h3>
        </div>
        <p className="text-[13px] text-newTableText mb-[16px] max-w-[640px] leading-relaxed">
          {t('brand_editor_intro', "A “brand” is a personality for the AI. Set up how it should write, what your brand looks like, and what it knows about your business — then it'll create on-brand posts for you. Pick a section below to get started.")}
        </p>

        <div className="flex gap-[8px] flex-wrap mb-[16px]">
          {editTabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setEditTab(tab.key)}
              className={`flex flex-col items-start text-start px-[16px] py-[10px] rounded-[10px] border transition-colors ${
                editTab === tab.key
                  ? 'border-btnPrimary bg-btnPrimary/10'
                  : 'border-newTableBorder hover:bg-boxHover'
              }`}
            >
              <span className="text-[14px] text-textColor">{tab.label}</span>
              <span className="text-[11px] text-newTableText">{tab.hint}</span>
            </button>
          ))}
        </div>

        {editTab === 'voice' && (
          <BrandVoice
            key={editingBrand.id}
            brandId={editingBrand.id}
            initial={editingBrand}
            onSaved={() => refetchBrands()}
          />
        )}
        {editTab === 'kit' && (
          <BrandAssets
            key={`assets-${editingBrand.id}`}
            brandId={editingBrand.id}
            initial={editingBrand}
            onSaved={() => refetchBrands()}
          />
        )}
        {editTab === 'knowledge' && <KnowledgeBase />}
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between mb-[16px]">
        <h3 className="text-[20px]">{t('brands', 'Brands')}</h3>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="bg-btnPrimary text-white rounded-[8px] px-[16px] py-[8px] text-[14px] hover:opacity-90"
        >
          {t('create_brand', 'Create Brand')}
        </button>
      </div>

      {showCreate && (
        <div className="flex gap-[8px] mb-[16px]">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder={t('brand_name_placeholder', 'Brand name...')}
            className="bg-newBgColor border border-newTableBorder rounded-[4px] px-[12px] py-[8px] text-textColor text-[14px] outline-none flex-1"
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
          />
          <button
            onClick={handleCreate}
            className="bg-btnPrimary text-white rounded-[8px] px-[16px] py-[8px] text-[14px] hover:opacity-90"
          >
            {t('save', 'Save')}
          </button>
        </div>
      )}

      <div className="flex flex-col gap-[8px]">
        {(!brands || brands.length === 0) && (
          <div className="text-newTableText text-[14px] py-[24px] text-center">
            {t('no_brands_yet', 'No brands yet. Create your first brand to define your brand voice.')}
          </div>
        )}
        {brands?.map((brand) => (
          <div
            key={brand.id}
            className="bg-newBgColorInner border border-newTableBorder rounded-[8px] p-[16px] flex items-center gap-[16px]"
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-[8px]">
                <div className="text-[14px] font-[500]">{brand.name}</div>
                {brand.isDefault && (
                  <div className="bg-btnPrimary text-white text-[10px] rounded-[4px] px-[6px] py-[2px] uppercase">
                    {t('default', 'Default')}
                  </div>
                )}
                {!brand.enabled && (
                  <div className="bg-red-500/20 text-red-500 text-[10px] rounded-[4px] px-[6px] py-[2px]">
                    {t('disabled', 'Disabled')}
                  </div>
                )}
              </div>
              {(brand.palette?.length || brand.assets?.length) ? (
                <div className="flex items-center gap-[10px] mt-[6px]">
                  {!!brand.palette?.length && (
                    <div className="flex items-center -space-x-[4px]">
                      {brand.palette.slice(0, 6).map((c, i) => (
                        <div
                          key={`${c}-${i}`}
                          className="w-[14px] h-[14px] rounded-full border border-newTableBorder"
                          style={{ backgroundColor: c }}
                          title={c}
                        />
                      ))}
                    </div>
                  )}
                  {!!brand.assets?.length && (
                    <span className="text-[11px] text-newTableText">
                      {brand.assets.length} {brand.assets.length === 1 ? t('asset', 'asset') : t('assets_lower', 'assets')}
                    </span>
                  )}
                </div>
              ) : null}
            </div>
            <div className="flex items-center gap-[8px]">
              {!brand.isDefault && (
                <button
                  onClick={() => handleSetDefault(brand)}
                  className="text-[12px] text-newTableText hover:text-textColor"
                >
                  {t('set_default', 'Set as Default')}
                </button>
              )}
              <button
                onClick={() => { setEditingBrand(brand); setEditTab('voice'); setSubtab('edit'); }}
                className="text-btnPrimary text-[12px] hover:underline"
              >
                {t('edit', 'Edit')}
              </button>
              <button
                onClick={() => handleDelete(brand)}
                className="text-red-500 text-[12px] hover:underline"
              >
                {t('delete', 'Delete')}
              </button>
            </div>
          </div>
        ))}
      </div>

      {subtab === 'knowledge' && (
        <div className="mt-[16px]">
          <KnowledgeBase />
        </div>
      )}
    </div>
  );
};
