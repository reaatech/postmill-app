'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import useSWR from 'swr';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { DataTable } from '@gitroom/frontend/components/ui/data-table';

interface SpendEntry {
  id: string;
  provider: string;
  model: string;
  scope: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  createdAt: string;
}

interface BudgetSettings {
  enabled?: boolean;
  monthlyCap?: number;
  dailyCap?: number;
  alertThresholdPct?: number;
  monthlyLimit?: number;
}

const useSpend = (scope?: string, page = 0) => {
  const fetch = useFetch();
  const limit = 50;
  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (scope) params.set('scope', scope);
    params.set('limit', String(limit));
    params.set('offset', String(page * limit));
    const res = await fetch(`/settings/ai/spend?${params.toString()}`);
    if (!res.ok) throw new Error('Failed to load spend data');
    return res.json();
  }, [fetch, scope, page]);
  return useSWR<SpendEntry[]>(`org-ai-spend-${scope || 'all'}-${page}`, load, {
    revalidateOnFocus: false,
  });
};

const useBudget = () => {
  const fetch = useFetch();
  const load = useCallback(async () => {
    const res = await fetch('/settings/ai/budget');
    if (!res.ok) throw new Error('Failed to load budget');
    return res.json();
  }, [fetch]);
  return useSWR<BudgetSettings>('org-ai-budget', load, {
    revalidateOnFocus: false,
  });
};

export const SpendTab = () => {
  const t = useT();
  const fetch = useFetch();
  const toaster = useToaster();
  const [scope, setScope] = useState('');
  const [page, setPage] = useState(0);
  const { data: spend, isLoading, mutate } = useSpend(scope || undefined, page);
  const { data: budget, mutate: mutateBudget } = useBudget();

  const [budgetForm, setBudgetForm] = useState<BudgetSettings>({});

  useEffect(() => {
    if (budget) {
      setBudgetForm(budget);
    }
  }, [budget]);

  const handleSaveBudget = useCallback(async () => {
    const res = await fetch('/settings/ai/budget', {
      method: 'PUT',
      body: JSON.stringify({
        monthlyCap: budgetForm.monthlyCap,
        dailyCap: budgetForm.dailyCap,
        alertThresholdPct: budgetForm.alertThresholdPct,
        enabled: budgetForm.enabled,
      }),
    });
    if (!res.ok) {
      toaster.show(t('budget_save_failed', 'Failed to save budget'), 'warning');
      return;
    }
    mutateBudget();
    toaster.show(t('budget_saved', 'Budget saved'), 'success');
  }, [budgetForm, fetch, mutateBudget, toaster, t]);

  const handleClearFilters = useCallback(() => {
    setScope('');
    setPage(0);
  }, []);

  return (
    <div className="flex flex-col gap-[24px]">
      <div className="bg-newBgColorInner border border-newTableBorder rounded-[12px] p-[24px] flex flex-col gap-[24px]">
        <div className="mt-[4px]">{t('spend_log', 'Spend Log')}</div>

        <div className="flex items-center gap-[12px]">
          <select
            className="bg-newBgColorInner border border-newTableBorder rounded-[8px] p-[8px] text-textColor text-[13px] w-[200px]"
            value={scope}
            onChange={(e) => {
              setScope(e.target.value);
              setPage(0);
            }}
          >
            <option value="">{t('all_scopes', 'All Scopes')}</option>
            <option value="utility">{t('utility', 'Utility')}</option>
            <option value="generator">{t('generator', 'Generator')}</option>
            <option value="agent">{t('agent', 'Agent')}</option>
            <option value="mcp">{t('mcp', 'MCP')}</option>
          </select>
          {scope && (
            <button
              className="text-[12px] text-textColor hover:underline"
              onClick={handleClearFilters}
            >
              {t('clear', 'Clear')}
            </button>
          )}
        </div>

        <DataTable
          columns={[
            { key: 'provider', header: t('provider', 'Provider') },
            { key: 'model', header: t('model', 'Model'), render: (entry: SpendEntry) => <span className="truncate block max-w-[200px]">{entry.model}</span> },
            { key: 'scope', header: t('scope', 'Scope') },
            { key: 'tokens', header: t('tokens', 'Tokens'), align: 'right', render: (entry: SpendEntry) => entry.inputTokens + entry.outputTokens },
            { key: 'cost', header: t('cost', 'Cost'), align: 'right', render: (entry: SpendEntry) => `$${entry.costUsd.toFixed(6)}` },
            { key: 'date', header: t('date', 'Date'), render: (entry: SpendEntry) => new Date(entry.createdAt).toLocaleDateString() },
          ]}
          data={spend || []}
          keyExtractor={(entry: SpendEntry) => entry.id}
          loading={isLoading}
          page={page + 1}
          total={spend ? (spend.length < 50 ? page * 50 + spend.length : (page + 1) * 50 + 1) : 0}
          limit={50}
          onPageChange={(p) => setPage(p - 1)}
          emptyState={{ title: t('no_spend_data', 'No spend data yet') }}
        />
      </div>

      <div className="bg-newBgColorInner border border-newTableBorder rounded-[12px] p-[24px] flex flex-col gap-[24px]">
        <div className="mt-[4px]">{t('budget_caps', 'Budget Caps')}</div>

        <div className="flex flex-col gap-[16px]">
          <div className="flex items-center justify-between">
            <div className="flex flex-col">
              <div className="text-[14px]">{t('enable_budget', 'Enable Budget')}</div>
              <div className="text-[12px] text-newTableText">
                {t('enable_budget_description', 'Set caps on AI spend for this organization')}
              </div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                className="sr-only peer"
                checked={budgetForm?.enabled ?? false}
                onChange={(e) =>
                  setBudgetForm((prev) => ({ ...prev, enabled: e.target.checked }))
                }
              />
              <div className="w-[36px] h-[20px] bg-newTableHeader rounded-full peer peer-checked:bg-btnPrimary peer-checked:after:translate-x-[16px] after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-[16px] after:w-[16px] after:transition-all" />
            </label>
          </div>

          <div className="flex flex-col gap-[4px]">
            <label className="text-[13px] text-newTableText">
              {t('monthly_cap', 'Monthly Cap ($)')}
            </label>
            <input
              type="number"
              className="bg-newBgColorInner border border-newTableBorder rounded-[8px] p-[8px] text-textColor text-[13px] w-[250px]"
              value={budgetForm?.monthlyCap ?? ''}
              onChange={(e) =>
                setBudgetForm((prev) => ({
                  ...prev,
                  monthlyCap: e.target.value ? parseFloat(e.target.value) : undefined,
                }))
              }
              placeholder="0.00"
              min="0"
              step="0.01"
            />
          </div>

          <div className="flex flex-col gap-[4px]">
            <label className="text-[13px] text-newTableText">
              {t('daily_cap', 'Daily Cap ($)')}
            </label>
            <input
              type="number"
              className="bg-newBgColorInner border border-newTableBorder rounded-[8px] p-[8px] text-textColor text-[13px] w-[250px]"
              value={budgetForm?.dailyCap ?? ''}
              onChange={(e) =>
                setBudgetForm((prev) => ({
                  ...prev,
                  dailyCap: e.target.value ? parseFloat(e.target.value) : undefined,
                }))
              }
              placeholder="0.00"
              min="0"
              step="0.01"
            />
          </div>

          <div className="flex justify-end">
            <button
              className="bg-btnPrimary text-white rounded-[8px] px-[16px] py-[8px] text-[13px] hover:opacity-90"
              onClick={handleSaveBudget}
            >
              {t('save_budget', 'Save Budget')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
