'use client';

import { Button } from '@gitroom/react/form/button';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import useSWR from 'swr';
import React, { useCallback, useMemo, useState } from 'react';
import { useUser } from '@gitroom/frontend/components/layout/user.context';
import { capitalize } from 'lodash';
import { useModals } from '@gitroom/frontend/components/layout/new-modal';
import { Input } from '@gitroom/react/form/input';
import { useForm, FormProvider } from 'react-hook-form';
import { Select } from '@gitroom/react/form/select';
import { classValidatorResolver } from '@hookform/resolvers/class-validator';
import { AddTeamMemberDto } from '@gitroom/nestjs-libraries/dtos/settings/add.team.member.dto';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { deleteDialog } from '@gitroom/react/helpers/delete.dialog';
import copy from 'copy-to-clipboard';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { DataTable, StatusPill, AvatarCell } from '@gitroom/frontend/components/ui/data-table';

const PAGE_SIZE = 25;

const roles = [
  { name: 'User', value: 'USER' },
  { name: 'Admin', value: 'ADMIN' },
];

const CreateUserForm = ({ onDone }: { onDone: () => void }) => {
  const fetch = useFetch();
  const toast = useToaster();
  const t = useT();
  const form = useForm({ values: { email: '', password: '', role: 'USER' }, mode: 'onChange' });

  const submit = useCallback(async (values: { email: string; password: string; role: string }) => {
    await fetch('/settings/team/create-user', {
      method: 'POST',
      body: JSON.stringify(values),
    });
    toast.show(t('user_created', 'User created successfully'), 'success');
    onDone();
  }, [fetch, toast, t, onDone]);

  return (
    <FormProvider {...form}>
      <form onSubmit={form.handleSubmit(submit)} className="flex flex-col gap-[10px] p-[16px] pt-0">
        <Input label="Email" name="email" placeholder={t('enter_email', 'Enter email')} />
        <Input label="Password" name="password" type="password" placeholder={t('enter_password', 'Enter password')} />
        <Select label="Role" name="role">
          <option value="USER">{t('user', 'User')}</option>
          <option value="ADMIN">{t('admin', 'Admin')}</option>
        </Select>
        <Button type="submit" className="mt-[18px]">{t('create_user', 'Create User')}</Button>
      </form>
    </FormProvider>
  );
};

const InviteMemberForm = ({ onDone }: { onDone: () => void }) => {
  const fetch = useFetch();
  const toast = useToaster();
  const t = useT();
  const resolver = useMemo(() => classValidatorResolver(AddTeamMemberDto), []);
  const form = useForm({ values: { email: '', role: 'USER', sendEmail: true }, resolver, mode: 'onChange' });

  const submit = useCallback(async (values: { email: string; role: string; sendEmail: boolean }) => {
    const { url } = await (await fetch('/settings/team', {
      method: 'POST',
      body: JSON.stringify(values),
    })).json();
    if (values.sendEmail) {
      toast.show(t('invitation_link_sent', 'Invitation link sent'), 'success');
    } else {
      copy(url);
      toast.show(t('link_copied_to_clipboard', 'Link copied to clipboard'), 'success');
    }
    onDone();
  }, [fetch, toast, t, onDone]);

  return (
    <FormProvider {...form}>
      <form onSubmit={form.handleSubmit(submit)} className="flex flex-col gap-[10px] p-[16px] pt-0">
        <Input label="Email" name="email" placeholder={t('enter_email', 'Enter email')} />
        <Select label="Role" name="role">
          <option value="">{t('select_role', 'Select Role')}</option>
          {roles.map((r) => <option key={r.value} value={r.value}>{r.name}</option>)}
        </Select>
        <div className="flex gap-[5px] items-center">
          <input type="checkbox" {...form.register('sendEmail')} className="w-[16px] h-[16px] rounded-[4px] accent-btnPrimary cursor-pointer" />
          <span className="text-[13px]">{t('send_invitation_via_email', 'Send invitation via email?')}</span>
        </div>
        <Button type="submit" className="mt-[18px]">{t('send_invitation_link', 'Send Invitation')}</Button>
      </form>
    </FormProvider>
  );
};

export const TeamsComponent = () => {
  const fetch = useFetch();
  const user = useUser();
  const modals = useModals();
  const toast = useToaster();
  const t = useT();

  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'name' | 'joined'>('joined');
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const myLevel = user?.role === 'USER' ? 0 : user?.role === 'ADMIN' ? 1 : 2;
  const getLevel = useCallback((r: 'USER' | 'ADMIN' | 'SUPERADMIN') => r === 'USER' ? 0 : r === 'ADMIN' ? 1 : 2, []);
  const isAdmin = myLevel >= 1;

  const loadTeam = useCallback(async () => {
    return (await (await fetch('/settings/team')).json()).users as Array<{
      id: string;
      role: 'SUPERADMIN' | 'ADMIN' | 'USER';
      user: { email: string; id: string; name?: string | null; pictureId?: string | null };
    }>;
  }, []);

  const { data, mutate, isLoading, error } = useSWR('/api/teams', loadTeam, {
    revalidateOnFocus: false, revalidateOnReconnect: false, revalidateIfStale: false,
  });

  const members = useMemo(() => {
    if (!data) return [];
    let list = data.map((m: any, idx: number) => ({ ...m, _sortIdx: idx }));

    if (search) {
      const q = search.toLowerCase();
      list = list.filter((m: any) => m.user.email.toLowerCase().includes(q) || (m.user.name || '').toLowerCase().includes(q));
    }

    if (roleFilter !== 'all') {
      list = list.filter((m: any) => m.role === roleFilter);
    }

    if (sortBy === 'name') {
      list.sort((a: any, b: any) => (a.user.name || a.user.email).localeCompare(b.user.name || b.user.email));
    }

    const start = page * PAGE_SIZE;
    return list.slice(start, start + PAGE_SIZE);
  }, [data, search, roleFilter, sortBy, page]);

  const totalPages = data ? Math.ceil((data.length || 0) / PAGE_SIZE) : 0;

  const openInvite = useCallback(() => {
    modals.openModal({
      title: t('invite_member', 'Invite Member'),
      withCloseButton: true,
      children: <InviteMemberForm onDone={() => { modals.closeAll(); mutate(); }} />,
    });
  }, [modals, t, mutate]);

  const openCreateUser = useCallback(() => {
    modals.openModal({
      title: t('create_user', 'Create User'),
      withCloseButton: true,
      children: <CreateUserForm onDone={() => { modals.closeAll(); mutate(); }} />,
    });
  }, [modals, t, mutate]);

  const remove = useCallback((toRemove: { user: { id: string } }) => async () => {
    if (!(await deleteDialog(t('are_you_sure_remove_team_member', 'Are you sure you want to remove this team member?')))) return;
    await fetch(`/settings/team/${toRemove.user.id}`, { method: 'DELETE' });
    await mutate();
  }, [fetch, mutate, t]);

  const changeRole = useCallback((member: { user: { id: string } }) => async (e: React.ChangeEvent<HTMLSelectElement>) => {
    await fetch(`/settings/team/${member.user.id}/role`, {
      method: 'PUT',
      body: JSON.stringify({ role: e.target.value }),
    });
    await mutate();
  }, [fetch, mutate]);

  const bulkRemove = useCallback(async () => {
    if (!(await deleteDialog(t('remove_selected_confirm', 'Are you sure you want to remove the selected members?')))) return;
    for (const id of selected) {
      await fetch(`/settings/team/${id}`, { method: 'DELETE' });
    }
    setSelected(new Set());
    await mutate();
  }, [fetch, selected, mutate, t]);

  const memberRoleDisplay = useCallback((role: string) => {
    if (role === 'SUPERADMIN') return t('super_admin', 'Super Admin');
    if (role === 'ADMIN') return t('admin', 'Admin');
    return t('user', 'User');
  }, [t]);

  const getAvatarUrl = useCallback((email: string, name?: string | null) => {
    const displayName = name || email.split('@')[0];
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=6366f1&color=fff&size=40`;
  }, []);

  const getStatus = useCallback((m: any) => {
    return m.user.activated !== false ? 'active' : 'pending';
  }, []);

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between mb-[16px]">
        <div>
          <h3 className="text-[20px]">{t('team_members', 'Team Members')}</h3>
          <div className="text-newTableText mt-[4px]">
            {t('invite_your_assistant_or_team_member_to_manage_your_account', 'Invite your assistant or team member to manage your account')}
          </div>
        </div>
        <div className="flex gap-[8px]">
          <Button onClick={openInvite}>{t('invite_member', 'Invite Member')}</Button>
          {isAdmin && <Button secondary onClick={openCreateUser}>{t('create_user', 'Create User')}</Button>}
        </div>
      </div>

      <div className="flex items-center gap-[12px] mb-[16px]">
        <div className="flex-1">
          <input
            type="text"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            placeholder={t('search_by_name_or_email', 'Search by name or email...')}
            className="w-full px-[12px] py-[8px] bg-newBgColor border border-newTableBorder rounded-[8px] text-[14px] outline-none"
          />
        </div>
        <select
          value={roleFilter}
          onChange={(e) => { setRoleFilter(e.target.value); setPage(0); }}
          className="px-[12px] py-[8px] bg-newBgColor border border-newTableBorder rounded-[8px] text-[14px] outline-none"
        >
          <option value="all">{t('all_roles', 'All Roles')}</option>
          {roles.map((r) => <option key={r.value} value={r.value}>{r.name}</option>)}
          <option value="SUPERADMIN">{t('super_admin', 'Super Admin')}</option>
        </select>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as 'name' | 'joined')}
          className="px-[12px] py-[8px] bg-newBgColor border border-newTableBorder rounded-[8px] text-[14px] outline-none"
        >
          <option value="joined">{t('joined_date', 'Joined Date')}</option>
          <option value="name">{t('name', 'Name')}</option>
        </select>
      </div>

      <div className="bg-newBgColorInner border-newTableBorder border rounded-[12px] p-[24px] overflow-x-auto">
        {isLoading && (
          <div className="flex flex-col gap-[8px] py-[16px]">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-[12px] animate-pulse" style={{ animationDelay: `${i * 100}ms` }}>
                <div className="h-[16px] bg-newTableHeader rounded-[4px]" style={{ flex: i === 0 ? 2 : 1.5 }} />
                <div className="h-[16px] bg-newTableHeader rounded-[4px]" style={{ flex: 1 }} />
                <div className="h-[16px] bg-newTableHeader rounded-[4px]" style={{ flex: 1 }} />
                <div className="h-[16px] bg-newTableHeader rounded-[4px]" style={{ flex: 1 }} />
                <div className="h-[16px] bg-newTableHeader rounded-[4px]" style={{ flex: i < 3 ? 1 : 0.5 }} />
              </div>
            ))}
          </div>
        )}

        {!isLoading && error && !data && (
          <div className="flex flex-col items-center py-[40px] gap-[8px]">
            <div className="text-red-400 text-[14px]">{t('failed_loading_team', 'Failed to load team')}</div>
            <button onClick={() => window.location.reload()} className="text-[12px] text-textColor hover:underline">{t('try_again', 'Try again')}</button>
          </div>
        )}

        {!isLoading && !error && (!data || data.length === 0) && (
          <div className="flex flex-col items-center py-[40px] gap-[16px]">
            <div className="text-textColor/50 text-[14px]">{t('no_team_members', 'No team members yet')}</div>
            <Button onClick={openInvite}>{t('invite_first_member', 'Invite your first member')}</Button>
          </div>
        )}

        {!isLoading && data && data.length > 0 && (
          <>
            <DataTable
              columns={[
                {
                  key: 'name',
                  header: t('name', 'Name'),
                  render: (m: any) => (
                    <AvatarCell
                      src={getAvatarUrl(m.user.email, m.user.name)}
                      name={capitalize(m.user.name || m.user.email.split('@')[0]).split('.')[0]}
                      subtitle={m.user.email}
                    />
                  ),
                },
                {
                  key: 'role',
                  header: t('role', 'Role'),
                  render: (m: any) =>
                    myLevel > getLevel(m.role) && m.role !== 'SUPERADMIN' ? (
                      <select
                        value={m.role}
                        onChange={changeRole(m)}
                        className="bg-newBgColor border border-newTableBorder rounded-[8px] px-[8px] py-[4px] text-[13px] outline-none"
                      >
                        {roles.map((r) => <option key={r.value} value={r.value}>{r.name}</option>)}
                      </select>
                    ) : (
                      <span className="text-newTableText">{memberRoleDisplay(m.role)}</span>
                    ),
                },
                {
                  key: 'status',
                  header: t('status', 'Status'),
                  render: (m: any) => (
                    <StatusPill
                      status={getStatus(m) === 'active' ? 'green' : 'amber'}
                      label={getStatus(m) === 'active' ? t('active', 'Active') : t('pending', 'Pending')}
                    />
                  ),
                },
                {
                  key: 'actions',
                  header: t('actions', 'Actions'),
                  align: 'right',
                  render: (m: any) =>
                    myLevel > getLevel(m.role) ? (
                      <button onClick={remove(m)} className="text-[12px] text-red-400 hover:text-red-300 transition-colors">
                        {t('remove', 'Remove')}
                      </button>
                    ) : (
                      <span className="text-[12px] text-newTableText">—</span>
                    ),
                },
              ]}
              data={members}
              keyExtractor={(m: any) => m.user.id}
              selectedIds={Array.from(selected)}
              onSelectionChange={(ids) => setSelected(new Set(ids))}
              page={page + 1}
              total={data.length}
              limit={PAGE_SIZE}
              onPageChange={(p) => setPage(p - 1)}
            />

            {selected.size > 0 && (
              <div className="flex items-center gap-[8px] mt-[12px] pt-[12px] border-t border-newTableBorder">
                <span className="text-[13px] text-newTableText">{selected.size} selected</span>
                <Button secondary className="!h-[32px] !text-[12px]" onClick={bulkRemove}>
                  {t('remove_selected', 'Remove Selected')}
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};
