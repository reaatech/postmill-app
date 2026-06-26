'use client';

import React, { useState } from 'react';
import ProviderIcon from '@gitroom/frontend/components/shared/provider-icon';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';

const allProviderTypes = [
  { value: 'LOCAL', label: 'Local Storage' },
  { value: 'S3', label: 'AWS S3' },
  { value: 'CLOUDFLARE_R2', label: 'Cloudflare R2' },
  { value: 'BACKBLAZE_B2', label: 'Backblaze B2' },
  { value: 'IDRIVE_E2', label: 'IDrive e2' },
  { value: 'WASABI', label: 'Wasabi' },
  { value: 'DIGITALOCEAN_SPACES', label: 'DigitalOcean Spaces' },
  { value: 'HETZNER', label: 'Hetzner Object Storage' },
  { value: 'STORJ', label: 'Storj' },
  { value: 'SCALEWAY', label: 'Scaleway' },
  { value: 'VULTR', label: 'Vultr Object Storage' },
  { value: 'LINODE', label: 'Linode / Akamai' },
  { value: 'S3_COMPATIBLE', label: 'S3-Compatible' },
];

interface ProviderFormModalProps {
  onClose: () => void;
  onSaved: () => void;
  editProvider?: any;
  presetType?: string;
}

export const ProviderFormModal: React.FC<ProviderFormModalProps> = ({
  onClose,
  onSaved,
  editProvider,
  presetType,
}) => {
  const fetch = useFetch();
  const [type, setType] = useState(editProvider?.type || presetType || 'S3');
  const [name, setName] = useState(editProvider?.name || '');
  const [accessKeyId, setAccessKeyId] = useState('');
  const [secretAccessKey, setSecretAccessKey] = useState('');
  const [region, setRegion] = useState(editProvider?.region || '');
  const [bucket, setBucket] = useState(editProvider?.bucket || '');
  const [endpoint, setEndpoint] = useState(editProvider?.endpoint || '');
  const [publicUrl, setPublicUrl] = useState(editProvider?.publicUrl || '');
  const [testResult, setTestResult] = useState<{
    ok?: boolean;
    error?: string;
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const testBody: any = {};
      if (type !== 'LOCAL' && (accessKeyId || secretAccessKey)) {
        testBody.credentials = { accessKeyId, secretAccessKey };
      }
      if (region) testBody.region = region;
      if (bucket) testBody.bucket = bucket;
      if (endpoint) testBody.endpoint = endpoint;

      const res = await fetch('/settings/storage/' + (editProvider?.id || 'temp') + '/test', {
        method: 'POST',
        ...(Object.keys(testBody).length > 0 && {
          body: JSON.stringify(testBody),
          headers: { 'Content-Type': 'application/json' },
        }),
      });
      const data = await res.json();
      setTestResult(data);
    } catch {
      setTestResult({ ok: false, error: 'Test request failed' });
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const body: any = {
        name,
        region,
        bucket,
        endpoint,
        publicUrl,
      };

      if (!editProvider?.id) {
        body.type = type;
      }

      if (type !== 'LOCAL' && (accessKeyId || secretAccessKey)) {
        body.credentials = { accessKeyId, secretAccessKey };
      }

      const res = await fetch(
        '/settings/storage' + (editProvider?.id ? '/' + editProvider.id : ''),
        {
          method: editProvider?.id ? 'PUT' : 'POST',
          body: JSON.stringify(body),
          headers: { 'Content-Type': 'application/json' },
        }
      );

      if (!res.ok) {
        const err = await res.json();
        setTestResult({ ok: false, error: err.message || err.error || 'Save failed' });
        return;
      }

      onSaved();
    } catch (err: any) {
      setTestResult({ ok: false, error: err.message });
    } finally {
      setSaving(false);
    }
  };

  const showCredentials = type !== 'LOCAL';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-newBgColorInner border border-newTableBorder rounded-[16px] p-[24px] w-full max-w-[500px] max-h-[90vh] overflow-y-auto">
        <h3 className="text-[18px] font-medium text-textColor mb-[20px]">
          {editProvider ? 'Edit Provider' : 'Add Storage Provider'}
        </h3>

        <div className="flex flex-col gap-[16px]">
          <div>
            <label className="text-[12px] text-newTableText mb-[6px] block">
              Provider Type
            </label>
            <div className="grid grid-cols-3 gap-[8px]">
              {(editProvider
                ? allProviderTypes.filter((t) => t.value === editProvider.type)
                : allProviderTypes
                    .filter((t) => t.value !== 'LOCAL')
                    .sort((a, b) => a.label.localeCompare(b.label))
              ).map(({ value, label }) => (
                <button
                  key={value}
                  onClick={() => {
                    if (!editProvider) {
                      setType(value);
                      setTestResult(null);
                    }
                  }}
                  disabled={!!editProvider}
                  className={`flex flex-col items-center gap-[4px] p-[8px] rounded-[8px] border transition-colors ${
                    type === value
                      ? 'border-btnPrimary bg-[#1a3a1a]'
                      : 'border-newTableBorder bg-transparent hover:bg-boxHover'
                  }`}
                >
                  <ProviderIcon identifier={value} name={label} size={28} />
                  <span className="text-[10px] text-newTableText text-center">
                    {label}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-[12px] text-newTableText mb-[6px] block">
              Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Storage"
              className="w-full bg-newBgColorInner border border-newTableBorder rounded-[8px] px-[12px] py-[8px] text-[14px] text-textColor outline-none focus:border-btnPrimary"
            />
          </div>

          {showCredentials && (
            <>
              <div>
                <label className="text-[12px] text-newTableText mb-[6px] block">
                  Access Key ID
                </label>
                <input
                  type="text"
                  value={accessKeyId}
                  onChange={(e) => setAccessKeyId(e.target.value)}
                  placeholder="AKIA..."
                  className="w-full bg-newBgColorInner border border-newTableBorder rounded-[8px] px-[12px] py-[8px] text-[14px] text-textColor outline-none focus:border-btnPrimary"
                />
              </div>
              <div>
                <label className="text-[12px] text-newTableText mb-[6px] block">
                  Secret Access Key
                </label>
                <input
                  type="password"
                  value={secretAccessKey}
                  onChange={(e) => setSecretAccessKey(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-newBgColorInner border border-newTableBorder rounded-[8px] px-[12px] py-[8px] text-[14px] text-textColor outline-none focus:border-btnPrimary"
                />
              </div>
            </>
          )}

          <div>
            <label className="text-[12px] text-newTableText mb-[6px] block">
              Region
            </label>
            <input
              type="text"
              value={region}
              onChange={(e) => setRegion(e.target.value)}
              placeholder="us-east-1"
              className="w-full bg-newBgColorInner border border-newTableBorder rounded-[8px] px-[12px] py-[8px] text-[14px] text-textColor outline-none focus:border-btnPrimary"
            />
          </div>

          <div>
            <label className="text-[12px] text-newTableText mb-[6px] block">
              Bucket
            </label>
            <input
              type="text"
              value={bucket}
              onChange={(e) => setBucket(e.target.value)}
              placeholder="my-bucket"
              className="w-full bg-newBgColorInner border border-newTableBorder rounded-[8px] px-[12px] py-[8px] text-[14px] text-textColor outline-none focus:border-btnPrimary"
            />
          </div>

          <div>
            <label className="text-[12px] text-newTableText mb-[6px] block">
              Custom Endpoint <span className="text-[10px]">(optional)</span>
            </label>
            <input
              type="text"
              value={endpoint}
              onChange={(e) => setEndpoint(e.target.value)}
              placeholder="https://..."
              className="w-full bg-newBgColorInner border border-newTableBorder rounded-[8px] px-[12px] py-[8px] text-[14px] text-textColor outline-none focus:border-btnPrimary"
            />
          </div>

          <div>
            <label className="text-[12px] text-newTableText mb-[6px] block">
              Public URL <span className="text-[10px]">(optional)</span>
            </label>
            <input
              type="text"
              value={publicUrl}
              onChange={(e) => setPublicUrl(e.target.value)}
              placeholder="https://cdn.example.com"
              className="w-full bg-newBgColorInner border border-newTableBorder rounded-[8px] px-[12px] py-[8px] text-[14px] text-textColor outline-none focus:border-btnPrimary"
            />
          </div>

          {testResult && (
            <div
              className={`p-[12px] rounded-[8px] text-[13px] ${
                testResult.ok
                  ? 'bg-[#1a3a1a] text-textColor'
                  : 'bg-[#3a1a1a] text-[#f87171]'
              }`}
            >
              {testResult.ok
                ? 'Connection successful!'
                : `Connection failed: ${testResult.error}`}
            </div>
          )}

          <div className="flex gap-[12px] justify-end mt-[8px]">
            <button
              onClick={onClose}
              className="px-[16px] py-[8px] rounded-[8px] bg-btnSimple text-newTableText text-[13px] hover:bg-boxHover transition-colors"
            >
              Cancel
            </button>
            {editProvider && (
              <button
                onClick={handleTest}
                disabled={testing}
                className="px-[16px] py-[8px] rounded-[8px] bg-[#1a2a3a] text-[#60a5fa] text-[13px] hover:bg-[#2a3a4a] transition-colors disabled:opacity-50"
              >
                {testing ? 'Testing...' : 'Test Connection'}
              </button>
            )}
            <button
              onClick={handleSave}
              disabled={saving || !name.trim()}
              className="px-[16px] py-[8px] rounded-[8px] bg-btnPrimary text-white text-[13px] font-medium hover:bg-btnPrimary/80 transition-colors disabled:opacity-50"
            >
              {saving
                ? 'Saving...'
                : editProvider
                  ? 'Update'
                  : 'Add Provider'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
