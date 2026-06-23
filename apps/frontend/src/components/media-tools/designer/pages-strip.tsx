'use client';

import React, { FC } from 'react';
import type { DesignerPage } from './designer.store';

interface PagesStripProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  store: any;
}

// Multi-page UI (D1): page thumbnails with add / duplicate / remove / reorder / select.
export const PagesStrip: FC<PagesStripProps> = ({ store }) => {
  const doc = store((s: any) => s.doc);
  const currentPage = store((s: any) => s.currentPage);
  const setCurrentPage = store((s: any) => s.setCurrentPage);
  const addPage = store((s: any) => s.addPage);
  const removePage = store((s: any) => s.removePage);
  const duplicatePage = store((s: any) => s.duplicatePage);
  const movePage = store((s: any) => s.movePage);

  const pages: DesignerPage[] = doc.pages;
  // Only show the strip once there is more than one page or on hover-add.
  const aspect = doc.width / doc.height;
  const thumbH = 56;
  const thumbW = Math.max(32, Math.min(96, thumbH * aspect));

  return (
    <div className="shrink-0 flex items-center gap-2 px-3 py-2 border-t border-newBorder bg-newBgColorInner overflow-x-auto">
      {pages.map((p, i) => (
        <div key={p.id} className="relative group shrink-0">
          <button
            onClick={() => setCurrentPage(i)}
            aria-label={`Page ${i + 1}`}
            aria-current={i === currentPage}
            className={`relative rounded-md border-2 overflow-hidden flex items-center justify-center text-[10px] text-gray-400 ${
              i === currentPage ? 'border-[#2B5CD3]' : 'border-newBorder hover:border-newColColor'
            }`}
            style={{ width: thumbW, height: thumbH, background: p.bg?.color || p.background || '#fff' }}
          >
            <span className="absolute bottom-0.5 left-0.5 px-1 rounded bg-black/40 text-white text-[9px]">
              {i + 1}
            </span>
          </button>
          <div className="absolute -top-1 -right-1 hidden group-hover:flex items-center gap-0.5">
            {i > 0 && (
              <button
                onClick={() => movePage(i, i - 1)}
                title="Move left"
                className="w-4 h-4 flex items-center justify-center rounded bg-[#1e1e2e] border border-newBorder text-[9px] text-textColor"
              >
                ‹
              </button>
            )}
            <button
              onClick={() => duplicatePage(i)}
              title="Duplicate page"
              className="w-4 h-4 flex items-center justify-center rounded bg-[#1e1e2e] border border-newBorder text-[9px] text-textColor"
            >
              ⧉
            </button>
            {pages.length > 1 && (
              <button
                onClick={() => removePage(i)}
                title="Delete page"
                className="w-4 h-4 flex items-center justify-center rounded bg-[#1e1e2e] border border-newBorder text-[9px] text-red-400"
              >
                ×
              </button>
            )}
          </div>
        </div>
      ))}
      <button
        onClick={() => addPage()}
        title="Add page"
        aria-label="Add page"
        className="shrink-0 flex items-center justify-center rounded-md border-2 border-dashed border-newBorder text-textColor/50 hover:border-[#2B5CD3] hover:text-[#2B5CD3] text-[18px]"
        style={{ width: thumbW, height: thumbH }}
      >
        +
      </button>
    </div>
  );
};
