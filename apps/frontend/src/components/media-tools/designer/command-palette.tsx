'use client';
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import type { DesignerStore, DesignerOutput } from './designer.store';

type DesignerStoreApi = ReturnType<
  typeof import('./designer.store').createDesignerStore
>;

interface CommandAction {
  id: string;
  label: string;
  keywords: string[];
  category: string;
  run: () => void;
}

interface CommandPaletteProps {
  store: DesignerStoreApi;
  onExport: () => void;
  onSave: () => void;
  onSaveAsTemplate: () => void;
  showSafeZones: boolean;
  onToggleSafeZones: () => void;
  onAddImage?: () => void;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  store,
  onExport,
  onSave,
  onSaveAsTemplate,
  showSafeZones: _showSafeZones,
  onToggleSafeZones,
  onAddImage,
}) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const returnRef = useRef<HTMLElement | null>(null);

  const s = store.getState();

  const actions: CommandAction[] = useMemo(() => {
    const activeOutput = s.doc.outputs[s.currentOutput];
    const outputWidth = activeOutput.width;
    const outputHeight = activeOutput.height;

    return [
      {
        id: 'add-text',
        label: 'Add Text',
        keywords: ['text', 'add', 'insert'],
        category: 'Elements',
        run: () => {
          const st = store.getState();
          const out = st.doc.outputs[st.currentOutput];
          st.addElement({
            id: '',
            type: 'text',
            x: out.width / 2 - 100,
            y: out.height / 2 - 16,
            width: 200,
            height: 40,
            rotation: 0,
            opacity: 1,
            locked: false,
            hidden: false,
            text: 'Text',
            fontSize: 32,
            fontWeight: 700,
            fontFamily: 'Inter',
            fontStyle: 'normal',
            fill: '#000000',
            align: 'center',
          });
        },
      },
      {
        id: 'add-shape',
        label: 'Add Shape',
        keywords: ['shape', 'rect', 'ellipse', 'add'],
        category: 'Elements',
        run: () => {
          const st = store.getState();
          const out = st.doc.outputs[st.currentOutput];
          st.addElement({
            id: '',
            type: 'shape',
            shape: 'rect',
            x: out.width / 2 - 50,
            y: out.height / 2 - 50,
            width: 100,
            height: 100,
            rotation: 0,
            opacity: 1,
            locked: false,
            hidden: false,
            fill: '#2B5CD3',
          });
        },
      },
      {
        id: 'add-image',
        label: 'Add Image',
        keywords: ['image', 'photo', 'add'],
        category: 'Elements',
        run: () => onAddImage?.(),
      },
      {
        id: 'export',
        label: 'Export',
        keywords: ['export', 'download', 'save'],
        category: 'File',
        run: onExport,
      },
      {
        id: 'save',
        label: 'Save Design',
        keywords: ['save', 'save design'],
        category: 'File',
        run: onSave,
      },
      {
        id: 'save-as-template',
        label: 'Save as Template',
        keywords: ['template', 'save'],
        category: 'File',
        run: onSaveAsTemplate,
      },
      {
        id: 'undo',
        label: 'Undo',
        keywords: ['undo', 'back'],
        category: 'Edit',
        run: () => store.getState().undo(),
      },
      {
        id: 'redo',
        label: 'Redo',
        keywords: ['redo', 'forward'],
        category: 'Edit',
        run: () => store.getState().redo(),
      },
      {
        id: 'delete',
        label: 'Delete Selection',
        keywords: ['delete', 'remove'],
        category: 'Edit',
        run: () => {
          const st = store.getState();
          st.selectedIds.forEach((id) => st.removeElement(id));
        },
      },
      {
        id: 'duplicate',
        label: 'Duplicate',
        keywords: ['duplicate', 'copy'],
        category: 'Edit',
        run: () => {
          const st = store.getState();
          st.selectedIds.forEach((id) => st.duplicateElement(id));
        },
      },
      {
        id: 'select-all',
        label: 'Select All',
        keywords: ['select', 'all'],
        category: 'Edit',
        run: () => {
          const st = store.getState();
          const out = st.doc.outputs[st.currentOutput] as DesignerOutput;
          st.setSelectedIds(out.children.map((c) => c.id));
        },
      },
      {
        id: 'clear-selection',
        label: 'Clear Selection',
        keywords: ['clear', 'deselect', 'none'],
        category: 'Edit',
        run: () => store.getState().setSelectedIds([]),
      },
      {
        id: 'group',
        label: 'Group',
        keywords: ['group'],
        category: 'Arrange',
        run: () => store.getState().groupSelection(),
      },
      {
        id: 'ungroup',
        label: 'Ungroup',
        keywords: ['ungroup'],
        category: 'Arrange',
        run: () => store.getState().ungroupSelection(),
      },
      {
        id: 'bring-front',
        label: 'Bring to Front',
        keywords: ['front', 'order'],
        category: 'Arrange',
        run: () => {
          const st = store.getState();
          st.reorder(st.selectedIds, 'front');
        },
      },
      {
        id: 'send-back',
        label: 'Send to Back',
        keywords: ['back', 'order'],
        category: 'Arrange',
        run: () => {
          const st = store.getState();
          st.reorder(st.selectedIds, 'back');
        },
      },
      {
        id: 'forward',
        label: 'Bring Forward',
        keywords: ['forward', 'order'],
        category: 'Arrange',
        run: () => {
          const st = store.getState();
          st.reorder(st.selectedIds, 'forward');
        },
      },
      {
        id: 'backward',
        label: 'Send Backward',
        keywords: ['backward', 'order'],
        category: 'Arrange',
        run: () => {
          const st = store.getState();
          st.reorder(st.selectedIds, 'backward');
        },
      },
      {
        id: 'align-left',
        label: 'Align Left',
        keywords: ['align', 'left'],
        category: 'Arrange',
        run: () => {
          const st = store.getState();
          st.selectedIds.forEach((id) => {
            st.updateElement(id, { x: 0 });
          });
        },
      },
      {
        id: 'align-center-h',
        label: 'Align Center (H)',
        keywords: ['align', 'center', 'horizontal'],
        category: 'Arrange',
        run: () => {
          const st = store.getState();
          const out = st.doc.outputs[st.currentOutput] as DesignerOutput;
          st.selectedIds.forEach((id) => {
            const el = out.children.find((c) => c.id === id);
            if (el) {
              st.updateElement(id, { x: (out.width - el.width) / 2 });
            }
          });
        },
      },
      {
        id: 'align-right',
        label: 'Align Right',
        keywords: ['align', 'right'],
        category: 'Arrange',
        run: () => {
          const st = store.getState();
          const out = st.doc.outputs[st.currentOutput] as DesignerOutput;
          st.selectedIds.forEach((id) => {
            const el = out.children.find((c) => c.id === id);
            if (el) {
              st.updateElement(id, { x: out.width - el.width });
            }
          });
        },
      },
      {
        id: 'align-top',
        label: 'Align Top',
        keywords: ['align', 'top'],
        category: 'Arrange',
        run: () => {
          const st = store.getState();
          st.selectedIds.forEach((id) => {
            st.updateElement(id, { y: 0 });
          });
        },
      },
      {
        id: 'align-middle',
        label: 'Align Middle (V)',
        keywords: ['align', 'middle', 'vertical'],
        category: 'Arrange',
        run: () => {
          const st = store.getState();
          const out = st.doc.outputs[st.currentOutput] as DesignerOutput;
          st.selectedIds.forEach((id) => {
            const el = out.children.find((c) => c.id === id);
            if (el) {
              st.updateElement(id, { y: (out.height - el.height) / 2 });
            }
          });
        },
      },
      {
        id: 'align-bottom',
        label: 'Align Bottom',
        keywords: ['align', 'bottom'],
        category: 'Arrange',
        run: () => {
          const st = store.getState();
          const out = st.doc.outputs[st.currentOutput] as DesignerOutput;
          st.selectedIds.forEach((id) => {
            const el = out.children.find((c) => c.id === id);
            if (el) {
              st.updateElement(id, { y: out.height - el.height });
            }
          });
        },
      },
      {
        id: 'toggle-safe-zones',
        label: 'Toggle Safe Zones',
        keywords: ['safe', 'zones'],
        category: 'View',
        run: onToggleSafeZones,
      },
      {
        id: 'zoom-fit',
        label: 'Fit to Screen',
        keywords: ['zoom', 'fit'],
        category: 'View',
        run: () => store.getState().setZoom(1),
      },
      {
        id: 'zoom-in',
        label: 'Zoom In',
        keywords: ['zoom', 'in'],
        category: 'View',
        run: () => {
          const st = store.getState();
          st.setZoom(st.zoom * 1.2);
        },
      },
      {
        id: 'zoom-out',
        label: 'Zoom Out',
        keywords: ['zoom', 'out'],
        category: 'View',
        run: () => {
          const st = store.getState();
          st.setZoom(st.zoom / 1.2);
        },
      },
    ];
  }, [store, onExport, onSave, onSaveAsTemplate, onToggleSafeZones, onAddImage]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        if (!open) {
          returnRef.current = document.activeElement as HTMLElement;
        }
        setOpen((v) => !v);
      }
      if (e.key === 'Escape' && open) {
        setOpen(false);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
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

  const filtered = actions.filter((a) => {
    if (!query) return true;
    const q = query.toLowerCase();
    return (
      a.label.toLowerCase().includes(q) ||
      a.keywords.some((k) => k.toLowerCase().includes(q))
    );
  });

  const grouped = filtered.reduce(
    (acc, a) => {
      if (!acc[a.category]) acc[a.category] = [];
      acc[a.category].push(a);
      return acc;
    },
    {} as Record<string, CommandAction[]>,
  );

  const executeAction = useCallback(
    (action: CommandAction) => {
      action.run();
      setOpen(false);
      setQuery('');
      setSelectedIndex(0);
    },
    [],
  );

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
          autoFocus
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
                    <span className="flex-1">{action.label}</span>
                    <span className="text-xs text-gray-500">{action.category}</span>
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
