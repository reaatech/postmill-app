'use client';

import dynamic from 'next/dynamic';
import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';

const DesignerPage = dynamic(
  () =>
    import('@gitroom/frontend/components/media-tools/designer/designer').then(
      (m) => m.Designer
    ),
  { ssr: false }
);

// "Open in Designer" (stock photos/videos) navigates here with the asset in the
// query string — no modal. When `url` is present we build the same initialAsset
// the picker used to pass; otherwise the Designer shows its preset picker.
function DesignerWithParams() {
  const sp = useSearchParams();
  const url = sp.get('url') || undefined;
  const designId = sp.get('designId') || undefined;
  const num = (k: string) => (sp.get(k) ? Number(sp.get(k)) : undefined);

  const initialAsset = url
    ? {
        url,
        type: (sp.get('type') as 'photo' | 'video') || 'photo',
        thumbUrl: sp.get('thumbUrl') || undefined,
        author: sp.get('author') || undefined,
        authorUrl: sp.get('authorUrl') || undefined,
        downloadLocation: sp.get('downloadLocation') || undefined,
        source: sp.get('source') || undefined,
        width: num('w'),
        height: num('h'),
        naturalWidth: num('nw'),
        naturalHeight: num('nh'),
      }
    : undefined;

  // Bulk handoff: "Open all in Designer" from the Files library stashes the
  // selected assets in sessionStorage (too many/too long for the query string)
  // and navigates here with ?bulk=1. Each is placed as a cascaded element.
  let initialAssets:
    | Array<{
        url: string;
        type?: 'photo' | 'video';
        thumbUrl?: string;
        naturalWidth?: number;
        naturalHeight?: number;
        source?: string;
      }>
    | undefined;
  if (sp.get('bulk') && typeof window !== 'undefined') {
    try {
      const raw = window.sessionStorage.getItem('designer:bulk-assets');
      if (raw) initialAssets = JSON.parse(raw);
    } catch {
      // ignore malformed handoff
    }
  }

  // Caption handoff: the Deepgram studio stashes the source video + computed word
  // timings in sessionStorage and navigates here with ?captions=1. The Designer opens a
  // video project with the clip + a caption track already built (no re-transcribe).
  let initialCaptionVideo:
    | { url: string; fileId?: string; width?: number; height?: number; words: { word: string; start: number; end: number }[] }
    | undefined;
  if (sp.get('captions') && typeof window !== 'undefined') {
    try {
      const raw = window.sessionStorage.getItem('designer:caption-handoff');
      if (raw) initialCaptionVideo = JSON.parse(raw);
    } catch {
      // ignore malformed handoff
    }
  }

  // Timeline handoff: studios/open-in-designer stashes a video/audio artifact in
  // sessionStorage and navigates here with ?timeline=1. The Designer lands it directly
  // on the video/audio track.
  let initialTimelineMedia:
    | { type: 'video' | 'audio'; url: string; fileId?: string; width?: number; height?: number }
    | undefined;
  if (sp.get('timeline') && typeof window !== 'undefined') {
    try {
      const raw = window.sessionStorage.getItem('designer:timeline-handoff');
      if (raw) initialTimelineMedia = JSON.parse(raw);
    } catch {
      // ignore malformed handoff
    }
  }

  // Clear consumed handoff keys so a refresh does not re-apply them.
  if (typeof window !== 'undefined') {
    window.sessionStorage.removeItem('designer:timeline-handoff');
    window.sessionStorage.removeItem('designer:caption-handoff');
    window.sessionStorage.removeItem('designer:bulk-assets');
  }

  // The Designer initialises its store once from initialAsset, so remount it
  // when the asset changes (navigating straight from one asset to another).
  return (
    <DesignerPage
      key={
        designId ||
        url ||
        (initialTimelineMedia
          ? `timeline-${initialTimelineMedia.type}`
          : initialCaptionVideo
          ? 'captions'
          : initialAssets
          ? 'bulk'
          : 'blank')
      }
      designId={designId}
      initialAsset={initialAsset}
      initialAssets={initialAssets}
      initialCaptionVideo={initialCaptionVideo}
      initialTimelineMedia={initialTimelineMedia}
    />
  );
}

export default function DesignerRoute() {
  return (
    <div className="h-full flex flex-col">
      <Suspense fallback={null}>
        <DesignerWithParams />
      </Suspense>
    </div>
  );
}
