'use client';

import React, { ReactNode } from 'react';
import Link from 'next/link';

export interface ProviderConfigItem {
  id: string;
  identifier: string;
  name: string;
  enabled: boolean;
  isActive?: boolean;
  isConfigured?: boolean;
  mounted?: boolean;
  status?: string[];
  capabilities?: string[];
}

export interface ProviderListShellProps {
  providers: ProviderConfigItem[];
  onConfigure: (identifier: string) => void;
  onSetActive?: (identifier: string) => void;
  onRemove: (identifier: string) => void;
  onToggle?: (identifier: string, enabled: boolean) => void;
  title: string;
  description?: string;
  ProviderIconComponent: React.FC<{ identifier: string; name: string; size?: number }>;
  getProviderHref?: (provider: ProviderConfigItem) => string | undefined;
  renderBadges?: (provider: ProviderConfigItem) => ReactNode;
  renderActions?: (provider: ProviderConfigItem) => ReactNode;
  addProviderButton?: ReactNode;
  toolbar?: ReactNode;
}

const STATUS_STYLES: Record<string, string> = {
  active: 'bg-green-900/20 text-green-400',
  configured: 'bg-blue-900/20 text-blue-400',
  enabled: 'bg-green-900/20 text-green-400',
  mounted: 'bg-[#1a3a1a] text-textColor',
  disabled: 'bg-[#3a1a1a] text-[#f87171]',
};

const ProviderListShell: React.FC<ProviderListShellProps> = ({
  providers,
  onConfigure,
  onSetActive,
  onRemove,
  onToggle,
  title,
  description,
  ProviderIconComponent,
  getProviderHref,
  renderBadges,
  renderActions,
  addProviderButton,
  toolbar,
}) => {
  return (
    <div className="flex flex-col gap-[16px]">
      {(title || description || addProviderButton) && (
        <div className="flex items-center justify-between">
          <div className="flex flex-col gap-[4px]">
            {title && <h3 className="text-[20px] font-semibold">{title}</h3>}
            {description && (
              <p className="text-[13px] text-newTableText">{description}</p>
            )}
          </div>
          {addProviderButton}
        </div>
      )}

      {toolbar}

      <div className="flex flex-col gap-[8px]">
        {providers.length === 0 ? (
          <div className="bg-newBgColorInner border border-newTableBorder rounded-[12px] p-[24px] text-center">
            <span className="text-[13px] text-newTableText">
              No providers configured. Use the button above to add one.
            </span>
          </div>
        ) : (
          providers.map((provider) => (
            <div
              key={provider.id || provider.identifier}
              className="bg-newBgColorInner border border-newTableBorder rounded-[12px] p-[16px] flex items-center gap-[12px]"
            >
              <ProviderIconComponent
                identifier={provider.identifier}
                name={provider.name}
                size={40}
              />

              <div className="flex flex-col gap-[4px] flex-1 min-w-0">
                <div className="flex items-center gap-[8px] flex-wrap">
                  {(() => {
                    const href = getProviderHref?.(provider);
                    return href ? (
                      <Link
                        href={href}
                        className="text-[14px] font-semibold truncate hover:text-btnPrimary hover:underline transition-colors"
                      >
                        {provider.name}
                      </Link>
                    ) : (
                      <span className="text-[14px] font-semibold truncate">
                        {provider.name}
                      </span>
                    );
                  })()}
                  {(provider.status || []).map((s) => (
                    <span
                      key={s}
                      className={`text-[11px] rounded-[4px] px-[8px] py-[2px] font-medium ${
                        STATUS_STYLES[s] || 'bg-newTableHeader text-newTableText'
                      }`}
                    >
                      {s.charAt(0).toUpperCase() + s.slice(1)}
                    </span>
                  ))}
                  {provider.isActive && (
                    <span className="text-[11px] bg-green-900/20 text-green-400 rounded-[4px] px-[8px] py-[2px]">
                      Active
                    </span>
                  )}
                  {provider.mounted && (
                    <span className="text-[11px] bg-[#1a3a1a] text-textColor rounded-[4px] px-[8px] py-[2px]">
                      Mounted
                    </span>
                  )}
                </div>

                {renderBadges ? (
                  renderBadges(provider)
                ) : (
                  (provider.capabilities && provider.capabilities.length > 0) && (
                    <div className="flex gap-[4px] mt-[4px] flex-wrap">
                      {provider.capabilities.map((cap) => (
                        <span
                          key={cap}
                          className="text-[10px] bg-newTableText/20 text-newTableText rounded-[2px] px-[4px] py-[1px]"
                        >
                          {cap}
                        </span>
                      ))}
                    </div>
                  )
                )}
              </div>

              <div className="flex items-center gap-[8px] shrink-0">
                {renderActions ? (
                  renderActions(provider)
                ) : (
                  <>
                    <button
                      className="text-[12px] text-btnPrimary hover:underline"
                      onClick={() => onConfigure(provider.identifier)}
                    >
                      {provider.isConfigured ? 'Edit' : 'Configure'}
                    </button>
                    {provider.isConfigured && onSetActive && !provider.isActive && (
                      <button
                        className="text-[12px] text-btnPrimary hover:underline"
                        onClick={() => onSetActive(provider.identifier)}
                      >
                        Set Active
                      </button>
                    )}
                    {onToggle && provider.isConfigured && (
                      <label className="flex items-center gap-[4px] cursor-pointer">
                        <span className="text-[11px] text-newTableText">
                          {provider.enabled ? 'On' : 'Off'}
                        </span>
                        <input
                          type="checkbox"
                          className="accent-btnPrimary w-[14px] h-[14px]"
                          checked={provider.enabled}
                          onChange={(e) => onToggle(provider.identifier, e.target.checked)}
                        />
                      </label>
                    )}
                    {provider.isConfigured && (
                      <button
                        className="text-[12px] text-red-500 hover:underline"
                        onClick={() => onRemove(provider.identifier)}
                      >
                        Remove
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default ProviderListShell;
