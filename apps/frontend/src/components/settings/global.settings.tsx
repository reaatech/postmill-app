'use client';

import React from 'react';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import ShortlinkPreferenceComponent from '@gitroom/frontend/components/settings/shortlink-preference.component';

export const GlobalSettings = ({ form, isLoading }: { form?: any; isLoading?: boolean }) => {
  const t = useT();
  return (
    <div className="flex flex-col">
      <h3 className="text-[20px]">{t('settings', 'Settings')}</h3>
      <ShortlinkPreferenceComponent />
    </div>
  );
};
