'use client';

import React, { useCallback } from 'react';
import useSWR from 'swr';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useLaunchStore } from '@gitroom/frontend/components/composer/store';

interface Brand {
  id: string;
  name: string;
  isDefault: boolean;
  enabled: boolean;
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
    revalidateOnReconnect: false,
    revalidateIfStale: false,
  });
};

export const BrandPicker = () => {
  const t = useT();
  const { data: brands, isLoading } = useBrands();
  const brandId = useLaunchStore((state) => state.brandId);
  const setBrandId = useLaunchStore((state) => state.setBrandId);

  if (isLoading || !brands?.length) return null;

  return (
    <div className="flex items-center gap-[8px]">
      <div className="text-[12px] text-newTableText whitespace-nowrap">
        {t('brand', 'Brand')}
      </div>
      <select
        value={brandId || ''}
        onChange={(e) => setBrandId(e.target.value || null)}
        className="bg-newBgColor border border-newTableBorder rounded-[4px] text-[12px] px-[8px] py-[4px] text-textColor outline-none max-w-[160px]"
      >
        <option value="">{t('no_brand', 'No Brand')}</option>
        {brands.map((brand) => (
          <option key={brand.id} value={brand.id}>
            {brand.name}
            {brand.isDefault ? ` (${t('default', 'Default')})` : ''}
          </option>
        ))}
      </select>
    </div>
  );
};
