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

  // The Designer initialises its store once from initialAsset, so remount it
  // when the asset changes (navigating straight from one asset to another).
  return (
    <DesignerPage
      key={url || (initialAssets ? 'bulk' : 'blank')}
      initialAsset={initialAsset}
      initialAssets={initialAssets}
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
