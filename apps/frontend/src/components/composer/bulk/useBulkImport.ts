'use client';

import { useState, useCallback } from 'react';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';

export interface BulkRow {
  content: string;
  channels: string[];
  scheduleAt: string;
  mediaUrl?: string;
  campaignId?: string;
}

export interface BulkResult {
  index: number;
  success: boolean;
  postId?: string;
  error?: string;
  warnings?: string[];
}

export function useBulkImport() {
  const fetch = useFetch();
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<BulkResult[] | null>(null);
  const [error, setError] = useState('');

  const submit = useCallback(async (rows: BulkRow[]) => {
    setLoading(true);
    setError('');
    setResults(null);
    try {
      const res = await fetch('/posts/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows }),
      });
      const data = await res.json();
      setResults(data?.rows || []);
      return data?.rows || [];
    } catch (err: any) {
      setError(err.message || 'Bulk import failed');
      return [];
    } finally {
      setLoading(false);
    }
  }, [fetch]);

  const reset = useCallback(() => {
    setResults(null);
    setError('');
  }, []);

  return { submit, loading, results, error, reset };
}
