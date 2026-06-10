'use client';

import React from 'react';
import { S3Icon } from '@gitroom/frontend/components/settings/storage/icons/s3-icon';
import { R2Icon } from '@gitroom/frontend/components/settings/storage/icons/r2-icon';
import { B2Icon } from '@gitroom/frontend/components/settings/storage/icons/b2-icon';
import { IdriveIcon } from '@gitroom/frontend/components/settings/storage/icons/idrive-icon';
import { LocalIcon } from '@gitroom/frontend/components/settings/storage/icons/local-icon';

const typeIcons: Record<string, React.FC<{ className?: string }>> = {
  LOCAL: LocalIcon,
  S3: S3Icon,
  CLOUDFLARE_R2: R2Icon,
  BACKBLAZE_B2: B2Icon,
  IDRIVE_E2: IdriveIcon,
};

const typeLabels: Record<string, string> = {
  LOCAL: 'Local Storage',
  S3: 'AWS S3',
  CLOUDFLARE_R2: 'Cloudflare R2',
  BACKBLAZE_B2: 'Backblaze B2',
  IDRIVE_E2: 'IDrive e2',
};

interface ProviderCardProps {
  provider: {
    id: string;
    type: string;
    name: string;
    mounted: boolean;
    quotaBytes?: string | null;
    bucket?: string | null;
    region?: string | null;
  };
  usageBytes?: string | null;
  hasOtherProviders?: boolean;
  onMount: (id: string) => void;
  onUnmount: (id: string) => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  onTest: (id: string) => void;
  onMigrate?: (id: string) => void;
}

export const ProviderCard: React.FC<ProviderCardProps> = ({
  provider,
  usageBytes,
  hasOtherProviders,
  onMount,
  onUnmount,
  onEdit,
  onDelete,
  onTest,
  onMigrate,
}) => {
  const Icon = typeIcons[provider.type] || LocalIcon;
  const quota = provider.quotaBytes ? BigInt(provider.quotaBytes) : null;
  const usage = usageBytes ? BigInt(usageBytes) : null;
  const usagePercent =
    quota && usage !== null && quota > 0
      ? Number((usage * BigInt(100)) / quota)
      : null;

  return (
    <div className="bg-sixth border border-fifth rounded-[12px] p-[16px] flex flex-col gap-[12px]">
      <div className="flex items-center gap-[12px]">
        <Icon />
        <div className="flex-1 min-w-0">
          <h4 className="text-[14px] font-medium text-textColor truncate">
            {provider.name}
          </h4>
          <p className="text-[12px] text-customColor18">
            {typeLabels[provider.type] || provider.type}
            {provider.bucket ? ` · ${provider.bucket}` : ''}
            {provider.region ? ` · ${provider.region}` : ''}
          </p>
        </div>
        <div className="flex items-center gap-[6px]">
          {provider.type === 'LOCAL' ? (
            <div className="px-[8px] py-[2px] rounded-full text-[11px] font-medium bg-[#1a3a1a] text-customColor4">
              Always on
            </div>
          ) : (
            <div
              className={`px-[8px] py-[2px] rounded-full text-[11px] font-medium ${
                provider.mounted
                  ? 'bg-[#1a3a1a] text-customColor4'
                  : 'bg-[#3a1a1a] text-[#f87171]'
              }`}
            >
              {provider.mounted ? 'Mounted' : 'Unmounted'}
            </div>
          )}
        </div>
      </div>

      {usagePercent !== null && (
        <div className="flex flex-col gap-[4px]">
          <div className="flex justify-between text-[11px] text-customColor18">
            <span>Usage</span>
            <span>{usagePercent}%</span>
          </div>
          <div className="h-[4px] bg-fifth rounded-full overflow-hidden">
            <div
              className="h-full bg-customColor4 rounded-full transition-all"
              style={{ width: `${Math.min(usagePercent, 100)}%` }}
            />
          </div>
        </div>
      )}

      <div className="flex gap-[8px] flex-wrap">
        {provider.type !== 'LOCAL' && (
          <>
            {provider.mounted ? (
              <button
                onClick={() => onUnmount(provider.id)}
                className="text-[11px] px-[8px] py-[4px] rounded-[6px] bg-fifth text-[#f87171] hover:bg-[#3a2a2a] transition-colors"
              >
                Unmount
              </button>
            ) : (
              <button
                onClick={() => onMount(provider.id)}
                className="text-[11px] px-[8px] py-[4px] rounded-[6px] bg-fifth text-customColor4 hover:bg-[#1a3a1a] transition-colors"
              >
                Mount
              </button>
            )}
          </>
        )}
        <button
          onClick={() => onEdit(provider.id)}
          className="text-[11px] px-[8px] py-[4px] rounded-[6px] bg-fifth text-customColor18 hover:bg-[#3a3a3a] transition-colors"
        >
          Edit
        </button>
        <button
          onClick={() => onTest(provider.id)}
          className="text-[11px] px-[8px] py-[4px] rounded-[6px] bg-fifth text-[#60a5fa] hover:bg-[#1a2a3a] transition-colors"
        >
          Test
        </button>
        {provider.type !== 'LOCAL' && hasOtherProviders && (
          <button
            onClick={() => onMigrate?.(provider.id)}
            className="text-[11px] px-[8px] py-[4px] rounded-[6px] bg-fifth text-[#f59e0b] hover:bg-[#3a2a1a] transition-colors"
          >
            Migrate
          </button>
        )}
        {provider.type !== 'LOCAL' && (
          <button
            onClick={() => onDelete(provider.id)}
            className="text-[11px] px-[8px] py-[4px] rounded-[6px] bg-fifth text-[#f87171] hover:bg-[#3a1a1a] transition-colors ml-auto"
          >
            Delete
          </button>
        )}
      </div>
    </div>
  );
};
