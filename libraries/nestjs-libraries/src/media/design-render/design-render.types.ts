// Server-side mirror of the frontend Designer document shape. Intentionally a local
// copy — the backend must not import from the frontend workspace.

export interface DesignerGradientStop {
  offset: number;
  color: string;
}

export interface DesignerGradient {
  type: 'linear' | 'radial';
  angle?: number;
  stops: DesignerGradientStop[];
}

export interface DesignerPageBackground {
  type: 'color' | 'gradient' | 'image';
  color?: string;
  gradient?: DesignerGradient;
  src?: string;
  fileId?: string;
}

export interface DesignerTextShadow {
  color: string;
  blur: number;
  offsetX: number;
  offsetY: number;
}

export interface DesignerTextStroke {
  color: string;
  width: number;
}

export interface DesignerCrop {
  x: number;
  y: number;
  width: number;
  height: number;
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

  // text
  text?: string;
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: number;
  fontStyle?: 'normal' | 'italic';
  fill?: string;
  align?: 'left' | 'center' | 'right';
  lineHeight?: number;
  letterSpacing?: number;
  textShadow?: DesignerTextShadow;
  textStroke?: DesignerTextStroke;

  // image
  src?: string;
  fileId?: string;
  crop?: DesignerCrop;
  borderRadius?: number;

  // shape
  shape?: 'rect' | 'ellipse' | 'line' | 'star';
  fillGradient?: DesignerGradient;
  stroke?: string;
  strokeWidth?: number;
  flipX?: boolean;
  flipY?: boolean;
}

export interface DesignerPage {
  id: string;
  background: string;
  bg?: DesignerPageBackground;
  children: DesignerElement[];
}

export interface DesignerDoc {
  version: number;
  width: number;
  height: number;
  pages: DesignerPage[];
  attribution?: any;
}

export interface RenderOptions {
  pixelRatio?: number;
  transparent?: boolean;
}
