import { fitWithin } from './panels/fit-within';
import { CHANNEL_PRESETS } from '@gitroom/nestjs-libraries/integrations/social/channel-presets';
import type { DesignerElement } from './designer.store';

export const computeCoverCrop = (
  srcW: number,
  srcH: number,
  targetW: number,
  targetH: number,
  focalPoint?: { x: number; y: number },
): { x: number; y: number; width: number; height: number } => {
  const fp = focalPoint || { x: 0.5, y: 0.5 };
  const targetRatio = targetW / targetH;
  const srcRatio = srcW / srcH;
  let sw: number;
  let sh: number;
  if (srcRatio > targetRatio) {
    sh = srcH;
    sw = srcH * targetRatio;
  } else {
    sw = srcW;
    sh = srcW / targetRatio;
  }
  const x = (srcW - sw) * Math.min(1, Math.max(0, fp.x));
  const y = (srcH - sh) * Math.min(1, Math.max(0, fp.y));
  return { x, y, width: sw, height: sh };
};

export type Anchor =
  | 'top-left' | 'top-center' | 'top-right'
  | 'center-left' | 'center' | 'center-right'
  | 'bottom-left' | 'bottom-center' | 'bottom-right';

export const deriveAnchor = (
  el: DesignerElement,
  source: { width: number; height: number }
): Anchor => {
  if (el.anchor) return el.anchor;
  const cx = el.x + el.width / 2;
  const cy = el.y + el.height / 2;
  const h =
    cx < source.width * 0.33 ? 'left' : cx > source.width * 0.67 ? 'right' : 'center';
  const v =
    cy < source.height * 0.33 ? 'top' : cy > source.height * 0.67 ? 'bottom' : 'center';
  if (h === 'left' && v === 'top') return 'top-left';
  if (h === 'center' && v === 'top') return 'top-center';
  if (h === 'right' && v === 'top') return 'top-right';
  if (h === 'left' && v === 'center') return 'center-left';
  if (h === 'right' && v === 'center') return 'center-right';
  if (h === 'left' && v === 'bottom') return 'bottom-left';
  if (h === 'center' && v === 'bottom') return 'bottom-center';
  if (h === 'right' && v === 'bottom') return 'bottom-right';
  return 'center';
};

const anchorX = (anchor: Anchor, targetW: number, w: number): number => {
  if (anchor.includes('left')) return 0;
  if (anchor.includes('right')) return targetW - w;
  return (targetW - w) / 2;
};

const anchorY = (anchor: Anchor, targetH: number, h: number): number => {
  if (anchor.includes('top')) return 0;
  if (anchor.includes('bottom')) return targetH - h;
  return (targetH - h) / 2;
};

export const smartReflow = (
  el: DesignerElement,
  source: { width: number; height: number },
  target: { width: number; height: number; formatId?: string },
): Partial<DesignerElement> => {
  const scaleX = target.width / source.width;
  const scaleY = target.height / source.height;
  const scale = Math.min(scaleX, scaleY);

  const anchor = deriveAnchor(el, source);
  let newW: number;
  let newH: number;
  const result: Partial<DesignerElement> = { anchor };

  if (el.type === 'image') {
    const mode = el.fitMode || 'cover';
    if (mode === 'cover' || mode === 'contain') {
      const { width: w, height: h } = fitWithin(
        el.naturalWidth || el.width || source.width,
        el.naturalHeight || el.height || source.height,
        target.width,
        target.height,
      );
      newW = mode === 'cover' ? target.width : w;
      newH = mode === 'cover' ? target.height : h;
      result.width = newW;
      result.height = newH;
      result.fitMode = mode;
      result.focalPoint = el.focalPoint || { x: 0.5, y: 0.5 };
    } else {
      newW = Math.max(10, Math.round(el.width * scaleX));
      newH = Math.max(10, Math.round(el.height * scaleY));
      result.width = newW;
      result.height = newH;
    }
  } else {
    newW = Math.max(10, Math.round(el.width * scale));
    newH = Math.max(10, Math.round(el.height * scale));
    result.width = newW;
    result.height = newH;

    if (el.fontSize) {
      const newFontSize = Math.round(el.fontSize * scale);
      result.fontSize = Math.max(10, newFontSize);
    }
  }

  let x = anchorX(anchor, target.width, newW);
  let y = anchorY(anchor, target.height, newH);

  // Keep text, images, and shapes inside the title-safe area so they remain
  // readable / uncropped by platform overlays. For images and shapes we only
  // nudge when the element actually overlaps a safe-zone edge, preserving the
  // user's intentional edge-to-edge placements when possible.
  if (el.type === 'text' || el.type === 'image' || el.type === 'shape') {
    const safe = getSafeZoneInset(target.formatId || '', target.width, target.height);
    if (el.type === 'text') {
      // Text is fully constrained inside the safe zone.
      if (x < safe.left) x = safe.left;
      if (x + newW > safe.right) x = Math.max(safe.left, safe.right - newW);
      if (y < safe.top) y = safe.top;
      if (y + newH > safe.bottom) y = Math.max(safe.top, safe.bottom - newH);
    } else {
      // Images / shapes: nudge only the edge that crosses a safe boundary, and
      // only when the element actually fits inside the safe area. A full-bleed
      // element (wider/taller than the safe zone, e.g. a cover photo) is an
      // intentional edge-to-edge placement and must be preserved.
      const safeW = safe.right - safe.left;
      const safeH = safe.bottom - safe.top;
      if (newW <= safeW) {
        if (x < safe.left) x = safe.left;
        if (x + newW > safe.right) x = Math.max(safe.left, safe.right - newW);
      }
      if (newH <= safeH) {
        if (y < safe.top) y = safe.top;
        if (y + newH > safe.bottom) y = Math.max(safe.top, safe.bottom - newH);
      }
    }
  }

  result.x = x;
  result.y = y;
  return result;
};

export const estimateFocalPoint = (naturalWidth: number, naturalHeight: number): { x: number; y: number } => {
  const ratio = naturalWidth / naturalHeight;
  if (ratio < 1) {
    return { x: 0.5, y: 0.35 };
  }
  return { x: 0.5, y: 0.5 };
};

/**
 * Lightweight client-side focal-point detection.
 *
 * Downsamples the image, converts to grayscale, and computes the centroid of
 * the brightest pixels (subject/face highlight heuristic). Falls back to the
 * center if the image cannot be loaded or the canvas is tainted.
 */
export const detectFocalPointClient = (imageUrl: string): Promise<{ x: number; y: number }> => {
  return new Promise((resolve) => {
    if (typeof window === 'undefined' || !('Image' in window)) {
      resolve({ x: 0.5, y: 0.5 });
      return;
    }

    const img = new Image();
    img.crossOrigin = 'anonymous';

    const fallback = () => {
      clearTimeout(timeout);
      resolve({ x: 0.5, y: 0.5 });
    };

    // Guard against environments (or CORS taint) where the image never fires.
    const timeout = setTimeout(fallback, 1000);

    img.onerror = fallback;

    img.onload = () => {
      clearTimeout(timeout);
      try {
        const canvas = document.createElement('canvas');
        const maxDim = 200;
        const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
        canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));

        const ctx = canvas.getContext('2d');
        if (!ctx) return fallback();

        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;

        let totalBrightness = 0;
        let count = 0;
        for (let i = 0; i < data.length; i += 4) {
          const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
          totalBrightness += lum;
          count++;
        }
        if (count === 0) return fallback();
        const mean = totalBrightness / count;
        const threshold = mean * 1.1;

        let weightedX = 0;
        let weightedY = 0;
        let weightSum = 0;
        for (let y = 0; y < canvas.height; y++) {
          for (let x = 0; x < canvas.width; x++) {
            const i = (y * canvas.width + x) * 4;
            const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
            if (lum > threshold) {
              const w = lum - mean;
              weightedX += x * w;
              weightedY += y * w;
              weightSum += w;
            }
          }
        }

        if (weightSum === 0) return fallback();

        const x = weightedX / weightSum / canvas.width;
        let y = weightedY / weightSum / canvas.height;

        // For portrait photos, bias slightly toward the upper-center where faces
        // typically sit, while still honoring the detected centroid.
        if (img.naturalHeight > img.naturalWidth) {
          y = 0.25 + y * 0.5;
        }

        resolve({
          x: Math.min(1, Math.max(0, x)),
          y: Math.min(1, Math.max(0, y)),
        });
      } catch {
        fallback();
      }
    };

    img.src = imageUrl;
  });
};

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

/**
 * Provider-aware focal-point detection.
 *
 * When an authenticated fetcher is supplied, asks the backend to run a
 * vision-capable AI provider. If the provider returns a valid focal point,
 * use it. Otherwise — or if AI is not configured / the call fails — fall back
 * to the client-side brightness-centroid heuristic (which itself falls back to
 * center).
 */
export const detectFocalPoint = async (
  imageUrl: string,
  fetch?: FetchLike,
): Promise<{ x: number; y: number }> => {
  if (fetch) {
    try {
      const res = await fetch('/media/detect-focal-point', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageUrl }),
      });
      if (res.ok) {
        const data = (await res.json()) as {
          x?: number;
          y?: number;
          source?: 'provider' | 'fallback';
        };
        if (
          data.source === 'provider' &&
          typeof data.x === 'number' &&
          typeof data.y === 'number' &&
          !Number.isNaN(data.x) &&
          !Number.isNaN(data.y)
        ) {
          return {
            x: Math.min(1, Math.max(0, data.x)),
            y: Math.min(1, Math.max(0, data.y)),
          };
        }
      }
    } catch {
      // fall through to client heuristic
    }
  }
  return detectFocalPointClient(imageUrl);
};

export const getSafeZoneInset = (
  formatId: string,
  width: number,
  height: number,
) => {
  const preset = CHANNEL_PRESETS.find((p) => p.id === formatId);
  if (!preset?.safeZones?.length) {
    return {
      left: width * 0.05,
      top: height * 0.05,
      right: width * 0.95,
      bottom: height * 0.95,
    };
  }
  const minX = Math.min(...preset.safeZones.map((z) => z.x));
  const minY = Math.min(...preset.safeZones.map((z) => z.y));
  const maxX = Math.max(...preset.safeZones.map((z) => z.x + z.width));
  const maxY = Math.max(...preset.safeZones.map((z) => z.y + z.height));
  return { left: minX, top: minY, right: width - maxX, bottom: height - maxY };
};
