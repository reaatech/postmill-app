'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useReplicateStore, type CategoryDefinition } from './replicate.store';
import { useGenerate } from './use-generate';
import { missingRequiredFields } from './use-generate';

interface PaletteAction {
  id: string;
  label: string;
  hint?: string;
  keywords: string[];
  enabled: () => boolean;
  run: () => void;
}

const MEDIUM_LABEL: Record<string, string> = {
  image: 'Image',
  video: 'Video',
  audio: 'Audio',
};

/**
 * ⌘K command palette for Replicate Studio. A single action list (categories +
 * generate/new) drives the palette; the same list shape is reused by the header
 * menu so the two never diverge (the Designer's actions.ts pattern).
 */
export function CommandPalette({ categories }: { categories: CategoryDefinition[] }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const openRef = useRef(false);

  // Reset is done in event handlers (open/close), never synchronously in an effect.
  const closePalette = useCallback(() => {
    setOpen(false);
    setQuery('');
    setActive(0);
  }, []);
  const openPalette = useCallback(() => {
    setQuery('');
    setActive(0);
    setOpen(true);
  }, []);

  const setCategory = useReplicateStore((s) => s.setCategory);
  const setResult = useReplicateStore((s) => s.setResult);
  const setError = useReplicateStore((s) => s.setError);
  const setRunState = useReplicateStore((s) => s.setRunState);
  const generate = useGenerate();

  const actions = useMemo<PaletteAction[]>(() => {
    const list: PaletteAction[] = categories.map((cat) => ({
      id: `goto-${cat.key}`,
      label: `Go to ${cat.label}`,
      hint: MEDIUM_LABEL[cat.medium],
      keywords: [cat.label, cat.medium, cat.key, 'category', 'switch'],
      enabled: () => true,
      run: () => setCategory(cat.key),
    }));
    list.push({
      id: 'generate',
      label: 'Generate',
      hint: '↵',
      keywords: ['generate', 'run', 'create'],
      enabled: () => {
        const s = useReplicateStore.getState();
        if (!s.selectedModel || s.runState === 'running') return false;
        const schema = s.selectedModel.inputSchema as { required?: string[] } | undefined;
        return missingRequiredFields(schema, s.formInput).length === 0;
      },
      run: () => generate(),
    });
    list.push({
      id: 'new',
      label: 'New / clear output',
      keywords: ['new', 'clear', 'reset', 'output'],
      enabled: () => true,
      run: () => {
        setResult(null);
        setError(null);
        setRunState('idle');
      },
    });
    return list;
  }, [categories, setCategory, generate, setResult, setError, setRunState]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const enabled = actions.filter((a) => a.enabled());
    if (!q) return enabled;
    return enabled.filter(
      (a) => a.label.toLowerCase().includes(q) || a.keywords.some((k) => k.toLowerCase().includes(q))
    );
  }, [actions, query]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (openRef.current) closePalette();
        else openPalette();
      }
      if (e.key === 'Escape') closePalette();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openPalette, closePalette]);

  // Sync the open ref + focus the input — DOM synchronisation, no setState here.
  useEffect(() => {
    openRef.current = open;
    if (open) setTimeout(() => inputRef.current?.focus(), 0);
  }, [open]);

  const choose = useCallback(
    (a: PaletteAction) => {
      a.run();
      closePalette();
    },
    [closePalette]
  );

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/50 flex items-start justify-center pt-[15vh]"
      onClick={closePalette}
    >
      <div
        className="w-full max-w-lg rounded-xl border border-studioBorder bg-newBgColor shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setActive((a) => Math.min(a + 1, filtered.length - 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActive((a) => Math.max(a - 1, 0));
            } else if (e.key === 'Enter' && filtered[active]) {
              e.preventDefault();
              choose(filtered[active]);
            }
          }}
          placeholder="Search commands…"
          className="w-full px-4 py-3 bg-transparent text-textColor text-sm focus:outline-none border-b border-studioBorder"
        />
        <div className="max-h-80 overflow-y-auto py-1">
          {filtered.length === 0 && (
            <div className="px-4 py-6 text-center text-xs text-newTextColor/50">No commands</div>
          )}
          {filtered.map((a, i) => (
            <button
              key={a.id}
              onMouseEnter={() => setActive(i)}
              onClick={() => choose(a)}
              className={`w-full flex items-center justify-between px-4 py-2 text-left text-sm ${
                i === active ? 'bg-designerAccent/20 text-textColor' : 'text-newTextColor/80'
              }`}
            >
              <span>{a.label}</span>
              {a.hint && <span className="text-[10px] text-newTextColor/50">{a.hint}</span>}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
