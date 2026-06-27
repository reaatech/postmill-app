'use client';

import React, { useCallback, useState } from 'react';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import useSWR from 'swr';
import { DataTable } from '@gitroom/frontend/components/ui/data-table';

const limit = 25;

interface AuditLogRow {
  id: string;
  action: string;
  entity: string;
  entityId: string | null;
  entityName: string | null;
  userId: string | null;
  createdAt: string;
}

const useAuditLog = (page: number) => {
  const fetch = useFetch();
  const load = useCallback(async () => {
    const res = await fetch(
      `/settings/storage/audit-log?limit=${limit}&offset=${page * limit}`
    );
    if (!res.ok) throw new Error('Failed to load audit logs');
    return res.json();
  }, [fetch, page]);
  return useSWR<{ logs: AuditLogRow[]; total: number }>(
    `audit-log:${page}`,
    load,
    { revalidateOnFocus: false }
  );
};

export const AuditTab: React.FC = () => {
  const [currentPage, setCurrentPage] = useState(0);

  const { data, isLoading } = useAuditLog(currentPage);

  const logs = data?.logs ?? [];
  const total = data?.total ?? 0;

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

  return (
    <div className="flex flex-col gap-[20px]">
      <h3 className="text-[18px] font-semibold text-textColor">Audit Log</h3>

      <DataTable
        columns={[
          { key: 'action', header: 'Action', render: (log: any) => actionLabel(log.action) },
          { key: 'entity', header: 'Provider', render: (log: any) => log.entityName || log.entityId || '—' },
          { key: 'user', header: 'User', render: (log: any) => log.userId || 'System' },
          { key: 'date', header: 'Date', render: (log: any) => formatDate(log.createdAt) },
        ]}
        data={logs}
        keyExtractor={(log: any) => log.id}
        loading={isLoading}
        page={currentPage + 1}
        total={total}
        limit={limit}
        onPageChange={(p) => setCurrentPage(p - 1)}
        emptyState={{ title: 'No audit logs yet.' }}
      />
    </div>
  );
};
