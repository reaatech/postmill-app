'use client';
import 'reflect-metadata';

import React, { FC, useCallback, useMemo, useState } from 'react';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import useSWR from 'swr';
import { Button } from '@gitroom/react/form/button';
import { Input } from '@gitroom/react/form/input';
import { useToaster } from '@gitroom/react/toaster/toaster';
import clsx from 'clsx';
import { deleteDialog } from '@gitroom/react/helpers/delete.dialog';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { AddEditModal } from '@gitroom/frontend/components/new-launch/add.edit.modal';
import { newDayjs } from '@gitroom/frontend/components/layout/set.timezone';
import { useModals } from '@gitroom/frontend/components/layout/new-modal';
import dayjs from 'dayjs';

const PAGE_SIZE = 25;

const SaveSetModal: FC<{
  postData: any;
  initialValue?: string;
  onSave: (name: string) => void;
  onCancel: () => void;
}> = ({ postData, onSave, onCancel, initialValue }) => {
  const [name, setName] = useState(initialValue || '');
  const t = useT();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim()) {
      onSave(name.trim());
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 p-[16px]">
      <div>
        <Input
          label="Set Name"
          translationKey="label_set_name"
          name="setName"
          value={name}
          disableForm
          onChange={(e) => setName(e.target.value)}
          placeholder="Enter a name for this set"
          autoFocus
        />
      </div>
      <div className="flex gap-2 justify-end">
        <Button type="button" secondary onClick={onCancel}>
          {t('cancel', 'Cancel')}
        </Button>
        <Button type="submit" disabled={!name.trim()}>
          {t('save', 'Save')}
        </Button>
      </div>
    </form>
  );
};

export const Sets: FC = () => {
  const fetch = useFetch();
  const modal = useModals();
  const toaster = useToaster();
  const t = useT();

  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);

  const load = useCallback(async (path: string) => {
    return (await (await fetch(path)).json()).integrations;
  }, []);

  const { data: integrations } = useSWR('/integrations/list', load, {
    revalidateOnFocus: false, revalidateOnReconnect: false, revalidateIfStale: false,
    revalidateOnMount: true, refreshWhenHidden: false, refreshWhenOffline: false,
    fallbackData: [],
  });

  const listSets = useCallback(async () => (await fetch('/sets')).json(), []);
  const { data, mutate, isLoading, error } = useSWR('sets', listSets, {
    revalidateOnFocus: false, revalidateOnReconnect: false, revalidateIfStale: false,
    revalidateOnMount: true, refreshWhenHidden: false, refreshWhenOffline: false,
  });

  const filtered = useMemo(() => {
    if (!data) return [];
    let list = [...data];
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((s: any) => s.name?.toLowerCase().includes(q));
    }
    const start = page * PAGE_SIZE;
    return list.slice(start, start + PAGE_SIZE);
  }, [data, search, page]);

  const totalPages = data ? Math.ceil((data.length || 0) / PAGE_SIZE) : 0;

  const addSet = useCallback((params?: { id?: string; name?: string; content?: string }) => () => {
    modal.openModal({
      id: 'add-edit-modal',
      closeOnClickOutside: false,
      removeLayout: true,
      closeOnEscape: false,
      withCloseButton: false,
      askClose: true,
      fullScreen: true,
      classNames: { modal: 'w-[100%] max-w-[1400px] text-textColor' },
      children: (
        <AddEditModal
          allIntegrations={(integrations || []).map((p: any) => ({ ...p }))}
          {...(params?.id ? { set: JSON.parse(params.content) } : {})}
          addEditSets={(data: any) => {
            modal.openModal({
              title: 'Save as Set',
              children: (
                <SaveSetModal
                  initialValue={params?.name || ''}
                  postData={data}
                  onSave={async (name: string) => {
                    try {
                      await fetch('/sets', {
                        method: 'POST',
                        body: JSON.stringify({
                          ...(params?.id ? { id: params.id } : {}),
                          name,
                          content: JSON.stringify(data),
                        }),
                      });
                      modal.closeAll();
                      mutate();
                      toaster.show(t('set_saved', 'Set saved successfully'), 'success');
                    } catch {
                      toaster.show(t('set_save_failed', 'Failed to save set'), 'warning');
                    }
                  }}
                  onCancel={() => modal.closeAll()}
                />
              ),
            });
          }}
          reopenModal={() => {}}
          mutate={() => {}}
          integrations={integrations || []}
          date={newDayjs()}
        />
      ),
      title: '',
    });
  }, [integrations, fetch, modal, mutate, toaster, t]);

  const deleteSet = useCallback((setData: any) => async () => {
    if (await deleteDialog(t('are_you_sure_delete_set', 'Are you sure you want to delete this set?'))) {
      await fetch(`/sets/${setData.id}`, { method: 'DELETE' });
      mutate();
      toaster.show(t('set_deleted', 'Set deleted successfully'), 'success');
    }
  }, [fetch, mutate, toaster, t]);

  return (
    <div className="flex flex-col">
      <div className="mb-[16px]">
        <h3 className="text-[20px]">{t('sets', 'Sets')}</h3>
        <div className="text-newTableText mt-[4px] text-[13px] leading-relaxed">
          {t('sets_description', 'A Set is a saved group of social accounts and post content that you can reuse across multiple posts. Create sets for recurring campaigns, weekly digests, or common post configurations.')}
        </div>
      </div>

      <div className="flex items-center gap-[12px] mb-[16px]">
        <div className="flex-1">
          <input
            type="text"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            placeholder={t('search_sets', 'Search by name...')}
            className="w-full px-[12px] py-[8px] bg-newBgColor border border-newTableBorder rounded-[8px] text-[14px] outline-none"
          />
        </div>
        <Button onClick={addSet()}>{t('add_set', 'Add Set')}</Button>
      </div>

      <div className="bg-newBgColorInner border-newTableBorder border rounded-[12px] p-[24px] overflow-x-auto">
        {isLoading && (
          <div className="flex flex-col gap-[8px] py-[16px]">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-[12px] animate-pulse" style={{ animationDelay: `${i * 100}ms` }}>
                <div className="h-[16px] bg-newTableHeader rounded-[4px]" style={{ flex: i === 0 ? 2 : 1.5 }} />
                <div className="h-[16px] bg-newTableHeader rounded-[4px]" style={{ flex: 1 }} />
                <div className="h-[16px] bg-newTableHeader rounded-[4px]" style={{ flex: 1 }} />
                <div className="h-[16px] bg-newTableHeader rounded-[4px]" style={{ flex: i < 3 ? 1 : 0.5 }} />
              </div>
            ))}
          </div>
        )}

        {!isLoading && error && !data && (
          <div className="flex flex-col items-center py-[40px] gap-[8px]">
            <div className="text-red-400 text-[14px]">{t('failed_loading_sets', 'Failed to load sets')}</div>
            <button onClick={() => window.location.reload()} className="text-[12px] text-textColor hover:underline">{t('try_again', 'Try again')}</button>
          </div>
        )}

        {!isLoading && !error && (!data || data.length === 0) && (
          <div className="flex flex-col items-center py-[40px] gap-[16px]">
            <div className="text-textColor/50 text-[14px]">{t('no_sets', 'No sets created yet')}</div>
            <p className="text-[12px] text-newTableText max-w-[400px] text-center">
              {t('sets_empty_hint', 'Sets let you save groups of social accounts and content together so you can quickly reuse them when creating new posts.')}
            </p>
            <Button onClick={addSet()}>{t('create_first_set', 'Create your first set')}</Button>
          </div>
        )}

        {!isLoading && data && data.length > 0 && (
          <>
            <div className="min-w-[700px]">
            <div className="grid grid-cols-[2fr,2fr,1fr,1fr,1fr] gap-[12px] text-[12px] text-newTableText uppercase font-medium pb-[12px] border-b border-newTableBorder items-center">
              <div>{t('name', 'Name')}</div>
              <div>{t('channels', 'Channels')}</div>
              <div>{t('post_count', 'Posts')}</div>
              <div>{t('created', 'Created')}</div>
              <div className="text-end">{t('actions', 'Actions')}</div>
            </div>

            <div className="flex flex-col">
              {filtered.map((s: any) => (
                <div key={s.id} className="grid grid-cols-[2fr,2fr,1fr,1fr,1fr] gap-[12px] py-[12px] border-b border-newTableBorder/50 items-center text-[14px]">
                  <div className="truncate">{s.name}</div>
                  <div>
                    {(() => {
                      try {
                        const content = JSON.parse(s.content || '[]');
                        if (Array.isArray(content)) {
                          const channels = content.filter((c: any) => c?.integration?.picture);
                          return (
                            <div className="flex items-center gap-[4px]">
                              {channels.slice(0, 5).map((c: any, i: number) => (
                                <img
                                  key={i}
                                  src={c.integration.picture}
                                  alt=""
                                  className="w-[20px] h-[20px] rounded-full border border-newTableBorder"
                                />
                              ))}
                              {channels.length > 5 && (
                                <span className="text-[11px] text-newTableText">+{channels.length - 5}</span>
                              )}
                            </div>
                          );
                        }
                      } catch {}
                      return <span className="text-[12px] text-newTableText">—</span>;
                    })()}
                  </div>
                  <div className="text-newTableText text-[12px]">
                    {(() => {
                      try {
                        const content = JSON.parse(s.content || '[]');
                        return Array.isArray(content) ? content.length : 0;
                      } catch { return 0; }
                    })()}
                  </div>
                  <div className="text-newTableText text-[12px]">{dayjs(s.createdAt).format('MMM D, YYYY')}</div>
                  <div className="flex justify-end gap-[8px]">
                    <button onClick={addSet(s)} className="text-[12px] text-textColor hover:underline">{t('edit', 'Edit')}</button>
                    <button onClick={deleteSet(s)} className="text-[12px] text-red-400 hover:underline">{t('delete', 'Delete')}</button>
                  </div>
                </div>
              ))}
            </div>

            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-[16px] pt-[12px] border-t border-newTableBorder">
                <div className="text-[12px] text-newTableText">{t('page_of', 'Page {page} of {total}', { page: String(page + 1), total: String(totalPages) })}</div>
                <div className="flex gap-[8px]">
                  <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} className="px-[12px] py-[6px] text-[13px] bg-newBgColor border border-newTableBorder rounded-[4px] disabled:opacity-40">{t('previous', 'Previous')}</button>
                  <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1} className="px-[12px] py-[6px] text-[13px] bg-newBgColor border border-newTableBorder rounded-[4px] disabled:opacity-40">{t('next', 'Next')}</button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};
