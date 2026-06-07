'use client';

import { FC, useCallback, useState } from 'react';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import useSWR, { mutate } from 'swr';

interface Campaign {
  id: string;
  name: string;
  color: string | null;
  description: string | null;
  startDate: string | null;
  endDate: string | null;
  archived: boolean;
  createdAt: string;
  _count: { posts: number };
}

export const CampaignsPage: FC = () => {
  const t = useT();
  const fetch = useFetch();
  const [name, setName] = useState('');
  const [color, setColor] = useState('');
  const [description, setDescription] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);

  const { data: campaigns, error } = useSWR<Campaign[]>(
    '/campaigns',
    (url: string) => fetch(url).then((r: Response) => r.json()),
  );

  const resetForm = useCallback(() => {
    setName('');
    setColor('');
    setDescription('');
    setEditingId(null);
  }, []);

  const save = useCallback(async () => {
    if (!name.trim()) return;
    if (editingId) {
      await fetch(`/campaigns/${editingId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), color: color || undefined, description: description.trim() || undefined }),
      });
    } else {
      await fetch('/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), color: color || undefined, description: description.trim() || undefined }),
      });
    }
    resetForm();
    mutate('/campaigns');
  }, [name, color, description, editingId, fetch, resetForm]);

  const remove = useCallback(async (id: string) => {
    await fetch(`/campaigns/${id}`, { method: 'DELETE' });
    mutate('/campaigns');
  }, [fetch]);

  const edit = useCallback((campaign: Campaign) => {
    setEditingId(campaign.id);
    setName(campaign.name);
    setColor(campaign.color || '');
    setDescription(campaign.description || '');
  }, []);

  return (
    <div className="flex-1 flex flex-col p-[24px] gap-[24px]">
      <h1 className="text-[24px] font-semibold">
        {t('campaigns_title', 'Campaigns')}
      </h1>

      <div className="flex gap-[8px] items-end">
        <div className="flex flex-col gap-[4px]">
          <label className="text-[12px] text-newTableText">
            {t('name', 'Name')}
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="px-[12px] py-[8px] bg-newBgColor border border-newTableBorder rounded-[8px] text-[14px] outline-none"
            placeholder={t('campaign_name_placeholder', 'Campaign name')}
          />
        </div>
        <div className="flex flex-col gap-[4px]">
          <label className="text-[12px] text-newTableText">
            {t('color', 'Color')}
          </label>
          <input
            type="text"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            className="px-[12px] py-[8px] bg-newBgColor border border-newTableBorder rounded-[8px] text-[14px] outline-none w-[80px]"
            placeholder="#fff"
          />
        </div>
        <div className="flex flex-col gap-[4px]">
          <label className="text-[12px] text-newTableText">
            {t('description', 'Description')}
          </label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="px-[12px] py-[8px] bg-newBgColor border border-newTableBorder rounded-[8px] text-[14px] outline-none"
            placeholder={t('campaign_desc_placeholder', 'Optional description')}
          />
        </div>
        <button
          onClick={save}
          disabled={!name.trim()}
          className="px-[16px] py-[8px] bg-forth text-white rounded-[8px] text-[14px] font-medium disabled:opacity-50"
        >
          {editingId ? t('update', 'Update') : t('create', 'Create')}
        </button>
        {editingId && (
          <button
            onClick={resetForm}
            className="px-[16px] py-[8px] bg-gray-500 text-white rounded-[8px] text-[14px] font-medium"
          >
            {t('cancel', 'Cancel')}
          </button>
        )}
      </div>

      {error && (
        <div className="text-red-500 text-[13px]">
          {t('campaigns_load_error', 'Failed to load campaigns')}
        </div>
      )}

      {campaigns && campaigns.length === 0 && (
        <div className="text-[13px] text-newTableText">
          {t('campaigns_empty', 'No campaigns yet. Create one above.')}
        </div>
      )}

      {campaigns && campaigns.length > 0 && (
        <div className="grid gap-[12px]">
          {campaigns.map((campaign) => (
            <div
              key={campaign.id}
              className="flex items-center justify-between p-[16px] bg-newBgColor border border-newTableBorder rounded-[8px]"
              style={campaign.color ? { borderLeftColor: campaign.color, borderLeftWidth: 4 } : undefined}
            >
              <div className="flex items-center gap-[16px]">
                <div>
                  <span className="text-[15px] font-medium">
                    {campaign.name}
                  </span>
                  {campaign.description && (
                    <p className="text-[12px] text-newTableText mt-[4px]">
                      {campaign.description}
                    </p>
                  )}
                </div>
                <span className="text-[12px] text-newTableText">
                  {campaign._count.posts} {t('posts', 'posts')}
                </span>
              </div>
              <div className="flex items-center gap-[8px]">
                <button
                  onClick={() => edit(campaign)}
                  className="px-[8px] py-[4px] text-[12px] bg-forth text-white rounded-[4px]"
                >
                  {t('edit', 'Edit')}
                </button>
                <button
                  onClick={() => remove(campaign.id)}
                  className="px-[8px] py-[4px] text-[12px] bg-red-500 text-white rounded-[4px]"
                >
                  {t('delete', 'Delete')}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
