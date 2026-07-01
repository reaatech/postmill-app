'use client';

import { FC, useMemo, useState } from 'react';
import clsx from 'clsx';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import type { Campaign } from '@gitroom/frontend/components/campaigns/campaign-types';

export type CampaignSort =
  | 'created'
  | 'oldest'
  | 'name'
  | 'name_desc'
  | 'posts'
  | 'posts_asc';
export type CampaignStatus = 'all' | 'active' | 'archived';

export interface CampaignFilters {
  search: string;
  status: CampaignStatus;
  client: string; // '' = all clients
  tags: string[];
  sort: CampaignSort;
}

export const DEFAULT_CAMPAIGN_FILTERS: CampaignFilters = {
  search: '',
  status: 'active',
  client: '',
  tags: [],
  sort: 'created',
};

const uniqSorted = (values: (string | null | undefined)[]) =>
  Array.from(new Set(values.filter((v): v is string => !!v))).sort((a, b) =>
    a.localeCompare(b)
  );

const FilterIcon = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z" />
  </svg>
);

interface CampaignFilterBarProps {
  campaigns: Campaign[];
  filters: CampaignFilters;
  onChange: (next: CampaignFilters) => void;
}

export const CampaignFilterBar: FC<CampaignFilterBarProps> = ({
  campaigns,
  filters,
  onChange,
}) => {
  const t = useT();
  const [sheetOpen, setSheetOpen] = useState(false);

  const clients = useMemo(() => uniqSorted(campaigns.map((c) => c.client)), [campaigns]);
  const allTags = useMemo(
    () => uniqSorted(campaigns.flatMap((c) => c.tags || [])),
    [campaigns]
  );

  const set = (patch: Partial<CampaignFilters>) => onChange({ ...filters, ...patch });
  const toggleTag = (tag: string) =>
    set({
      tags: filters.tags.includes(tag)
        ? filters.tags.filter((x) => x !== tag)
        : [...filters.tags, tag],
    });

  const activeCount =
    (filters.status !== DEFAULT_CAMPAIGN_FILTERS.status ? 1 : 0) +
    (filters.client ? 1 : 0) +
    filters.tags.length;

  const sortOptions: { value: CampaignSort; label: string }[] = [
    { value: 'created', label: t('sort_newest', 'Newest') },
    { value: 'oldest', label: t('sort_oldest', 'Oldest') },
    { value: 'name', label: t('sort_name_az', 'Name A–Z') },
    { value: 'name_desc', label: t('sort_name_za', 'Name Z–A') },
    { value: 'posts', label: t('sort_most_posts', 'Most posts') },
    { value: 'posts_asc', label: t('sort_fewest_posts', 'Fewest posts') },
  ];

  const statusOptions: { value: CampaignStatus; label: string }[] = [
    { value: 'all', label: t('status_all', 'All') },
    { value: 'active', label: t('status_active', 'Active') },
    { value: 'archived', label: t('archived', 'Archived') },
  ];

  const inputCls =
    'px-[12px] py-[8px] bg-newBgColor border border-newTableBorder rounded-[8px] text-[14px] outline-none';

  return (
    <div className="flex flex-col gap-[12px]">
      {/* Search + sort + filters trigger */}
      <div className="flex flex-wrap items-center gap-[8px]">
        <input
          type="text"
          value={filters.search}
          onChange={(e) => set({ search: e.target.value })}
          placeholder={t('search_campaigns', 'Search name, client, project or tag...')}
          className={clsx(inputCls, 'flex-1 min-w-[180px]')}
        />
        <select
          value={filters.sort}
          onChange={(e) => set({ sort: e.target.value as CampaignSort })}
          className={clsx(inputCls, 'shrink-0')}
          aria-label={t('sort_by', 'Sort by')}
        >
          {sortOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          className={clsx(
            'shrink-0 flex items-center gap-[6px] px-[12px] py-[8px] rounded-[8px] border text-[14px] transition-colors',
            activeCount > 0
              ? 'border-btnPrimary text-btnPrimary bg-btnPrimary/10'
              : 'border-newTableBorder text-textColor bg-newBgColor hover:bg-newTableBorder/30'
          )}
          aria-haspopup="dialog"
          aria-expanded={sheetOpen}
        >
          {FilterIcon}
          <span>{t('filters', 'Filters')}</span>
          {activeCount > 0 && (
            <span className="min-w-[18px] h-[18px] px-[4px] flex items-center justify-center rounded-full bg-btnPrimary text-white text-[11px] font-[600]">
              {activeCount}
            </span>
          )}
        </button>
      </div>

      {/* Active filter chips */}
      {activeCount > 0 && (
        <div className="flex flex-wrap items-center gap-[6px]">
          {filters.status !== DEFAULT_CAMPAIGN_FILTERS.status && (
            <Chip onRemove={() => set({ status: DEFAULT_CAMPAIGN_FILTERS.status })}>
              {statusOptions.find((s) => s.value === filters.status)?.label}
            </Chip>
          )}
          {filters.client && (
            <Chip onRemove={() => set({ client: '' })}>
              {t('client', 'Client')}: {filters.client}
            </Chip>
          )}
          {filters.tags.map((tag) => (
            <Chip key={tag} onRemove={() => toggleTag(tag)}>
              #{tag}
            </Chip>
          ))}
          <button
            type="button"
            onClick={() => set({ status: DEFAULT_CAMPAIGN_FILTERS.status, client: '', tags: [] })}
            className="text-[12px] text-newTableText hover:text-textColor underline"
          >
            {t('clear_all', 'Clear all')}
          </button>
        </div>
      )}

      {/* Filters bottom sheet */}
      {sheetOpen && (
        <div className="fixed inset-0 z-[210]">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setSheetOpen(false)}
          />
          <div className="absolute bottom-0 inset-x-0 lg:inset-x-auto lg:left-1/2 lg:-translate-x-1/2 lg:bottom-[40px] lg:w-[560px] lg:max-w-[calc(100vw-32px)] max-h-[85vh] overflow-y-auto bg-newBgColorInner rounded-t-[16px] lg:rounded-[16px] p-[16px] pb-[calc(env(safe-area-inset-bottom)+16px)] shadow-[0_-8px_24px_rgba(0,0,0,0.25)]">
            <div className="lg:hidden mx-auto mb-[12px] h-[4px] w-[40px] rounded-full bg-newTableBorder" />
            <div className="flex items-center justify-between mb-[16px]">
              <h3 className="text-[16px] font-[600] text-textColor">
                {t('filters', 'Filters')}
              </h3>
              <button
                type="button"
                onClick={() => set({ status: DEFAULT_CAMPAIGN_FILTERS.status, client: '', tags: [] })}
                className="text-[13px] text-newTableText hover:text-textColor"
              >
                {t('clear_all', 'Clear all')}
              </button>
            </div>

            {/* Status */}
            <div className="mb-[16px]">
              <div className="text-[12px] font-[600] text-newTableText mb-[6px]">
                {t('status', 'Status')}
              </div>
              <div className="flex gap-[6px]">
                {statusOptions.map((o) => (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() => set({ status: o.value })}
                    className={clsx(
                      'flex-1 px-[10px] py-[8px] rounded-[8px] text-[13px] border transition-colors',
                      filters.status === o.value
                        ? 'border-btnPrimary bg-btnPrimary/15 text-btnPrimary'
                        : 'border-newTableBorder text-textColor hover:bg-newTableBorder/30'
                    )}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Client */}
            {clients.length > 0 && (
              <div className="mb-[16px]">
                <div className="text-[12px] font-[600] text-newTableText mb-[6px]">
                  {t('client', 'Client')}
                </div>
                <select
                  value={filters.client}
                  onChange={(e) => set({ client: e.target.value })}
                  className={clsx(inputCls, 'w-full')}
                >
                  <option value="">{t('all_clients', 'All clients')}</option>
                  {clients.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Tags */}
            {allTags.length > 0 && (
              <div className="mb-[16px]">
                <div className="text-[12px] font-[600] text-newTableText mb-[6px]">
                  {t('tags', 'Tags')}
                </div>
                <div className="flex flex-wrap gap-[6px]">
                  {allTags.map((tag) => {
                    const on = filters.tags.includes(tag);
                    return (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => toggleTag(tag)}
                        className={clsx(
                          'px-[10px] py-[4px] rounded-full text-[12px] border transition-colors',
                          on
                            ? 'border-btnPrimary bg-btnPrimary/15 text-btnPrimary'
                            : 'border-newTableBorder text-newTableText hover:text-textColor'
                        )}
                      >
                        {tag}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <button
              type="button"
              onClick={() => setSheetOpen(false)}
              className="w-full h-[44px] rounded-[8px] bg-btnPrimary text-white text-[14px] font-[600]"
            >
              {t('show_results', 'Show results')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

const Chip: FC<{ onRemove: () => void; children: React.ReactNode }> = ({
  onRemove,
  children,
}) => (
  <span className="flex items-center gap-[4px] pl-[10px] pr-[6px] py-[3px] rounded-full bg-btnPrimary/15 text-btnPrimary text-[12px]">
    {children}
    <button
      type="button"
      onClick={onRemove}
      aria-label="Remove filter"
      className="w-[16px] h-[16px] flex items-center justify-center rounded-full hover:bg-btnPrimary/20"
    >
      <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
        <path d="M1 1l8 8M9 1l-8 8" />
      </svg>
    </button>
  </span>
);
