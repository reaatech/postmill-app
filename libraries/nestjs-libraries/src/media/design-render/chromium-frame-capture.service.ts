import { Injectable, Logger } from '@nestjs/common';
import puppeteer from 'puppeteer';
import * as path from 'path';
import { FRAME_RENDERER_SCRIPT } from './frame-renderer-script';
import type { VideoOutput } from './design-render.types';

export interface FrameCaptureProgress {
  frame: number;
  total: number;
}

export interface RenderRouteOptions {
  jobId: string;
  orgId: string;
  token: string;
}

@Injectable()
export class ChromiumFrameCaptureService {
  private readonly _logger = new Logger(ChromiumFrameCaptureService.name);

  /**
   * Render every frame of a VideoOutput to PNG files in `frameDir`.
   * Files are named `frame-00001.png`, `frame-00002.png`, etc.
   * Returns the number of frames written.
   */
  async captureFrames(
    output: VideoOutput,
    fps: number,
    frameDir: string,
    onProgress?: (progress: FrameCaptureProgress) => void,
    routeOptions?: RenderRouteOptions,
  ): Promise<number> {
    const width = output.width;
    const height = output.height;
    const durationMs = output.durationMs;
    const totalFrames = Math.max(1, Math.ceil((durationMs / 1000) * fps));

    const browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu',
        '--mute-audio',
      ],
    });

    try {
      const page = await browser.newPage();
      await page.setViewport({ width, height, deviceScaleFactor: 1 });

      const baseUrl =
        process.env.NEXT_PUBLIC_BACKEND_URL ||
        process.env.FRONTEND_URL ||
        'http://localhost:3000';

      if (routeOptions) {
        const renderUrl = `${baseUrl.replace(/\/$/, '')}/media/designs/render-frame/${routeOptions.jobId}?token=${encodeURIComponent(routeOptions.token)}`;
        await page.goto(renderUrl, { waitUntil: 'networkidle0' });
      } else {
        const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <base href="${baseUrl}">
  <style>body{margin:0;background:#000}</style>
</head>
<body>
  <canvas id="frame-canvas"></canvas>
  <script>
    window.__DATA = {
      output: ${JSON.stringify(output)},
      baseUrl: ${JSON.stringify(baseUrl)}
    };
    ${FRAME_RENDERER_SCRIPT}
  </script>
</body>
</html>`;

        await page.setContent(html, { waitUntil: 'networkidle0' });
      }
      await page.waitForFunction(
        () => !!(window as any).__FRAME_API,
        { timeout: 30000 },
      );

      // Preload images/videos so frame rendering is not stalled by network.
      await page.evaluate(() => (window as any).__FRAME_API.preload());

      for (let i = 0; i < totalFrames; i++) {
        const timeMs = Math.min((i * 1000) / fps, durationMs);
        await page.evaluate(
          (t: number) => (window as any).__FRAME_API.renderFrame(t),
          timeMs,
        );

        const framePath = path.join(
          frameDir,
          `frame-${String(i + 1).padStart(5, '0')}.png`,
        );
        const canvas = await page.$('#frame-canvas');
        if (!canvas) {
          throw new Error('Frame canvas disappeared during capture');
        }
        await canvas.screenshot({ path: framePath, type: 'png' });

        if (onProgress) {
          onProgress({ frame: i + 1, total: totalFrames });
        }
      }

      this._logger.log(
        `Captured ${totalFrames} frames (${width}x${height} @ ${fps}fps)`,
      );
      return totalFrames;
    } finally {
      await browser.close();
    }
  }
}
