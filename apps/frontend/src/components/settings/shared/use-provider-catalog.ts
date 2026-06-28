'use client';

import { useCallback } from 'react';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import useSWR from 'swr';

export interface CatalogCredentialField {
  key: string;
  label: string;
  type: string;
  required: boolean;
  placeholder?: string;
  help?: string;
  options?: { label: string; value: string }[];
}

export type ProviderVersionStatus = 'preview' | 'active' | 'deprecated' | 'retired';

export interface ProviderCatalogEntry {
  domain: string;
  providerId: string;
  version: string;
  displayName: string;
  status: ProviderVersionStatus;
  capabilities?: unknown;
  authType?: string;
  defaultDomain?: string;
  setupNotes?: string;
  credentialFields?: CatalogCredentialField[];
  deprecatedAt?: string;
  sunsetAt?: string;
}

/**
 * Versions an org may newly select for a provider — `active` and `preview` only
 * (deprecated reject new writes, retired are gone). Sorted newest-first.
 */
export function selectableVersions(
  catalog: ProviderCatalogEntry[] | undefined,
  providerId: string,
): ProviderCatalogEntry[] {
  return (catalog || [])
    .filter(
      (e) =>
        e.providerId === providerId &&
        (e.status === 'active' || e.status === 'preview'),
    )
    .sort((a, b) => b.version.localeCompare(a.version, undefined, { numeric: true }));
}

/** The version a fresh config / upgrade should default to. */
export function latestActiveVersion(
  catalog: ProviderCatalogEntry[] | undefined,
  providerId: string,
): string | undefined {
  const selectable = selectableVersions(catalog, providerId);
  return (
    selectable.find((e) => e.status === 'active')?.version ??
    selectable[0]?.version
  );
}

export function useProviderCatalog(domain?: string) {
  const fetch = useFetch();
  const load = useCallback(async () => {
    const url = domain ? `/providers/catalog?domain=${encodeURIComponent(domain)}` : '/providers/catalog';
    const res = await fetch(url);
    if (!res.ok) throw new Error('Failed to load provider catalog');
    return res.json();
  }, [fetch, domain]);

  return useSWR<ProviderCatalogEntry[]>(`provider-catalog-${domain ?? 'all'}`, load, {
    revalidateOnFocus: false,
  });
}
