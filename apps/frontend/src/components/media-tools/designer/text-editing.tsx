import React, { FC, useEffect, useRef, useState } from 'react';
import type { DesignerElement } from './designer.store';

interface TextEditingProps {
  element: DesignerElement;
  stageRect: { x: number; y: number; scale: number };
  onUpdate: (id: string, updates: Partial<DesignerElement>) => void;
  onComplete: () => void;
}

export const TextEditingOverlay: FC<TextEditingProps> = ({
  element,
  stageRect,
  onUpdate,
  onComplete,
}) => {
  const [text, setText] = useState(element.text || '');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const scale = stageRect.scale || 1;

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.select();
    }
  }, []);

  const handleBlur = () => {
    if (text !== element.text) {
      onUpdate(element.id, { text });
    }
    onComplete();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setText(element.text || '');
      onComplete();
    }
  };

  const left = (element.x + stageRect.x) * scale + 2;
  const top = (element.y + stageRect.y) * scale + 2;
  const width = element.width * scale - 4;
  const minHeight = Math.max(element.height * scale - 4, 20);

  return (
    <textarea
      ref={textareaRef}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      style={{
        position: 'absolute',
        left: `${left}px`,
        top: `${top}px`,
        width: `${Math.max(width, 20)}px`,
        minHeight: `${minHeight}px`,
        fontFamily: element.fontFamily || 'Arial',
        fontSize: `${(element.fontSize || 16) * scale}px`,
        fontWeight: element.fontWeight ?? 400,
        color: element.fill || '#000000',
        textAlign: element.align || 'left',
        lineHeight: element.lineHeight || 1.2,
        letterSpacing: `${(element.letterSpacing || 0) * scale}px`,
        background: 'transparent',
        border: 'none',
        outline: 'none',
        resize: 'none',
        overflow: 'hidden',
        whiteSpace: 'pre-wrap',
        wordWrap: 'break-word',
        zIndex: 100,
      }}
    />
  );
};
