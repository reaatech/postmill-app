'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useToaster } from '@gitroom/react/toaster/toaster';

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

      {loading ? (
        <div className="text-[14px] text-customColor18">Loading...</div>
      ) : logs.length === 0 ? (
        <div className="text-[14px] text-customColor18 text-center py-[40px]">
          No audit logs yet.
        </div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-customColor20">
                  <th className="text-left py-[12px] px-[16px] text-customColor18 font-medium">
                    Action
                  </th>
                  <th className="text-left py-[12px] px-[16px] text-customColor18 font-medium">
                    Provider
                  </th>
                  <th className="text-left py-[12px] px-[16px] text-customColor18 font-medium">
                    User
                  </th>
                  <th className="text-left py-[12px] px-[16px] text-customColor18 font-medium">
                    Date
                  </th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id} className="border-b border-customColor20 hover:bg-customColor8">
                    <td className="py-[12px] px-[16px] text-textColor">
                      {actionLabel(log.action)}
                    </td>
                    <td className="py-[12px] px-[16px] text-textColor">
                      {log.entityName || log.entityId || '—'}
                    </td>
                    <td className="py-[12px] px-[16px] text-customColor18">
                      {log.userId || 'System'}
                    </td>
                    <td className="py-[12px] px-[16px] text-customColor18 text-[12px]">
                      {formatDate(log.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {pages > 1 && (
            <div className="flex items-center justify-between text-[13px]">
              <div className="text-customColor18">
                Page {currentPage + 1} of {pages}
              </div>
              <div className="flex gap-[8px]">
                <button
                  disabled={currentPage === 0}
                  onClick={() => setCurrentPage((p) => Math.max(0, p - 1))}
                  className="px-[12px] py-[6px] rounded-[4px] bg-customColor4 text-textColor text-[12px] font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-customColor4/80 transition-colors"
                >
                  Previous
                </button>
                <button
                  disabled={currentPage >= pages - 1}
                  onClick={() => setCurrentPage((p) => p + 1)}
                  className="px-[12px] py-[6px] rounded-[4px] bg-customColor4 text-textColor text-[12px] font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-customColor4/80 transition-colors"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};
