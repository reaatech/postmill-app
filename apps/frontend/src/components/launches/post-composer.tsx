'use client';
import 'reflect-metadata';
import { useLaunchStore } from '@gitroom/frontend/components/new-launch/store';
import dayjs from 'dayjs';
import { FC, useEffect, useRef } from 'react';
import { makeId } from '@gitroom/nestjs-libraries/services/make.is';
import { ManageModal } from '@gitroom/frontend/components/new-launch/manage.modal';
import { Integrations } from '@gitroom/frontend/components/launches/calendar.context';
import { useShallow } from 'zustand/react/shallow';
import { useExistingData } from '@gitroom/frontend/components/launches/helpers/use.existing.data';
import { newDayjs } from '@gitroom/frontend/components/layout/set.timezone';
import { useRouter } from 'next/navigation';

export interface PostComposerProps {
  date?: dayjs.Dayjs;
  integrations: Integrations[];
  allIntegrations?: Integrations[];
  selectedChannels?: string[];
  focusedChannel?: string;
  onlyValues?: Array<{
    content: string;
    id?: string;
    image?: Array<{ id: string; path: string }>;
  }>;
  reopenModal?: () => void;
  mutate?: () => void;
  customClose?: () => void;
  onLoadDraft?: (group: string) => void;
}

export const PostComposer: FC<PostComposerProps> = (props) => {
  const router = useRouter();
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

  // Mount-only initialization: capture the initial props in a ref so the
  // effect's dependencies are exhaustive without re-running on prop changes.
  const initialProps = useRef(props);
  useEffect(() => {
    setDummy(false);
    setDate(initialProps.current.date || newDayjs());
    setAllIntegrations(initialProps.current.allIntegrations || []);
    setIsCreateSet(false);
  }, [setAllIntegrations, setDate, setDummy, setIsCreateSet]);

  if (!integrations.length && !props.allIntegrations?.length) {
    return null;
  }

  return <PostComposerInner {...props} />;
};

const PostComposerInner: FC<PostComposerProps> = (props) => {
  const existingData = useExistingData();
  const { addOrRemoveSelectedIntegration, selectedIntegrations, integrations } =
    useLaunchStore(
      useShallow((state) => ({
        integrations: state.integrations,
        selectedIntegrations: state.selectedIntegrations,
        addOrRemoveSelectedIntegration: state.addOrRemoveSelectedIntegration,
      }))
    );

  // Mount-only initialization: read the initial values from a ref so the
  // effect's dependencies are exhaustive without re-running on changes.
  const initialState = useRef({
    existingData,
    integrations,
    selectedChannels: props?.selectedChannels,
  });
  useEffect(() => {
    const { existingData, integrations, selectedChannels } =
      initialState.current;
    if (existingData.integration) {
      const integration = integrations.find(
        (i) => i.id === existingData.integration
      );
      addOrRemoveSelectedIntegration(integration, existingData.settings);
    }

    if (selectedChannels?.length) {
      for (const channel of selectedChannels) {
        const integration = integrations.find((i) => i.id === channel);
        if (integration) {
          addOrRemoveSelectedIntegration(integration, {});
        }
      }
    }
  }, [addOrRemoveSelectedIntegration]);

  if (existingData.integration && selectedIntegrations.length === 0) {
    return null;
  }

  return <PostComposerInnerInner {...props} />;
};

const PostComposerInnerInner: FC<PostComposerProps> = (props) => {
  const router = useRouter();
  const existingData = useExistingData();
  const {
    reset,
    addGlobalValue,
    addInternalValue,
    global,
    internal,
    setCurrent,
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

  // Mount-only initialization (with unmount cleanup): read the initial values
  // from a ref so the effect's dependencies are exhaustive without re-running.
  const initialState = useRef({
    existingData,
    focusedChannel: props.focusedChannel,
    onlyValues: props.onlyValues,
  });
  useEffect(() => {
    const { existingData, focusedChannel, onlyValues } = initialState.current;
    if (existingData.integration) {
      if (existingData?.posts?.[0]?.intervalInDays) {
        setRepeater(existingData.posts[0].intervalInDays);
      }
      setTags(
        // @ts-ignore
        existingData?.posts?.[0]?.tags?.map(
          (p: { tag: { name: string } }) => ({
            label: p.tag.name,
            value: p.tag.name,
          })
        ) || []
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
          media: post.image as unknown as {
            id: string;
            path: string;
            thumbnail?: string;
          }[],
        }))
      );
      setCurrent(existingData.integration);
    } else {
      setEditor('normal');
    }

    if (focusedChannel) {
      setCurrent(focusedChannel);
    }

    addGlobalValue(
      0,
      onlyValues?.length
        ? onlyValues.map((p) => ({
            content:
              p.content.indexOf('<p>') > -1
                ? p.content
                : p.content
                    .split('\n')
                    .map((line: string) => `<p>${line}</p>`)
                    .join(''),
            id: makeId(10),
            delay: 0,
            media: p.image || [],
          }))
        : [
            {
              content: '',
              id: makeId(10),
              delay: 0,
              media: [],
            },
          ]
    );

    return () => {
      reset();
    };
  }, [
    addGlobalValue,
    addInternalValue,
    reset,
    setCurrent,
    setEditor,
    setRepeater,
    setTags,
  ]);

  if (!global.length && !internal.length) {
    return null;
  }

  return (
    <>
      <style>{`#support-discord {display: none !important;}`}</style>
      <ManageModal
        date={props.date || newDayjs()}
        integrations={props.integrations}
        allIntegrations={props.allIntegrations}
        selectedChannels={props.selectedChannels}
        focusedChannel={props.focusedChannel}
        onlyValues={props.onlyValues}
        customClose={props.customClose || (() => router.push('/schedule'))}
        mutate={props.mutate || (() => router.refresh())}
        reopenModal={props.reopenModal || (() => {})}
        onLoadDraft={props.onLoadDraft}
      />
    </>
  );
};
