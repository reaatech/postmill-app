'use client';

import React, { FC } from 'react';
import { useFullscreen } from './use-fullscreen';

// Self-contained full-screen toggle for the media studios — drop it into any
// studio header. Hidden when the browser doesn't support the Fullscreen API.
export const FullscreenButton: FC<{ className?: string }> = ({ className }) => {
  const { isFullscreen, toggle, supported } = useFullscreen();
  if (!supported) return null;

  return (
    <button
      type="button"
      onClick={toggle}
      title={isFullscreen ? 'Exit full screen (Esc)' : 'Full screen'}
      aria-label={isFullscreen ? 'Exit full screen' : 'Enter full screen'}
      className={
        className ??
        'w-[28px] h-[28px] flex items-center justify-center rounded-[6px] text-newTextColor/60 hover:text-textColor hover:bg-boxHover transition-colors shrink-0'
      }
    >
      {isFullscreen ? (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M8 3v3a2 2 0 0 1-2 2H3M21 8h-3a2 2 0 0 1-2-2V3M3 16h3a2 2 0 0 1 2 2v3M16 21v-3a2 2 0 0 1 2-2h3" />
        </svg>
      ) : (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M8 21H5a2 2 0 0 1-2-2v-3M16 21h3a2 2 0 0 0 2-2v-3" />
        </svg>
      )}
    </button>
  );
};
