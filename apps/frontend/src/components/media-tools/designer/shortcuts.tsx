'use client';

import React, { FC } from 'react';

const SHORTCUTS: { keys: string; label: string }[] = [
  { keys: '⌘/Ctrl + Z', label: 'Undo' },
  { keys: '⌘/Ctrl + Shift + Z', label: 'Redo' },
  { keys: '⌘/Ctrl + C', label: 'Copy' },
  { keys: '⌘/Ctrl + X', label: 'Cut' },
  { keys: '⌘/Ctrl + V', label: 'Paste' },
  { keys: '⌘/Ctrl + D', label: 'Duplicate' },
  { keys: '⌘/Ctrl + A', label: 'Select all' },
  { keys: '⌘/Ctrl + G', label: 'Group' },
  { keys: '⌘/Ctrl + Shift + G', label: 'Ungroup' },
  { keys: 'Delete / Backspace', label: 'Delete selection' },
  { keys: 'Arrows', label: 'Nudge 1px' },
  { keys: 'Shift + Arrows', label: 'Nudge 10px' },
  { keys: 'Enter', label: 'Edit text' },
  { keys: 'Esc', label: 'Deselect' },
  { keys: 'Space + drag', label: 'Pan canvas' },
  { keys: 'Scroll', label: 'Zoom' },
  { keys: 'Shift / ⌘ + click', label: 'Add to selection' },
  { keys: '⌘/Ctrl + K', label: 'Command palette' },
];

export const ShortcutsOverlay: FC<{ onClose: () => void }> = ({ onClose }) => (
  <div className="p-5 w-[420px] max-w-full">
    <div className="flex items-center justify-between mb-4">
      <h3 className="text-[15px] font-semibold text-textColor">Keyboard shortcuts</h3>
      <button onClick={onClose} className="text-textColor/50 hover:text-textColor text-[16px]" aria-label="Close">
        ×
      </button>
    </div>
    <div className="grid grid-cols-1 gap-1.5">
      {SHORTCUTS.map((s) => (
        <div key={s.keys} className="flex items-center justify-between text-[12px]">
          <span className="text-textColor/70">{s.label}</span>
          <kbd className="px-2 py-0.5 rounded bg-newColColor/40 border border-newBorder text-textColor/80 text-[11px]">
            {s.keys}
          </kbd>
        </div>
      ))}
    </div>
  </div>
);
