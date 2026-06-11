'use client';

import React, { FC, Fragment, useCallback, useMemo, useState } from 'react';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import useSWR from 'swr';
import { Button } from '@gitroom/react/form/button';
import clsx from 'clsx';
import { useModals } from '@gitroom/frontend/components/layout/new-modal';
import { boolean, object, string } from 'yup';
import { FormProvider, useForm } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import { Select } from '@gitroom/react/form/select';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { deleteDialog } from '@gitroom/react/helpers/delete.dialog';
import dayjs from 'dayjs';

const PAGE_SIZE = 25;

const details = object().shape({
  content: string().required('Content is required'),
  autoAdd: boolean().required(),
  channelScope: string().optional(),
});

const AddOrEditSignature: FC<{
  data?: any;
  reload: () => void;
  appendSignature?: (value: string) => void;
}> = ({ data, reload, appendSignature }) => {
  const fetch = useFetch();
  const toast = useToaster();
  const modal = useModals();
  const t = useT();

  const form = useForm({
    resolver: yupResolver(details),
    values: {
      content: data?.content || '',
      autoAdd: data?.autoAdd || false,
      channelScope: data?.channelScope || 'all',
    },
  });

  const text = form.watch('content');
  const autoAdd = form.watch('autoAdd');

  const callBack = useCallback(async (values: any) => {
    await fetch(data?.id ? `/signatures/${data.id}` : '/signatures', {
      method: data?.id ? 'PUT' : 'POST',
      body: JSON.stringify(values),
    });
    toast.show(
      data?.id ? t('signature_updated', 'Signature updated successfully') : t('signature_added', 'Signature added successfully'),
      'success'
    );
    modal.closeCurrent();
    reload();
  }, [data, fetch, modal, reload, toast, t]);

  return (
    <FormProvider {...form}>
      <form onSubmit={form.handleSubmit(callBack)}>
        <div className="relative flex gap-[20px] flex-col flex-1 rounded-[4px] pt-0">
          <div className="relative">
            <textarea
              value={text}
              onChange={(e) => form.setValue('content', e.target.value)}
              className="min-h-[120px] max-h-[240px] w-full p-[12px] bg-newBgColor border border-newTableBorder rounded-[8px] text-[14px] outline-none resize-y scrollbar scrollbar-thumb-tableBorder"
              placeholder={t('write_signature', 'Write your signature...')}
            />
            <div className="text-[11px] text-newTableText text-end mt-[4px]">
              {text.length} {t('characters', 'characters')}
            </div>
          </div>

          <Select
            label="Auto add signature?"
            translationKey="label_auto_add_signature"
            {...form.register('autoAdd', {
              setValueAs: (value) => value === 'true',
            })}
          >
            <option value="false">{t('no', 'No')}</option>
            <option value="true">{t('yes', 'Yes')}</option>
          </Select>

          <Select
            label="Channel scope"
            translationKey="label_channel_scope"
            {...form.register('channelScope')}
          >
            <option value="all">{t('all_channels', 'All channels')}</option>
            <option value="social">{t('social_only', 'Social media only')}</option>
          </Select>

          <Button type="submit">{t('save', 'Save')}</Button>
        </div>
      </form>
    </FormProvider>
  );
};

export const SignaturesComponent: FC<{
  appendSignature?: (value: string) => void;
}> = ({ appendSignature }) => {
  const fetch = useFetch();
  const modal = useModals();
  const toaster = useToaster();
  const t = useT();

  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);

  const load = useCallback(async () => (await fetch('/signatures')).json(), []);
  const { data, mutate, isLoading, error } = useSWR('signatures', load);

  const filtered = useMemo(() => {
    if (!data) return [];
    let list = [...data];
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((s: any) => s.content?.toLowerCase().includes(q));
    }
    const start = page * PAGE_SIZE;
    return list.slice(start, start + PAGE_SIZE);
  }, [data, search, page]);

  const totalPages = data ? Math.ceil((data.length || 0) / PAGE_SIZE) : 0;

  const addSignature = useCallback((sigData?: any) => () => {
    modal.openModal({
      title: sigData ? t('edit_signature', 'Edit Signature') : t('add_signature', 'Add Signature'),
      withCloseButton: true,
      children: <AddOrEditSignature data={sigData} reload={mutate} appendSignature={appendSignature} />,
    });
  }, [modal, mutate, t, appendSignature]);

  const deleteSignature = useCallback((sig: any) => async () => {
    if (await deleteDialog(t('are_you_sure_delete_signature', 'Are you sure you want to delete this signature?'))) {
      await fetch(`/signatures/${sig.id}`, { method: 'DELETE' });
      mutate();
      toaster.show(t('signature_deleted', 'Signature deleted successfully'), 'success');
    }
  }, [fetch, mutate, toaster, t]);

  const usageCount = useCallback((sig: any) => {
    return sig.usageCount || 0;
  }, []);

  return (
    <div className="flex flex-col">
      <div className="mb-[16px]">
        <h3 className="text-[20px]">{t('signatures', 'Signatures')}</h3>
        <div className="text-newTableText mt-[4px] text-[13px] leading-relaxed">
          {t('signatures_description', 'Signatures are reusable text blocks that you can append to your social media posts. Create signatures for branding, disclaimers, or call-to-action messages.')}
        </div>
      </div>

      <div className="flex items-center gap-[12px] mb-[16px]">
        <div className="flex-1">
          <input
            type="text"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            placeholder={t('search_signatures', 'Search signatures...')}
            className="w-full px-[12px] py-[8px] bg-newBgColor border border-newTableBorder rounded-[8px] text-[14px] outline-none"
          />
        </div>
        <Button onClick={addSignature()}>{t('add_signature', 'Add Signature')}</Button>
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
            <div className="text-red-400 text-[14px]">{t('failed_loading_signatures', 'Failed to load signatures')}</div>
            <button onClick={() => window.location.reload()} className="text-[12px] text-textColor hover:underline">{t('try_again', 'Try again')}</button>
          </div>
        )}

        {!isLoading && !error && (!data || data.length === 0) && (
          <div className="flex flex-col items-center py-[40px] gap-[16px]">
            <div className="text-textColor/50 text-[14px]">{t('no_signatures', 'No signatures created yet')}</div>
            <p className="text-[12px] text-newTableText max-w-[400px] text-center">
              {t('signatures_empty_hint', 'Signatures let you add consistent branding, disclaimers, or calls-to-action to the end of your social media posts.')}
            </p>
            <Button onClick={addSignature()}>{t('create_first_signature', 'Create your first signature')}</Button>
          </div>
        )}

        {!isLoading && data && data.length > 0 && (
          <>
            <div className="min-w-[700px]">
            <div className={clsx(
              'grid gap-[12px] text-[12px] text-newTableText uppercase font-medium pb-[12px] border-b border-newTableBorder items-center',
              appendSignature ? 'grid-cols-[2fr,1.5fr,1fr,1fr,1fr]' : 'grid-cols-[2fr,1.5fr,1fr,1fr]'
            )}>
              <div>{t('name_preview', 'Preview')}</div>
              <div>{t('channel_scope', 'Scope')}</div>
              <div>{t('usage', 'Usage')}</div>
              {!!appendSignature && <div className="text-center">{t('actions', 'Actions')}</div>}
              <div className="text-end">{t('actions', 'Actions')}</div>
            </div>

            <div className="flex flex-col">
              {filtered.map((sig: any) => (
                <div key={sig.id} className={clsx(
                  'grid gap-[12px] py-[12px] border-b border-newTableBorder/50 items-center text-[14px]',
                  appendSignature ? 'grid-cols-[2fr,1.5fr,1fr,1fr,1fr]' : 'grid-cols-[2fr,1.5fr,1fr,1fr]'
                )}>
                  <div className="truncate text-newTableText" title={sig.content}>
                    {sig.content.slice(0, 80)}{sig.content.length > 80 ? '...' : ''}
                  </div>
                  <div className="text-[12px]">
                    <span className={clsx(
                      'px-[6px] py-[2px] rounded-full text-[11px]',
                      (!sig.channelScope || sig.channelScope === 'all') ? 'bg-btnSecondary/20 text-btnPrimary' : 'bg-amber-500/20 text-amber-500'
                    )}>
                      {(!sig.channelScope || sig.channelScope === 'all') ? t('all_channels', 'All') : t('social_only', 'Social')}
                    </span>
                  </div>
                  <div className="text-[12px] text-newTableText">{usageCount(sig)}</div>
                  {!!appendSignature && (
                    <div className="text-center">
                      <button onClick={() => appendSignature(sig.content)} className="text-[12px] text-textColor hover:underline">
                        {t('use', 'Use')}
                      </button>
                    </div>
                  )}
                  <div className="flex justify-end gap-[8px]">
                    <button onClick={addSignature(sig)} className="text-[12px] text-textColor hover:underline">{t('edit', 'Edit')}</button>
                    <button onClick={deleteSignature(sig)} className="text-[12px] text-red-400 hover:underline">{t('delete', 'Delete')}</button>
                  </div>
                </div>
              ))}
            </div>

            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-[16px] pt-[12px] border-t border-newTableBorder">
                <div className="text-[12px] text-newTableText">{t('page_of', 'Page {page} of {total}', { page: String(page + 1), total: String(totalPages) })}</div>
                <div className="flex gap-[8px]">
                  <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} className="px-[12px] py-[6px] text-[13px] bg-newBgColor border border-newTableBorder rounded-[8px] disabled:opacity-40">{t('previous', 'Previous')}</button>
                  <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1} className="px-[12px] py-[6px] text-[13px] bg-newBgColor border border-newTableBorder rounded-[8px] disabled:opacity-40">{t('next', 'Next')}</button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};
