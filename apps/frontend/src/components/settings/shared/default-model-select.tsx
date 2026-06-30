'use client';

import React, { FC, useMemo, useRef, useState } from 'react';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import useSWR from 'swr';
import Loading from '@gitroom/frontend/components/layout/loading';

export interface DefaultCatalogOption {
  providerId: string;
  version: string;
  model?: string;
  label: string;
}

interface DefaultCatalogResponse {
  category: string;
  options: DefaultCatalogOption[];
}

function encodeValue(option: { providerId: string; version: string; model?: string }): string {
  return option.model
    ? `${option.providerId}::${option.version}::${option.model}`
    : `${option.providerId}::${option.version}`;
}

export function decodeValue(value: string): {
  providerId: string;
  version: string;
  model?: string;
} | null {
  const parts = value.split('::');
  if (parts.length < 2) return null;
  const [providerId, version, model] = parts;
  if (!providerId || !version) return null;
  return { providerId, version, model };
}

const useDefaultCatalog = (domain: 'ai' | 'media', category: string) => {
  const fetch = useFetch();
  const path =
    domain === 'ai'
      ? `/settings/ai/defaults/catalog?category=${encodeURIComponent(category)}`
      : `/settings/content/media-defaults/catalog?category=${encodeURIComponent(category)}`;

  const load = React.useCallback(async () => {
    const res = await fetch(path);
    if (!res.ok) throw new Error('Failed to load catalog');
    return (await res.json()) as DefaultCatalogResponse;
  }, [fetch, path]);

  return useSWR(path, load, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    revalidateIfStale: false,
    refreshWhenHidden: false,
    refreshWhenOffline: false,
  });
};

const inputClass =
  'w-full px-[12px] py-[9px] rounded-[8px] bg-newBgColorInner border border-newTableBorder text-[13px] text-textColor outline-none focus:border-[#2B5CD3] transition-colors';

export const DefaultModelSelect: FC<{
  domain: 'ai' | 'media';
  category: string;
  value?: { providerId: string; version: string; model?: string } | null;
  onChange: (value: { providerId: string; version: string; model?: string } | null) => void;
}> = ({ domain, category, value, onChange }) => {
  const { data, isLoading } = useDefaultCatalog(domain, category);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const options = useMemo<DefaultCatalogOption[]>(() => {
    return data?.options ?? [];
  }, [data]);

  const selected = useMemo(() => {
    if (!value) return undefined;
    return options.find(
      (o) =>
        o.providerId === value.providerId &&
        o.version === value.version &&
        o.model === value.model
    );
  }, [options, value]);

  const selectedLabel = selected?.label || '';

  const trimmed = query.trim();
  const filtered = useMemo(() => {
    const q = trimmed.toLowerCase();
    if (!q) return options.slice(0, 100);
    return options
      .filter(
        (o) =>
          o.label.toLowerCase().includes(q) ||
          o.providerId.toLowerCase().includes(q) ||
          o.model?.toLowerCase().includes(q)
      )
      .slice(0, 100);
  }, [options, trimmed]);

  // Catalogs can be incomplete. Allow a typed value in the form provider::version::model
  // or provider::version (action-only provider).
  const showRaw =
    trimmed.length > 0 && !options.some((o) => encodeValue(o) === trimmed);

  // Resolve a typed entry to a concrete value. A fully-encoded string decodes directly;
  // a bare model id is attached to a provider — the row's current selection if any, else
  // the first catalog candidate's provider — so an off-catalog model is still usable.
  const rawTarget = useMemo(() => {
    if (!showRaw) return null;
    const decoded = decodeValue(trimmed);
    if (decoded) return decoded;
    if (value?.providerId && value?.version) {
      return { providerId: value.providerId, version: value.version, model: trimmed };
    }
    const fallback = options[0];
    if (fallback) {
      return { providerId: fallback.providerId, version: fallback.version, model: trimmed };
    }
    return null;
  }, [showRaw, trimmed, value, options]);

  const commit = (resolved: { providerId: string; version: string; model?: string }) => {
    if (blurTimer.current) clearTimeout(blurTimer.current);
    onChange(resolved);
    setOpen(false);
    setQuery('');
  };

  return (
    <div className="relative">
      <input
        type="text"
        value={open ? query : selectedLabel}
        placeholder={isLoading ? 'Loading…' : 'Search or type a model…'}
        onFocus={() => {
          setOpen(true);
          setQuery('');
        }}
        onBlur={() => {
          blurTimer.current = setTimeout(() => setOpen(false), 120);
        }}
        onChange={(e) => setQuery(e.target.value)}
        className={inputClass}
      />
      {isLoading && (
        <div className="absolute right-[10px] top-[10px]">
          <Loading height={16} width={16} type="spin" color="#888" />
        </div>
      )}
      {open && (filtered.length > 0 || (showRaw && !!rawTarget)) && (
        <div className="absolute z-[20] mt-[4px] w-full max-h-[260px] overflow-y-auto rounded-[8px] border border-newTableBorder bg-newBgColorInner shadow-lg">
          {showRaw && rawTarget && (
            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                commit(rawTarget);
              }}
              className="block w-full text-left px-[12px] py-[8px] text-[13px] text-textColor hover:bg-boxHover transition-colors"
            >
              Use “
              {rawTarget.model
                ? `${rawTarget.providerId}: ${rawTarget.model}`
                : rawTarget.providerId}
              ”
            </button>
          )}
          {filtered.map((o) => {
            const v = encodeValue(o);
            const decoded = decodeValue(v);
            const isSelected =
              value?.providerId === o.providerId &&
              value?.version === o.version &&
              value?.model === o.model;
            return (
              <button
                key={v}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  if (decoded) commit(decoded);
                }}
                className={`block w-full text-left px-[12px] py-[8px] text-[13px] hover:bg-boxHover transition-colors ${
                  isSelected ? 'text-textColor bg-[#2B5CD3]/15' : 'text-newTextColor/80'
                }`}
              >
                {o.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
