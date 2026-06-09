'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { ProviderCard } from '@gitroom/frontend/components/settings/storage/provider-card';
import { ProviderFormModal } from '@gitroom/frontend/components/settings/storage/provider-form.modal';
import { MigrationModal } from '@gitroom/frontend/components/settings/storage/migration.modal';
import { AuditTab } from '@gitroom/frontend/components/settings/storage/audit.tab';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { deleteDialog } from '@gitroom/react/helpers/delete.dialog';

export const StorageTab: React.FC = () => {
  const fetch = useFetch();
  const toast = useToaster();
  const [providers, setProviders] = useState<any[]>([]);
  const [usage, setUsage] = useState<Record<string, string>>({});
  const [quotaStatus, setQuotaStatus] = useState<any>(null);
  const [usageBreakdown, setUsageBreakdown] = useState<any>(null);
  const [showModal, setShowModal] = useState(false);
  const [editProvider, setEditProvider] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [migrateSource, setMigrateSource] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<'providers' | 'quota' | 'breakdown' | 'audit'>('providers');

  const loadProviders = useCallback(async () => {
    try {
      const res = await fetch('/settings/storage');
      if (res.ok) {
        const data = await res.json();
        setProviders(data || []);
      }
    } catch {
      toast.show('Failed to load storage providers', 'warning');
    } finally {
      setLoading(false);
    }
  }, [fetch, toast]);

  const loadUsage = useCallback(async () => {
    try {
      const res = await fetch('/settings/storage/usage');
      if (res.ok) {
        const data = await res.json();
        const usageMap: Record<string, string> = {};
        if (data.providers) {
          for (const p of data.providers) {
            if (p.usageBytes !== null) {
              usageMap[p.id] = p.usageBytes;
            }
          }
        }
        setUsage(usageMap);
      }
    } catch {
      toast.show('Failed to load storage usage', 'warning');
    }
  }, [fetch, toast]);

  const loadQuotaStatus = useCallback(async () => {
    try {
      const res = await fetch('/settings/storage/quota-status');
      if (res.ok) {
        setQuotaStatus(await res.json());
      }
    } catch {
      toast.show('Failed to load quota status', 'warning');
    }
  }, [fetch, toast]);

  const loadUsageBreakdown = useCallback(async () => {
    try {
      const res = await fetch('/settings/storage/usage-breakdown');
      if (res.ok) {
        setUsageBreakdown(await res.json());
      }
    } catch {
      toast.show('Failed to load usage breakdown', 'warning');
    }
  }, [fetch, toast]);

  useEffect(() => {
    loadProviders();
    loadUsage();
    loadQuotaStatus();
    loadUsageBreakdown();
  }, [loadProviders, loadUsage, loadQuotaStatus, loadUsageBreakdown]);

  const handleMount = async (id: string) => {
    try {
      await fetch('/settings/storage/' + id + '/mount', { method: 'POST' });
      loadProviders();
      loadUsage();
      loadQuotaStatus();
      toast.show('Storage provider mounted', 'success');
    } catch {
      toast.show('Failed to mount storage provider', 'warning');
    }
  };

  const handleUnmount = async (id: string) => {
    try {
      await fetch('/settings/storage/' + id + '/unmount', { method: 'POST' });
      loadProviders();
      loadUsage();
      loadQuotaStatus();
      toast.show('Storage provider unmounted', 'success');
    } catch {
      toast.show('Failed to unmount storage provider', 'warning');
    }
  };

  const handleEdit = (id: string) => {
    const provider = providers.find((p) => p.id === id);
    setEditProvider(provider);
    setShowModal(true);
  };

  const handleDelete = async (id: string) => {
    const confirmed = await deleteDialog(
      'Are you sure you want to delete this storage provider?',
      'Delete Storage Provider',
      'Delete',
    );
    if (!confirmed) return;

    try {
      const res = await fetch('/settings/storage/' + id, { method: 'DELETE' });
      if (res.ok) {
        loadProviders();
        loadUsage();
        loadQuotaStatus();
        loadUsageBreakdown();
        toast.show('Storage provider deleted', 'success');
      }
    } catch {
      toast.show('Failed to delete storage provider', 'warning');
    }
  };

  const handleMigrate = (id: string) => {
    const provider = providers.find((p) => p.id === id);
    if (provider) {
      setMigrateSource(provider);
    }
  };

  const handleSetDefault = async (id: string) => {
    try {
      const res = await fetch('/settings/storage/' + id + '/set-default', {
        method: 'POST',
      });
      if (res.ok) {
        loadProviders();
        toast.show('Default storage provider updated', 'success');
      } else {
        toast.show('Failed to set default provider', 'warning');
      }
    } catch {
      toast.show('Failed to set default provider', 'warning');
    }
  };

  const handleTest = async (id: string) => {
    try {
      const res = await fetch('/settings/storage/' + id + '/test', {
        method: 'POST',
      });
      const data = await res.json();
      if (data.ok) {
        toast.show('Connection test successful!', 'success');
      } else {
        toast.show('Connection test failed: ' + (data.error || 'Unknown error'), 'warning');
      }
    } catch {
      toast.show('Test request failed', 'warning');
    }
  }; 

  const handleSaved = () => {
    setShowModal(false);
    setEditProvider(null);
    loadProviders();
    loadUsage();
    loadQuotaStatus();
    loadUsageBreakdown();
  };

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  };

  return (
    <div className="flex flex-col gap-[20px]">
      {/* Tab Navigation */}
      <div className="flex gap-[16px] border-b border-customColor20">
        {['providers', 'quota', 'breakdown', 'audit'].map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab as typeof activeTab)}
            className={`px-[16px] py-[12px] text-[14px] font-medium transition-colors ${
              activeTab === tab
                ? 'text-customColor13 border-b-2 border-customColor13'
                : 'text-customColor18 hover:text-textColor'
            }`}
          >
            {tab === 'providers' && 'Providers'}
            {tab === 'quota' && 'Quota Status'}
            {tab === 'breakdown' && 'Usage Breakdown'}
            {tab === 'audit' && 'Audit Log'}
          </button>
        ))}
      </div>

      {/* Quota Warning Banner */}
      {quotaStatus?.warning && (
        <div className="px-[16px] py-[12px] rounded-[8px] bg-[#2a2a1a] border border-[#f59e0b] text-[#f59e0b] text-[13px]">
          ⚠️ You're using {quotaStatus.percentUsed}% of your storage quota ({formatBytes(quotaStatus.usedBytes)} / {formatBytes(quotaStatus.quotaBytes)})
        </div>
      )}

      {/* Tab Content */}
      {activeTab === 'providers' && (
        <>
          <div className="flex items-center justify-between">
            <h3 className="text-[20px] text-textColor">Storage Providers</h3>
            <button
              onClick={() => {
                setEditProvider(null);
                setShowModal(true);
              }}
              className="px-[16px] py-[8px] rounded-[8px] bg-customColor4 text-textColor text-[13px] font-medium hover:bg-customColor4/80 transition-colors"
            >
              Add Provider
            </button>
          </div>

          {loading ? (
            <div className="text-[14px] text-customColor18">Loading...</div>
          ) : providers.length === 0 ? (
            <div className="text-[14px] text-customColor18 text-center py-[40px]">
              No storage providers configured yet.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-[16px]">
              {providers.map((provider) => (
                <ProviderCard
                  key={provider.id}
                  provider={provider}
                  usageBytes={usage[provider.id] || null}
                  hasOtherProviders={providers.length > 1}
                  onMount={handleMount}
                  onUnmount={handleUnmount}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                  onTest={handleTest}
                  onMigrate={handleMigrate}
                  onSetDefault={handleSetDefault}
                />
              ))}
            </div>
          )}
        </>
      )}

      {activeTab === 'quota' && (
        <div className="flex flex-col gap-[20px]">
          <h3 className="text-[20px] text-textColor">Quota Status</h3>
          {quotaStatus ? (
            <div className="flex flex-col gap-[16px]">
              <div className="p-[16px] rounded-[8px] bg-customColor8">
                <div className="text-[13px] text-customColor18 mb-[8px]">Used / Quota</div>
                <div className="text-[24px] text-textColor font-semibold mb-[12px]">
                  {formatBytes(quotaStatus.usedBytes)} / {formatBytes(quotaStatus.quotaBytes)}
                </div>
                <div className="w-full bg-customColor20 rounded-[4px] h-[8px] overflow-hidden">
                  <div
                    className={`h-full ${quotaStatus.percentUsed >= 90 ? 'bg-[#ef4444]' : quotaStatus.percentUsed >= 80 ? 'bg-[#f59e0b]' : 'bg-[#10b981]'}`}
                    style={{ width: `${Math.min(quotaStatus.percentUsed, 100)}%` }}
                  />
                </div>
                <div className="text-[13px] text-customColor18 mt-[8px]">
                  {quotaStatus.percentUsed.toFixed(1)}% Used
                </div>
              </div>
            </div>
          ) : (
            <div className="text-[14px] text-customColor18">Loading quota status...</div>
          )}
        </div>
      )}

      {activeTab === 'breakdown' && (
        <div className="flex flex-col gap-[20px]">
          <h3 className="text-[20px] text-textColor">Usage Breakdown</h3>
          {usageBreakdown ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-[20px]">
              <div className="flex flex-col gap-[12px]">
                <h4 className="text-[16px] text-textColor font-medium">By Folder</h4>
                {usageBreakdown.byFolder?.length > 0 ? (
                  <div className="space-y-[8px]">
                    {usageBreakdown.byFolder.map((folder: any) => (
                      <div key={folder.folderId} className="flex items-center justify-between p-[12px] rounded-[8px] bg-customColor8 text-[13px]">
                        <span className="text-textColor">{folder.folderName}</span>
                        <span className="text-customColor18">{formatBytes(folder.totalBytes)}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-[13px] text-customColor18">No usage data</div>
                )}
              </div>
              <div className="flex flex-col gap-[12px]">
                <h4 className="text-[16px] text-textColor font-medium">By Provider</h4>
                {usageBreakdown.byProvider?.length > 0 ? (
                  <div className="space-y-[8px]">
                    {usageBreakdown.byProvider.map((provider: any) => (
                      <div key={provider.providerId} className="flex items-center justify-between p-[12px] rounded-[8px] bg-customColor8 text-[13px]">
                        <span className="text-textColor">{provider.providerName}</span>
                        <span className="text-customColor18">{formatBytes(provider.totalBytes)}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-[13px] text-customColor18">No usage data</div>
                )}
              </div>
            </div>
          ) : (
            <div className="text-[14px] text-customColor18">Loading usage breakdown...</div>
          )}
        </div>
      )}

      {activeTab === 'audit' && <AuditTab />}

      {showModal && (
        <ProviderFormModal
          onClose={() => {
            setShowModal(false);
            setEditProvider(null);
          }}
          onSaved={handleSaved}
          editProvider={editProvider}
        />
      )}

      {migrateSource && (
        <MigrationModal
          source={migrateSource}
          targets={providers.filter((p) => p.id !== migrateSource.id)}
          onClose={() => setMigrateSource(null)}
          onComplete={() => {
            loadProviders();
            loadUsage();
          }}
        />
      )}
    </div>
  );
};
