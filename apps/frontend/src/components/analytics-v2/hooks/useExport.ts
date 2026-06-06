'use client';

import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useCallback } from 'react';

interface ExportParams {
  from: string;
  to: string;
  format: 'csv' | 'json';
  integrations?: string[];
  compare?: boolean;
}

function serializeParams(p: ExportParams): string {
  const params = new URLSearchParams({
    from: p.from,
    to: p.to,
    format: p.format,
  });
  if (p.integrations?.length) {
    params.set('integrations', p.integrations.join(','));
  }
  if (p.compare !== undefined) {
    params.set('compare', String(p.compare));
  }
  return `/analytics/v2/export?${params.toString()}`;
}

export const useExport = () => {
  const fetch = useFetch();

  const download = useCallback(
    async (params: ExportParams) => {
      const url = serializeParams(params);
      const res = await fetch(url);
      if (!res.ok) throw new Error('Failed to export analytics data');
      const blob = await res.blob();
      const ext = params.format === 'csv' ? 'csv' : 'json';
      const filename = `analytics-export.${ext}`;
      const blobUrl = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = blobUrl;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(blobUrl);
    },
    [fetch]
  );

  return { download };
};
