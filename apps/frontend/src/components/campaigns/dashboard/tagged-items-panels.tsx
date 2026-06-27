'use client';

import { FC, useCallback, useMemo, useState } from 'react';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useModals } from '@gitroom/frontend/components/layout/new-modal';
import { Button } from '@gitroom/react/form/button';
import dayjs from 'dayjs';
import {
  CampaignEntitySlug,
  ResolvedCampaignItem,
} from '@gitroom/frontend/components/campaigns/campaign-types';
import {
  useOrgEntities,
  OrgEntityOption,
} from '@gitroom/frontend/components/campaigns/hooks/campaign.hooks';

const ENTITY_LABELS: Record<CampaignEntitySlug, string> = {
  post: 'Posts',
  channel: 'Channels',
  vpn: 'VPN',
  llm: 'AI Providers',
  brand: 'Brands',
  storage: 'Storage',
  file: 'Files',
  set: 'Sets',
  signature: 'Signatures',
};

const ENTITY_ORDER: CampaignEntitySlug[] = [
  'channel',
  'brand',
  'file',
  'signature',
  'set',
  'vpn',
  'llm',
  'storage',
  'post',
];

const PanelItem: FC<{
  item: ResolvedCampaignItem;
  onRemove: (entityType: CampaignEntitySlug, entityId: string) => void;
  busy: boolean;
}> = ({ item, onRemove, busy }) => {
  const iconSrc = item.icon || undefined;
  return (
    <div className="flex items-center justify-between gap-[8px] px-[12px] py-[8px] rounded-[8px] bg-newBgColorInner border border-newTableBorder hover:border-newTableText/30 transition-colors">
      <div className="flex items-center gap-[8px] min-w-0">
        {iconSrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={iconSrc} alt="" className="w-[24px] h-[24px] rounded-[4px] object-cover shrink-0" />
        ) : (
          <div className="w-[24px] h-[24px] rounded-[4px] bg-btnPrimary/10 text-btnPrimary flex items-center justify-center text-[10px] font-medium shrink-0">
            {(item.name || '?').charAt(0).toUpperCase()}
          </div>
        )}
        <div className="flex flex-col min-w-0">
          <span className="text-[13px] text-textColor truncate">{item.name}</span>
          {item.subtitle && (
            <span className="text-[11px] text-newTableText truncate">{item.subtitle}</span>
          )}
        </div>
      </div>
      <button
        type="button"
        disabled={busy}
        onClick={() => onRemove(item.entityType as CampaignEntitySlug, item.id)}
        className="text-[12px] text-newTableText hover:text-red-400 shrink-0 px-[6px] py-[2px] rounded-[4px] hover:bg-red-500/10 transition-colors disabled:opacity-40"
        aria-label="Remove"
      >
        ×
      </button>
    </div>
  );
};

const AddItemsModal: FC<{
  campaignId: string;
  existingItems: Record<string, ResolvedCampaignItem[]>;
  onDone: () => void;
}> = ({ campaignId, existingItems, onDone }) => {
  const t = useT();
  const fetch = useFetch();
  const toaster = useToaster();
  const [selectedType, setSelectedType] = useState<CampaignEntitySlug>('channel');
  const [query, setQuery] = useState('');
  const [taggingId, setTaggingId] = useState<string | null>(null);
  const { data: entities, isLoading, error } = useOrgEntities(selectedType);

  const existingIds = useMemo(() => {
    return new Set((existingItems[selectedType] || []).map((i) => i.id));
  }, [existingItems, selectedType]);

  const filtered = useMemo(() => {
    const list = entities || [];
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (e) =>
        e.name.toLowerCase().includes(q) ||
        (e.subtitle || '').toLowerCase().includes(q)
    );
  }, [entities, query]);

  const tag = useCallback(
    async (entity: OrgEntityOption) => {
      if (taggingId) return;
      setTaggingId(entity.id);
      try {
        const r = await fetch(`/campaigns/${campaignId}/items`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ entityType: selectedType, entityId: entity.id }),
        });
        if (!r.ok) throw new Error();
        toaster.show(t('item_tagged', 'Item tagged'), 'success');
        onDone();
      } catch {
        toaster.show(t('failed_to_tag_item', 'Failed to tag item'), 'warning');
      } finally {
        setTaggingId(null);
      }
    },
    [campaignId, fetch, onDone, selectedType, taggingId, t, toaster]
  );

  return (
    <div className="flex flex-col gap-[16px] p-[16px] min-w-[420px] max-w-[90vw]">
      <div className="flex flex-col gap-[4px]">
        <label className="text-[12px] text-newTableText">{t('entity_type', 'Entity type')}</label>
        <select
          value={selectedType}
          onChange={(e) => {
            setSelectedType(e.target.value as CampaignEntitySlug);
            setQuery('');
          }}
          className="px-[12px] py-[8px] bg-newBgColor border border-newTableBorder rounded-[8px] text-[14px] text-textColor outline-none"
        >
          {ENTITY_ORDER.map((slug) => (
            <option key={slug} value={slug}>
              {ENTITY_LABELS[slug]}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-[4px]">
        <label className="text-[12px] text-newTableText">{t('search', 'Search')}</label>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('search_entities', 'Search…')}
          className="px-[12px] py-[8px] bg-newBgColor border border-newTableBorder rounded-[8px] text-[14px] text-textColor placeholder-newTableText outline-none"
        />
      </div>

      <div className="flex flex-col gap-[6px] max-h-[300px] overflow-y-auto">
        {isLoading && (
          <div className="text-center py-[24px] text-[13px] text-newTableText">
            {t('loading', 'Loading…')}
          </div>
        )}
        {error && (
          <div className="text-center py-[24px] text-[13px] text-red-400">
            {t('failed_to_load_entities', 'Failed to load entities')}
          </div>
        )}
        {!isLoading && !error && filtered.length === 0 && (
          <div className="text-center py-[24px] text-[13px] text-newTableText">
            {t('no_entities', 'No entities found')}
          </div>
        )}
        {filtered.map((entity) => {
          const alreadyTagged = existingIds.has(entity.id);
          return (
            <button
              key={entity.id}
              type="button"
              disabled={alreadyTagged || taggingId === entity.id}
              onClick={() => tag(entity)}
              className="flex items-center gap-[8px] w-full text-left px-[12px] py-[8px] rounded-[8px] bg-newBgColorInner border border-newTableBorder hover:border-newTableText/30 transition-colors disabled:opacity-50"
            >
              {entity.icon ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={entity.icon} alt="" className="w-[24px] h-[24px] rounded-[4px] object-cover shrink-0" />
              ) : (
                <div className="w-[24px] h-[24px] rounded-[4px] bg-btnPrimary/10 text-btnPrimary flex items-center justify-center text-[10px] font-medium shrink-0">
                  {entity.name.charAt(0).toUpperCase()}
                </div>
              )}
              <div className="flex flex-col min-w-0 flex-1">
                <span className="text-[13px] text-textColor truncate">{entity.name}</span>
                {entity.subtitle && (
                  <span className="text-[11px] text-newTableText truncate">{entity.subtitle}</span>
                )}
              </div>
              {alreadyTagged ? (
                <span className="text-[11px] text-newTableText shrink-0">{t('tagged', 'Tagged')}</span>
              ) : taggingId === entity.id ? (
                <span className="text-[11px] text-newTableText shrink-0">{t('saving', 'Saving…')}</span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export const TaggedItemsPanels: FC<{
  campaignId: string;
  items: Record<string, ResolvedCampaignItem[]>;
  posts?: Array<{
    id: string;
    title?: string;
    content?: string;
    publishDate?: string;
    state?: string;
    integration?: { picture?: string; name?: string };
  }>;
  onMutate: () => void;
}> = ({ campaignId, items, posts, onMutate }) => {
  const t = useT();
  const fetch = useFetch();
  const toaster = useToaster();
  const modal = useModals();
  const [removingKey, setRemovingKey] = useState<string | null>(null);

  const mergedItems = useMemo<Record<string, ResolvedCampaignItem[]>>(() => {
    const postItems: ResolvedCampaignItem[] = (posts || []).map((post) => ({
      id: post.id,
      name:
        post.title ||
        post.content?.replace(/<[^>]+>/g, ' ').trim().slice(0, 60) ||
        'Untitled post',
      icon: post.integration?.picture,
      subtitle: post.publishDate
        ? dayjs(post.publishDate).format('MMM D, YYYY HH:mm')
        : post.state,
      entityType: 'post',
    }));
    return { ...items, post: postItems };
  }, [items, posts]);

  const sortedTypes = useMemo(() => {
    return ENTITY_ORDER;
  }, []);

  const remove = useCallback(
    async (entityType: CampaignEntitySlug, entityId: string) => {
      if (removingKey) return;
      setRemovingKey(`${entityType}:${entityId}`);
      try {
        const r = await fetch(`/campaigns/${campaignId}/items/${entityType}/${entityId}`, {
          method: 'DELETE',
        });
        if (!r.ok) throw new Error();
        toaster.show(t('item_untagged', 'Item removed'), 'success');
        onMutate();
      } catch {
        toaster.show(t('failed_to_untag_item', 'Failed to remove item'), 'warning');
      } finally {
        setRemovingKey(null);
      }
    },
    [campaignId, fetch, onMutate, removingKey, t, toaster]
  );

  const openAddModal = useCallback(() => {
    modal.openModal({
      title: t('add_items_to_campaign', 'Add items to campaign'),
      withCloseButton: true,
      children: (
        <AddItemsModal
          campaignId={campaignId}
          existingItems={mergedItems}
          onDone={() => {
            modal.closeAll();
            onMutate();
          }}
        />
      ),
    });
  }, [campaignId, mergedItems, modal, onMutate, t]);

  return (
    <div className="p-[16px] border border-newTableBorder rounded-[12px] bg-newBgColor">
      <div className="flex items-center justify-between mb-[12px]">
        <h3 className="text-[16px] font-semibold text-textColor">{t('tagged_items', 'Tagged Items')}</h3>
        <Button onClick={openAddModal} className="!h-[32px] !px-[12px] text-[13px]">
          {t('add_items', 'Add items')}
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-[16px]">
        {sortedTypes.map((slug) => {
          const panelItems = mergedItems[slug] || [];
          if (panelItems.length === 0) return null;
          return (
            <div
              key={slug}
              className="flex flex-col gap-[8px] p-[12px] border border-newTableBorder rounded-[12px] bg-newBgColorInner"
            >
              <div className="text-[13px] font-medium text-textColor">{ENTITY_LABELS[slug]}</div>
              <div className="flex flex-col gap-[6px]">
                {panelItems.map((item) => (
                  <PanelItem
                    key={item.id}
                    item={item}
                    onRemove={remove}
                    busy={removingKey === `${item.entityType}:${item.id}`}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {sortedTypes.every((slug) => !(mergedItems[slug] || []).length) && (
        <div className="text-[13px] text-newTableText text-center py-[24px]">
          {t('no_tagged_items', 'No items tagged yet. Click Add items to tag channels, brands, files, posts, and more.')}
        </div>
      )}
    </div>
  );
};
