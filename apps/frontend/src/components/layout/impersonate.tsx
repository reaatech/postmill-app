import { Input } from '@gitroom/react/form/input';
import { ChangeEventHandler, FC, useCallback, useMemo, useState } from 'react';
import useSWR, { useSWRConfig } from 'swr';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useUser } from '@gitroom/frontend/components/layout/user.context';
import { Select } from '@gitroom/react/form/select';
import { pricing } from '@gitroom/nestjs-libraries/database/prisma/subscriptions/pricing';
import { deleteDialog } from '@gitroom/react/helpers/delete.dialog';
import { useVariables } from '@gitroom/react/helpers/variable.context';
import { setCookie } from '@gitroom/frontend/components/layout/layout.context';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { useModals } from '@gitroom/frontend/components/layout/new-modal';
import { Button } from '@gitroom/react/form/button';
import { ImportDebugPostModal } from '@gitroom/frontend/components/launches/import-debug-post.modal';
import { DataTable } from '@gitroom/frontend/components/ui/data-table';

interface Charge {
  id: string;
  amount: number;
  currency: string;
  created: number;
  status: string;
  refunded: boolean;
  amount_refunded: number;
  description: string | null;
  receipt_url: string | null;
  invoice_pdf: string | null;
}

const useCharges = () => {
  const fetch = useFetch();
  return useSWR<Charge[]>('/billing/charges', async () => {
    return (await fetch('/billing/charges')).json();
  }, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    revalidateIfStale: false,
  });
};

const ChargesModal: FC<{ close: () => void }> = ({ close }) => {
  const fetch = useFetch();
  const toaster = useToaster();
  const t = useT();
  const { data: charges, mutate, isLoading } = useCharges();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [refunding, setRefunding] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  const handleRefund = useCallback(async () => {
    if (!selected.size) return;
    if (
      !(await deleteDialog(
        t(
          'refund_selected_confirm',
          `Are you sure you want to refund ${selected.size} charge(s)? This cannot be undone.`
        ),
        t('yes_refund', 'Yes, refund'),
        t('confirm_refund', 'Confirm Refund'),
        t('no_cancel', 'No, cancel')
      ))
    ) {
      return;
    }
    setRefunding(true);
    try {
      await fetch('/billing/refund-charges', {
        method: 'POST',
        body: JSON.stringify({ chargeIds: Array.from(selected) }),
      });
      setSelected(new Set());
      await mutate();
    } finally {
      setRefunding(false);
    }
  }, [selected, fetch, mutate, t]);

  const handleCancel = useCallback(async () => {
    if (
      !(await deleteDialog(
        t(
          'cancel_subscription_confirm',
          'This will immediately cancel the subscription. The user will be downgraded to the FREE plan. This cannot be undone.'
        ),
        t('yes_cancel_subscription', 'Yes, cancel subscription'),
        t('cancel_subscription_title', 'Cancel Subscription?'),
        t('no_go_back', 'No, go back')
      ))
    ) {
      return;
    }
    setCancelling(true);
    try {
      await fetch('/billing/cancel-subscription', {
        method: 'POST',
      });
      close();
      window.location.reload();
    } catch {
      setCancelling(false);
      toaster.show('Failed to cancel subscription', 'warning');
    }
  }, [toaster, fetch, close, t]);

  return (
    <div className="flex flex-col gap-[16px] min-w-[500px]">
      <div className="max-h-[400px] overflow-y-auto">
        {isLoading ? (
          <div className="text-center py-[20px] text-newTextColor/60">
            {t('loading', 'Loading...')}
          </div>
        ) : !charges?.length ? (
          <div className="text-center py-[20px] text-newTextColor/60">
            {t('no_charges', 'No charges found')}
          </div>
        ) : (
          <DataTable
            columns={[
              { key: 'date', header: t('date', 'Date'), render: (charge: Charge) => new Date(charge.created * 1000).toLocaleDateString() },
              { key: 'amount', header: t('amount', 'Amount'), render: (charge: Charge) => `$${(charge.amount / 100).toFixed(2)} ${charge.currency.toUpperCase()}` },
              { key: 'status', header: t('status', 'Status'), render: (charge: Charge) => (
                charge.refunded ? <span className="text-red-400">{t('refunded', 'Refunded')}</span> : <span className="text-green-400">{t('paid', 'Paid')}</span>
              )},
              { key: 'actions', header: '', align: 'right', render: (charge: Charge) => (
                (charge.invoice_pdf || charge.receipt_url) ? (
                  <a
                    href={charge.invoice_pdf || charge.receipt_url!}
                    target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center justify-center w-[28px] h-[28px] rounded-[4px] hover:bg-tableBorder transition-colors"
                    title={charge.invoice_pdf ? t('download_invoice', 'Download Invoice') : t('view_receipt', 'View Receipt')}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="7 10 12 15 17 10" />
                      <line x1="12" y1="15" x2="12" y2="3" />
                    </svg>
                  </a>
                ) : null
              )},
            ]}
            data={charges}
            keyExtractor={(charge: Charge) => charge.id}
            selectedIds={Array.from(selected)}
            onSelectionChange={(ids) => setSelected(new Set(ids.filter((id) => !charges?.find((c) => c.id === id)?.refunded)))}
            emptyState={{ title: t('no_charges', 'No charges found') }}
          />
        )}
      </div>
      <div className="flex gap-[12px] justify-end">
        <Button
          onClick={handleRefund}
          loading={refunding}
          disabled={!selected.size}
          className="rounded-[4px]"
        >
          {t('refund_selected', 'Refund Selected')}
          {selected.size > 0 && ` (${selected.size})`}
        </Button>
        <Button
          onClick={handleCancel}
          loading={cancelling}
          className="!bg-red-700 rounded-[4px]"
        >
          {t('cancel_subscription', 'Cancel Subscription')}
        </Button>
      </div>
    </div>
  );
};

const ManageBilling = () => {
  const { openModal } = useModals();
  const t = useT();

  const handleClick = useCallback(() => {
    openModal({
      title: t('manage_billing', 'Manage Billing'),
      children: (close) => <ChargesModal close={close} />,
    });
  }, [openModal, t]);

  return (
    <div
      className="px-[10px] rounded-[4px] bg-red-700 text-white cursor-pointer whitespace-nowrap"
      onClick={handleClick}
    >
      {t('manage_billing', 'Manage Billing')}
    </div>
  );
};

export const Subscription = () => {
  const fetch = useFetch();
  const toaster = useToaster();
  const t = useT();

  const addSubscription: ChangeEventHandler<HTMLSelectElement> = useCallback(
    async (e) => {
      const value = e.target.value;
      if (
        await deleteDialog(
          'Are you sure you want to add a user subscription?',
          'Add'
        )
      ) {
        try {
          await fetch('/billing/add-subscription', {
            method: 'POST',
            body: JSON.stringify({
              subscription: value,
            }),
          });
          window.location.reload();
        } catch {
          toaster.show('Failed to add subscription', 'warning');
        }
      }
    },
    [toaster, fetch]
  );
  return (
    <Select
      onChange={addSubscription}
      hideErrors={true}
      disableForm={true}
      name="sub"
      label=""
      value=""
    >
      <option>
        {t('add_free_subscription', '-- ADD FREE SUBSCRIPTION --')}
      </option>
      {Object.keys(pricing)
        .filter((f) => !f.includes('FREE'))
        .map((key) => (
          <option key={key} value={key}>
            {key}
          </option>
        ))}
    </Select>
  );
};
const colorOptions = [
  { value: 'INFO', label: 'Info (Blue)', className: 'bg-blue-600' },
  { value: 'WARNING', label: 'Warning (Amber)', className: 'bg-amber-600' },
  { value: 'ERROR', label: 'Error (Red)', className: 'bg-red-600' },
];

const AddAnnouncementModal: FC<{ close: () => void }> = ({ close }) => {
  const fetch = useFetch();
  const { mutate } = useSWRConfig();
  const t = useT();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState('INFO');
  const [saving, setSaving] = useState(false);

  const handleSubmit = useCallback(async () => {
    if (!title.trim() || !description.trim()) return;
    setSaving(true);
    try {
      await fetch('/announcements', {
        method: 'POST',
        body: JSON.stringify({ title, description, color }),
      });
      await mutate('/announcements');
      close();
    } finally {
      setSaving(false);
    }
  }, [title, description, color, fetch, mutate, close]);

  return (
    <div className="flex flex-col gap-[16px] min-w-[500px]">
      <Input
        label={t('announcement_title', 'Title')}
        name="title"
        disableForm={true}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder={t('announcement_title_placeholder', 'Announcement title')}
      />
      <div className="flex flex-col gap-[6px]">
        <label className="text-[14px]">
          {t('announcement_description', 'Description')}
        </label>
        <textarea
          className="bg-input border border-newTableBorder rounded-[8px] p-[10px] text-newTextColor min-h-[120px] outline-none resize-y"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={t(
            'announcement_description_placeholder',
            'Announcement description'
          )}
        />
      </div>
      <div className="flex flex-col gap-[6px]">
        <label className="text-[14px]">
          {t('announcement_color', 'Color')}
        </label>
        <div className="flex gap-[8px]">
          {colorOptions.map((opt) => (
            <div
              key={opt.value}
              onClick={() => setColor(opt.value)}
              className={`flex-1 text-center py-[8px] rounded-[8px] text-white text-[13px] cursor-pointer transition-opacity ${opt.className} ${
                color === opt.value ? 'opacity-100 ring-2 ring-white' : 'opacity-40'
              }`}
            >
              {opt.label}
            </div>
          ))}
        </div>
      </div>
      <div className="flex justify-end">
        <Button
          onClick={handleSubmit}
          loading={saving}
          disabled={!title.trim() || !description.trim()}
          className="rounded-[4px]"
        >
          {t('create_announcement', 'Create Announcement')}
        </Button>
      </div>
    </div>
  );
};

const AddAnnouncement = () => {
  const { openModal } = useModals();
  const t = useT();

  const handleClick = useCallback(() => {
    openModal({
      title: t('add_announcement', 'Add Announcement'),
      children: (close) => <AddAnnouncementModal close={close} />,
    });
  }, [openModal, t]);

  return (
    <div
      className="px-[10px] rounded-[4px] bg-green-700 text-white cursor-pointer whitespace-nowrap"
      onClick={handleClick}
    >
      {t('add_announcement', 'Add Announcement')}
    </div>
  );
};

const ImportDebugPost = () => {
  const { openModal } = useModals();
  const t = useT();

  const handleClick = useCallback(() => {
    openModal({
      title: t('import_debug_post', 'Import Debug Post'),
      maxSize: 800,
      children: (close) => <ImportDebugPostModal close={close} />,
    });
  }, [openModal, t]);
  return (
    <div
      className="px-[10px] rounded-[4px] bg-yellow-600 text-white cursor-pointer whitespace-nowrap"
      onClick={handleClick}
    >
      {t('import_debug_post', 'Import Debug Post')}
    </div>
  );
};

const useImpersonateSearch = (name: string) => {
  const fetch = useFetch();
  return useSWR(`/impersonate-${name}`, async () => {
    if (!name) return [];
    return await (await fetch(`/user/impersonate?name=${name}`)).json();
  }, {
    refreshWhenHidden: false,
    revalidateOnMount: true,
    revalidateOnReconnect: false,
    revalidateOnFocus: false,
    refreshWhenOffline: false,
    revalidateIfStale: false,
    refreshInterval: 0,
  });
};

export const Impersonate = () => {
  const fetch = useFetch();
  const [name, setName] = useState('');
  const { isSecured, billingEnabled } = useVariables();
  const user = useUser();
  const stopImpersonating = useCallback(async () => {
    if (!isSecured) {
      setCookie('impersonate', '', -10);
    } else {
      await fetch(`/user/impersonate`, {
        method: 'POST',
        body: JSON.stringify({
          id: '',
        }),
      });
    }
    window.location.reload();
  }, [isSecured, fetch]);
  const t = useT();

  const setUser = useCallback(
    (userId: string) => async () => {
      await fetch(`/user/impersonate`, {
        method: 'POST',
        body: JSON.stringify({
          id: userId,
        }),
      });
      window.location.reload();
    },
    [fetch]
  );
  const { data } = useImpersonateSearch(name);
  const mapData = useMemo(() => {
    return data?.map(
      (curr: any) => ({
        id: curr.id,
        name: curr.user.profile?.name,
        email: curr.user.email,
      })
    );
  }, [data]);
  return (
    <div>
      <div className="bg-btnPrimary h-[52px] flex justify-center items-center border-input border rounded-[8px] text-white min-w-0 overflow-x-auto">
        <div className="relative flex flex-col w-full max-w-[600px] min-w-0 px-[12px]">
          <div className="relative z-[1]">
            {user?.impersonate ? (
              <div className="text-center flex justify-center items-center gap-[20px]">
                <div>
                  {t('currently_impersonating', 'Currently Impersonating')}
                </div>
                <div>
                  <div
                    className="px-[10px] rounded-[4px] bg-red-500 text-white cursor-pointer"
                    onClick={stopImpersonating}
                  >
                    X
                  </div>
                </div>
                {user?.tier?.current === 'FREE' && <Subscription />}
                {billingEnabled && <ManageBilling />}
              </div>
            ) : (
              <div className="flex items-center gap-[10px]">
                <div className="flex-1">
                  <Input
                    autoComplete="off"
                    placeholder="Write the user details"
                    name="impersonate"
                    disableForm={true}
                    label=""
                    removeError={true}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>
                <ImportDebugPost />
                <AddAnnouncement />
              </div>
            )}
          </div>
          {!!data?.length && (
            <>
              <div
                className="bg-primary/80 fixed start-0 top-0 w-full h-full z-[998]"
                onClick={() => setName('')}
              />
              <div className="absolute top-[100%] w-full start-0 bg-newBgColorInner border border-newTableBorder text-textColor z-[999]">
                {mapData?.map((user: any) => (
                  <div
                    onClick={setUser(user.id)}
                    key={user.id}
                    className="p-[10px] border-b border-newTableBorder hover:bg-boxHover cursor-pointer"
                  >
                    {t('user_1', 'user:')}
                    {user.id.split('-').at(-1)} - {user.name} - {user.email}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
