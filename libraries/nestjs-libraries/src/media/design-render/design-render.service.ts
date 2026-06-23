/// <reference path="./pdfkit.d.ts" />
import { Injectable, Logger } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import { safeFetch } from '@gitroom/nestjs-libraries/dtos/webhooks/safe.fetch';
import {
  DesignerDoc,
  DesignerElement,
  DesignerGradient,
  DesignerPage,
  RenderOptions,
} from './design-render.types';

const MAX_IMAGE_BYTES = 25 * 1024 * 1024;

// node-canvas is a native module whose binary may not be built in every
// environment. Load it lazily so a missing binary only disables the render
// endpoints — it must NOT take down the whole module (which also hosts
// /files, /brands, /designs, etc.).
type CanvasModule = typeof import('canvas');
let _canvasModule: CanvasModule | null = null;
const loadCanvasModule = async (): Promise<CanvasModule> => {
  if (!_canvasModule) {
    _canvasModule = await import('canvas');
  }
  return _canvasModule;
};

@Injectable()
export class DesignRenderService {
  private readonly _logger = new Logger(DesignRenderService.name);

  /**
   * Render a single page of a DesignerDoc to a PNG Buffer using node-canvas.
   */
  async renderPage(
    doc: DesignerDoc,
    pageIndex: number,
    opts?: RenderOptions
  ): Promise<Buffer> {
    const page = doc.pages?.[pageIndex];
    if (!page) {
      throw new Error(`Page ${pageIndex} out of range`);
    }

    const ratio = opts?.pixelRatio && opts.pixelRatio > 0 ? opts.pixelRatio : 1;
    const width = Math.max(1, Math.round(doc.width * ratio));
    const height = Math.max(1, Math.round(doc.height * ratio));

    const { createCanvas } = await loadCanvasModule();
    const canvas = createCanvas(width, height);
    // Type the context loosely — node-canvas's 2D context is a near-complete
    // superset of the DOM one but its TS types differ in places.
    const ctx: any = canvas.getContext('2d');
    ctx.scale(ratio, ratio);

    if (!opts?.transparent) {
      await this.drawBackground(ctx, doc, page);
    }

    for (const el of page.children ?? []) {
      if (el.hidden) {
        continue;
      }
      try {
        await this.drawElement(ctx, el);
      } catch (err) {
        this._logger.warn(
          `Skipping element ${el?.id} (${el?.type}) during render: ${
            (err as Error)?.message
          }`
        );
      }
    }

    return canvas.toBuffer('image/png');
  }

  /**
   * Render every page of a DesignerDoc to PNG Buffers.
   */
  async renderAllPages(
    doc: DesignerDoc,
    opts?: RenderOptions
  ): Promise<Buffer[]> {
    const out: Buffer[] = [];
    for (let i = 0; i < (doc.pages?.length ?? 0); i++) {
      out.push(await this.renderPage(doc, i, opts));
    }
    return out;
  }

  /**
   * Render a DesignerDoc to a multi-page PDF (one PDF page per design page),
   * each sized to the doc and embedding the rendered PNG.
   */
  async renderPdf(doc: DesignerDoc, opts?: RenderOptions): Promise<Buffer> {
    const pages = await this.renderAllPages(doc, opts);
    const width = Math.max(1, Math.round(doc.width));
    const height = Math.max(1, Math.round(doc.height));

    const pdf = new PDFDocument({
      size: [width, height],
      margin: 0,
      autoFirstPage: false,
    });

    const chunks: Buffer[] = [];
    const done = new Promise<Buffer>((resolve, reject) => {
      pdf.on('data', (chunk: Buffer) => chunks.push(chunk));
      pdf.on('end', () => resolve(Buffer.concat(chunks)));
      pdf.on('error', reject);
    });

    for (const png of pages) {
      pdf.addPage({ size: [width, height], margin: 0 });
      pdf.image(png, 0, 0, { width, height });
    }
    pdf.end();

    return done;
  }

  // ---------------------------------------------------------------------------

  private async drawBackground(
    ctx: any,
    doc: DesignerDoc,
    page: DesignerPage
  ): Promise<void> {
    const bg = page.bg;
    if (bg?.type === 'gradient' && bg.gradient) {
      ctx.save();
      ctx.fillStyle = this.buildGradient(ctx, bg.gradient, doc.width, doc.height);
      ctx.fillRect(0, 0, doc.width, doc.height);
      ctx.restore();
      return;
    }

    if (bg?.type === 'image' && (bg.src || bg.fileId)) {
      const img = await this.loadImageSafe(bg.src);
      if (img) {
        ctx.save();
        ctx.drawImage(img, 0, 0, doc.width, doc.height);
        ctx.restore();
        return;
      }
    }

    const color = bg?.color || page.background || '#ffffff';
    ctx.save();
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, doc.width, doc.height);
    ctx.restore();
  }

  private async drawElement(ctx: any, el: DesignerElement): Promise<void> {
    ctx.save();
    ctx.globalAlpha = el.opacity ?? 1;

    // Transform around the element's centre so rotation/flip stay centred.
    const cx = el.x + el.width / 2;
    const cy = el.y + el.height / 2;
    ctx.translate(cx, cy);
    if (el.rotation) {
      ctx.rotate((el.rotation * Math.PI) / 180);
    }
    if (el.flipX || el.flipY) {
      ctx.scale(el.flipX ? -1 : 1, el.flipY ? -1 : 1);
    }
    ctx.translate(-el.width / 2, -el.height / 2);
    // Local coordinate space now has the element at (0,0).

    if (el.type === 'shape') {
      this.drawShape(ctx, el);
    } else if (el.type === 'text') {
      this.drawText(ctx, el);
    } else if (el.type === 'image') {
      await this.drawImage(ctx, el);
    }

    ctx.restore();
  }

  private drawShape(ctx: any, el: DesignerElement): void {
    const fill =
      el.fillGradient
        ? this.buildGradient(ctx, el.fillGradient, el.width, el.height)
        : el.fill;
    const shape = el.shape || 'rect';

    if (shape === 'line') {
      ctx.beginPath();
      ctx.moveTo(0, el.height / 2);
      ctx.lineTo(el.width, el.height / 2);
      ctx.strokeStyle = el.stroke || el.fill || '#000000';
      ctx.lineWidth = el.strokeWidth || 1;
      ctx.stroke();
      return;
    }

    if (shape === 'ellipse') {
      ctx.beginPath();
      ctx.ellipse(
        el.width / 2,
        el.height / 2,
        el.width / 2,
        el.height / 2,
        0,
        0,
        Math.PI * 2
      );
    } else if (shape === 'star') {
      this.tracePath(ctx, this.starPoints(el.width, el.height));
    } else {
      // rect, optionally rounded
      this.traceRoundRect(ctx, 0, 0, el.width, el.height, el.borderRadius || 0);
    }

    if (fill) {
      ctx.fillStyle = fill;
      ctx.fill();
    }
    if (el.stroke && (el.strokeWidth || 0) > 0) {
      ctx.strokeStyle = el.stroke;
      ctx.lineWidth = el.strokeWidth as number;
      ctx.stroke();
    }
  }

  private drawText(ctx: any, el: DesignerElement): void {
    const text = el.text ?? '';
    if (!text) {
      return;
    }
    const fontSize = el.fontSize || 16;
    const fontWeight = el.fontWeight || 400;
    const fontStyle = el.fontStyle === 'italic' ? 'italic' : 'normal';
    const fontFamily = el.fontFamily || 'sans-serif';
    const lineHeight = (el.lineHeight || 1.2) * fontSize;
    const align = el.align || 'left';
    const letterSpacing = el.letterSpacing || 0;

    ctx.font = `${fontStyle} ${fontWeight} ${fontSize}px ${fontFamily}`;
    ctx.textBaseline = 'top';
    ctx.fillStyle = el.fill || '#000000';
    if (typeof ctx.textAlign === 'string') {
      ctx.textAlign = 'left'; // we position manually
    }

    if (el.textShadow) {
      ctx.shadowColor = el.textShadow.color;
      ctx.shadowBlur = el.textShadow.blur || 0;
      ctx.shadowOffsetX = el.textShadow.offsetX || 0;
      ctx.shadowOffsetY = el.textShadow.offsetY || 0;
    }

    const lines = this.wrapLines(ctx, text, el.width, letterSpacing);
    let y = 0;
    for (const line of lines) {
      const lineWidth = this.measureLine(ctx, line, letterSpacing);
      let x = 0;
      if (align === 'center') {
        x = (el.width - lineWidth) / 2;
      } else if (align === 'right') {
        x = el.width - lineWidth;
      }
      this.drawTextLine(ctx, line, x, y, letterSpacing, el);
      y += lineHeight;
    }
  }

  private drawTextLine(
    ctx: any,
    line: string,
    startX: number,
    y: number,
    letterSpacing: number,
    el: DesignerElement
  ): void {
    if (!letterSpacing) {
      if (el.textStroke && el.textStroke.width > 0) {
        ctx.strokeStyle = el.textStroke.color;
        ctx.lineWidth = el.textStroke.width;
        ctx.strokeText(line, startX, y);
      }
      ctx.fillText(line, startX, y);
      return;
    }
    let x = startX;
    for (const ch of line) {
      if (el.textStroke && el.textStroke.width > 0) {
        ctx.strokeStyle = el.textStroke.color;
        ctx.lineWidth = el.textStroke.width;
        ctx.strokeText(ch, x, y);
      }
      ctx.fillText(ch, x, y);
      x += ctx.measureText(ch).width + letterSpacing;
    }
  }

  private async drawImage(ctx: any, el: DesignerElement): Promise<void> {
    const img = await this.loadImageSafe(el.src);
    if (!img) {
      return;
    }

    if (el.borderRadius && el.borderRadius > 0) {
      this.traceRoundRect(ctx, 0, 0, el.width, el.height, el.borderRadius);
      ctx.clip();
    }

    const crop = el.crop;
    if (crop) {
      ctx.drawImage(
        img,
        crop.x,
        crop.y,
        crop.width,
        crop.height,
        0,
        0,
        el.width,
        el.height
      );
    } else {
      ctx.drawImage(img, 0, 0, el.width, el.height);
    }
  }

  // ---------------------------------------------------------------------------

  private buildGradient(
    ctx: any,
    g: DesignerGradient,
    width: number,
    height: number
  ): any {
    let grad: any;
    if (g.type === 'radial') {
      const r = Math.max(width, height) / 2;
      grad = ctx.createRadialGradient(
        width / 2,
        height / 2,
        0,
        width / 2,
        height / 2,
        r
      );
    } else {
      const angle = ((g.angle ?? 0) * Math.PI) / 180;
      const halfW = width / 2;
      const halfH = height / 2;
      const dx = Math.cos(angle) * halfW;
      const dy = Math.sin(angle) * halfH;
      grad = ctx.createLinearGradient(
        halfW - dx,
        halfH - dy,
        halfW + dx,
        halfH + dy
      );
    }
    for (const stop of g.stops ?? []) {
      const offset = Math.min(1, Math.max(0, stop.offset));
      grad.addColorStop(offset, stop.color);
    }
    return grad;
  }

  private traceRoundRect(
    ctx: any,
    x: number,
    y: number,
    w: number,
    h: number,
    r: number
  ): void {
    const radius = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    if (radius <= 0) {
      ctx.rect(x, y, w, h);
      return;
    }
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
  }

  private starPoints(w: number, h: number): Array<[number, number]> {
    const cx = w / 2;
    const cy = h / 2;
    const outerX = w / 2;
    const outerY = h / 2;
    const inner = 0.5;
    const points: Array<[number, number]> = [];
    const spikes = 5;
    for (let i = 0; i < spikes * 2; i++) {
      const angle = (Math.PI / spikes) * i - Math.PI / 2;
      const rx = i % 2 === 0 ? outerX : outerX * inner;
      const ry = i % 2 === 0 ? outerY : outerY * inner;
      points.push([cx + Math.cos(angle) * rx, cy + Math.sin(angle) * ry]);
    }
    return points;
  }

  private tracePath(ctx: any, points: Array<[number, number]>): void {
    if (!points.length) {
      return;
    }
    ctx.beginPath();
    ctx.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i][0], points[i][1]);
    }
    ctx.closePath();
  }

  private measureLine(ctx: any, line: string, letterSpacing: number): number {
    if (!letterSpacing) {
      return ctx.measureText(line).width;
    }
    let w = 0;
    for (const ch of line) {
      w += ctx.measureText(ch).width + letterSpacing;
    }
    return w;
  }

  private wrapLines(
    ctx: any,
    text: string,
    maxWidth: number,
    letterSpacing: number
  ): string[] {
    const out: string[] = [];
    for (const rawLine of text.split('\n')) {
      const words = rawLine.split(' ');
      let current = '';
      for (const word of words) {
        const candidate = current ? `${current} ${word}` : word;
        if (
          this.measureLine(ctx, candidate, letterSpacing) > maxWidth &&
          current
        ) {
          out.push(current);
          current = word;
        } else {
          current = candidate;
        }
      }
      out.push(current);
    }
    return out;
  }

  private async loadImageSafe(src?: string): Promise<any | null> {
    if (!src) {
      return null;
    }
    try {
      const { loadImage } = await loadCanvasModule();
      if (src.startsWith('data:')) {
        return await loadImage(src);
      }
      const res = await safeFetch(src);
      if (!res.ok) {
        return null;
      }
      const contentLength = res.headers.get('content-length');
      if (contentLength && parseInt(contentLength, 10) > MAX_IMAGE_BYTES) {
        return null;
      }
      const arrayBuffer = await res.arrayBuffer();
      if (arrayBuffer.byteLength > MAX_IMAGE_BYTES) {
        return null;
      }
      return await loadImage(Buffer.from(arrayBuffer));
    } catch (err) {
      this._logger.warn(`Failed to load image: ${(err as Error)?.message}`);
      return null;
    }
  }
}
