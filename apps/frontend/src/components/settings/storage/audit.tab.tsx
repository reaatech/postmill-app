'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { DataTable } from '@gitroom/frontend/components/ui/data-table';

export const AuditTab: React.FC = () => {
  const fetch = useFetch();
  const toast = useToaster();
  const [logs, setLogs] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(0);
  const limit = 25;

  const loadLogs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/settings/storage/audit-log?limit=${limit}&offset=${currentPage * limit}`
      );
      if (res.ok) {
        const data = await res.json();
        setLogs(data.logs);
        setTotal(data.total);
      } else {
        toast.show('Failed to load audit logs', 'warning');
      }
    } catch {
      toast.show('Failed to load audit logs', 'warning');
    } finally {
      setLoading(false);
    }
  }, [fetch, currentPage, toast]);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  const formatDate = (date: string) => {
    return new Date(date).toLocaleString();
  };

  const actionLabel = (action: string) => {
    const map: Record<string, string> = {
      'storage.create': 'Created',
      'storage.update': 'Updated',
      'storage.delete': 'Deleted',
      'storage.mount': 'Mounted',
      'storage.unmount': 'Unmounted',
      'storage.set-default-folder': 'Set as Default',
      'storage.migrate': 'Migrated',
    };
    return map[action] || action;
  };

  const pages = Math.ceil(total / limit);

  return (
    <div className="flex flex-col gap-[20px]">
      <h3 className="text-[20px] text-textColor">Audit Log</h3>

      <DataTable
        columns={[
          { key: 'action', header: 'Action', render: (log: any) => actionLabel(log.action) },
          { key: 'entity', header: 'Provider', render: (log: any) => log.entityName || log.entityId || '—' },
          { key: 'user', header: 'User', render: (log: any) => log.userId || 'System' },
          { key: 'date', header: 'Date', render: (log: any) => formatDate(log.createdAt) },
        ]}
        data={logs}
        keyExtractor={(log: any) => log.id}
        loading={loading}
        page={currentPage + 1}
        total={total}
        limit={limit}
        onPageChange={(p) => setCurrentPage(p - 1)}
        emptyState={{ title: 'No audit logs yet.' }}
      />
    </div>
  );
};
