# Designer (native design editor)

> Verified against v3.9.0 (Designer Phase 2).

The Designer is the native, open-source design editor that replaced the proprietary Polotno SDK.
It is built on **react-konva** (Konva.js, MIT) and lives under `/media/designer`. It reads input
from and writes output to the **Files** library; it never stores its own assets outside `/files`.

## Frontend architecture

All components live under `apps/frontend/src/components/media-tools/designer/`.

- **`designer.store.ts`** — a per-mount **Zustand** store created by `createDesignerStore(w, h, attribution)`.
  No module-level singleton (it resets on unmount). The document model is:
  - `DesignerDoc { version, width, height, pages: DesignerPage[], attribution?, durationMs? }`
  - `DesignerPage { id, background, bg?: DesignerBackground, children: DesignerElement[] }`
  - `DesignerElement` — `text | image | shape` with geometry, `opacity`, `locked`, `hidden`,
    `groupId`, `flipX/Y`, `crop`, text styling + `textShadow`/`textStroke`, `fillGradient`, and an
    optional entrance `animation`.
  - State also tracks `selectedIds`, `currentPage`, `zoom`, undo/redo `history`, `clipboard`, and
    `previewTime` (animation playback clock).
- **`canvas.tsx`** — the Konva `Stage`. Handles multi-select (shift/⌘ + marquee), group-aware
  selection, snapping/alignment guides, a custom `Transformer` with a dimension HUD, wheel-zoom,
  space-drag pan, the keyboard-shortcut matrix, and drag-and-drop drops from panels (payload key
  `application/x-designer-element`).
- **`elements.tsx`** — element renderers (text/image/shape), gradient fills, crop, flip, and
  entrance-animation interpolation driven by `previewTime`.
- **Panels** (`panels/`) — Templates, Text, Elements, Icons, Photos, Uploads, Background, Layers,
  AI (gated on an active org AI provider via `useAiActive`), Brand, plus the selection **Inspector**.
- **`controls/`** — reusable control primitives (color swatch, slider, segmented control, stepper,
  font-preview picker). **`fonts.ts`** — curated OFL fonts + `ensureFontLoaded`.
- **`timeline.tsx`** — per-element entrance animations with live preview and **WebM** export via
  `MediaRecorder` + `canvas.captureStream` (no ffmpeg dependency).
- **`export-dialog.tsx`** — PNG / JPEG / transparent-PNG, high-res `pixelRatio`, multi-page carousel
  export, and "Save & Post". Reuses `SaveToFilesModal` for the destination folder.

### Cross-origin canvas
Konva's `toBlob`/`toDataURL` taints on cross-origin images. Element images load with
`crossOrigin="anonymous"`; for object storage you must enable CORS (see the operations storage
guide) or route through the same-origin image proxy (`GET /media/designer/proxy`).

## Backend

Layering is Controller → Service → Repository (only repositories touch Prisma).

- **Models:** `Design`, `DesignTemplate` (additive, nullable/defaulted — db-push-safe).
- **CRUD:** `DesignController` / `DesignTemplateController` — `/media/designs`,
  `/media/design-templates`. `DesignerProxyController` — `GET /media/designer/proxy` (org-bound,
  `safeFetch`, fail-closed on non-image, size-capped).
- **AI ops** (`MediaController`, credit-checked, `@RequirePermission('media','create')`):
  `POST /media/remove-background`, `POST /media/inpaint`, `POST /media/upscale` — delegate to
  `AiMediaService` (Replicate via `@reaatech/media-pipeline-mcp-*`).
- **Server-side render** (`DesignRenderService`, node-canvas): `POST /media/designs/render`
  → PNG or PDF (pdfkit). **Bulk generation** (`DesignBulkService`): `POST /media/designs/bulk-generate`
  substitutes `{{variables}}` per row and renders a batch.
- **Brand kit:** `AIBrandProfile.logoFileIds` / `palette` / `fontFamilies` are read/written through
  the brand profile API.

## Not yet implemented

- **Real-time multi-user collaboration (O5)** — deferred. Requires adding a WebSocket platform
  (`@nestjs/websockets` + an adapter) and a CRDT layer (Yjs) for conflict-free editing. Tracked in
  `dev/MEDIA_PHASE_2.md`.
