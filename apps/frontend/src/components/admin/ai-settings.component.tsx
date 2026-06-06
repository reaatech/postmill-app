'use client';

import React, { FC, useCallback, useEffect, useMemo, useState } from 'react';
import useSWR, { useSWRConfig } from 'swr';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useUser } from '@gitroom/frontend/components/layout/user.context';
import { Button } from '@gitroom/react/form/button';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { LoadingComponent } from '@gitroom/frontend/components/layout/loading';

interface AICapabilities {
  text: boolean;
  image: boolean;
  vision: boolean;
  embeddings: boolean;
  speech: boolean;
  tools: boolean;
}

interface CredentialField {
  key: string;
  label: string;
  type: string;
  required: boolean;
  options?: { label: string; value: string }[];
  placeholder?: string;
}

interface PrivacyInfo {
  dataRetention: string;
  trainingOnData: boolean;
  zeroRetention?: boolean;
  description: string;
}

interface ModelInfo {
  id: string;
  label: string;
  kind: 'text' | 'image' | 'embedding';
  dimension?: number;
  capabilities: AICapabilities;
}

interface ProviderInfo {
  identifier: string;
  name: string;
  type: 'hub' | 'direct';
  capabilities: AICapabilities;
  privacy?: PrivacyInfo;
  enabled: boolean;
  isConfigured: boolean;
  credentialFields: CredentialField[];
}

interface ProviderDetail extends ProviderInfo {
  defaultModel: string;
  imageModel: string;
  extraConfig: Record<string, any> | null;
  models: ModelInfo[];
}

interface ScopeModelEntry {
  provider?: string;
  model?: string;
}

type ScopeModels = Record<string, ScopeModelEntry | null>;

interface GovernanceSettings {
  guardrailSettings: { enabled: boolean; rules: string[] } | null;
  budgetSettings: {
    enabled: boolean;
    monthlyCap: number;
    monthlyLimit?: number;
    dailyCap: number;
    alertThresholdPct: number;
  } | null;
  rateLimitSettings: {
    enabled: boolean;
    requestsPerMinute: number;
    rpm?: number;
    concurrency?: number;
  } | null;
  fallbackProvider: string;
  fallbackImageProvider: string;
}

interface GovernanceResponse extends GovernanceSettings {
  observability: any;
  mcpSettings: any;
  ragSettings: any;
  scopeModels: ScopeModels | null;
}

interface SpendLogEntry {
  id: string;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  scope: string;
  createdAt: string;
}

interface ProviderHealthRecord {
  lastSuccessAt: number | null;
  lastErrorAt: number | null;
  successCount: number;
  errorCount: number;
  consecutiveErrors: number;
}

interface HealthResponse {
  hasActiveConfig: boolean;
  activeProvider: string | null;
  activeModel: string | null;
  envFallback: boolean;
  providerHealth: Record<string, ProviderHealthRecord>;
}

interface AuditEntry {
  id: string;
  action: string;
  userId: string;
  detail: string;
  createdAt: string;
}

interface RagSettings {
  enabled: boolean;
  vectorStore: string;
  embeddingModel: string;
}

interface ObservabilityForm {
  enabled: boolean;
  endpoint: string;
}

interface RateLimitForm {
  enabled: boolean;
  requestsPerMinute: number;
  rpm: number;
  concurrency: number;
}

const SCOPES = ['utility', 'generator', 'agent', 'mcp'] as const;

const parseErrorMessage = async (res: Response, fallback: string) => {
  const data = await res.json().catch(() => null);
  return data?.message || data?.error || fallback;
};

const useProviders = () => {
  const fetch = useFetch();
  return useSWR<ProviderInfo[]>('/admin/ai-settings/providers', (url: string) =>
    fetch(url).then((r) => { if (!r.ok) throw new Error(r.statusText); return r.json(); })
  );
};

const useProviderDetail = (identifier: string | null) => {
  const fetch = useFetch();
  return useSWR<ProviderDetail>(
    identifier ? `/admin/ai-settings/providers/${identifier}` : null,
    (url: string) => fetch(url).then((r) => { if (!r.ok) throw new Error(r.statusText); return r.json(); })
  );
};

const useGovernance = () => {
  const fetch = useFetch();
  return useSWR<GovernanceResponse>('/admin/ai-settings/governance', (url: string) =>
    fetch(url).then((r) => { if (!r.ok) throw new Error(r.statusText); return r.json(); })
  );
};

const useSpend = (offset = 0, limit = 100, scope?: string, provider?: string) => {
  const fetch = useFetch();
  const params = new URLSearchParams();
  params.set('offset', String(offset));
  params.set('limit', String(limit));
  if (scope) params.set('scope', scope);
  if (provider) params.set('provider', provider);

  return useSWR<SpendLogEntry[]>(`/admin/ai-settings/spend?${params.toString()}`, (url: string) =>
    fetch(url).then((r) => { if (!r.ok) throw new Error(r.statusText); return r.json(); })
  );
};

const useHealth = () => {
  const fetch = useFetch();
  return useSWR<HealthResponse>('/admin/ai-settings/health', (url: string) =>
    fetch(url).then((r) => { if (!r.ok) throw new Error(r.statusText); return r.json(); })
  );
};

const useAudit = () => {
  const fetch = useFetch();
  return useSWR<AuditEntry[]>('/admin/ai-settings/audit', (url: string) =>
    fetch(url).then((r) => { if (!r.ok) throw new Error(r.statusText); return r.json(); })
  );
};

const useRagSettings = () => {
  const fetch = useFetch();
  return useSWR<RagSettings>('/admin/ai-settings/rag', (url: string) =>
    fetch(url).then((r) => { if (!r.ok) throw new Error(r.statusText); return r.json(); })
  );
};

const SectionHeader: FC<{ title: string }> = ({ title }) => (
  <div className="text-[18px] font-[600] text-textColor mb-[8px]">{title}</div>
);

const SectionCard: FC<{ children: React.ReactNode; className?: string }> = ({ children, className }) => (
  <div className={`border border-newTableBorder rounded-[8px] p-[16px] bg-newBgColorInner ${className || ''}`}>
    {children}
  </div>
);

const ProviderAndModelSection: FC = () => {
  const fetch = useFetch();
  const { mutate: globalMutate } = useSWRConfig();
  const toaster = useToaster();
  const { data: providers, isLoading: loadingProviders } = useProviders();
  const { data: health, isLoading: loadingHealth } = useHealth();

  const [selectedProviderId, setSelectedProviderId] = useState('');
  const [credentials, setCredentials] = useState<Record<string, string>>({});
  const [defaultModel, setDefaultModel] = useState('');
  const [imageModel, setImageModel] = useState('');
  const [previewPrompt, setPreviewPrompt] = useState(
    'Write a one sentence launch post for a new scheduling feature.',
  );
  const [previewResult, setPreviewResult] = useState('');
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [previewing, setPreviewing] = useState(false);

  const { data: selectedProviderDetail, isLoading: loadingDetail } = useProviderDetail(
    selectedProviderId || null
  );

  const selectedProvider = providers?.find((p) => p.identifier === selectedProviderId);
  const configuredProviders = providers?.filter((p) => p.isConfigured) || [];
  const textModels = useMemo(
    () =>
      (selectedProviderDetail?.models || []).filter(
        (m) => m.kind === 'text' || m.capabilities?.text,
      ),
    [selectedProviderDetail?.models],
  );
  const imageModels = useMemo(
    () =>
      (selectedProviderDetail?.models || []).filter(
        (m) => m.kind === 'image' || m.capabilities?.image,
      ),
    [selectedProviderDetail?.models],
  );

  useEffect(() => {
    if (!selectedProviderDetail) return;
    setDefaultModel(selectedProviderDetail.defaultModel || textModels[0]?.id || '');
    setImageModel(selectedProviderDetail.imageModel || imageModels[0]?.id || '');
  }, [selectedProviderDetail, textModels, imageModels]);

  const handleSave = useCallback(async () => {
    if (!selectedProviderId || !selectedProvider) return;
    const credentialPayload = Object.fromEntries(
      Object.entries(credentials).filter(([, value]) => value.trim() !== ''),
    );
    const missingRequired = selectedProvider.credentialFields.some(
      (field) =>
        field.required &&
        !credentialPayload[field.key] &&
        !selectedProvider.isConfigured,
    );
    if (missingRequired) {
      toaster.show('Required credentials are missing', 'warning');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(`/admin/ai-settings/providers/${selectedProviderId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enabled: true,
          ...(Object.keys(credentialPayload).length > 0
            ? { credentials: credentialPayload }
            : {}),
          defaultModel: defaultModel || undefined,
          imageModel: imageModel || undefined,
        }),
      });
      if (res.ok) {
        toaster.show('Provider saved', 'success');
        globalMutate('/admin/ai-settings/providers');
        globalMutate(`/admin/ai-settings/providers/${selectedProviderId}`);
        globalMutate('/admin/ai-settings/health');
      } else {
        toaster.show(await parseErrorMessage(res, 'Failed to save provider'), 'warning');
      }
    } catch {
      toaster.show('Network error while saving', 'warning');
    } finally {
      setSaving(false);
    }
  }, [fetch, selectedProviderId, selectedProvider, credentials, defaultModel, imageModel, toaster, globalMutate]);

  const handleTest = useCallback(async () => {
    if (!selectedProviderId) return;
    setTesting(true);
    try {
      const credentialPayload = Object.fromEntries(
        Object.entries(credentials).filter(([, value]) => value.trim() !== ''),
      );
      const res = await fetch(`/admin/ai-settings/providers/${selectedProviderId}/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          Object.keys(credentialPayload).length > 0
            ? { credentials: credentialPayload }
            : {},
        ),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && (data.ok || data.success)) {
        toaster.show('Connection successful', 'success');
      } else {
        toaster.show(data?.error || data?.message || 'Connection failed', 'warning');
      }
    } catch {
      toaster.show('Network error while testing', 'warning');
    } finally {
      setTesting(false);
    }
  }, [fetch, selectedProviderId, credentials, toaster]);

  const handleSetActive = useCallback(async (providerId: string, model?: string) => {
    if (!model) {
      toaster.show('Select and save a default model before activating this provider', 'warning');
      return;
    }
    try {
      const res = await fetch('/admin/ai-settings/active', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: providerId, model }),
      });
      if (res.ok) {
        toaster.show('Active provider updated', 'success');
        globalMutate('/admin/ai-settings/providers');
        globalMutate('/admin/ai-settings/health');
      } else {
        toaster.show(await parseErrorMessage(res, 'Failed to set active provider'), 'warning');
      }
    } catch {
      toaster.show('Network error', 'warning');
    }
  }, [fetch, toaster, globalMutate]);

  const handlePreview = useCallback(async () => {
    if (!selectedProviderId || !previewPrompt.trim()) return;
    setPreviewing(true);
    setPreviewResult('');
    try {
      const res = await fetch(`/admin/ai-settings/providers/${selectedProviderId}/preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: previewPrompt }),
      });
      if (res.ok) {
        const data = await res.json();
        setPreviewResult(data.text || '');
      } else {
        toaster.show(await parseErrorMessage(res, 'Preview failed'), 'warning');
      }
    } catch {
      toaster.show('Network error while previewing', 'warning');
    } finally {
      setPreviewing(false);
    }
  }, [fetch, selectedProviderId, previewPrompt, toaster]);

  if (loadingProviders || loadingHealth) return <LoadingComponent />;

  return (
    <SectionCard>
      <SectionHeader title="Provider & Model" />
      <div className="flex flex-col gap-[12px]">
        <div className="flex items-center gap-[8px] text-[14px]">
          <span className="opacity-70">Active provider:</span>
          <span className="font-[500]">
            {health?.activeProvider
              ? `${health.activeProvider}${health.activeModel ? ` (${health.activeModel})` : ''}`
              : 'None'}
          </span>
        </div>

        {health?.envFallback && !health.hasActiveConfig && (
          <div className="text-[13px] bg-yellow-500/10 text-yellow-500 border border-yellow-500/20 rounded-[6px] px-[12px] py-[8px]">
            Using environment <code className="bg-black/20 px-[4px] rounded">OPENAI_API_KEY</code> fallback. All four surfaces default to gpt-4o-mini.
          </div>
        )}

        <div className="flex flex-col gap-[6px]">
          <label className="text-[14px] opacity-70">Provider</label>
          <select
            value={selectedProviderId}
            onChange={(e) => {
              setSelectedProviderId(e.target.value);
              setCredentials({});
              setDefaultModel('');
              setImageModel('');
              setPreviewResult('');
            }}
            className="bg-newBgColorInner h-[42px] border border-newTableBorder rounded-[8px] px-[10px] text-[14px] text-textColor"
          >
            <option value="">Select a provider</option>
            {(providers || []).map((p) => (
              <option key={p.identifier} value={p.identifier}>{p.name}</option>
            ))}
          </select>
        </div>

        {selectedProvider && (
          <>
            {selectedProvider.credentialFields.map((field) => (
              <div key={field.key} className="flex flex-col gap-[6px]">
                <label className="text-[14px] opacity-70">
                  {field.label}{field.required ? ' *' : ''}
                </label>
                {field.type === 'textarea' ? (
                  <textarea
                    className="bg-newBgColorInner min-h-[96px] border-newTableBorder border rounded-[8px] text-[14px] text-textColor placeholder-textColor px-[16px] py-[10px] resize-y"
                    value={credentials[field.key] || ''}
                    onChange={(e) => setCredentials((prev) => ({ ...prev, [field.key]: e.target.value }))}
                    placeholder={selectedProvider.isConfigured ? 'Leave blank to keep existing value' : field.placeholder || `Enter ${field.label}`}
                  />
                ) : field.type === 'select' ? (
                  <select
                    className="bg-newBgColorInner h-[42px] border-newTableBorder border rounded-[8px] px-[10px] text-[14px] text-textColor"
                    value={credentials[field.key] || ''}
                    onChange={(e) => setCredentials((prev) => ({ ...prev, [field.key]: e.target.value }))}
                  >
                    <option value="">{selectedProvider.isConfigured ? 'Keep existing value' : 'Select a value'}</option>
                    {(field.options || []).map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                ) : (
                  <div className="bg-newBgColorInner h-[42px] border-newTableBorder border rounded-[8px] flex items-center">
                    <input
                      type={field.type === 'password' ? 'password' : 'text'}
                      className="h-full bg-transparent outline-none flex-1 text-[14px] text-textColor placeholder-textColor px-[16px]"
                      value={credentials[field.key] || ''}
                      onChange={(e) => setCredentials((prev) => ({ ...prev, [field.key]: e.target.value }))}
                      placeholder={selectedProvider.isConfigured ? 'Leave blank to keep existing value' : field.placeholder || `Enter ${field.label}`}
                    />
                  </div>
                )}
              </div>
            ))}

            {selectedProvider.privacy && (
              <div className="flex flex-col gap-[4px] text-[13px] opacity-80 bg-sixth rounded-[6px] px-[12px] py-[8px]">
                <div className="font-[500] mb-[2px]">Privacy</div>
                <div>Data Retention: {selectedProvider.privacy.dataRetention}</div>
                <div>Training on Data: {selectedProvider.privacy.trainingOnData ? 'Yes' : 'No'}</div>
                {selectedProvider.privacy.zeroRetention !== undefined && (
                  <div>Zero Retention: {selectedProvider.privacy.zeroRetention ? 'Yes' : 'No'}</div>
                )}
                {selectedProvider.privacy.description && (
                  <div className="italic">{selectedProvider.privacy.description}</div>
                )}
              </div>
            )}

            {loadingDetail && (
              <div className="text-[13px] opacity-70">Loading models...</div>
            )}

            {selectedProviderDetail && selectedProviderDetail.models.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-[12px]">
                <div className="flex flex-col gap-[6px]">
                  <label className="text-[14px] opacity-70">Default text model</label>
                  <select
                    value={defaultModel}
                    onChange={(e) => setDefaultModel(e.target.value)}
                    className="bg-newBgColorInner h-[42px] border border-newTableBorder rounded-[8px] px-[10px] text-[14px] text-textColor"
                  >
                    <option value="">Select a model</option>
                    {textModels.map((m) => (
                      <option key={m.id} value={m.id}>{m.label}</option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col gap-[6px]">
                  <label className="text-[14px] opacity-70">Image model</label>
                  <select
                    value={imageModel}
                    onChange={(e) => setImageModel(e.target.value)}
                    className="bg-newBgColorInner h-[42px] border border-newTableBorder rounded-[8px] px-[10px] text-[14px] text-textColor"
                  >
                    <option value="">No image model</option>
                    {imageModels.map((m) => (
                      <option key={m.id} value={m.id}>{m.label}</option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            <div className="flex gap-[8px] items-center">
              <Button onClick={handleSave} disabled={saving || !selectedProviderId}>
                {saving ? 'Saving...' : 'Save'}
              </Button>
              <Button secondary onClick={handleTest} disabled={testing}>
                {testing ? 'Testing...' : 'Test Connection'}
              </Button>
            </div>

            {selectedProvider.isConfigured && (
              <div className="flex flex-col gap-[8px] border-t border-newTableBorder pt-[12px]">
                <label className="text-[14px] opacity-70">Dry-run preview</label>
                <textarea
                  className="bg-newBgColorInner min-h-[76px] border-newTableBorder border rounded-[8px] text-[14px] text-textColor placeholder-textColor px-[16px] py-[10px] resize-y"
                  value={previewPrompt}
                  onChange={(e) => setPreviewPrompt(e.target.value)}
                />
                <div className="flex justify-end">
                  <Button secondary onClick={handlePreview} disabled={previewing || !previewPrompt.trim()}>
                    {previewing ? 'Previewing...' : 'Run Preview'}
                  </Button>
                </div>
                {previewResult && (
                  <div className="text-[13px] bg-sixth rounded-[6px] px-[12px] py-[8px] whitespace-pre-wrap">
                    {previewResult}
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {configuredProviders.length > 0 && (
          <div className="flex flex-col gap-[6px]">
            <label className="text-[14px] opacity-70">Configured Providers</label>
            <div className="flex flex-col gap-[6px]">
              {configuredProviders.map((cfg) => (
                <div key={cfg.identifier} className="flex items-center justify-between bg-sixth rounded-[6px] px-[12px] py-[8px]">
                  <div className="flex items-center gap-[8px]">
                    <span className="text-[14px]">{cfg.name}</span>
                    {cfg.identifier === health?.activeProvider && (
                      <span className="text-[11px] bg-green-500/10 text-green-500 px-[6px] py-[1px] rounded-full">Active</span>
                    )}
                  </div>
                  {cfg.identifier !== health?.activeProvider && (
                    <button
                      type="button"
                      className="text-[12px] text-forth cursor-pointer hover:underline"
                      onClick={() => {
                        if (cfg.identifier !== selectedProviderId) {
                          setSelectedProviderId(cfg.identifier);
                          setCredentials({});
                          setPreviewResult('');
                          return;
                        }
                        handleSetActive(cfg.identifier, defaultModel);
                      }}
                    >
                      {cfg.identifier === selectedProviderId ? 'Set Active' : 'Select'}
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </SectionCard>
  );
};

const ScopeModelsSection: FC = () => {
  const fetch = useFetch();
  const { mutate: globalMutate } = useSWRConfig();
  const toaster = useToaster();
  const { data, isLoading } = useGovernance();
  const { data: providersData } = useProviders();
  const [form, setForm] = useState<ScopeModels | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!data) return;
    const initial: ScopeModels = {};
    for (const s of SCOPES) {
      initial[s] = data.scopeModels?.[s] ?? null;
    }
    setForm(initial);
  }, [data]);

  const handleSave = useCallback(async () => {
    if (!form) return;
    setSaving(true);
    try {
      const res = await fetch('/admin/ai-settings/scope-models', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scopeModels: form }),
      });
      if (res.ok) {
        toaster.show('Scope models saved', 'success');
        globalMutate('/admin/ai-settings/governance');
      } else {
        toaster.show('Failed to save scope models', 'warning');
      }
    } catch {
      toaster.show('Network error', 'warning');
    } finally {
      setSaving(false);
    }
  }, [fetch, form, toaster, globalMutate]);

  if (isLoading) return <LoadingComponent />;

  return (
    <SectionCard>
      <SectionHeader title="Scope Models" />
      <div className="flex flex-col gap-[12px]">
        {SCOPES.map((scope) => (
          <div key={scope} className="flex items-center gap-[12px]">
            <label className="w-[120px] text-[14px] capitalize opacity-70">{scope}</label>
            <select
              value={form?.[scope]?.provider || ''}
              onChange={(e) =>
                setForm((prev) =>
                  prev
                    ? {
                        ...prev,
                        [scope]: { ...prev[scope], provider: e.target.value || undefined },
                      }
                    : prev
                )
              }
              className="bg-newBgColorInner h-[42px] border border-newTableBorder rounded-[8px] px-[10px] text-[14px] text-textColor w-[180px]"
            >
              <option value="">Default provider</option>
              {(providersData || []).map((p) => (
                <option key={p.identifier} value={p.identifier}>
                  {p.name}
                </option>
              ))}
            </select>
            <div className="bg-newBgColorInner h-[42px] border-newTableBorder border rounded-[8px] flex items-center flex-1">
              <input
                className="h-full bg-transparent outline-none flex-1 text-[14px] text-textColor placeholder-textColor px-[16px]"
                value={form?.[scope]?.model || ''}
                onChange={(e) =>
                  setForm((prev) =>
                    prev
                      ? {
                          ...prev,
                          [scope]: { ...prev[scope], model: e.target.value || undefined },
                        }
                      : prev
                  )
                }
                placeholder="Inherit from active provider"
              />
            </div>
          </div>
        ))}
        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={saving}>Save Scope Models</Button>
        </div>
      </div>
    </SectionCard>
  );
};

const GovernanceSection: FC = () => {
  const fetch = useFetch();
  const { mutate: globalMutate } = useSWRConfig();
  const toaster = useToaster();
  const { data, isLoading } = useGovernance();
  const { data: providersList } = useProviders();
  const [form, setForm] = useState<GovernanceSettings | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!data) return;
    const rateLimitSettings = data.rateLimitSettings ?? {
      enabled: false,
      requestsPerMinute: 0,
    };
    setForm({
      guardrailSettings: data.guardrailSettings ?? { enabled: false, rules: [] },
      budgetSettings: data.budgetSettings
        ? {
            ...data.budgetSettings,
            monthlyCap:
              data.budgetSettings.monthlyCap ??
              data.budgetSettings.monthlyLimit ??
              0,
          }
        : { enabled: false, monthlyCap: 0, dailyCap: 0, alertThresholdPct: 80 },
      rateLimitSettings: {
        ...rateLimitSettings,
        enabled: rateLimitSettings.enabled ?? false,
        requestsPerMinute:
          rateLimitSettings.requestsPerMinute ?? rateLimitSettings.rpm ?? 0,
        rpm: rateLimitSettings.rpm ?? rateLimitSettings.requestsPerMinute ?? 0,
        concurrency: rateLimitSettings.concurrency ?? 0,
      },
      fallbackProvider: data.fallbackProvider || '',
      fallbackImageProvider: data.fallbackImageProvider || '',
    });
  }, [data]);

  const handleSave = useCallback(async () => {
    if (!form) return;
    setSaving(true);
    try {
      const res = await fetch('/admin/ai-settings/governance', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          guardrailSettings: form.guardrailSettings,
          budgetSettings: form.budgetSettings
            ? {
                enabled: form.budgetSettings.enabled,
                monthlyCap: form.budgetSettings.monthlyCap,
                dailyCap: form.budgetSettings.dailyCap,
                alertThresholdPct: form.budgetSettings.alertThresholdPct,
              }
            : null,
          rateLimitSettings: form.rateLimitSettings,
          fallbackProvider: form.fallbackProvider || null,
          fallbackImageProvider: form.fallbackImageProvider || null,
        }),
      });
      if (res.ok) {
        toaster.show('Governance settings saved', 'success');
        globalMutate('/admin/ai-settings/governance');
      } else {
        toaster.show('Failed to save governance settings', 'warning');
      }
    } catch {
      toaster.show('Network error', 'warning');
    } finally {
      setSaving(false);
    }
  }, [fetch, form, toaster, globalMutate]);

  if (isLoading) return <LoadingComponent />;

  return (
    <SectionCard>
      <SectionHeader title="Governance" />
      {form && (
        <div className="flex flex-col gap-[16px]">
          <div className="flex items-center gap-[12px]">
            <label className="text-[14px] w-[180px] opacity-70">Guardrails</label>
            <input
              type="checkbox"
              checked={form.guardrailSettings?.enabled || false}
              onChange={(e) =>
                setForm((prev) =>
                  prev ? { ...prev, guardrailSettings: { ...prev.guardrailSettings!, enabled: e.target.checked } } : prev
                )
              }
              className="w-[18px] h-[18px]"
            />
          </div>

          <div className="flex flex-wrap items-center gap-[12px]">
            <label className="text-[14px] w-[180px] opacity-70">Budget</label>
            <input
              type="checkbox"
              checked={form.budgetSettings?.enabled || false}
              onChange={(e) =>
                setForm((prev) =>
                  prev ? { ...prev, budgetSettings: { ...prev.budgetSettings!, enabled: e.target.checked } } : prev
                )
              }
              className="w-[18px] h-[18px]"
            />
            {form.budgetSettings?.enabled && (
              <>
                <div className="bg-newBgColorInner h-[42px] border-newTableBorder border rounded-[8px] flex items-center">
                  <input
                    type="number"
                    className="h-full bg-transparent outline-none text-[14px] text-textColor px-[16px] w-[120px]"
                    value={form.budgetSettings.monthlyCap}
                    onChange={(e) =>
                      setForm((prev) =>
                        prev
                          ? { ...prev, budgetSettings: { ...prev.budgetSettings!, monthlyCap: parseInt(e.target.value, 10) || 0 } }
                          : prev
                      )
                    }
                    placeholder="Monthly limit"
                  />
                </div>
                <div className="bg-newBgColorInner h-[42px] border-newTableBorder border rounded-[8px] flex items-center">
                  <input
                    type="number"
                    className="h-full bg-transparent outline-none text-[14px] text-textColor px-[16px] w-[120px]"
                    value={form.budgetSettings.dailyCap}
                    onChange={(e) =>
                      setForm((prev) =>
                        prev
                          ? { ...prev, budgetSettings: { ...prev.budgetSettings!, dailyCap: parseInt(e.target.value, 10) || 0 } }
                          : prev
                      )
                    }
                    placeholder="Daily cap"
                  />
                </div>
                <div className="bg-newBgColorInner h-[42px] border-newTableBorder border rounded-[8px] flex items-center">
                  <input
                    type="number"
                    className="h-full bg-transparent outline-none text-[14px] text-textColor px-[16px] w-[120px]"
                    min="0"
                    max="100"
                    value={form.budgetSettings.alertThresholdPct}
                    onChange={(e) =>
                      setForm((prev) =>
                        prev
                          ? {
                              ...prev,
                              budgetSettings: {
                                ...prev.budgetSettings!,
                                alertThresholdPct: Math.min(100, Math.max(0, parseInt(e.target.value, 10) || 0)),
                              },
                            }
                          : prev
                      )
                    }
                    placeholder="Alert %"
                  />
                </div>
              </>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-[12px]">
            <label className="text-[14px] w-[180px] opacity-70">Rate Limit</label>
            <input
              type="checkbox"
              checked={form.rateLimitSettings?.enabled || false}
              onChange={(e) =>
                setForm((prev) =>
                  prev ? { ...prev, rateLimitSettings: { ...prev.rateLimitSettings!, enabled: e.target.checked } } : prev
                )
              }
              className="w-[18px] h-[18px]"
            />
            {form.rateLimitSettings?.enabled && (
              <div className="bg-newBgColorInner h-[42px] border-newTableBorder border rounded-[8px] flex items-center">
                <input
                  type="number"
                  className="h-full bg-transparent outline-none text-[14px] text-textColor px-[16px] w-[120px]"
                  value={form.rateLimitSettings.requestsPerMinute}
                  onChange={(e) =>
                    setForm((prev) =>
                      prev
                        ? {
                            ...prev,
                            rateLimitSettings: {
                              ...prev.rateLimitSettings!,
                              requestsPerMinute: parseInt(e.target.value, 10) || 0,
                              rpm: parseInt(e.target.value, 10) || 0,
                            },
                          }
                        : prev
                    )
                  }
                  placeholder="RPM"
                />
              </div>
            )}
          </div>

          <div className="flex items-center gap-[12px]">
            <label className="text-[14px] w-[180px] opacity-70">Fallback Provider</label>
            <select
              value={form.fallbackProvider}
              onChange={(e) =>
                setForm((prev) => (prev ? { ...prev, fallbackProvider: e.target.value } : prev))
              }
              className="bg-newBgColorInner h-[42px] border border-newTableBorder rounded-[8px] px-[10px] text-[14px] text-textColor w-[220px]"
            >
              <option value="">None</option>
              {(providersList || []).map((p) => (
                <option key={p.identifier} value={p.identifier}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-[12px]">
            <label className="text-[14px] w-[180px] opacity-70">Fallback Image Provider</label>
            <select
              value={form.fallbackImageProvider}
              onChange={(e) =>
                setForm((prev) => (prev ? { ...prev, fallbackImageProvider: e.target.value } : prev))
              }
              className="bg-newBgColorInner h-[42px] border border-newTableBorder rounded-[8px] px-[10px] text-[14px] text-textColor w-[220px]"
            >
              <option value="">None</option>
              {(providersList || []).map((p) => (
                <option key={p.identifier} value={p.identifier}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex justify-end">
            <Button onClick={handleSave} disabled={saving}>Save Governance</Button>
          </div>
        </div>
      )}
    </SectionCard>
  );
};

const ObservabilitySection: FC = () => {
  const fetch = useFetch();
  const { mutate: globalMutate } = useSWRConfig();
  const toaster = useToaster();
  const { data, isLoading } = useGovernance();
  const [form, setForm] = useState<{
    observability: ObservabilityForm;
    mcpEnabled: boolean;
  } | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!data) return;
    const obs = data.observability || {};
    const mcp = data.mcpSettings || {};
    setForm({
      observability: {
        enabled: obs.enabled || false,
        endpoint: obs.endpoint || '',
      },
      mcpEnabled: mcp.enabled || false,
    });
  }, [data]);

  const handleSave = useCallback(async () => {
    if (!form) return;
    setSaving(true);
    try {
      const res = await fetch('/admin/ai-settings/governance', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          observability: form.observability,
          mcpSettings: { enabled: form.mcpEnabled },
        }),
      });
      if (res.ok) {
        toaster.show('Observability settings saved', 'success');
        globalMutate('/admin/ai-settings/governance');
      } else {
        toaster.show('Failed to save observability settings', 'warning');
      }
    } catch {
      toaster.show('Network error', 'warning');
    } finally {
      setSaving(false);
    }
  }, [fetch, form, toaster, globalMutate]);

  if (isLoading) return <LoadingComponent />;

  return (
    <SectionCard>
      <SectionHeader title="Observability & MCP" />
      {form && (
        <div className="flex flex-col gap-[12px]">
          <div className="flex items-center gap-[12px]">
            <label className="text-[14px] w-[200px] opacity-70">Observability Enabled</label>
            <input
              type="checkbox"
              checked={form.observability.enabled}
              onChange={(e) =>
                setForm((prev) =>
                  prev
                    ? {
                        ...prev,
                        observability: { ...prev.observability, enabled: e.target.checked },
                      }
                    : prev
                )
              }
              className="w-[18px] h-[18px]"
            />
          </div>
          <div className="flex items-center gap-[12px]">
            <label className="text-[14px] w-[200px] opacity-70">OTLP Endpoint</label>
            <div className="bg-newBgColorInner h-[42px] border-newTableBorder border rounded-[8px] flex items-center flex-1 max-w-[400px]">
              <input
                className="h-full bg-transparent outline-none flex-1 text-[14px] text-textColor px-[16px]"
                value={form.observability.endpoint}
                onChange={(e) =>
                  setForm((prev) =>
                    prev
                      ? {
                          ...prev,
                          observability: { ...prev.observability, endpoint: e.target.value },
                        }
                      : prev
                  )
                }
                placeholder="https://otlp.example.com:4318"
              />
            </div>
          </div>
          <div className="flex items-center gap-[12px]">
            <label className="text-[14px] w-[200px] opacity-70">MCP Enabled</label>
            <input
              type="checkbox"
              checked={form.mcpEnabled}
              onChange={(e) =>
                setForm((prev) =>
                  prev ? { ...prev, mcpEnabled: e.target.checked } : prev
                )
              }
              className="w-[18px] h-[18px]"
            />
          </div>
          <div className="flex justify-end">
            <Button onClick={handleSave} disabled={saving}>
              Save Observability
            </Button>
          </div>
        </div>
      )}
    </SectionCard>
  );
};

const RateLimitSection: FC = () => {
  const fetch = useFetch();
  const { mutate: globalMutate } = useSWRConfig();
  const toaster = useToaster();
  const { data, isLoading } = useGovernance();
  const [form, setForm] = useState<RateLimitForm | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!data) return;
    const rl = data.rateLimitSettings;
    setForm({
      enabled: rl?.enabled ?? false,
      requestsPerMinute: rl?.requestsPerMinute ?? rl?.rpm ?? 0,
      rpm: rl?.rpm ?? rl?.requestsPerMinute ?? 0,
      concurrency: rl?.concurrency || 0,
    });
  }, [data]);

  const handleSave = useCallback(async () => {
    if (!form) return;
    setSaving(true);
    try {
      const res = await fetch('/admin/ai-settings/governance', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rateLimitSettings: {
            ...form,
            requestsPerMinute: form.requestsPerMinute || form.rpm,
            rpm: form.rpm || form.requestsPerMinute,
          },
        }),
      });
      if (res.ok) {
        toaster.show('Rate limits saved', 'success');
        globalMutate('/admin/ai-settings/governance');
      } else {
        toaster.show('Failed to save rate limits', 'warning');
      }
    } catch {
      toaster.show('Network error', 'warning');
    } finally {
      setSaving(false);
    }
  }, [fetch, form, toaster, globalMutate]);

  if (isLoading) return <LoadingComponent />;

  return (
    <SectionCard>
      <SectionHeader title="Rate Limits (Agent)" />
      {form && (
        <div className="flex flex-col gap-[12px]">
          <div className="flex items-center gap-[12px]">
            <label className="text-[14px] w-[200px] opacity-70">Enabled</label>
            <input
              type="checkbox"
              checked={form.enabled}
              onChange={(e) =>
                setForm((prev) => (prev ? { ...prev, enabled: e.target.checked } : prev))
              }
              className="w-[18px] h-[18px]"
            />
          </div>
          <div className="flex items-center gap-[12px]">
            <label className="text-[14px] w-[200px] opacity-70">Agent RPM</label>
            <div className="bg-newBgColorInner h-[42px] border-newTableBorder border rounded-[8px] flex items-center">
              <input
                type="number"
                className="h-full bg-transparent outline-none text-[14px] text-textColor px-[16px] w-[120px]"
                value={form.rpm || form.requestsPerMinute}
                onChange={(e) =>
                  setForm((prev) =>
                    prev
                      ? {
                          ...prev,
                          rpm: parseInt(e.target.value, 10) || 0,
                          requestsPerMinute: parseInt(e.target.value, 10) || 0,
                        }
                      : prev
                  )
                }
                placeholder="RPM"
              />
            </div>
          </div>
          <div className="flex items-center gap-[12px]">
            <label className="text-[14px] w-[200px] opacity-70">Concurrency</label>
            <div className="bg-newBgColorInner h-[42px] border-newTableBorder border rounded-[8px] flex items-center">
              <input
                type="number"
                className="h-full bg-transparent outline-none text-[14px] text-textColor px-[16px] w-[120px]"
                value={form.concurrency}
                onChange={(e) =>
                  setForm((prev) =>
                    prev ? { ...prev, concurrency: parseInt(e.target.value, 10) || 0 } : prev
                  )
                }
                placeholder="Concurrency"
              />
            </div>
          </div>
          <div className="flex justify-end">
            <Button onClick={handleSave} disabled={saving}>
              Save Rate Limits
            </Button>
          </div>
        </div>
      )}
    </SectionCard>
  );
};

const SpendSection: FC = () => {
  const [offset, setOffset] = useState(0);
  const [scopeFilter, setScopeFilter] = useState('');
  const { data, isLoading } = useSpend(offset, 100, scopeFilter || undefined);

  if (isLoading) return <LoadingComponent />;

  return (
    <SectionCard>
      <SectionHeader title="Spend Log" />
      <div className="flex items-center gap-[8px] mb-[12px]">
        <label className="text-[13px] opacity-70">Scope:</label>
        <select
          value={scopeFilter}
          onChange={(e) => { setScopeFilter(e.target.value); setOffset(0); }}
          className="bg-newBgColorInner h-[32px] border border-newTableBorder rounded-[6px] px-[8px] text-[13px] text-textColor"
        >
          <option value="">All</option>
          <option value="utility">Utility</option>
          <option value="generator">Generator</option>
          <option value="agent">Agent</option>
          <option value="mcp">MCP</option>
        </select>
      </div>
      {!data || data.length === 0 ? (
        <div className="text-[14px] opacity-70">No spend data available.</div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="table1">
              <thead>
                <tr>
                  <th>Provider</th>
                  <th>Model</th>
                  <th>Scope</th>
                  <th>Tokens</th>
                  <th>Cost</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {data.map((entry) => (
                  <tr key={entry.id}>
                    <td>{entry.provider}</td>
                    <td>{entry.model}</td>
                    <td>{entry.scope}</td>
                    <td>{(entry.inputTokens + entry.outputTokens).toLocaleString()}</td>
                    <td>${entry.costUsd.toFixed(4)}</td>
                    <td>{new Date(entry.createdAt).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-end gap-[8px] mt-[8px]">
            <button
              type="button"
              disabled={offset === 0}
              onClick={() => setOffset(Math.max(0, offset - 100))}
              className="text-[12px] text-forth cursor-pointer disabled:opacity-30 hover:underline"
            >
              Previous
            </button>
            <span className="text-[12px] opacity-60">{offset + 1}–{offset + (data?.length || 0)}</span>
            <button
              type="button"
              disabled={!data || data.length < 100}
              onClick={() => setOffset(offset + 100)}
              className="text-[12px] text-forth cursor-pointer disabled:opacity-30 hover:underline"
            >
              Next
            </button>
          </div>
        </>
      )}
    </SectionCard>
  );
};

const HealthSection: FC = () => {
  const { data, isLoading } = useHealth();

  if (isLoading) return <LoadingComponent />;

  const healthEntries = Object.entries(data?.providerHealth || {});

  return (
    <SectionCard>
      <SectionHeader title="Provider Health" />
      <div className="flex flex-col gap-[8px] mb-[12px] text-[13px]">
        <div>Active config: <span className="font-[500]">{data?.hasActiveConfig ? 'Yes' : 'No'}</span></div>
        {data?.envFallback && (
          <div>
            Env fallback: <span className="font-[500] text-yellow-500">Active (OPENAI_API_KEY)</span>
          </div>
        )}
      </div>
      {healthEntries.length === 0 ? (
        <div className="text-[14px] opacity-70">No health data available.</div>
      ) : (
        <div className="flex flex-col gap-[8px]">
          {healthEntries.map(([id, record]) => {
            const status =
              record.successCount > 0 && record.consecutiveErrors === 0
                ? 'ok'
                : record.consecutiveErrors >= 3
                  ? 'error'
                  : 'warning';

            const lastChecked = Math.max(
              record.lastSuccessAt || 0,
              record.lastErrorAt || 0,
            );

            return (
              <div key={id} className="flex items-center justify-between bg-sixth rounded-[6px] px-[12px] py-[8px]">
                <div className="flex items-center gap-[8px]">
                  <span
                    className={`w-[8px] h-[8px] rounded-full ${
                      status === 'ok' ? 'bg-green-500' : status === 'error' ? 'bg-red-500' : 'bg-yellow-500'
                    }`}
                  />
                  <span className="text-[14px]">{id}</span>
                </div>
                <div className="flex items-center gap-[12px] text-[13px] opacity-70">
                  <span>
                    {record.successCount + record.errorCount > 0
                      ? `${Math.round((record.successCount / (record.successCount + record.errorCount)) * 100)}% success`
                      : 'No calls'}
                  </span>
                  <span>{lastChecked > 0 ? new Date(lastChecked).toLocaleString() : 'Never'}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </SectionCard>
  );
};

const AuditSection: FC = () => {
  const { data, isLoading } = useAudit();

  if (isLoading) return <LoadingComponent />;

  return (
    <SectionCard>
      <SectionHeader title="Audit Log" />
      {!data || data.length === 0 ? (
        <div className="text-[14px] opacity-70">No audit entries.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="table1">
            <thead>
              <tr>
                <th>Action</th>
                <th>User ID</th>
                <th>Details</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {data.map((entry) => (
                <tr key={entry.id}>
                  <td>{entry.action}</td>
                  <td className="font-mono text-[12px]">{entry.userId ? entry.userId.slice(0, 8) + '…' : '-'}</td>
                  <td className="font-mono text-[12px]">{entry.detail}</td>
                  <td>{new Date(entry.createdAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </SectionCard>
  );
};

const RagSection: FC = () => {
  const fetch = useFetch();
  const { mutate: globalMutate } = useSWRConfig();
  const toaster = useToaster();
  const user = useUser();
  const { data, isLoading } = useRagSettings();
  const [form, setForm] = useState<RagSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [backfilling, setBackfilling] = useState(false);

  useEffect(() => {
    if (!data) return;
    setForm({
      enabled: data.enabled ?? false,
      vectorStore: data.vectorStore || 'pgvector',
      embeddingModel: data.embeddingModel || '',
    });
  }, [data]);

  const handleSave = useCallback(async () => {
    if (!form) return;
    setSaving(true);
    try {
      const res = await fetch('/admin/ai-settings/rag', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ragSettings: form }),
      });
      if (res.ok) {
        toaster.show('RAG settings saved', 'success');
        globalMutate('/admin/ai-settings/rag');
      } else {
        toaster.show('Failed to save RAG settings', 'warning');
      }
    } catch {
      toaster.show('Network error', 'warning');
    } finally {
      setSaving(false);
    }
  }, [fetch, form, toaster, globalMutate]);

  const handleTriggerBackfill = useCallback(async () => {
    if (!user?.orgId) {
      toaster.show('No organization is selected', 'warning');
      return;
    }
    setBackfilling(true);
    try {
      const res = await fetch('/admin/ai-settings/rag/backfill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ organizationId: user.orgId }),
      });
      if (res.ok) {
        const data = await res.json().catch(() => null);
        toaster.show(data?.status === 'failed' ? data.error || 'Backfill failed' : 'Backfill completed', data?.status === 'failed' ? 'warning' : 'success');
      } else {
        toaster.show(await parseErrorMessage(res, 'Failed to trigger backfill'), 'warning');
      }
    } catch {
      toaster.show('Network error', 'warning');
    } finally {
      setBackfilling(false);
    }
  }, [fetch, toaster, user?.orgId]);

  if (isLoading) return <LoadingComponent />;

  return (
    <SectionCard>
      <SectionHeader title="RAG Settings" />
      {form && (
        <div className="flex flex-col gap-[12px]">
          <div className="flex items-center gap-[12px]">
            <label className="text-[14px] w-[180px] opacity-70">Enable RAG</label>
            <input
              type="checkbox"
              checked={form.enabled}
              onChange={(e) => setForm((prev) => prev ? { ...prev, enabled: e.target.checked } : prev)}
              className="w-[18px] h-[18px]"
            />
          </div>
          <div className="flex items-center gap-[12px]">
            <label className="text-[14px] w-[180px] opacity-70">Vector Store</label>
            <select
                className="bg-newBgColorInner h-[42px] border border-newTableBorder rounded-[8px] px-[10px] text-[14px] text-textColor flex-1 max-w-[300px]"
                value={form.vectorStore}
                onChange={(e) => setForm((prev) => prev ? { ...prev, vectorStore: e.target.value } : prev)}
            >
              <option value="pgvector">pgvector</option>
              <option value="qdrant">Qdrant</option>
            </select>
          </div>
          <div className="flex items-center gap-[12px]">
            <label className="text-[14px] w-[180px] opacity-70">Embedding Model</label>
            <div className="bg-newBgColorInner h-[42px] border-newTableBorder border rounded-[8px] flex items-center flex-1 max-w-[300px]">
              <input
                className="h-full bg-transparent outline-none flex-1 text-[14px] text-textColor px-[16px]"
                value={form.embeddingModel}
                onChange={(e) => setForm((prev) => prev ? { ...prev, embeddingModel: e.target.value } : prev)}
                placeholder="e.g., text-embedding-3-small"
              />
            </div>
          </div>
          <div className="flex gap-[8px] justify-end">
            <Button secondary onClick={handleTriggerBackfill} disabled={backfilling}>
              {backfilling ? 'Backfilling...' : 'Trigger Backfill'}
            </Button>
            <Button onClick={handleSave} disabled={saving}>Save RAG Settings</Button>
          </div>
        </div>
      )}
    </SectionCard>
  );
};

export const AiSettingsAdmin: FC = () => {
  const user = useUser();

  if (!user) {
    return <div className="text-textColor text-[14px]">Loading...</div>;
  }

  if (!user.isSuperAdmin) {
    return (
      <div className="text-textColor text-[14px]">
        You do not have permission to access this page.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-[16px]">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[20px] font-[600] text-textColor">AI Settings</h1>
          <p className="text-[14px] text-textColor/70 mt-[4px]">
            Manage AI providers, scope models, governance, spend, health, and RAG settings.
          </p>
        </div>
      </div>

      <ProviderAndModelSection />
      <ScopeModelsSection />
      <GovernanceSection />
      <ObservabilitySection />
      <RateLimitSection />
      <SpendSection />
      <HealthSection />
      <AuditSection />
      <RagSection />
    </div>
  );
};
