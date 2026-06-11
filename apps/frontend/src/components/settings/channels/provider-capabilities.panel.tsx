'use client';

import React, { FC } from 'react';
import { ProviderCapabilityMatrix } from '@gitroom/frontend/components/admin/provider-capability.matrix';

export const ProviderCapabilitiesPanel: FC = () => {
  return (
    <div className="flex flex-col gap-[12px] mt-[8px]">
      <div className="border-t border-newTableBorder pt-[16px]">
        <h3 className="text-[15px] font-[600] text-textColor mb-[8px]">
          Provider Capability Reference
        </h3>
        <p className="text-[12px] text-textColor/60 mb-[12px]">
          This matrix shows what each provider supports. Use it to understand
          which features (analytics, comments, polls, etc.) are available per channel.
        </p>
        <div className="bg-newTableHeader rounded-[8px] p-[12px] max-h-[400px] overflow-auto">
          <ProviderCapabilityMatrix />
        </div>
      </div>
    </div>
  );
};
