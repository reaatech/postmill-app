import React, { FC, useCallback, useRef, useEffect, useState } from 'react';
import { Stage, Layer, Transformer, Rect, Line as KonvaLine, Image as KonvaImage } from 'react-konva';
import type Konva from 'konva';
import { CanvasElements, gradientFillProps } from './elements';
import { TextEditingOverlay } from './text-editing';
import { SafeZoneOverlay } from './safe-zones';
import type { DesignerElement } from './designer.store';

interface CanvasProps {
  store: ReturnType<typeof import('./designer.store').createDesignerStore>;
  showSafeZones?: boolean;
  safeZonePreset?: string;
}

const SNAP = 6; // snapping threshold in canvas px

export const DesignerCanvas: FC<CanvasProps> = ({ store, showSafeZones, safeZonePreset }) => {
  const stageRef = useRef<Konva.Stage>(null);
  const transformerRef = useRef<Konva.Transformer>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  // Start at 0 so the fixed stage width never props the flex layout open before
  // the container is measured; the ResizeObserver sizes it to the real space.
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 });
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  const [isSpacePressed, setIsSpacePressed] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const [guides, setGuides] = useState<{ points: number[] }[]>([]);
  const [hud, setHud] = useState<{ x: number; y: number; text: string } | null>(null);
  const [marquee, setMarquee] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const marqueeStart = useRef<{ x: number; y: number } | null>(null);
  const [bgImage, setBgImage] = useState<HTMLImageElement | null>(null);

  const doc = store((s) => s.doc);
  const selectedIds = store((s) => s.selectedIds);
  const currentPage = store((s) => s.currentPage);
  const previewTime = store((s) => s.previewTime);
  const isPreviewing = previewTime != null;
  const zoom = store((s) => s.zoom);
  const viewportX = store((s) => s.viewportX);
  const viewportY = store((s) => s.viewportY);
  const pushHistory = store((s) => s.pushHistory);
  const setSelectedIds = store((s) => s.setSelectedIds);
  const updateElement = store((s) => s.updateElement);
  const removeElement = store((s) => s.removeElement);
  const duplicateElement = store((s) => s.duplicateElement);
  const addElement = store((s) => s.addElement);
  const setZoom = store((s) => s.setZoom);
  const setViewport = store((s) => s.setViewport);

  const page = doc.pages[currentPage];

  useEffect(() => {
    const updateSize = () => {
      if (containerRef.current) {
        setStageSize({
          width: containerRef.current.offsetWidth,
          height: containerRef.current.offsetHeight,
        });
      }
    };
    updateSize();
    // Observe the container so the stage tracks panel toggles / window resize,
    // not just window resize (otherwise the canvas keeps a stale fixed size).
    const ro = new ResizeObserver(updateSize);
    if (containerRef.current) ro.observe(containerRef.current);
    window.addEventListener('resize', updateSize);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', updateSize);
    };
  }, []);

  // Load a page background image when the page uses an image fill (C4).
  useEffect(() => {
    const src = page?.bg?.type === 'image' ? page.bg.src : undefined;
    if (!src) {
      setBgImage(null);
      return;
    }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => setBgImage(img);
    img.onerror = () => setBgImage(null);
    img.src = src;
  }, [page?.bg]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !(e.target as HTMLElement)?.matches?.('input,textarea')) {
        e.preventDefault();
        setIsSpacePressed(true);
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') setIsSpacePressed(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  // Attach transformer to the current selection.
  useEffect(() => {
    if (!transformerRef.current) return;
    const stage = stageRef.current;
    if (!stage) return;
    const nodes = selectedIds
      .map((id) => stage.findOne('#' + id))
      .filter(Boolean) as Konva.Node[];
    transformerRef.current.nodes(nodes);
    transformerRef.current.getLayer()?.batchDraw();
  }, [selectedIds, doc, currentPage]);

  // Resolve a click into a selection, honoring group membership and additive (shift/meta) clicks.
  const handleElementSelect = useCallback(
    (id: string, evt?: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
      const el = page?.children.find((c) => c.id === id);
      const groupId = el?.groupId;
      const groupIds = groupId
        ? page!.children.filter((c) => c.groupId === groupId).map((c) => c.id)
        : [id];
      const native = evt?.evt as MouseEvent | undefined;
      const additive = !!(native && (native.shiftKey || native.metaKey || native.ctrlKey));
      if (additive) {
        const set = new Set(selectedIds);
        const allSelected = groupIds.every((g) => set.has(g));
        groupIds.forEach((g) => (allSelected ? set.delete(g) : set.add(g)));
        setSelectedIds(Array.from(set));
      } else {
        setSelectedIds(groupIds);
      }
    },
    [page, selectedIds, setSelectedIds]
  );

  const handleStageMouseDown = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent>) => {
      if (isSpacePressed) {
        setIsPanning(true);
        return;
      }
      // Empty-canvas press starts a marquee selection.
      if (e.target === e.target.getStage()) {
        const stage = stageRef.current;
        const pos = stage?.getRelativePointerPosition();
        if (pos) {
          marqueeStart.current = { x: pos.x, y: pos.y };
          setMarquee({ x: pos.x, y: pos.y, w: 0, h: 0 });
        }
        setSelectedIds([]);
        setEditingTextId(null);
      }
    },
    [isSpacePressed, setSelectedIds]
  );

  const handleStageMouseMove = useCallback(() => {
    if (!marqueeStart.current) return;
    const stage = stageRef.current;
    const pos = stage?.getRelativePointerPosition();
    if (!pos) return;
    const s = marqueeStart.current;
    setMarquee({
      x: Math.min(s.x, pos.x),
      y: Math.min(s.y, pos.y),
      w: Math.abs(pos.x - s.x),
      h: Math.abs(pos.y - s.y),
    });
  }, []);

  const handleStageMouseUp = useCallback(() => {
    setIsPanning(false);
    if (marqueeStart.current && marquee && (marquee.w > 3 || marquee.h > 3)) {
      const hits = (page?.children || [])
        .filter((el) => !el.hidden && !el.locked)
        .filter(
          (el) =>
            el.x < marquee.x + marquee.w &&
            el.x + el.width > marquee.x &&
            el.y < marquee.y + marquee.h &&
            el.y + el.height > marquee.y
        )
        .map((el) => el.id);
      if (hits.length) setSelectedIds(hits);
    }
    marqueeStart.current = null;
    setMarquee(null);
  }, [marquee, page, setSelectedIds]);

  // Snapping during drag: align edges/centers to other elements + page guides (B3).
  const computeSnap = useCallback(
    (node: Konva.Node) => {
      if (!page) return;
      const others = page.children.filter((el) => !selectedIds.includes(el.id) && !el.hidden);
      const w = node.width() * node.scaleX();
      const h = node.height() * node.scaleY();
      const targetsX = [0, doc.width / 2, doc.width];
      const targetsY = [0, doc.height / 2, doc.height];
      others.forEach((el) => {
        targetsX.push(el.x, el.x + el.width / 2, el.x + el.width);
        targetsY.push(el.y, el.y + el.height / 2, el.y + el.height);
      });
      const lines: { points: number[] }[] = [];
      const edgesX = [node.x(), node.x() + w / 2, node.x() + w];
      const edgesY = [node.y(), node.y() + h / 2, node.y() + h];
      let snapDX: number | null = null;
      let snapDY: number | null = null;
      edgesX.forEach((ex) => {
        targetsX.forEach((tx) => {
          if (Math.abs(ex - tx) <= SNAP && (snapDX === null || Math.abs(tx - ex) < Math.abs(snapDX))) {
            snapDX = tx - ex;
            lines.push({ points: [tx, 0, tx, doc.height] });
          }
        });
      });
      edgesY.forEach((ey) => {
        targetsY.forEach((ty) => {
          if (Math.abs(ey - ty) <= SNAP && (snapDY === null || Math.abs(ty - ey) < Math.abs(snapDY))) {
            snapDY = ty - ey;
            lines.push({ points: [0, ty, doc.width, ty] });
          }
        });
      });
      if (snapDX !== null) node.x(node.x() + snapDX);
      if (snapDY !== null) node.y(node.y() + snapDY);
      setGuides(lines);
      setHud({ x: node.x(), y: node.y() - 22, text: `${Math.round(node.x())}, ${Math.round(node.y())}` });
    },
    [page, selectedIds, doc.width, doc.height]
  );

  const handleDragMove = useCallback(
    (e: Konva.KonvaEventObject<DragEvent>) => {
      if (e.target === e.target.getStage()) return;
      computeSnap(e.target);
    },
    [computeSnap]
  );

  const handleDragEnd = useCallback(
    (e: Konva.KonvaEventObject<DragEvent>) => {
      setGuides([]);
      setHud(null);
      const node = e.target;
      const id = node.id();
      if (id) {
        pushHistory();
        updateElement(id, { x: node.x(), y: node.y() });
      }
    },
    [pushHistory, updateElement]
  );

  const handleTransform = useCallback((e: Konva.KonvaEventObject<Event>) => {
    const node = e.target;
    const w = Math.round(node.width() * node.scaleX());
    const h = Math.round(node.height() * node.scaleY());
    setHud({ x: node.x(), y: node.y() - 22, text: `${w} × ${h}` });
  }, []);

  const handleTransformEnd = useCallback(
    (e: Konva.KonvaEventObject<Event>) => {
      setHud(null);
      const node = e.target;
      const id = node.id();
      if (id) {
        pushHistory();
        updateElement(id, {
          x: node.x(),
          y: node.y(),
          width: Math.max(node.width() * node.scaleX(), 10),
          height: Math.max(node.height() * node.scaleY(), 10),
          rotation: node.rotation(),
        });
        node.scaleX(1);
        node.scaleY(1);
      }
    },
    [pushHistory, updateElement]
  );

  const handleWheel = useCallback(
    (e: Konva.KonvaEventObject<WheelEvent>) => {
      e.evt.preventDefault();
      const scaleBy = 1.1;
      const stage = stageRef.current;
      if (!stage) return;
      const oldScale = stage.scaleX();
      const pointer = stage.getPointerPosition();
      if (!pointer) return;
      const mousePointTo = {
        x: pointer.x / oldScale - stage.x() / oldScale,
        y: pointer.y / oldScale - stage.y() / oldScale,
      };
      const newScale = e.evt.deltaY > 0 ? oldScale / scaleBy : oldScale * scaleBy;
      const clampedScale = Math.max(0.1, Math.min(5, newScale));
      stage.scale({ x: clampedScale, y: clampedScale });
      const newPos = {
        x: -(mousePointTo.x - pointer.x / clampedScale) * clampedScale,
        y: -(mousePointTo.y - pointer.y / clampedScale) * clampedScale,
      };
      stage.position(newPos);
      setZoom(clampedScale);
      setViewport(newPos.x, newPos.y);
    },
    [setZoom, setViewport]
  );

  const fitToScreen = useCallback(() => {
    if (!stageSize.width || !stageSize.height) return;
    const scaleX = stageSize.width / doc.width;
    const scaleY = stageSize.height / doc.height;
    const next = Math.min(scaleX, scaleY) * 0.9;
    setZoom(next);
    setViewport(
      (stageSize.width - doc.width * next) / 2,
      (stageSize.height - doc.height * next) / 2
    );
  }, [stageSize, doc.width, doc.height, setZoom, setViewport]);

  // Auto fit-to-screen once the stage is measured and whenever the doc's
  // dimensions change (preset pick, magic resize, opening with an asset). Keyed
  // on doc size so it does NOT refight on panel toggles or after the user zooms
  // — only a genuine canvas-size change re-fits.
  const lastFitKey = useRef('');
  useEffect(() => {
    if (!stageSize.width || !stageSize.height) return;
    const key = `${doc.width}x${doc.height}`;
    if (lastFitKey.current === key) return;
    lastFitKey.current = key;
    fitToScreen();
  }, [stageSize.width, stageSize.height, doc.width, doc.height, fitToScreen]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (editingTextId) return;
      const st = store.getState();
      const mod = e.ctrlKey || e.metaKey;
      if (e.key === 'Delete' || e.key === 'Backspace') {
        selectedIds.forEach((id) => removeElement(id));
      } else if (e.key === 'Escape') {
        setSelectedIds([]);
      } else if (mod && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        setSelectedIds((page?.children || []).filter((c) => !c.hidden).map((c) => c.id));
      } else if (mod && e.key.toLowerCase() === 'c') {
        e.preventDefault();
        st.copySelection();
      } else if (mod && e.key.toLowerCase() === 'x') {
        e.preventDefault();
        st.cutSelection();
      } else if (mod && e.key.toLowerCase() === 'v') {
        e.preventDefault();
        st.paste();
      } else if (mod && e.key.toLowerCase() === 'g') {
        e.preventDefault();
        if (e.shiftKey) st.ungroupSelection();
        else st.groupSelection();
      } else if (mod && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        selectedIds.forEach((id) => duplicateElement(id));
      } else if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) st.redo();
        else st.undo();
      } else if (e.key.startsWith('Arrow')) {
        e.preventDefault();
        if (selectedIds.length === 0) return;
        const delta = e.shiftKey ? 10 : 1;
        let dx = 0;
        let dy = 0;
        if (e.key === 'ArrowUp') dy = -delta;
        if (e.key === 'ArrowDown') dy = delta;
        if (e.key === 'ArrowLeft') dx = -delta;
        if (e.key === 'ArrowRight') dx = delta;
        selectedIds.forEach((id) => {
          const el = page?.children.find((c) => c.id === id);
          if (!el || el.locked || el.hidden) return;
          updateElement(id, { x: el.x + dx, y: el.y + dy });
        });
      } else if (e.key === 'Enter') {
        if (selectedIds.length === 1) {
          const el = page?.children.find((c) => c.id === selectedIds[0]);
          if (el?.type === 'text') setEditingTextId(el.id);
        }
      }
    },
    [editingTextId, selectedIds, removeElement, setSelectedIds, updateElement, page, duplicateElement, store]
  );

  const handleStageDblClick = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (e: Konva.KonvaEventObject<any>) => {
      const target = e.target;
      const id = target.id() || target.getParent()?.id();
      if (id) {
        const el = page?.children.find((c) => c.id === id);
        if (el?.type === 'text') setEditingTextId(id);
      }
    },
    [page]
  );

  // Drop from panels (B5): payload set on dragstart in panels.
  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      containerRef.current?.classList.remove('designer-drop-active');
      const raw = e.dataTransfer.getData('application/x-designer-element');
      if (!raw) return;
      let payload: Partial<DesignerElement>;
      try {
        payload = JSON.parse(raw);
      } catch {
        return;
      }
      const stage = stageRef.current;
      const rect = containerRef.current?.getBoundingClientRect();
      if (!stage || !rect) return;
      const px = (e.clientX - rect.left - viewportX) / zoom;
      const py = (e.clientY - rect.top - viewportY) / zoom;
      const w = payload.width || 200;
      const h = payload.height || 200;
      addElement({
        id: '',
        type: payload.type || 'image',
        x: px - w / 2,
        y: py - h / 2,
        width: w,
        height: h,
        rotation: 0,
        opacity: 1,
        locked: false,
        hidden: false,
        ...payload,
      } as DesignerElement);
    },
    [addElement, viewportX, viewportY, zoom]
  );

  const bg = page?.bg;
  const bgGrad =
    bg?.type === 'gradient' ? gradientFillProps(bg.gradient, doc.width, doc.height) : {};

  return (
    <div
      ref={containerRef}
      className={`flex-1 min-w-0 relative overflow-hidden bg-[#1a1a2e] designer-canvas-container ${
        isPanning ? 'cursor-grabbing' : isSpacePressed ? 'cursor-grab' : 'cursor-default'
      }`}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      onDragOver={(e) => {
        e.preventDefault();
        containerRef.current?.classList.add('designer-drop-active');
      }}
      onDragLeave={() => containerRef.current?.classList.remove('designer-drop-active')}
      onDrop={handleDrop}
    >
      <Stage
        ref={stageRef}
        className="konva-stage"
        width={stageSize.width}
        height={stageSize.height}
        x={viewportX}
        y={viewportY}
        scaleX={zoom}
        scaleY={zoom}
        onWheel={handleWheel}
        onDblClick={handleStageDblClick}
        onDblTap={handleStageDblClick}
        draggable={isSpacePressed}
        onMouseDown={handleStageMouseDown}
        onMouseMove={handleStageMouseMove}
        onMouseUp={handleStageMouseUp}
        onMouseLeave={() => {
          setIsPanning(false);
          marqueeStart.current = null;
          setMarquee(null);
        }}
        onDragEnd={(e) => {
          if (e.target === e.target.getStage()) {
            setIsPanning(false);
            setViewport(e.target.x(), e.target.y());
          }
        }}
      >
        <Layer>
          <Rect
            x={0}
            y={0}
            width={doc.width}
            height={doc.height}
            fill={bg?.type === 'gradient' ? undefined : bg?.color || page?.background || '#ffffff'}
            {...bgGrad}
            shadowColor="rgba(0,0,0,0.3)"
            shadowBlur={20}
            shadowOffset={{ x: 0, y: 4 }}
          />
          {bg?.type === 'image' && bgImage && (
            <KonvaImage image={bgImage} x={0} y={0} width={doc.width} height={doc.height} listening={false} />
          )}
          <CanvasElements
            elements={page?.children || []}
            onSelect={handleElementSelect}
            previewTime={previewTime}
          />
          {!isPreviewing && guides.map((g, i) => (
            <KonvaLine key={i} points={g.points} stroke="#FF3B7F" strokeWidth={1 / zoom} dash={[4, 4]} listening={false} />
          ))}
          {showSafeZones && safeZonePreset && (
            <SafeZoneOverlay presetId={safeZonePreset} width={doc.width} height={doc.height} visible={true} />
          )}
          {marquee && (
            <Rect
              x={marquee.x}
              y={marquee.y}
              width={marquee.w}
              height={marquee.h}
              fill="rgba(43,92,211,0.12)"
              stroke="#2B5CD3"
              strokeWidth={1 / zoom}
              listening={false}
            />
          )}
          {selectedIds.length > 0 && !isPreviewing && (
            <Transformer
              ref={transformerRef}
              rotateEnabled={true}
              enabledAnchors={['top-left', 'top-center', 'top-right', 'middle-left', 'middle-right', 'bottom-left', 'bottom-center', 'bottom-right']}
              borderStroke="#2B5CD3"
              borderStrokeWidth={1.5}
              anchorFill="#ffffff"
              anchorStroke="#2B5CD3"
              anchorSize={10}
              anchorCornerRadius={5}
              rotateAnchorOffset={24}
              onDragMove={handleDragMove}
              onDragEnd={handleDragEnd}
              onTransform={handleTransform}
              onTransformEnd={handleTransformEnd}
            />
          )}
        </Layer>
      </Stage>

      {hud && (
        <div
          className="absolute pointer-events-none z-10 px-2 py-1 rounded bg-[#2B5CD3] text-white text-[11px] font-medium"
          style={{ left: viewportX + hud.x * zoom, top: viewportY + hud.y * zoom }}
        >
          {hud.text}
        </div>
      )}

      {editingTextId && (() => {
        const el = page?.children.find((c) => c.id === editingTextId);
        if (!el || el.type !== 'text') return null;
        return (
          <TextEditingOverlay
            element={el}
            stageRect={{ x: 0, y: 0, scale: zoom }}
            onUpdate={updateElement}
            onComplete={() => setEditingTextId(null)}
          />
        );
      })()}

      <div className="absolute bottom-4 right-4 flex items-center gap-2 bg-[#1e1e2e] rounded-lg px-3 py-2 text-[12px] text-textColor/60">
        <button
          onClick={() => setZoom(zoom / 1.25)}
          className="w-7 h-7 flex items-center justify-center rounded hover:bg-newColColor/30"
          aria-label="Zoom out"
        >
          −
        </button>
        <span className="min-w-[40px] text-center">{Math.round(zoom * 100)}%</span>
        <button
          onClick={() => setZoom(zoom * 1.25)}
          className="w-7 h-7 flex items-center justify-center rounded hover:bg-newColColor/30"
          aria-label="Zoom in"
        >
          +
        </button>
        <button
          onClick={fitToScreen}
          className="w-7 h-7 flex items-center justify-center rounded hover:bg-newColColor/30 text-[10px]"
          aria-label="Fit to screen"
        >
          ⊞
        </button>
      </div>
    </div>
  );
};
