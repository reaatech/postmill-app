'use client';

import dynamic from 'next/dynamic';

const DesignerPage = dynamic(
  () =>
    import('@gitroom/frontend/components/media-tools/designer/designer').then(
      (m) => m.Designer
    ),
  { ssr: false }
);

export default function DesignerRoute() {
  return (
    <div className="h-full flex flex-col">
      <DesignerPage />
    </div>
  );
}
