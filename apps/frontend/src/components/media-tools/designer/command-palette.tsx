'use client';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { actionLabel, menuLabel, type DesignerAction } from './actions';

interface CommandPaletteProps {
  actions: DesignerAction[];
}

// ⌘K command palette. Renders from the shared action registry (actions.ts) so
// every command stays defined in exactly one place.
export const CommandPalette: React.FC<CommandPaletteProps> = ({ actions }) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const returnRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        if (!open) returnRef.current = document.activeElement as HTMLElement;
        setOpen((v) => !v);
      }
      if (e.key === 'Escape' && open) setOpen(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open]);

  useEffect(() => {
    if (open) {
      inputRef.current?.focus();
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const el = containerRef.current;
    if (!el) return;
    const focusable = el.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    const first = focusable[0] as HTMLElement | undefined;
    const last = focusable[focusable.length - 1] as HTMLElement | undefined;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Tab') {
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    el.addEventListener('keydown', handler);
    first?.focus();
    return () => {
      el.removeEventListener('keydown', handler);
      returnRef.current?.focus();
      returnRef.current = null;
    };
  }, [open]);

  // Only runnable (enabled) commands appear in the palette.
  const available = actions.filter((a) => !a.enabled || a.enabled());

  const filtered = available.filter((a) => {
    if (!query) return true;
    const q = query.toLowerCase();
    return (
      actionLabel(a).toLowerCase().includes(q) ||
      (a.keywords || []).some((k) => k.toLowerCase().includes(q))
    );
  });

  const grouped = filtered.reduce(
    (acc, a) => {
      const cat = menuLabel(a.menu);
      (acc[cat] = acc[cat] || []).push(a);
      return acc;
    },
    {} as Record<string, DesignerAction[]>
  );

  const executeAction = useCallback((action: DesignerAction) => {
    action.run();
    setOpen(false);
    setQuery('');
    setSelectedIndex(0);
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!open) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1));
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
      }
      if (e.key === 'Enter' && filtered[selectedIndex]) {
        e.preventDefault();
        executeAction(filtered[selectedIndex]);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, filtered, selectedIndex, executeAction]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-start justify-center pt-[15vh]"
      onClick={() => setOpen(false)}
    >
      <div
        ref={containerRef}
        className="bg-[#1a1a2e] border border-[#2a2a4a] rounded-xl w-[560px] max-h-[400px] flex flex-col shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          className="w-full px-4 py-3 bg-transparent text-white text-lg outline-none border-b border-[#2a2a4a] placeholder-gray-500"
          placeholder="Type a command..."
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setSelectedIndex(0);
          }}
        />
        <div className="flex-1 overflow-y-auto p-2">
          {Object.entries(grouped).map(([category, items]) => (
            <div key={category}>
              <div className="px-3 py-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                {category}
              </div>
              {items.map((action) => {
                const globalIndex = filtered.indexOf(action);
                return (
                  <button
                    key={action.id}
                    className={`w-full text-left px-3 py-2 rounded text-sm flex items-center gap-3 ${
                      globalIndex === selectedIndex
                        ? 'bg-designerAccent text-white'
                        : 'text-gray-300 hover:bg-white/5'
                    }`}
                    onClick={() => executeAction(action)}
                    onMouseEnter={() => setSelectedIndex(globalIndex)}
                  >
                    <span className="flex-1">{actionLabel(action)}</span>
                    {action.shortcut && (
                      <span className="text-xs text-gray-500">{action.shortcut}</span>
                    )}
                    <span className="text-xs text-gray-500">{menuLabel(action.menu)}</span>
                  </button>
                );
              })}
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="px-3 py-6 text-center text-sm text-gray-500">
              No matching commands
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
