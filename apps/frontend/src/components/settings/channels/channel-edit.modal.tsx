'use client';

import React, { FC, useCallback, useState, useEffect } from 'react';
import { Button } from '@gitroom/react/form/button';
import { Input } from '@gitroom/react/form/input';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useToaster } from '@gitroom/react/toaster/toaster';

const PROVIDER_APP_LINKS: Record<string, { label: string; url: string }> = {
  linkedin: {
    label: 'LinkedIn Developer Portal',
    url: 'https://www.linkedin.com/developers/apps',
  },
  x: {
    label: 'X Developer Portal',
    url: 'https://developer.x.com/en/portal/dashboard',
  },
  facebook: {
    label: 'Facebook Developers',
    url: 'https://developers.facebook.com/apps',
  },
  instagram: {
    label: 'Instagram Basic Display',
    url: 'https://developers.facebook.com/docs/instagram-basic-display-api',
  },
  'instagram-standalone': {
    label: 'Instagram Basic Display',
    url: 'https://developers.facebook.com/docs/instagram-basic-display-api',
  },
  threads: {
    label: 'Threads Developer',
    url: 'https://developers.facebook.com/docs/threads',
  },
  youtube: {
    label: 'Google Cloud Console',
    url: 'https://console.cloud.google.com/apis/credentials',
  },
  tiktok: {
    label: 'TikTok for Developers',
    url: 'https://developers.tiktok.com/apps',
  },
  pinterest: {
    label: 'Pinterest Developers',
    url: 'https://developers.pinterest.com/apps',
  },
  discord: {
    label: 'Discord Developer Portal',
    url: 'https://discord.com/developers/applications',
  },
  slack: {
    label: 'Slack API',
    url: 'https://api.slack.com/apps',
  },
  reddit: {
    label: 'Reddit Apps',
    url: 'https://www.reddit.com/prefs/apps',
  },
  tumblr: {
    label: 'Tumblr OAuth Apps',
    url: 'https://www.tumblr.com/oauth/apps',
  },
  telegram: {
    label: 'Telegram BotFather',
    url: 'https://t.me/botfather',
  },
  wordpress: {
    label: 'WordPress Developers',
    url: 'https://developer.wordpress.com/apps',
  },
  devto: {
    label: 'dev.to Settings',
    url: 'https://dev.to/settings/extensions',
  },
  hashnode: {
    label: 'Hashnode Settings',
    url: 'https://hashnode.com/settings/developer',
  },
  medium: {
    label: 'Medium Integration',
    url: 'https://medium.com/me/settings/apps',
  },
  mastodon: {
    label: 'Mastodon Instance',
    url: null,
  },
  bluesky: {
    label: 'Bluesky Settings',
    url: 'https://bsky.app/settings/app passwords',
  },
};

interface ChannelEditModalProps {
  identifier: string;
  name: string;
  enabled: boolean;
  scopes: string;
  redirectUri: string;
  setupNotes: string;
  isConfigured: boolean;
  onSave: (identifier: string, data: Record<string, any>) => Promise<boolean>;
  onDelete: (identifier: string) => void;
  onTest: (identifier: string) => void;
  onClose: () => void;
}

const CREDENTIALS_REQUIRED_MSG =
  'Please enter a Client ID / API Key before enabling this provider.';

export const ChannelEditModal: FC<ChannelEditModalProps> = ({
  identifier,
  name,
  enabled: initialEnabled,
  scopes,
  redirectUri,
  setupNotes,
  isConfigured,
  onSave,
  onDelete,
  onTest,
  onClose,
}) => {
  const toaster = useToaster();
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [editScopes, setEditScopes] = useState(scopes);
  const [editRedirectUri, setEditRedirectUri] = useState(redirectUri);
  const [editSetupNotes, setEditSetupNotes] = useState(setupNotes);
  const [enabled, setEnabled] = useState(initialEnabled);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setEditScopes(scopes);
    setEditRedirectUri(redirectUri);
    setEditSetupNotes(setupNotes);
  }, [scopes, redirectUri, setupNotes]);

  const handleSave = useCallback(async () => {
    if (enabled && !clientId.trim() && !isConfigured) {
      toaster.show(CREDENTIALS_REQUIRED_MSG, 'warning');
      return;
    }

    setSaving(true);
    try {
      const payload: Record<string, any> = { enabled, scopes: editScopes || null };
      if (clientId.trim()) payload.clientId = clientId.trim();
      if (clientSecret.trim()) payload.clientSecret = clientSecret.trim();
      if (editRedirectUri.trim()) payload.redirectUri = editRedirectUri.trim();
      if (editSetupNotes.trim()) payload.setupNotes = editSetupNotes.trim();
      await onSave(identifier, payload);
    } finally {
      setSaving(false);
    }
  }, [identifier, enabled, clientId, clientSecret, editScopes, editRedirectUri, editSetupNotes, isConfigured, onSave, toaster]);

  const credentialPlaceholder = isConfigured ? 'Already configured' : '';

  const appLink = PROVIDER_APP_LINKS[identifier];

  return (
    <div className="flex flex-col gap-[12px] p-[16px] rounded-[8px] bg-newBgColorInner border border-newTableBorder">
      <div className="flex items-center justify-between">
        <h3 className="text-[15px] font-[600]">{name}</h3>
        {appLink?.url && (
          <a
            href={appLink.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[12px] text-textColor underline hover:opacity-80"
          >
            {appLink.label}
          </a>
        )}
      </div>

      <div className="flex items-center gap-[8px]">
        <label className="text-[14px] font-[500]">Enabled</label>
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => {
            if (
              e.target.checked &&
              !clientId.trim() &&
              !isConfigured
            ) {
              toaster.show(CREDENTIALS_REQUIRED_MSG, 'warning');
              return;
            }
            setEnabled(e.target.checked);
          }}
          className="w-[18px] h-[18px]"
        />
      </div>

      <div className="flex flex-col gap-[6px]">
        <label className="text-[14px] font-[500]">Client ID / API Key</label>
        <div className="bg-newBgColorInner h-[42px] border-newTableBorder border rounded-[8px] text-textColor flex items-center justify-center">
          <input
            className="h-full bg-transparent outline-none flex-1 text-[14px] text-textColor placeholder-textColor px-[16px]"
            placeholder={credentialPlaceholder}
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
          />
        </div>
      </div>

      <div className="flex flex-col gap-[6px]">
        <label className="text-[14px] font-[500]">Client Secret / API Secret</label>
        <div className="bg-newBgColorInner h-[42px] border-newTableBorder border rounded-[8px] text-textColor flex items-center justify-center">
          <input
            type="password"
            className="h-full bg-transparent outline-none flex-1 text-[14px] text-textColor placeholder-textColor px-[16px]"
            placeholder={credentialPlaceholder}
            value={clientSecret}
            onChange={(e) => setClientSecret(e.target.value)}
          />
        </div>
      </div>

      <Input
        label="Redirect URI"
        name={`redirect_${identifier}`}
        disableForm={true}
        value={editRedirectUri}
        onChange={(e) => setEditRedirectUri(e.target.value)}
        placeholder="Leave empty for default callback URL"
      />

      <Input
        label="Scopes (comma separated)"
        name={`scopes_${identifier}`}
        disableForm={true}
        value={editScopes}
        onChange={(e) => setEditScopes(e.target.value)}
      />

      {setupNotes && (
        <div className="flex flex-col gap-[4px]">
          <label className="text-[14px] font-[500]">Setup Instructions</label>
          <textarea
            value={editSetupNotes}
            onChange={(e) => setEditSetupNotes(e.target.value)}
            className="p-[8px] rounded-[8px] border border-newTableBorder bg-bgInput text-textColor min-h-[80px] text-[14px]"
            rows={3}
            placeholder="Setup instructions for this provider"
          />
        </div>
      )}

      <div className="flex gap-[8px] justify-between items-center mt-[8px]">
        <div className="flex gap-[8px]">
          <Button
            type="button"
            className="!bg-transparent border border-newTableBorder text-textColor"
            onClick={onClose}
          >
            Cancel
          </Button>
        </div>
        <div className="flex gap-[8px]">
          {isConfigured && (
            <>
              <Button
                type="button"
                className="!bg-transparent border border-red-500/30 text-red-400 text-[12px]"
                onClick={() => onDelete(identifier)}
              >
                Clear Credentials
              </Button>
              <Button
                type="button"
                className="!bg-transparent border border-newTableBorder text-textColor text-[12px]"
                onClick={() => onTest(identifier)}
              >
                Test
              </Button>
            </>
          )}
          <Button type="button" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : 'Save'}
          </Button>
        </div>
      </div>
    </div>
  );
};
