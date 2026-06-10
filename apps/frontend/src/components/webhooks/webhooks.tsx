'use client';

import React, { FC, Fragment, useCallback, useMemo, useState } from 'react';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import useSWR from 'swr';
import { Button } from '@gitroom/react/form/button';
import { useModals } from '@gitroom/frontend/components/layout/new-modal';
import { Input } from '@gitroom/react/form/input';
import { FormProvider, useForm } from 'react-hook-form';
import { object, string, array } from 'yup';
import { yupResolver } from '@hookform/resolvers/yup';
import { Select } from '@gitroom/react/form/select';
import { PickPlatforms } from '@gitroom/frontend/components/launches/helpers/pick.platform.component';
import { useToaster } from '@gitroom/react/toaster/toaster';
import clsx from 'clsx';
import { deleteDialog } from '@gitroom/react/helpers/delete.dialog';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import dayjs from 'dayjs';

const PAGE_SIZE = 25;

const EVENT_OPTIONS = [
  { value: 'post.published', label: 'Post Published' },
  { value: 'post.failed', label: 'Post Failed' },
  { value: 'comment.new', label: 'New Comment' },
  { value: 'comment.reply', label: 'Comment Reply' },
  { value: 'analytics.snapshot_complete', label: 'Analytics Snapshot' },
];

const webhookDetails = object().shape({
  name: string().required('Name is required'),
  url: string().url('Must be a valid URL').required('URL is required'),
  secret: string().optional(),
  events: array().of(string().required()).min(1, 'Select at least one event'),
  integrations: array(),
});

const getWebhookOptions = (t: (key: string, fallback: string) => string) => [
  { label: t('all_integrations', 'All integrations'), value: 'all' },
  { label: t('specific_integrations', 'Specific integrations'), value: 'specific' },
];

const AddOrEditWebhook: FC<{ data?: any; reload: () => void }> = ({ data, reload }) => {
  const fetch = useFetch();
  const t = useT();
  const options = getWebhookOptions(t);
  const modal = useModals();
  const toast = useToaster();

  const [allIntegrations, setAllIntegrations] = useState(
    (data?.integrations?.length || 0) > 0 ? options[1] : options[0]
  );

  const [testResult, setTestResult] = useState<{ success: boolean; status: number; error?: string } | null>(null);
  const [testing, setTesting] = useState(false);

  const form = useForm({
    resolver: yupResolver(webhookDetails),
    values: {
      name: data?.name || '',
      url: data?.url || '',
      secret: data?.secret || '',
      events: data?.events || ['post.published'],
      integrations: data?.integrations?.map((p: any) => p.integration) || [],
    },
  });

  const events = form.watch('events');
  const integrations = form.watch('integrations');
  const url = form.watch('url');

  const integrationList = useCallback(async () => (await fetch('/integrations/list')).json(), []);
  const { data: dataList, isLoading } = useSWR('integrations', integrationList, {
    revalidateOnFocus: false, revalidateOnReconnect: false, revalidateIfStale: false,
    revalidateOnMount: true, refreshWhenHidden: false, refreshWhenOffline: false,
  });

  const changeIntegration = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    const findValue = options.find((o) => o.value === e.target.value)!;
    setAllIntegrations(findValue);
    if (findValue.value === 'all') form.setValue('integrations', []);
  }, [options, form]);

  const callBack = useCallback(async (values: any) => {
    await fetch('/webhooks', {
      method: data?.id ? 'PUT' : 'POST',
      body: JSON.stringify({
        ...(data?.id ? { id: data.id } : {}),
        ...values,
      }),
    });
    toast.show(
      data?.id ? t('webhook_updated_successfully', 'Webhook updated successfully') : t('webhook_added_successfully', 'Webhook added successfully'),
      'success'
    );
    modal.closeAll();
    reload();
  }, [data, fetch, modal, reload, toast, t]);

  const testWebhook = useCallback(async () => {
    if (!url) return;
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch(`/webhooks/test-ping/${data?.id}`, { method: 'POST' });
      const result = await res.json();
      setTestResult(result);
    } catch {
      setTestResult({ success: false, status: 0, error: 'Connection failed' });
    }
    setTesting(false);
  }, [url, data?.id, fetch]);

  const toggleEvent = useCallback((event: string) => {
    const current = form.getValues('events') || [];
    if (current.includes(event)) {
      form.setValue('events', current.filter((e: string) => e !== event));
    } else {
      form.setValue('events', [...current, event]);
    }
  }, [form]);

  return (
    <FormProvider {...form}>
      <form onSubmit={form.handleSubmit(callBack)} className="relative flex gap-[20px] flex-col flex-1 rounded-[4px] pt-0">
        <div>
          <Input label="Name" translationKey="label_name" {...form.register('name')} />
          <Input label="URL" translationKey="label_url" {...form.register('url')} />
          <Input label="Secret (HMAC key)" translationKey="label_secret" {...form.register('secret')} />

          <div className="flex flex-col gap-[6px] mb-[16px]">
            <div className="text-[14px]">{t('events', 'Events')}</div>
            <div className="flex flex-wrap gap-[8px]">
              {EVENT_OPTIONS.map((opt) => (
                <label key={opt.value} className="flex items-center gap-[6px] cursor-pointer text-[13px]">
                  <input
                    type="checkbox"
                    checked={(events || []).includes(opt.value)}
                    onChange={() => toggleEvent(opt.value)}
                    className="accent-forth"
                  />
                  {opt.label}
                </label>
              ))}
            </div>
          </div>

          <Select
            value={allIntegrations.value}
            name="integrations"
            label="Integrations"
            translationKey="label_integrations"
            disableForm
            onChange={changeIntegration}
          >
            {options.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
          </Select>

          {allIntegrations.value === 'specific' && dataList && !isLoading && (
            <PickPlatforms
              integrations={dataList.integrations}
              selectedIntegrations={integrations as any[]}
              onChange={(e) => form.setValue('integrations', e)}
              singleSelect={false}
              toolTip
              isMain
            />
          )}

          <div className="flex gap-[10px] mt-[24px]">
            <Button type="submit">{t('save', 'Save')}</Button>
            <Button type="button" secondary onClick={testWebhook} disabled={!data?.id}>
              {testing ? t('testing', 'Testing...') : t('test_webhook', 'Test Webhook')}
            </Button>
          </div>

          {testResult && (
            <div className={clsx('mt-[12px] p-[12px] rounded-[4px] text-[13px]', testResult.success ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-400')}>
              {testResult.success
                ? t('webhook_test_success', 'Webhook responded with status {status}', { status: String(testResult.status) })
                : t('webhook_test_failed', 'Webhook test failed: {error}', { error: testResult.error || 'Unknown error' })}
            </div>
          )}
        </div>
      </form>
    </FormProvider>
  );
};

export const Webhooks: FC = () => {
  const fetch = useFetch();
  const modal = useModals();
  const toaster = useToaster();
  const t = useT();

  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);

  const list = useCallback(async () => (await fetch('/webhooks')).json(), []);
  const { data, mutate, isLoading, error } = useSWR('webhooks', list);

  const filtered = useMemo(() => {
    if (!data) return [];
    let list = [...data];
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((w: any) => w.url?.toLowerCase().includes(q) || w.name?.toLowerCase().includes(q));
    }
    const start = page * PAGE_SIZE;
    return list.slice(start, start + PAGE_SIZE);
  }, [data, search, page]);

  const totalPages = data ? Math.ceil((data.length || 0) / PAGE_SIZE) : 0;

  const addWebhook = useCallback((webhookData?: any) => () => {
    modal.openModal({
      title: webhookData ? t('edit_webhook', 'Edit Webhook') : t('add_webhook', 'Add Webhook'),
      withCloseButton: true,
      children: <AddOrEditWebhook data={webhookData} reload={mutate} />,
    });
  }, [modal, mutate, t]);

  const deleteHook = useCallback((webhook: any) => async () => {
    if (await deleteDialog(t('are_you_sure_delete_webhook', 'Are you sure you want to delete this webhook?'))) {
      await fetch(`/webhooks/${webhook.id}`, { method: 'DELETE' });
      mutate();
      toaster.show(t('webhook_deleted', 'Webhook deleted'), 'success');
    }
  }, [fetch, mutate, toaster, t]);

  const testPing = useCallback(async (webhook: any) => {
    try {
      const res = await fetch(`/webhooks/test-ping/${webhook.id}`, { method: 'POST' });
      const result = await res.json();
      if (result.success) {
        toaster.show(t('webhook_ping_ok', 'Webhook responded with status {status}', { status: String(result.status) }), 'success');
      } else {
        toaster.show(t('webhook_ping_fail', 'Webhook test failed: {error}', { error: result.error || 'Unknown' }), 'warning');
      }
    } catch {
      toaster.show(t('webhook_ping_error', 'Failed to test webhook'), 'warning');
    }
  }, [fetch, toaster, t]);

  return (
    <div className="flex flex-col">
      <div className="mb-[16px]">
        <h3 className="text-[20px]">{t('webhooks', 'Webhooks')}</h3>
        <div className="text-customColor18 mt-[4px] text-[13px] leading-relaxed">
          {t('webhooks_description', 'Webhooks are HTTP callbacks that notify your application when events happen in Postmill. When a triggered event occurs, we send an HTTP POST request to the URLs you configure.')}
        </div>
      </div>

      <div className="flex items-center gap-[12px] mb-[16px]">
        <div className="flex-1">
          <input
            type="text"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            placeholder={t('search_webhooks', 'Search by URL or name...')}
            className="w-full px-[12px] py-[8px] bg-newBgColor border border-newTableBorder rounded-[8px] text-[14px] outline-none"
          />
        </div>
        <Button onClick={addWebhook()}>{t('add_webhook', 'Add Webhook')}</Button>
      </div>

      <div className="bg-sixth border-fifth border rounded-[4px] p-[24px] overflow-x-auto">
        {isLoading && (
          <div className="flex flex-col gap-[8px] py-[16px]">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-[12px] animate-pulse" style={{ animationDelay: `${i * 100}ms` }}>
                <div className="h-[16px] bg-fifth rounded-[4px]" style={{ flex: i === 0 ? 2 : 1.5 }} />
                <div className="h-[16px] bg-fifth rounded-[4px]" style={{ flex: 1 }} />
                <div className="h-[16px] bg-fifth rounded-[4px]" style={{ flex: 1 }} />
                <div className="h-[16px] bg-fifth rounded-[4px]" style={{ flex: i < 3 ? 1 : 0.5 }} />
              </div>
            ))}
          </div>
        )}

        {!isLoading && error && !data && (
          <div className="flex flex-col items-center py-[40px] gap-[8px]">
            <div className="text-red-400 text-[14px]">{t('failed_loading_webhooks', 'Failed to load webhooks')}</div>
            <button onClick={() => window.location.reload()} className="text-[12px] text-forth hover:underline">{t('try_again', 'Try again')}</button>
          </div>
        )}

        {!isLoading && !error && (!data || data.length === 0) && (
          <div className="flex flex-col items-center py-[40px] gap-[16px]">
            <div className="text-textColor/50 text-[14px]">{t('no_webhooks', 'No webhooks configured yet')}</div>
            <p className="text-[12px] text-customColor18 max-w-[400px] text-center">
              {t('webhooks_empty_hint', 'Webhooks let you receive real-time notifications when posts are published, comments are received, or other events occur.')}
            </p>
            <Button onClick={addWebhook()}>{t('create_first_webhook', 'Create your first webhook')}</Button>
          </div>
        )}

        {!isLoading && data && data.length > 0 && (
          <>
            <div className="min-w-[700px]">
            <div className="grid grid-cols-[2fr,1.5fr,1fr,1fr,1fr] gap-[12px] text-[12px] text-customColor18 uppercase font-medium pb-[12px] border-b border-fifth items-center">
              <div>{t('url', 'URL')}</div>
              <div>{t('events', 'Events')}</div>
              <div>{t('status', 'Status')}</div>
              <div>{t('created', 'Created')}</div>
              <div className="text-end">{t('actions', 'Actions')}</div>
            </div>

            <div className="flex flex-col">
              {filtered.map((w: any) => (
                <div key={w.id} className="grid grid-cols-[2fr,1.5fr,1fr,1fr,1fr] gap-[12px] py-[12px] border-b border-fifth/50 items-center text-[14px]">
                  <div className="truncate text-customColor18" title={w.url}>{w.url}</div>
                  <div className="flex flex-wrap gap-[4px]">
                    {(w.events || ['post.published']).slice(0, 3).map((ev: string) => (
                      <span key={ev} className="text-[11px] bg-forth/20 text-forth px-[6px] py-[2px] rounded-full">
                        {ev.replace('.', ' ')}
                      </span>
                    ))}
                    {(w.events || []).length > 3 && (
                      <span className="text-[11px] text-customColor18">+{w.events.length - 3}</span>
                    )}
                  </div>
                  <div>
                    <span className={clsx('text-[12px]', w.active !== false ? 'text-green-500' : 'text-customColor18')}>
                      {w.active !== false ? t('active', 'Active') : t('disabled', 'Disabled')}
                    </span>
                  </div>
                  <div className="text-customColor18 text-[12px]">{dayjs(w.createdAt).format('MMM D, YYYY')}</div>
                  <div className="flex justify-end gap-[8px]">
                    <button onClick={() => testPing(w)} className="text-[12px] text-forth hover:underline">{t('test', 'Test')}</button>
                    <button onClick={addWebhook(w)} className="text-[12px] text-forth hover:underline">{t('edit', 'Edit')}</button>
                    <button onClick={deleteHook(w)} className="text-[12px] text-red-400 hover:underline">{t('delete', 'Delete')}</button>
                  </div>
                </div>
              ))}
            </div>

            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-[16px] pt-[12px] border-t border-fifth">
                <div className="text-[12px] text-customColor18">{t('page_of', 'Page {page} of {total}', { page: String(page + 1), total: String(totalPages) })}</div>
                <div className="flex gap-[8px]">
                  <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} className="px-[12px] py-[6px] text-[13px] bg-newBgColor border border-fifth rounded-[4px] disabled:opacity-40">{t('previous', 'Previous')}</button>
                  <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1} className="px-[12px] py-[6px] text-[13px] bg-newBgColor border border-fifth rounded-[4px] disabled:opacity-40">{t('next', 'Next')}</button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};
