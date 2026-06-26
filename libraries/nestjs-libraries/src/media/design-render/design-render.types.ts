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

export interface TextRun {
  text: string;
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: number;
  fontStyle?: 'normal' | 'italic';
  fill?: string;
  underline?: boolean;
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

export interface DesignerMask {
  type: 'shape' | 'text';
  shape?: 'ellipse' | 'rounded-rect' | 'triangle' | 'star' | 'hexagon' | 'heart';
  cornerRadius?: number;
  text?: string;
  fontFamily?: string;
  fontWeight?: number;
}

export interface DesignerElement {
  id: string;
  type: 'text' | 'image' | 'shape' | 'icon';
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  opacity: number;
  locked: boolean;
  hidden: boolean;
  name?: string;
  groupId?: string;
  flipX?: boolean;
  flipY?: boolean;

  // text
  text?: string;
  richText?: TextRun[];
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
  curve?: number;
  textPath?: string;

  // image
  src?: string;
  fileId?: string;
  crop?: DesignerCrop;
  filters?: string[];
  borderRadius?: number;
  fitMode?: 'contain' | 'cover' | 'fill';
  focalPoint?: { x: number; y: number };
  mask?: DesignerMask;
  alt?: string;
  naturalWidth?: number;
  naturalHeight?: number;

  // shape
  shape?: 'rect' | 'ellipse' | 'line' | 'star';
  fillGradient?: DesignerGradient;
  stroke?: string;
  strokeWidth?: number;

  // reflow / linked-by-default
  originId?: string;
  anchor?:
    | 'top-left' | 'top-center' | 'top-right'
    | 'center-left' | 'center' | 'center-right'
    | 'bottom-left' | 'bottom-center' | 'bottom-right';
}

export interface DesignerOutput {
  id: string;
  formatId: string;
  name: string;
  width: number;
  height: number;
  background: string;
  bg?: DesignerPageBackground;
  children: DesignerElement[];
}

export interface StickerFrame {
  url: string;
  durationMs: number;
}

export interface CaptionWord {
  word: string;
  startMs: number;
  endMs: number;
}

export interface VideoClip {
  id: string;
  startMs: number;
  endMs: number;
  trimInMs?: number;
  trimOutMs?: number;
  src?: string;
  fileId?: string;
  x?: number; y?: number; width?: number; height?: number;
  rotation?: number; opacity?: number;
  text?: string; fontFamily?: string; fontSize?: number; fill?: string;
  volume?: number; fadeInMs?: number; fadeOutMs?: number;
  keyframes?: { tMs: number; props: Record<string, number>; ease?: 'linear' | 'easeInOut' | 'easeIn' | 'easeOut' }[];
  naturalWidth?: number; naturalHeight?: number;
  transitionIn?: { type: 'cut' | 'fade' | 'dissolve' | 'slide'; durationMs: number; direction?: 'left' | 'right' | 'up' | 'down' };
  transitionOut?: { type: 'cut' | 'fade' | 'dissolve' | 'slide'; durationMs: number; direction?: 'left' | 'right' | 'up' | 'down' };
  speed?: number;
  reverse?: boolean;
  freezeAtMs?: number;
  filters?: string[];
  /** Decoded sticker frames (GIF/WebP) so preview + render advance by frame index. */
  frames?: StickerFrame[];
  /** Per-word timing for caption clips (karaoke highlight). */
  words?: CaptionWord[];
}

export interface VideoTrack {
  id: string;
  type: 'video' | 'image' | 'text' | 'audio' | 'sticker' | 'caption';
  clips: VideoClip[];
  gain?: number;
  autoDuck?: boolean;
}

export interface VideoOutput {
  id: string;
  formatId: string;
  name: string;
  width: number;
  height: number;
  fps: number;
  durationMs: number;
  tracks: VideoTrack[];
}

export interface DesignerPage extends DesignerOutput {}

export interface DesignerDoc {
  version: number;
  mode?: 'image' | 'video';
  outputs: (DesignerOutput | VideoOutput)[];
  attribution?: any;
}

export interface RenderOptions {
  pixelRatio?: number;
  transparent?: boolean;
  orgId?: string;
}
