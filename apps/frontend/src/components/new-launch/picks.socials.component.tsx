'use client';

import { FC, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import SafeImage from '@gitroom/react/helpers/safe.image';
import { useLaunchStore } from '@gitroom/frontend/components/new-launch/store';
import { useShallow } from 'zustand/react/shallow';
import { useExistingData } from '@gitroom/frontend/components/launches/helpers/use.existing.data';
import ImageWithFallback from '@gitroom/react/helpers/image.with.fallback';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { Integrations } from '@gitroom/frontend/components/launches/calendar.context';

const CHANNEL_SELECTOR_THRESHOLD = 4;

const PlatformAvatar: FC<{
  integration: Integrations;
  selected: boolean;
  size?: number;
}> = ({ integration, selected, size = 42 }) => {
  return (
    <div
      className={clsx(
        'relative rounded-full flex justify-center items-center bg-newTableHeader filter transition-all duration-500',
        selected ? 'border-[2px] border-[#622FF6]' : 'border-[2px] border-transparent'
      )}
    >
      <ImageWithFallback
        fallbackSrc="/no-picture.jpg"
        src={integration.picture || '/no-picture.jpg'}
        className={clsx(
          'rounded-full transition-all border-[1.5px]',
          selected ? 'border-[#000]' : 'border-transparent'
        )}
        style={{ minWidth: size, minHeight: size, width: size, height: size }}
        alt={integration.identifier}
        width={size}
        height={size}
      />
      {integration.identifier === 'youtube' ? (
        <img
          alt="YouTube"
          src="/icons/platforms/youtube.svg"
          className="absolute z-10 bottom-0 -end-[5px] min-w-[16px]"
          width={16}
        />
      ) : (
        <SafeImage
          src={`/icons/platforms/${integration.identifier}.png`}
          className="rounded-[4px] absolute z-10 bottom-0 -end-[5px] min-w-[16px] min-h-[16px]"
          alt={integration.identifier}
          width={16}
          height={16}
        />
      )}
    </div>
  );
};

export const PicksSocialsComponent: FC<{ toolTip?: boolean }> = ({
  toolTip,
}) => {
  const t = useT();
  const existingData = useExistingData();
  const containerRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const {
    locked,
    addOrRemoveSelectedIntegration,
    integrations,
    selectedIntegrations,
  } = useLaunchStore(
    useShallow((state) => ({
      integrations: state.integrations,
      selectedIntegrations: state.selectedIntegrations,
      addOrRemoveSelectedIntegration: state.addOrRemoveSelectedIntegration,
      locked: state.locked,
    }))
  );

  const selectableIntegrations = useMemo(
    () =>
      integrations.filter((f) => {
        if (existingData.integration) {
          return f.id === existingData.integration;
        }
        return !f.inBetweenSteps && !f.disabled;
      }),
    [integrations, existingData.integration]
  );

  const isSelected = useCallback(
    (id: string) =>
      selectedIntegrations.findIndex((p) => p.integration.id === id) !== -1,
    [selectedIntegrations]
  );

  const filteredIntegrations = useMemo(() => {
    if (!search.trim()) return selectableIntegrations;
    const q = search.trim().toLowerCase();
    return selectableIntegrations.filter(
      (i) =>
        i.name?.toLowerCase().includes(q) ||
        i.identifier?.toLowerCase().includes(q)
    );
  }, [selectableIntegrations, search]);

  const grouped = useMemo(() => {
    const map = new Map<string, Integrations[]>();
    for (const integration of filteredIntegrations) {
      const key = integration.identifier || 'other';
      const list = map.get(key) || [];
      list.push(integration);
      map.set(key, list);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [filteredIntegrations]);

  const toggle = useCallback(
    (integration: Integrations) => {
      if (existingData.integration || locked) return;
      addOrRemoveSelectedIntegration(integration, {});
    },
    [addOrRemoveSelectedIntegration, existingData.integration, locked]
  );

  // Click-outside + Escape close, mirroring CreateMenu/UserAvatarMenu.
  useEffect(() => {
    if (!open) return;
    const handleMouseDown = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  const selectedList = selectedIntegrations.filter((s) =>
    selectableIntegrations.some((i) => i.id === s.integration.id)
  );

  const useDropdown = selectableIntegrations.length > CHANNEL_SELECTOR_THRESHOLD;

  if (useDropdown) {
    return (
      <div
        ref={containerRef}
        className={clsx(
          'relative',
          open && 'z-[100]',
          locked && 'opacity-50 pointer-events-none'
        )}
      >
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-haspopup="listbox"
          aria-expanded={open}
          className="flex items-center gap-[10px] px-[12px] py-[6px] rounded-full border border-newColColor bg-newBgColor hover:bg-boxHover transition-colors"
        >
          <div className="flex -space-x-[10px]">
            {selectedList.slice(0, 4).map(({ integration }) => (
              <div
                key={integration.id}
                className="rounded-full border-[2px] border-newBgColor"
              >
                <PlatformAvatar integration={integration} selected size={28} />
              </div>
            ))}
            {selectedList.length > 4 && (
              <div className="rounded-full border-[2px] border-newBgColor bg-boxHover w-[28px] h-[28px] flex items-center justify-center text-[11px] font-semibold text-textColor">
                +{selectedList.length - 4}
              </div>
            )}
            {selectedList.length === 0 && (
              <div className="text-[13px] text-newTableText">
                {t('select_channels', 'Select channels')}
              </div>
            )}
          </div>
          {selectedList.length > 0 && (
            <span className="text-[13px] font-medium text-textColor">
              {selectedList.length}{' '}
              {selectedList.length === 1
                ? t('channel', 'channel')
                : t('channels', 'channels')}
            </span>
          )}
          <svg
            className={clsx(
              'w-[14px] h-[14px] text-textColor transition-transform',
              open && 'rotate-180'
            )}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M19 9l-7 7-7-7"
            />
          </svg>
        </button>

        {open && (
          <div
            role="listbox"
            aria-label={t('channels', 'Channels')}
            className="absolute z-[100] top-[calc(100%+8px)] left-0 w-[320px] max-h-[360px] bg-newBgColor border border-newBorder rounded-[12px] shadow-lg flex flex-col"
          >
            <div className="p-[12px] border-b border-newBorder">
              <div className="relative">
                <svg
                  className="absolute left-[12px] top-1/2 -translate-y-1/2 w-[16px] h-[16px] text-newTextColor/40"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z"
                  />
                </svg>
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={t('search_channels', 'Search channels...')}
                  className="w-full h-[40px] pl-[38px] pr-[12px] rounded-[8px] bg-newBgColorInner border border-newColColor text-[14px] text-textColor outline-none focus:border-[#2B5CD3]"
                />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-[8px]">
              {filteredIntegrations.length === 0 && (
                <div className="text-[13px] text-newTableText text-center py-[16px]">
                  {t('no_channels_found', 'No channels found')}
                </div>
              )}
              {grouped.map(([platform, items]) => (
                <div key={platform} className="mb-[8px]">
                  <div className="sticky top-0 bg-newBgColor text-[11px] uppercase tracking-wider text-newTableText px-[8px] py-[4px] z-[1]">
                    {platform}
                  </div>
                  <div className="flex flex-col gap-[2px]">
                    {items.map((integration) => {
                      const selected = isSelected(integration.id);
                      return (
                        <button
                          key={integration.id}
                          type="button"
                          role="option"
                          aria-selected={selected}
                          onClick={() => toggle(integration)}
                          className={clsx(
                            'flex items-center gap-[10px] w-full px-[8px] py-[8px] rounded-[8px] text-left transition-colors',
                            selected
                              ? 'bg-[#2B5CD3]/15 text-textColor'
                              : 'hover:bg-boxHover text-textColor'
                          )}
                        >
                          <div
                            className={clsx(
                              'w-[18px] h-[18px] rounded-[4px] border flex items-center justify-center shrink-0',
                              selected
                                ? 'bg-[#2B5CD3] border-[#2B5CD3]'
                                : 'border-newColColor'
                            )}
                          >
                            {selected && (
                              <svg
                                width="12"
                                height="12"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="white"
                                strokeWidth={3}
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              >
                                <path d="M5 12l5 5L20 7" />
                              </svg>
                            )}
                          </div>
                          <PlatformAvatar
                            integration={integration}
                            selected={false}
                            size={28}
                          />
                          <span className="flex-1 text-[13px] truncate">
                            {integration.name}
                          </span>
                          <SafeImage
                            src={`/icons/platforms/${integration.identifier}.png`}
                            className="rounded-[4px] min-w-[16px] min-h-[16px]"
                            alt={integration.identifier}
                            width={16}
                            height={16}
                          />
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  // Icon-row mode (≤4 selectable integrations)
  return (
    <div className={clsx('flex', locked && 'opacity-50 pointer-events-none')}>
      <div className="flex flex-1">
        <div className="innerComponent flex-1 flex">
          <div className="flex flex-wrap gap-[12px] flex-1">
            {selectableIntegrations.map((integration) => {
              const selected = isSelected(integration.id);
              return (
                <div
                  key={integration.id}
                  className="flex gap-[8px] items-center"
                  {...(toolTip && {
                    'data-tooltip-id': 'tooltip',
                    'data-tooltip-content': integration.name,
                  })}
                >
                  <div
                    onClick={() => toggle(integration)}
                    className={clsx(
                      'cursor-pointer border-[2px] relative rounded-full flex justify-center items-center bg-newTableHeader filter transition-all duration-500',
                      selected
                        ? 'border-[#622FF6]'
                        : 'grayscale border-transparent'
                    )}
                  >
                    <PlatformAvatar
                      integration={integration}
                      selected={selected}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
