'use client';
import 'reflect-metadata';
import { useLaunchStore } from '@gitroom/frontend/components/new-launch/store';
import dayjs from 'dayjs';
import { FC, useEffect } from 'react';
import useSWR from 'swr';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { makeId } from '@gitroom/nestjs-libraries/services/make.is';
import { ManageModal } from '@gitroom/frontend/components/new-launch/manage.modal';
import { Integrations } from '@gitroom/frontend/components/launches/calendar.context';
import { useShallow } from 'zustand/react/shallow';
import { useExistingData } from '@gitroom/frontend/components/launches/helpers/use.existing.data';
import { newDayjs } from '@gitroom/frontend/components/layout/set.timezone';

export interface AddEditModalProps {
  dummy?: boolean;
  date: dayjs.Dayjs;
  integrations: Integrations[];
  allIntegrations?: Integrations[];
  selectedChannels?: string[];
  set?: any;
  focusedChannel?: string;
  addEditSets?: (data: any) => void;
  reopenModal: () => void;
  mutate: () => void;
  padding?: string;
  customClose?: () => void;
  onlyValues?: Array<{
    content: string;
    id?: string;
    image?: Array<{
      id: string;
      path: string;
    }>;
  }>;
  onLoadDraft?: (group: string) => void;
}

export const AddEditModal: FC<AddEditModalProps> = (props) => {
  const { setAllIntegrations, setDate, setIsCreateSet, setDummy } =
    useLaunchStore(
      useShallow((state) => ({
        setAllIntegrations: state.setAllIntegrations,
        setDate: state.setDate,
        setIsCreateSet: state.setIsCreateSet,
        setDummy: state.setDummy,
      }))
    );

  const integrations = useLaunchStore((state) => state.integrations);
  useEffect(() => {
    setDummy(!!props.dummy);
    setDate(props.date || newDayjs());
    setAllIntegrations(props.allIntegrations || []);
    setIsCreateSet(!!props.addEditSets);

    return () => {
      // Campaign/brand context is set by callers (campaign dashboard, etc.) and
      // should not leak into the next composer session.
      useLaunchStore.getState().setCampaignId(null);
      useLaunchStore.getState().setBrandId(null);
    };
  }, []);

  if (!integrations.length) {
    return null;
  }

  return <AddEditModalInner {...props} />;
};

export const AddEditModalInner: FC<AddEditModalProps> = (props) => {
  const existingData = useExistingData();
  const { addOrRemoveSelectedIntegration, selectedIntegrations, integrations } =
    useLaunchStore(
      useShallow((state) => ({
        integrations: state.integrations,
        selectedIntegrations: state.selectedIntegrations,
        addOrRemoveSelectedIntegration: state.addOrRemoveSelectedIntegration,
      }))
    );

  useEffect(() => {
    if (props?.set?.posts?.length) {
      for (const post of props?.set?.posts) {
        if (post.integration) {
          const integration = integrations.find(
            (i) => i.id === post.integration.id
          );
          addOrRemoveSelectedIntegration(integration, post.settings);
        }
      }
    }

    if (existingData.integration) {
      const integration = integrations.find(
        (i) => i.id === existingData.integration
      );
      addOrRemoveSelectedIntegration(integration, existingData.settings);
    }

    if (props?.selectedChannels?.length) {
      for (const channel of props.selectedChannels) {
        const integration = integrations.find((i) => i.id === channel);
        if (integration) {
          addOrRemoveSelectedIntegration(integration, {});
        }
      }
    }
  }, []);

  if (existingData.integration && selectedIntegrations.length === 0) {
    return null;
  }

  return <AddEditModalInnerInner {...props} />;
};

export const AddEditModalInnerInner: FC<AddEditModalProps> = (props) => {
  const existingData = useExistingData();
  const fetch = useFetch();
  const {
    reset,
    addGlobalValue,
    addInternalValue,
    global,
    setCurrent,
    internal,
    setTags,
    setEditor,
    setRepeater,
  } = useLaunchStore(
    useShallow((state) => ({
      reset: state.reset,
      addGlobalValue: state.addGlobalValue,
      addInternalValue: state.addInternalValue,
      setCurrent: state.setCurrent,
      global: state.global,
      internal: state.internal,
      setTags: state.setTags,
      setEditor: state.setEditor,
      setRepeater: state.setRepeater,
    }))
  );

  // Auto-add signatures: a brand-new post is seeded with each auto-add
  // signature's content (and its logo/sticker), gated by channel scope. The
  // TipTap editor only reads its initial value, so signatures must be baked
  // into the *initial* global value — hence we defer the new-post seed until
  // the auto-add list has loaded. Skipped for edits, set-building, onlyValues
  // handoffs and dummy modals.
  const isNewPost =
    !existingData.integration &&
    !props.onlyValues?.length &&
    !props.set?.posts?.length &&
    !props.addEditSets &&
    !props.dummy;

  const { data: autoSignatures } = useSWR(
    isNewPost ? 'signatures-auto' : null,
    async () => {
      // Never throw — a failure must still resolve so the new-post composer
      // seeds (empty) instead of hanging on a blank editor.
      try {
        const res = await fetch('/signatures/auto');
        if (!res.ok) return [];
        return await res.json();
      } catch {
        return [];
      }
    },
    { revalidateOnFocus: false, revalidateOnReconnect: false }
  );

  useEffect(() => {
    if (!isNewPost) return;
    // Wait for the fetch to settle (success → [...] or error → []).
    if (autoSignatures === undefined) return;
    // Seed only when the global value is empty — re-seeds correctly after the
    // init effect's reset() (e.g. React StrictMode's mount/cleanup/remount).
    if (useLaunchStore.getState().global.length) return;

    // Scope against the channels known at open time (empty scope = all).
    const selectedIds = props.selectedChannels || [];
    const matching = (autoSignatures as any[]).filter(
      (s) =>
        !s.channels?.length ||
        s.channels.some((c: string) => selectedIds.includes(c))
    );
    const content = matching
      .map((s) =>
        s.content
          .split('\n')
          .map((line: string) => `<p>${line}</p>`)
          .join('')
      )
      .join('');
    const media = matching
      .filter((s) => s.picture?.id)
      .map((s) => ({ id: s.picture.id, path: s.picture.path }));

    addGlobalValue(0, [{ content, id: makeId(10), media, delay: 0 }]);

    matching.forEach((s) =>
      fetch(`/signatures/${s.id}/track-usage`, { method: 'POST' }).catch(
        () => undefined
      )
    );
  }, [isNewPost, autoSignatures, props.selectedChannels, addGlobalValue, fetch]);

  useEffect(() => {
    if (existingData.integration) {
      if (existingData?.posts?.[0]?.intervalInDays) {
        setRepeater(existingData.posts[0].intervalInDays);
      }
      setTags(
        // @ts-ignore
        existingData?.posts?.[0]?.tags?.map((p: any) => ({
          label: p.tag.name,
          value: p.tag.name,
        })) || []
      );
      addInternalValue(
        0,
        existingData.integration,
        existingData.posts.map((post) => ({
          delay: post.delay,
          content:
            post.content.indexOf('<p>') > -1
              ? post.content
              : post.content
                  .split('\n')
                  .map((line: string) => `<p>${line}</p>`)
                  .join(''),
          id: post.id,
          // @ts-ignore
          media: post.image as any[],
        }))
      );
      setCurrent(existingData.integration);
    } else {
      setEditor('normal');
    }

    if (props.focusedChannel) {
      setCurrent(props.focusedChannel);
    }

    // A plain new post's global value is seeded by the auto-add effect above
    // (it must wait for the signature list); seed the other modes here.
    if (!isNewPost) {
      addGlobalValue(
        0,
        props.onlyValues?.length
          ? props.onlyValues.map((p) => ({
              content:
                p.content.indexOf('<p>') > -1
                  ? p.content
                  : p.content
                      .split('\n')
                      .map((line: string) => `<p>${line}</p>`)
                      .join(''),
              id: makeId(10),
              media: p.image || [],
            }))
          : props.set?.posts?.length
          ? props.set.posts[0].value.map((p: any) => ({
              id: makeId(10),
              content:
                p.content.indexOf('<p>') > -1
                  ? p.content
                  : p.content
                      .split('\n')
                      .map((line: string) => `<p>${line}</p>`)
                      .join(''),
              // Set content historically stored `image`; older variants may
              // use `media`. Accept either for a robust round-trip.
              // @ts-ignore
              media: p.image || p.media || [],
            }))
          : [
              {
                content: '',
                id: makeId(10),
                media: [],
              },
            ]
      );
    }

    return () => {
      reset();
    };
  }, []);

  if (!global.length && !internal.length) {
    return null;
  }

  return (
    <>
      <style>
        {`#support-discord {display: none !important;}`}
      </style>
      <ManageModal {...props} />
    </>
  );
};
