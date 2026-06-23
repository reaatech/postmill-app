import { create } from 'zustand';

export interface DesignerTextShadow {
  color: string;
  blur: number;
  offsetX: number;
  offsetY: number;
}

export interface DesignerElement {
  id: string;
  type: 'text' | 'image' | 'shape';
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  opacity: number;
  locked: boolean;
  hidden: boolean;
  name?: string;
  // grouping (C5): elements sharing a groupId move/select together
  groupId?: string;
  // flip (A5): negative scale on each axis
  flipX?: boolean;
  flipY?: boolean;
  text?: string;
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: number;
  fontStyle?: 'normal' | 'italic';
  fill?: string;
  align?: 'left' | 'center' | 'right';
  lineHeight?: number;
  letterSpacing?: number;
  // text effects (C2)
  textShadow?: DesignerTextShadow;
  textStroke?: { color: string; width: number };
  curve?: number; // arc amount in degrees; 0 = straight
  src?: string;
  fileId?: string;
  crop?: { x: number; y: number; width: number; height: number };
  filters?: string[];
  borderRadius?: number;
  shape?: 'rect' | 'ellipse' | 'line' | 'star';
  fillGradient?: DesignerGradient;
  stroke?: string;
  strokeWidth?: number;
  // entrance animation (H3)
  animation?: DesignerAnimation;
}

export type DesignerAnimationType =
  | 'none'
  | 'fadeIn'
  | 'slideLeft'
  | 'slideRight'
  | 'slideUp'
  | 'slideDown'
  | 'zoomIn';

export interface DesignerAnimation {
  type: DesignerAnimationType;
  delay: number; // ms before the entrance starts
  duration: number; // ms the entrance takes
}

export interface DesignerGradient {
  type: 'linear' | 'radial';
  angle?: number; // for linear, degrees
  stops: { offset: number; color: string }[];
}

// A page background is a solid color, a gradient, or an image fill (C4).
export interface DesignerBackground {
  type: 'color' | 'gradient' | 'image';
  color?: string;
  gradient?: DesignerGradient;
  src?: string;
  fileId?: string;
}

export interface DesignerPage {
  id: string;
  // `background` stays a string (solid color) for back-compat; `bg` is the
  // richer optional form (gradient/image). Renderers prefer `bg` when present.
  background: string;
  bg?: DesignerBackground;
  children: DesignerElement[];
}

export interface DesignerAttribution {
  source?: string;
  url?: string;
  downloadLocation?: string;
  author?: string;
  authorUrl?: string;
}

export interface DesignerDoc {
  version: number;
  width: number;
  height: number;
  pages: DesignerPage[];
  attribution?: DesignerAttribution;
  durationMs?: number; // total animation length (H3)
}

export interface DesignerState {
  doc: DesignerDoc;
  selectedIds: string[];
  currentPage: number;
  zoom: number;
  viewportX: number;
  viewportY: number;
  history: DesignerDoc[];
  historyIndex: number;
  designId: string | null;
  designName: string;
  isDirty: boolean;
  isSaving: boolean;
  lastSaved: Date | null;
  clipboard: DesignerElement[];
  previewTime: number | null; // ms into the animation timeline; null = not previewing (H3)
}

export interface DesignerActions {
  setDoc: (doc: DesignerDoc) => void;
  setDesignName: (name: string) => void;
  setDesignId: (id: string | null) => void;
  addElement: (element: DesignerElement) => void;
  updateElement: (id: string, updates: Partial<DesignerElement>) => void;
  updateElements: (ids: string[], updates: Partial<DesignerElement>) => void;
  removeElement: (id: string) => void;
  duplicateElement: (id: string) => void;
  setSelectedIds: (ids: string[]) => void;
  setPageBackground: (bg: DesignerBackground) => void;
  // clipboard (B2)
  copySelection: () => void;
  cutSelection: () => void;
  paste: () => void;
  // grouping (C5)
  groupSelection: () => void;
  ungroupSelection: () => void;
  // z-order
  reorder: (ids: string[], dir: 'front' | 'back' | 'forward' | 'backward') => void;
  // animation (H3)
  setElementAnimation: (id: string, animation: DesignerAnimation) => void;
  setDuration: (ms: number) => void;
  setPreviewTime: (t: number | null) => void;
  // multi-page (D1/D2)
  setCurrentPage: (index: number) => void;
  addPage: () => void;
  removePage: (index: number) => void;
  duplicatePage: (index: number) => void;
  movePage: (from: number, to: number) => void;
  moveElementsToPage: (ids: string[], targetPage: number) => void;
  setZoom: (zoom: number) => void;
  setViewport: (x: number, y: number) => void;
  undo: () => void;
  redo: () => void;
  pushHistory: () => void;
  markSaved: () => void;
  setSaving: (saving: boolean) => void;
  reset: (width?: number, height?: number) => void;
  loadDesign: (doc: DesignerDoc, id: string, name: string) => void;
}

export type DesignerStore = DesignerState & DesignerActions;

const createEmptyDoc = (width = 1080, height = 1080, attribution?: DesignerAttribution): DesignerDoc => ({
  version: 1,
  width,
  height,
  pages: [{
    id: 'page-1',
    background: '#ffffff',
    children: [],
  }],
  attribution,
});

let elementCounter = 0;
const genId = () => `el-${Date.now()}-${++elementCounter}`;

export const createDesignerStore = (width?: number, height?: number, attribution?: DesignerAttribution) =>
  create<DesignerStore>((set, get) => {
    const initialDoc = createEmptyDoc(width, height, attribution);
    return {
      doc: initialDoc,
      selectedIds: [],
      currentPage: 0,
      zoom: 1,
      viewportX: 0,
      viewportY: 0,
      history: [JSON.parse(JSON.stringify(initialDoc))],
      historyIndex: 0,
      designId: null,
      designName: 'Untitled Design',
      isDirty: false,
      isSaving: false,
      lastSaved: null,
      clipboard: [],
      previewTime: null,

      setDoc: (doc) => set({ doc, isDirty: true }),

      setElementAnimation: (id, animation) => get().updateElement(id, { animation }),

      setDuration: (ms) => {
        const { doc } = get();
        set({ doc: { ...doc, durationMs: Math.max(500, ms) }, isDirty: true });
      },

      setPreviewTime: (t) => set({ previewTime: t }),

      setDesignName: (name) => set({ designName: name, isDirty: true }),

      setDesignId: (id) => set({ designId: id }),

      addElement: (element) => {
        const { doc, currentPage } = get();
        const newEl = { ...element, id: element.id || genId() };
        const newPages = [...doc.pages];
        newPages[currentPage] = {
          ...newPages[currentPage],
          children: [...newPages[currentPage].children, newEl],
        };
        set({ doc: { ...doc, pages: newPages }, isDirty: true, selectedIds: [newEl.id] });
        get().pushHistory();
      },

      updateElement: (id, updates) => {
        const { doc, currentPage } = get();
        const newPages = [...doc.pages];
        const children = newPages[currentPage].children.map((el) =>
          el.id === id ? { ...el, ...updates } : el
        );
        newPages[currentPage] = { ...newPages[currentPage], children };
        set({ doc: { ...doc, pages: newPages }, isDirty: true });
      },

      removeElement: (id) => {
        const { doc, currentPage, selectedIds } = get();
        const newPages = [...doc.pages];
        newPages[currentPage] = {
          ...newPages[currentPage],
          children: newPages[currentPage].children.filter((el) => el.id !== id),
        };
        set({
          doc: { ...doc, pages: newPages },
          isDirty: true,
          selectedIds: selectedIds.filter((s) => s !== id),
        });
        get().pushHistory();
      },

      duplicateElement: (id) => {
        const { doc, currentPage } = get();
        const el = doc.pages[currentPage].children.find((e) => e.id === id);
        if (!el) return;
        const newEl = { ...el, id: genId(), x: el.x + 20, y: el.y + 20 };
        const newPages = [...doc.pages];
        newPages[currentPage] = {
          ...newPages[currentPage],
          children: [...newPages[currentPage].children, newEl],
        };
        set({ doc: { ...doc, pages: newPages }, isDirty: true, selectedIds: [newEl.id] });
        get().pushHistory();
      },

      updateElements: (ids, updates) => {
        const { doc, currentPage } = get();
        const idSet = new Set(ids);
        const newPages = [...doc.pages];
        const children = newPages[currentPage].children.map((el) =>
          idSet.has(el.id) ? { ...el, ...updates } : el
        );
        newPages[currentPage] = { ...newPages[currentPage], children };
        set({ doc: { ...doc, pages: newPages }, isDirty: true });
        get().pushHistory();
      },

      setSelectedIds: (ids) => set({ selectedIds: ids }),

      setPageBackground: (bg) => {
        const { doc, currentPage } = get();
        const newPages = [...doc.pages];
        newPages[currentPage] = {
          ...newPages[currentPage],
          background: bg.type === 'color' && bg.color ? bg.color : newPages[currentPage].background,
          bg,
        };
        set({ doc: { ...doc, pages: newPages }, isDirty: true });
        get().pushHistory();
      },

      copySelection: () => {
        const { doc, currentPage, selectedIds } = get();
        const picked = doc.pages[currentPage].children.filter((el) =>
          selectedIds.includes(el.id)
        );
        set({ clipboard: JSON.parse(JSON.stringify(picked)) });
      },

      cutSelection: () => {
        const { doc, currentPage, selectedIds } = get();
        const picked = doc.pages[currentPage].children.filter((el) =>
          selectedIds.includes(el.id)
        );
        if (!picked.length) return;
        const newPages = [...doc.pages];
        newPages[currentPage] = {
          ...newPages[currentPage],
          children: newPages[currentPage].children.filter(
            (el) => !selectedIds.includes(el.id)
          ),
        };
        set({
          clipboard: JSON.parse(JSON.stringify(picked)),
          doc: { ...doc, pages: newPages },
          selectedIds: [],
          isDirty: true,
        });
        get().pushHistory();
      },

      paste: () => {
        const { doc, currentPage, clipboard } = get();
        if (!clipboard.length) return;
        // Preserve relative grouping by remapping group ids per paste.
        const groupRemap: Record<string, string> = {};
        const pasted = clipboard.map((el) => {
          let groupId = el.groupId;
          if (groupId) {
            groupRemap[groupId] = groupRemap[groupId] || genId();
            groupId = groupRemap[groupId];
          }
          return { ...el, id: genId(), x: el.x + 20, y: el.y + 20, groupId };
        });
        const newPages = [...doc.pages];
        newPages[currentPage] = {
          ...newPages[currentPage],
          children: [...newPages[currentPage].children, ...pasted],
        };
        set({
          doc: { ...doc, pages: newPages },
          selectedIds: pasted.map((el) => el.id),
          isDirty: true,
        });
        get().pushHistory();
      },

      groupSelection: () => {
        const { selectedIds } = get();
        if (selectedIds.length < 2) return;
        get().updateElements(selectedIds, { groupId: genId() });
      },

      ungroupSelection: () => {
        const { doc, currentPage, selectedIds } = get();
        const groupIds = new Set(
          doc.pages[currentPage].children
            .filter((el) => selectedIds.includes(el.id) && el.groupId)
            .map((el) => el.groupId as string)
        );
        if (!groupIds.size) return;
        const newPages = [...doc.pages];
        newPages[currentPage] = {
          ...newPages[currentPage],
          children: newPages[currentPage].children.map((el) =>
            el.groupId && groupIds.has(el.groupId) ? { ...el, groupId: undefined } : el
          ),
        };
        set({ doc: { ...doc, pages: newPages }, isDirty: true });
        get().pushHistory();
      },

      reorder: (ids, dir) => {
        const { doc, currentPage } = get();
        const children = [...doc.pages[currentPage].children];
        const picked = children.filter((el) => ids.includes(el.id));
        if (!picked.length) return;
        const rest = children.filter((el) => !ids.includes(el.id));
        let next: typeof children;
        if (dir === 'front') {
          next = [...rest, ...picked];
        } else if (dir === 'back') {
          next = [...picked, ...rest];
        } else {
          // forward/backward: shift each picked index by ±1 within the array
          next = [...children];
          const indices = ids
            .map((id) => next.findIndex((el) => el.id === id))
            .filter((i) => i >= 0)
            .sort((a, b) => (dir === 'forward' ? b - a : a - b));
          indices.forEach((i) => {
            const swap = dir === 'forward' ? i + 1 : i - 1;
            if (swap < 0 || swap >= next.length) return;
            [next[i], next[swap]] = [next[swap], next[i]];
          });
        }
        const newPages = [...doc.pages];
        newPages[currentPage] = { ...newPages[currentPage], children: next };
        set({ doc: { ...doc, pages: newPages }, isDirty: true });
        get().pushHistory();
      },

      setCurrentPage: (index) => {
        const { doc } = get();
        if (index < 0 || index >= doc.pages.length) return;
        set({ currentPage: index, selectedIds: [] });
      },

      addPage: () => {
        const { doc } = get();
        const newPage: DesignerPage = { id: genId(), background: '#ffffff', children: [] };
        const newPages = [...doc.pages, newPage];
        set({
          doc: { ...doc, pages: newPages },
          currentPage: newPages.length - 1,
          selectedIds: [],
          isDirty: true,
        });
        get().pushHistory();
      },

      removePage: (index) => {
        const { doc, currentPage } = get();
        if (doc.pages.length <= 1) return;
        const newPages = doc.pages.filter((_, i) => i !== index);
        const nextCurrent = Math.max(0, Math.min(currentPage, newPages.length - 1));
        set({
          doc: { ...doc, pages: newPages },
          currentPage: nextCurrent,
          selectedIds: [],
          isDirty: true,
        });
        get().pushHistory();
      },

      duplicatePage: (index) => {
        const { doc } = get();
        const src = doc.pages[index];
        if (!src) return;
        const groupRemap: Record<string, string> = {};
        const clone: DesignerPage = {
          id: genId(),
          background: src.background,
          bg: src.bg ? JSON.parse(JSON.stringify(src.bg)) : undefined,
          children: src.children.map((el) => {
            let groupId = el.groupId;
            if (groupId) {
              groupRemap[groupId] = groupRemap[groupId] || genId();
              groupId = groupRemap[groupId];
            }
            return { ...JSON.parse(JSON.stringify(el)), id: genId(), groupId };
          }),
        };
        const newPages = [...doc.pages];
        newPages.splice(index + 1, 0, clone);
        set({
          doc: { ...doc, pages: newPages },
          currentPage: index + 1,
          selectedIds: [],
          isDirty: true,
        });
        get().pushHistory();
      },

      movePage: (from, to) => {
        const { doc } = get();
        if (from === to || from < 0 || to < 0 || from >= doc.pages.length || to >= doc.pages.length)
          return;
        const newPages = [...doc.pages];
        const [moved] = newPages.splice(from, 1);
        newPages.splice(to, 0, moved);
        set({ doc: { ...doc, pages: newPages }, currentPage: to, isDirty: true });
        get().pushHistory();
      },

      moveElementsToPage: (ids, targetPage) => {
        const { doc, currentPage } = get();
        if (targetPage === currentPage || targetPage < 0 || targetPage >= doc.pages.length) return;
        const moving = doc.pages[currentPage].children.filter((el) => ids.includes(el.id));
        if (!moving.length) return;
        const newPages = [...doc.pages];
        newPages[currentPage] = {
          ...newPages[currentPage],
          children: newPages[currentPage].children.filter((el) => !ids.includes(el.id)),
        };
        newPages[targetPage] = {
          ...newPages[targetPage],
          children: [...newPages[targetPage].children, ...moving],
        };
        set({ doc: { ...doc, pages: newPages }, selectedIds: [], isDirty: true });
        get().pushHistory();
      },

      setZoom: (zoom) => set({ zoom: Math.max(0.1, Math.min(5, zoom)) }),

      setViewport: (x, y) => set({ viewportX: x, viewportY: y }),

      pushHistory: () => {
        const { doc, history, historyIndex } = get();
        const snapshot = JSON.parse(JSON.stringify(doc));
        const newHistory = history.slice(0, historyIndex + 1);
        newHistory.push(snapshot);
        if (newHistory.length > 50) newHistory.shift();
        set({ history: newHistory, historyIndex: newHistory.length - 1 });
      },

      undo: () => {
        const { historyIndex, history } = get();
        if (historyIndex <= 0) return;
        const newIndex = historyIndex - 1;
        set({
          doc: JSON.parse(JSON.stringify(history[newIndex])),
          historyIndex: newIndex,
          selectedIds: [],
          isDirty: true,
        });
      },

      redo: () => {
        const { historyIndex, history } = get();
        if (historyIndex >= history.length - 1) return;
        const newIndex = historyIndex + 1;
        set({
          doc: JSON.parse(JSON.stringify(history[newIndex])),
          historyIndex: newIndex,
          selectedIds: [],
          isDirty: true,
        });
      },

      markSaved: () => set({ isDirty: false, isSaving: false, lastSaved: new Date() }),

      setSaving: (saving) => set({ isSaving: saving }),

      reset: (width, height) => {
        const newDoc = createEmptyDoc(width, height);
        set({
          doc: newDoc,
          selectedIds: [],
          currentPage: 0,
          zoom: 1,
          viewportX: 0,
          viewportY: 0,
          history: [JSON.parse(JSON.stringify(newDoc))],
          historyIndex: 0,
          designId: null,
          designName: 'Untitled Design',
          isDirty: false,
          isSaving: false,
          lastSaved: null,
        });
      },

      loadDesign: (doc, id, name) => {
        set({
          doc: JSON.parse(JSON.stringify(doc)),
          designId: id,
          designName: name,
          selectedIds: [],
          currentPage: 0,
          zoom: 1,
          history: [JSON.parse(JSON.stringify(doc))],
          historyIndex: 0,
          isDirty: false,
        });
      },
    };
  });
