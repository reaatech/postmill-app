'use client';

import { FC, useEffect, useRef } from 'react';
import { DayDetailResponse } from '../utils';

interface DayDetailPanelProps {
  data?: DayDetailResponse;
  open: boolean;
  onClose: () => void;
}

export const DayDetailPanel: FC<DayDetailPanelProps> = ({ data, open, onClose }) => {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (open) document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  if (!open || !data) return null;

  return (
    <div className="fixed inset-0 z-[100] flex justify-end">
      <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" onClick={onClose} />
      <div
        ref={panelRef}
        className="relative w-full max-w-[520px] bg-newBgColorInner border-l border-newTableBorder h-full overflow-y-auto animate-fadeIn"
      >
        <div className="sticky top-0 bg-newBgColorInner border-b border-newTableBorder px-[20px] py-[14px] flex items-center justify-between z-10">
          <div>
            <h3 className="text-[16px] font-semibold">{data.metric}</h3>
            <p className="text-[12px] text-newTableText">{data.date}</p>
          </div>
          <button onClick={onClose} className="p-[6px] hover:bg-boxHover rounded-[6px] transition-colors">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M4 4L12 12M12 4L4 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="p-[20px] space-y-[20px]">
          <div className="text-[40px] font-semibold leading-tight tabular-nums">
            {new Intl.NumberFormat().format(Math.round(data.value))}
          </div>

          {data.byChannel.length > 0 && (
            <div>
              <h4 className="text-[13px] font-medium text-newTableText mb-[8px]">By Channel</h4>
              <div className="space-y-[6px]">
                {data.byChannel.map((ch) => (
                  <div key={ch.integrationId} className="flex items-center gap-[10px] px-[12px] py-[8px] bg-newTableHeader rounded-[8px]">
                    <img src={ch.picture} alt="" className="w-[24px] h-[24px] rounded-[6px]" />
                    <span className="flex-1 text-[13px] truncate">{ch.name}</span>
                    <span className="text-[14px] font-semibold tabular-nums">
                      {new Intl.NumberFormat().format(Math.round(ch.value))}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {data.posts.length > 0 && (
            <div>
              <h4 className="text-[13px] font-medium text-newTableText mb-[8px]">Posts on this day</h4>
              <div className="space-y-[6px]">
                {data.posts.map((post) => (
                  <div key={post.postId} className="px-[12px] py-[8px] bg-newTableHeader rounded-[8px]">
                    <div className="text-[13px] truncate">{post.content}</div>
                    <div className="flex items-center gap-[8px] mt-[4px]">
                      <img src={post.integration.picture} alt="" className="w-[14px] h-[14px] rounded-[3px]" />
                      <span className="text-[11px] text-newTableText">{post.integration.name}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
