'use client';
import { useCallback } from 'react';
import useSWR from 'swr';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useSearchParams } from 'next/navigation';
import { PostComposer } from '@gitroom/frontend/components/launches/post-composer';
import { LoadingComponent } from '@gitroom/frontend/components/layout/loading';
import { newDayjs } from '@gitroom/frontend/components/layout/set.timezone';

export default function CreatePostPage() {
  const fetch = useFetch();
  const searchParams = useSearchParams();

  const loadIntegrations = useCallback(async (path: string) => {
    return (await (await fetch(path)).json()).integrations;
  }, [fetch]);

  const { data: integrations, isLoading } = useSWR(
    '/integrations/list',
    loadIntegrations,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      revalidateIfStale: false,
      revalidateOnMount: true,
      refreshWhenHidden: false,
      refreshWhenOffline: false,
      fallbackData: [],
    }
  );

  const dateParam = searchParams.get('date');
  const channelParam = searchParams.get('channel');
  const contentParam = searchParams.get('content');

  const date = dateParam ? newDayjs(dateParam) : newDayjs();
  const selectedChannels = channelParam ? [channelParam] : undefined;
  const onlyValues = contentParam
    ? [{ content: decodeURIComponent(contentParam), id: 'new' }]
    : undefined;

  if (isLoading) {
    return <LoadingComponent />;
  }

  if (!integrations.length) {
    return null;
  }

  return (
    <PostComposer
      integrations={integrations}
      allIntegrations={integrations}
      date={date}
      selectedChannels={selectedChannels}
      onlyValues={onlyValues}
    />
  );
}
