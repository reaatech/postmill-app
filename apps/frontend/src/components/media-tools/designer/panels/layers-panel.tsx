'use client';

import React, { FC, useCallback, useRef, useState } from 'react';
import type { DesignerElement } from '../designer.store';

interface LayersPanelProps {
  store: ReturnType<typeof import('../designer.store').createDesignerStore>;
  onClose?: () => void;
}

const elementIcon: Record<string, string> = {
  text: 'T',
  image: '▣',
  shape: '◇',
};

const elementLabel = (el: DesignerElement): string => {
  if (el.name) return el.name;
  if (el.type === 'text') {
    const text = (el.text || '').slice(0, 20);
    return text ? `"${text}"` : 'Text';
  }
  if (el.type === 'image') return 'Image';
  if (el.type === 'shape') return el.shape ? `Shape (${el.shape})` : 'Shape';
  return 'Element';
};

export const LayersPanel: FC<LayersPanelProps> = ({ store }) => {
  const elements = store((s) => s.doc.pages[s.currentPage]?.children || []);
  const selectedIds = store((s) => s.selectedIds);
  const currentPage = store((s) => s.currentPage);

  const reversed = [...elements].reverse();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState('');
  const rowRefs = useRef<(HTMLDivElement | null)[]>([]);

  const selectElement = useCallback(
    (id: string) => {
      store.getState().setSelectedIds([id]);
    },
    [store]
  );

  const startRename = useCallback((el: DesignerElement) => {
    setEditingId(el.id);
    setDraftName(elementLabel(el));
  }, []);

  const commitRename = useCallback(() => {
    if (!editingId) return;
    const trimmed = draftName.trim();
    store.getState().updateElement(editingId, { name: trimmed || undefined });
    store.getState().pushHistory();
    setEditingId(null);
  }, [editingId, draftName, store]);

  const cancelRename = useCallback(() => {
    setEditingId(null);
  }, []);

  const toggleVisibility = useCallback(
    (e: React.MouseEvent, id: string) => {
      e.stopPropagation();
      const children = store.getState().doc.pages[currentPage]?.children || [];
      const el = children.find((c) => c.id === id);
      if (el) {
        store.getState().updateElement(id, { hidden: !el.hidden });
        store.getState().pushHistory();
      }
    },
    [store, currentPage]
  );

  const toggleLock = useCallback(
    (e: React.MouseEvent, id: string) => {
      e.stopPropagation();
      const children = store.getState().doc.pages[currentPage]?.children || [];
      const el = children.find((c) => c.id === id);
      if (el) {
        store.getState().updateElement(id, { locked: !el.locked });
        store.getState().pushHistory();
      }
    },
    [store, currentPage]
  );

  const moveUp = useCallback(
    (e: React.MouseEvent, index: number) => {
      e.stopPropagation();
      const children = store.getState().doc.pages[currentPage]?.children || [];
      if (index >= children.length - 1) return;
      const newElements = [...children];
      [newElements[index], newElements[index + 1]] = [newElements[index + 1], newElements[index]];
      const page = store.getState().doc.pages[currentPage];
      store.getState().setDoc({
        ...store.getState().doc,
        pages: [{ ...page, children: newElements }],
      });
      store.getState().pushHistory();
    },
    [store, currentPage]
  );

  const moveDown = useCallback(
    (e: React.MouseEvent, index: number) => {
      e.stopPropagation();
      const children = store.getState().doc.pages[currentPage]?.children || [];
      if (index <= 0) return;
      const newElements = [...children];
      [newElements[index], newElements[index - 1]] = [newElements[index - 1], newElements[index]];
      const page = store.getState().doc.pages[currentPage];
      store.getState().setDoc({
        ...store.getState().doc,
        pages: [{ ...page, children: newElements }],
      });
      store.getState().pushHistory();
    },
    [store, currentPage]
  );

  const handlePanelKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (editingId) return;
      const target = e.target as HTMLElement;
      const row = target.closest('[data-layer-row]') as HTMLDivElement | null;
      if (!row) return;
      const idx = Number(row.dataset.index);
      const id = row.dataset.elementId;
      if (Number.isNaN(idx) || !id) return;

      const isActionButton = !!target.closest('[data-row-action]');
      const children = store.getState().doc.pages[currentPage]?.children || [];
      const total = children.length;
      const el = children.find((c) => c.id === id);
      if (!el) return;

      switch (e.key) {
        case 'ArrowUp':
          e.preventDefault();
          if (idx > 0) {
            rowRefs.current[idx - 1]?.focus();
          }
          break;
        case 'ArrowDown':
          e.preventDefault();
          if (idx < total - 1) {
            rowRefs.current[idx + 1]?.focus();
          }
          break;
        case 'Enter':
          if (isActionButton) return;
          e.preventDefault();
          selectElement(el.id);
          startRename(el);
          break;
        case ' ':
          if (isActionButton) return;
          e.preventDefault();
          selectElement(el.id);
          break;
      }
    },
    [editingId, store, currentPage, selectElement, startRename]
  );

  if (!elements.length) {
    return (
      <div className="text-[12px] text-newTextColor/40 text-center py-4">
        No elements on this page
      </div>
    );
  }

  return (
    <div
      className="flex flex-col gap-1"
      role="listbox"
      aria-label="Layers"
      onKeyDown={handlePanelKeyDown}
    >
      {reversed.map((el, reversedIdx) => {
        const idx = elements.length - 1 - reversedIdx;
        const isSelected = selectedIds.includes(el.id);
        const isEditing = editingId === el.id;
        return (
          <div
            key={el.id}
            ref={(node) => {
              rowRefs.current[reversedIdx] = node;
            }}
            data-layer-row
            data-index={reversedIdx}
            data-element-id={el.id}
            role="option"
            tabIndex={isEditing ? -1 : 0}
            aria-selected={isSelected}
            aria-label={`Layer ${elementLabel(el)}`}
            onClick={() => {
              if (!isEditing) {
                selectElement(el.id);
              }
            }}
            className={`flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer text-[12px] transition-all outline-none focus-visible:ring-2 focus-visible:ring-[#2B5CD3] ${
              isSelected
                ? 'bg-[#2B5CD3]/20 text-textColor'
                : 'text-newTextColor/60 hover:bg-newColColor/10 hover:text-textColor'
            }`}
          >
            <div className="w-5 h-5 flex items-center justify-center text-[11px] font-bold text-[#2B5CD3] shrink-0">
              {elementIcon[el.type] || '?'}
            </div>

            {isEditing ? (
              <input
                type="text"
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                onBlur={commitRename}
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === 'Enter') {
                    commitRename();
                  } else if (e.key === 'Escape') {
                    cancelRename();
                  }
                }}
                autoFocus
                className="flex-1 h-[22px] px-1.5 rounded-[4px] bg-newBgColor border border-[#2B5CD3] text-[11px] text-textColor outline-none"
              />
            ) : (
              <div className="flex-1 truncate text-[11px]">{elementLabel(el)}</div>
            )}

            <div className="flex items-center gap-0.5 shrink-0">
              <button
                type="button"
                data-row-action
                onClick={(e) => moveDown(e, idx)}
                className="w-5 h-5 flex items-center justify-center rounded hover:bg-newColColor/20 text-[10px]"
                title="Move down"
                aria-label="Move layer down"
              >
                ↑
              </button>
              <button
                type="button"
                data-row-action
                onClick={(e) => moveUp(e, idx)}
                className="w-5 h-5 flex items-center justify-center rounded hover:bg-newColColor/20 text-[10px]"
                title="Move up"
                aria-label="Move layer up"
              >
                ↓
              </button>
            </div>

            <div className="flex items-center gap-0.5 shrink-0">
              <button
                type="button"
                data-row-action
                onClick={(e) => toggleVisibility(e, el.id)}
                className={`w-5 h-5 flex items-center justify-center rounded hover:bg-newColColor/20 text-[11px] ${
                  el.hidden ? 'text-newTextColor/20' : 'text-newTextColor/60'
                }`}
                title={el.hidden ? 'Show' : 'Hide'}
                aria-label={el.hidden ? 'Show layer' : 'Hide layer'}
              >
                {el.hidden ? '◌' : '◎'}
              </button>
              <button
                type="button"
                data-row-action
                onClick={(e) => toggleLock(e, el.id)}
                className={`w-5 h-5 flex items-center justify-center rounded hover:bg-newColColor/20 text-[10px] ${
                  el.locked ? 'text-[#2B5CD3]' : 'text-newTextColor/40'
                }`}
                title={el.locked ? 'Unlock' : 'Lock'}
                aria-label={el.locked ? 'Unlock layer' : 'Lock layer'}
              >
                {el.locked ? '◉' : '○'}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
};
