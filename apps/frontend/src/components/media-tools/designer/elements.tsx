import React, { FC, useEffect, useSyncExternalStore } from 'react';
import { Image as KonvaImage, Rect, Ellipse, Line, Star, Text as KonvaText, Group } from 'react-konva';
import type Konva from 'konva';
import type { DesignerElement, DesignerGradient } from './designer.store';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SelectHandler = (id: string, evt?: Konva.KonvaEventObject<any>) => void;

interface AnimState {
  opacity: number;
  offsetX: number;
  offsetY: number;
  scale: number;
}

// Entrance animation interpolation for the timeline/video export (H3).
const computeAnimation = (el: DesignerElement, t: number): AnimState | null => {
  const a = el.animation;
  if (!a || a.type === 'none') return null;
  const start = a.delay;
  const dur = a.duration || 1;
  let p = t <= start ? 0 : t >= start + dur ? 1 : (t - start) / dur;
  p = 1 - Math.pow(1 - p, 3); // ease-out cubic
  const dist = 80;
  const s: AnimState = { opacity: p, offsetX: 0, offsetY: 0, scale: 1 };
  if (a.type === 'slideLeft') s.offsetX = (1 - p) * dist;
  else if (a.type === 'slideRight') s.offsetX = -(1 - p) * dist;
  else if (a.type === 'slideUp') s.offsetY = (1 - p) * dist;
  else if (a.type === 'slideDown') s.offsetY = -(1 - p) * dist;
  else if (a.type === 'zoomIn') s.scale = 0.8 + 0.2 * p;
  return s;
};

interface ElementsProps {
  elements: DesignerElement[];
  onSelect: SelectHandler;
  previewTime?: number | null;
}

const imageCache = new Map<string, HTMLImageElement>();
const cacheListeners = new Set<() => void>();

// The Designer injects its authenticated fetch so the image loader can fall
// back to the same-origin proxy for cross-origin hosts that don't send CORS
// headers (otherwise `crossOrigin="anonymous"` fails and the canvas is blank).
type ImageFetch = (url: string, options?: RequestInit) => Promise<Response>;
let injectedFetch: ImageFetch | null = null;
export const setImageFetch = (fn: ImageFetch | null) => {
  injectedFetch = fn;
};

const isCrossOrigin = (src: string): boolean => {
  if (!/^https?:\/\//i.test(src)) return false;
  try {
    return new URL(src).origin !== window.location.origin;
  } catch {
    return false;
  }
};

// Pull a cross-origin image through the authenticated designer proxy and return
// a same-origin object URL (untainted — usable for both display and export).
const loadViaProxy = async (src: string): Promise<string | null> => {
  if (!injectedFetch) return null;
  try {
    const res = await injectedFetch(
      `/media/designer/proxy?url=${encodeURIComponent(src)}`
    );
    if (!res.ok) return null;
    const blob = await res.blob();
    if (!blob.type.startsWith('image/')) return null;
    return URL.createObjectURL(blob);
  } catch {
    return null;
  }
};

const notifyCacheListeners = () => {
  cacheListeners.forEach((listener) => listener());
};

const loadImage = (src: string): Promise<HTMLImageElement> => {
  const cached = imageCache.get(src);
  if (cached) return Promise.resolve(cached);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';

    const finish = (loaded: HTMLImageElement) => {
      imageCache.set(src, loaded);
      notifyCacheListeners();
      resolve(loaded);
    };

    img.onload = () => finish(img);

    img.onerror = () => {
      // A cross-origin host without CORS headers blocks the anonymous load.
      // Retry once through the same-origin authenticated proxy.
      if (isCrossOrigin(src)) {
        loadViaProxy(src).then((objectUrl) => {
          if (!objectUrl) {
            notifyCacheListeners();
            reject(new Error('Failed to load image'));
            return;
          }
          const proxied = new Image();
          proxied.onload = () => finish(proxied);
          proxied.onerror = () => {
            notifyCacheListeners();
            reject(new Error('Failed to load image'));
          };
          proxied.src = objectUrl; // same-origin blob — no crossOrigin / no taint
        });
        return;
      }
      notifyCacheListeners();
      reject(new Error('Failed to load image'));
    };

    img.src = src;
  });
};

const subscribeToCache = (listener: () => void) => {
  cacheListeners.add(listener);
  return () => cacheListeners.delete(listener);
};

const getCachedImage = (src: string | undefined) => {
  return src ? imageCache.get(src) || null : null;
};

// Natural pixel size of a loaded image (for crop math). Null if not yet cached.
export const getImageNaturalSize = (src?: string): { width: number; height: number } | null => {
  const img = src ? imageCache.get(src) : null;
  return img ? { width: img.naturalWidth, height: img.naturalHeight } : null;
};

const useLoadedImage = (src: string | undefined) => {
  const image = useSyncExternalStore(
    subscribeToCache,
    () => getCachedImage(src),
    () => getCachedImage(src)
  );

  useEffect(() => {
    if (!src) return;
    if (imageCache.has(src)) return;
    let cancelled = false;
    loadImage(src).catch(() => {
      if (!cancelled) notifyCacheListeners();
    });
    return () => {
      cancelled = true;
    };
  }, [src]);

  return image;
};

// Convert a DesignerGradient into Konva gradient props for a w×h box.
export const gradientFillProps = (
  g: DesignerGradient | undefined,
  width: number,
  height: number
): Record<string, unknown> => {
  if (!g || !g.stops?.length) return {};
  const colorStops = g.stops.flatMap((s) => [s.offset, s.color]);
  if (g.type === 'radial') {
    return {
      fillRadialGradientStartPoint: { x: width / 2, y: height / 2 },
      fillRadialGradientEndPoint: { x: width / 2, y: height / 2 },
      fillRadialGradientStartRadius: 0,
      fillRadialGradientEndRadius: Math.max(width, height) / 2,
      fillRadialGradientColorStops: colorStops,
    };
  }
  const angle = ((g.angle ?? 0) * Math.PI) / 180;
  const cx = width / 2;
  const cy = height / 2;
  const dx = (Math.cos(angle) * width) / 2;
  const dy = (Math.sin(angle) * height) / 2;
  return {
    fillLinearGradientStartPoint: { x: cx - dx, y: cy - dy },
    fillLinearGradientEndPoint: { x: cx + dx, y: cy + dy },
    fillLinearGradientColorStops: colorStops,
  };
};

interface ImageNodeProps {
  element: DesignerElement;
  onSelect: SelectHandler;
  anim?: AnimState | null;
}

const ImageNode: FC<ImageNodeProps> = ({ element, onSelect, anim }) => {
  const image = useLoadedImage(element.src);
  const flipX = element.flipX ? -1 : 1;
  const flipY = element.flipY ? -1 : 1;
  // Konva crop expects source-image pixels.
  const crop = element.crop
    ? { x: element.crop.x, y: element.crop.y, width: element.crop.width, height: element.crop.height }
    : undefined;
  return (
    <Group
      id={element.id}
      x={element.x + (anim?.offsetX || 0)}
      y={element.y + (anim?.offsetY || 0)}
      width={element.width}
      height={element.height}
      rotation={element.rotation}
      opacity={element.opacity * (anim ? anim.opacity : 1)}
      scaleX={anim?.scale ?? 1}
      scaleY={anim?.scale ?? 1}
      draggable={!element.locked}
      onClick={(e) => onSelect(element.id, e)}
      onTap={(e) => onSelect(element.id, e)}
    >
      <KonvaImage
        image={image || undefined}
        // Flip in place: mirror within the group's box.
        x={element.flipX ? element.width : 0}
        y={element.flipY ? element.height : 0}
        scaleX={flipX}
        scaleY={flipY}
        width={element.width}
        height={element.height}
        crop={crop}
        cornerRadius={element.borderRadius || 0}
      />
      {element.stroke && (
        <Rect
          x={0}
          y={0}
          width={element.width}
          height={element.height}
          stroke={element.stroke}
          strokeWidth={element.strokeWidth || 1}
          cornerRadius={element.borderRadius || 0}
          listening={false}
        />
      )}
    </Group>
  );
};

export const CanvasElements: FC<ElementsProps> = ({ elements, onSelect, previewTime }) => {
  return (
    <>
      {elements.map((el) => {
        if (el.hidden) return null;
        const anim = previewTime != null ? computeAnimation(el, previewTime) : null;
        const commonProps = {
          id: el.id,
          x: el.x + (anim?.offsetX || 0),
          y: el.y + (anim?.offsetY || 0),
          width: el.width,
          height: el.height,
          rotation: el.rotation,
          opacity: el.opacity * (anim ? anim.opacity : 1),
          scaleX: anim?.scale ?? 1,
          scaleY: anim?.scale ?? 1,
          draggable: !el.locked,
          onClick: (e: Konva.KonvaEventObject<MouseEvent>) => onSelect(el.id, e),
          onTap: (e: Konva.KonvaEventObject<TouchEvent>) => onSelect(el.id, e),
        };

        switch (el.type) {
          case 'text': {
            const shadow = el.textShadow;
            const outline = el.textStroke;
            return (
              <KonvaText
                key={el.id}
                {...commonProps}
                text={el.text || ''}
                fontFamily={el.fontFamily || 'Arial'}
                fontSize={el.fontSize || 16}
                fontStyle={`${el.fontStyle === 'italic' ? 'italic ' : ''}${
                  (el.fontWeight ?? 400) >= 600 ? 'bold' : 'normal'
                }`.trim()}
                fill={el.fill || '#000000'}
                align={el.align || 'left'}
                lineHeight={el.lineHeight || 1.2}
                letterSpacing={el.letterSpacing || 0}
                shadowColor={shadow?.color}
                shadowBlur={shadow?.blur}
                shadowOffsetX={shadow?.offsetX}
                shadowOffsetY={shadow?.offsetY}
                shadowEnabled={!!shadow}
                stroke={outline?.color}
                strokeWidth={outline?.width}
                fillAfterStrokeEnabled={!!outline}
              />
            );
          }

          case 'image':
            return <ImageNode key={el.id} element={el} onSelect={onSelect} anim={anim} />;

          case 'shape': {
            const grad = gradientFillProps(el.fillGradient, el.width, el.height);
            const hasGrad = !!el.fillGradient;
            const ax = anim?.offsetX || 0;
            const ay = anim?.offsetY || 0;
            switch (el.shape) {
              case 'ellipse':
                return (
                  <Ellipse
                    key={el.id}
                    {...commonProps}
                    x={el.x + el.width / 2 + ax}
                    y={el.y + el.height / 2 + ay}
                    radiusX={el.width / 2}
                    radiusY={el.height / 2}
                    fill={hasGrad ? undefined : el.fill || '#2B5CD3'}
                    {...grad}
                    stroke={el.stroke}
                    strokeWidth={el.strokeWidth}
                  />
                );
              case 'line':
                return (
                  <Line
                    key={el.id}
                    {...commonProps}
                    x={el.x + ax}
                    y={el.y + ay}
                    points={[0, 0, el.width, el.height]}
                    stroke={el.stroke || '#000000'}
                    strokeWidth={el.strokeWidth || 2}
                    fill={el.fill}
                  />
                );
              case 'star':
                return (
                  <Star
                    key={el.id}
                    {...commonProps}
                    x={el.x + el.width / 2 + ax}
                    y={el.y + el.height / 2 + ay}
                    numPoints={5}
                    innerRadius={el.width / 4}
                    outerRadius={el.width / 2}
                    fill={hasGrad ? undefined : el.fill || '#2B5CD3'}
                    {...grad}
                    stroke={el.stroke}
                    strokeWidth={el.strokeWidth}
                  />
                );
              default:
                return (
                  <Rect
                    key={el.id}
                    {...commonProps}
                    fill={hasGrad ? undefined : el.fill || '#2B5CD3'}
                    {...grad}
                    stroke={el.stroke}
                    strokeWidth={el.strokeWidth}
                    cornerRadius={el.borderRadius || 0}
                  />
                );
            }
          }

          default:
            return null;
        }
      })}
    </>
  );
};
