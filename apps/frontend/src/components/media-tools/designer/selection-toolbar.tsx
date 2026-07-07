'use client';

import React, { FC } from 'react';
import type { DesignerElement } from './designer.store';

interface ToolbarProps {
  store: any;
  aiActive?: boolean;
  onAiRemoveBg?: () => void;
  onAiUpscale?: (scale: number) => void;
  onAiInpaint?: () => void;
}

const Btn: FC<{ onClick: () => void; title: string; children: React.ReactNode }> = ({
  onClick,
  title,
  children,
}) => (
  <button
    onClick={onClick}
    title={title}
    aria-label={title}
    className="w-8 h-8 flex items-center justify-center rounded text-textColor/80 hover:bg-studioBorder/40 hover:text-textColor text-[14px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-designerAccent"
  >
    {children}
  </button>
);

// Contextual selection toolbar (A2): high-frequency actions surfaced at the top
// of the canvas when one or more elements are selected.
export const SelectionToolbar: FC<ToolbarProps> = ({
  store,
  aiActive,
  onAiRemoveBg,
  onAiUpscale,
  onAiInpaint,
}) => {
  const doc = store((s: any) => s.doc);
  const currentOutput = store((s: any) => s.currentOutput);
  const selectedIds: string[] = store((s: any) => s.selectedIds);
  const updateElements = store((s: any) => s.updateElements);
  const removeElement = store((s: any) => s.removeElement);
  const duplicateElement = store((s: any) => s.duplicateElement);
  const reorder = store((s: any) => s.reorder);
  const groupSelection = store((s: any) => s.groupSelection);
  const ungroupSelection = store((s: any) => s.ungroupSelection);

  if (!selectedIds.length) return null;
  const selected: DesignerElement[] = (doc.outputs[currentOutput]?.children || []).filter(
    (c: DesignerElement) => selectedIds.includes(c.id)
  );
  if (!selected.length) return null;
  const allLocked = selected.every((s) => s.locked);
  const canGroup = selectedIds.length >= 2;
  const canUngroup = selected.some((s) => s.groupId);
  const singleImage = selected.length === 1 && selected[0].type === 'image';
  const showAi = !!aiActive && singleImage;

  return (
    <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1 px-2 py-1 rounded-lg bg-[#1e1e2e] border border-studioBorder shadow-lg">
      <Btn onClick={() => reorder(selectedIds, 'front')} title="Bring to front">⤒</Btn>
      <Btn onClick={() => reorder(selectedIds, 'forward')} title="Bring forward">↑</Btn>
      <Btn onClick={() => reorder(selectedIds, 'backward')} title="Send backward">↓</Btn>
      <Btn onClick={() => reorder(selectedIds, 'back')} title="Send to back">⤓</Btn>
      <div className="w-px h-5 bg-studioBorder mx-1" />
      <Btn
        onClick={() => updateElements(selectedIds, { locked: !allLocked })}
        title={allLocked ? 'Unlock' : 'Lock'}
      >
        {allLocked ? '🔒' : '🔓'}
      </Btn>
      <Btn onClick={() => selectedIds.forEach((id) => duplicateElement(id))} title="Duplicate">⧉</Btn>
      {canGroup && <Btn onClick={() => groupSelection()} title="Group">▦</Btn>}
      {canUngroup && <Btn onClick={() => ungroupSelection()} title="Ungroup">▢</Btn>}
      <div className="w-px h-5 bg-studioBorder mx-1" />
      <Btn onClick={() => selectedIds.forEach((id) => removeElement(id))} title="Delete">🗑</Btn>
      {showAi && (
        <>
          <div className="w-px h-5 bg-studioBorder mx-1" />
          {onAiRemoveBg && (
            <Btn onClick={onAiRemoveBg} title="AI: Remove background">✦</Btn>
          )}
          {onAiUpscale && (
            <Btn onClick={() => onAiUpscale(2)} title="AI: Upscale 2×">⤢</Btn>
          )}
          {onAiInpaint && (
            <Btn onClick={onAiInpaint} title="AI: Inpaint">▦</Btn>
          )}
        </>
      )}
    </div>
  );
};
