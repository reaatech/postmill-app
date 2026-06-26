'use client';

import React, { FC, useCallback } from 'react';
import { useMediaDirectory } from '@gitroom/react/helpers/use.media.directory';
import { useModals } from '@gitroom/frontend/components/layout/new-modal';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import type { StudioJob } from './types';

const STATUS_META: Record<StudioJob['status'], { label: string; className: string }> = {
  pending: { label: 'Queued', className: 'text-amber-600 bg-amber-500/10' },
  processing: { label: 'Rendering', className: 'text-amber-600 bg-amber-500/10' },
  completed: { label: 'Ready', className: 'text-green-500 bg-green-500/10' },
  failed: { label: 'Failed', className: 'text-red-500 bg-red-500/10' },
};

const OPERATION_LABEL: Record<string, string> = {
  video: 'Video',
  avatar: 'Video',
  image: 'Image',
  audio: 'Audio',
  stt: 'Transcript',
};

// Shared render-queue used by every studio. The three handoffs are baked in:
// Save (implicit — the job already landed in /files), Edit in Designer, Post to Composer.
export const RenderQueue: FC<{ jobs: StudioJob[] | undefined; isLoading: boolean }> = ({ jobs, isLoading }) => {
  const mediaDirectory = useMediaDirectory();
  const modal = useModals();
  const toaster = useToaster();
  const fetch = useFetch();

  const openInDesigner = useCallback((job: StudioJob) => {
    if (!job.artifactUrl) return;
    const type = job.operation === 'audio' ? 'audio' : job.operation === 'image' ? 'image' : 'video';
    const params = new URLSearchParams({ url: job.artifactUrl, type, w: '', h: '' });
    window.open(`/media/designer?${params.toString()}`, '_blank');
  }, []);

  const openComposer = useCallback(
    async (content: string, image: { id: string; path: string }[]) => {
      const integrationsRes = await fetch('/integrations');
      if (!integrationsRes.ok) {
        toaster.show('Could not load channels', 'warning');
        return;
      }
      const integrations = await integrationsRes.json();
      const { AddEditModal } = await import('@gitroom/frontend/components/new-launch/add.edit.modal');
      const dayjs = (await import('dayjs')).default;
      modal.openModal({
        fullScreen: true,
        removeLayout: true,
        children: (
          <AddEditModal
            date={dayjs()}
            integrations={integrations}
            allIntegrations={integrations}
            onlyValues={[{ content, id: 'new', image }]}
            mutate={() => {}}
            reopenModal={() => {}}
          />
        ),
      });
    },
    [fetch, modal, toaster]
  );

  const post = useCallback(
    (job: StudioJob) => {
      if (!job.artifactUrl || !job.fileId) {
        toaster.show('This render is not ready to post yet', 'warning');
        return;
      }
      return openComposer('', [{ id: job.fileId, path: job.artifactUrl }]);
    },
    [openComposer, toaster]
  );

  // Transcript (stt) jobs carry text, not a previewable artifact — fetch the stored
  // text on demand for copy / insert-to-composer.
  const fetchTranscript = useCallback(
    async (job: StudioJob): Promise<string | null> => {
      if (!job.artifactUrl) return null;
      try {
        const res = await window.fetch(mediaDirectory.set(job.artifactUrl));
        if (!res.ok) return null;
        return await res.text();
      } catch {
        return null;
      }
    },
    [mediaDirectory]
  );

  const copyTranscript = useCallback(
    async (job: StudioJob) => {
      const text = await fetchTranscript(job);
      if (text == null) {
        toaster.show('Could not load transcript', 'warning');
        return;
      }
      navigator.clipboard.writeText(text).then(
        () => toaster.show('Transcript copied', 'success'),
        () => toaster.show('Copy failed', 'warning')
      );
    },
    [fetchTranscript, toaster]
  );

  const insertTranscript = useCallback(
    async (job: StudioJob) => {
      const text = await fetchTranscript(job);
      if (text == null) {
        toaster.show('Could not load transcript', 'warning');
        return;
      }
      await openComposer(text, []);
    },
    [fetchTranscript, openComposer, toaster]
  );

  if (!isLoading && (!jobs || jobs.length === 0)) {
    return (
      <div className="text-[12px] text-newTextColor/40 px-[4px] py-[10px]">
        Your renders will appear here.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-[8px]">
      {(jobs || []).map((job) => {
        const meta = STATUS_META[job.status];
        const isStt = job.operation === 'stt';
        const isAudio = job.operation === 'audio';
        const isImage = job.operation === 'image';
        const previewUrl = job.artifactUrl ? mediaDirectory.set(job.artifactUrl) : null;
        return (
          <div key={job.id} className="rounded-[10px] border border-studioBorder bg-newBgColorInner overflow-hidden">
            {job.status === 'completed' && previewUrl && isImage && (
              <img src={previewUrl} alt="" className="w-full aspect-video object-cover bg-black" />
            )}
            {job.status === 'completed' && previewUrl && !isStt && !isAudio && !isImage && (
              <video src={previewUrl} className="w-full aspect-video object-cover bg-black" controls preload="metadata" />
            )}
            {job.status === 'completed' && previewUrl && isAudio && (
              <audio src={previewUrl} className="w-full" controls preload="metadata" />
            )}
            <div className="flex items-center justify-between gap-[8px] px-[10px] py-[8px]">
              <div className="min-w-0">
                <div className="text-[12px] text-textColor truncate">
                  {OPERATION_LABEL[job.operation] || job.operation}
                </div>
                {job.status === 'failed' && job.error && (
                  <div className="text-[11px] text-red-500/80 truncate" title={job.error}>{job.error}</div>
                )}
              </div>
              <span className={`shrink-0 text-[10px] font-[600] px-[7px] py-[3px] rounded-full ${meta.className}`}>
                {(job.status === 'pending' || job.status === 'processing') && (
                  <span className="inline-block w-[8px] h-[8px] mr-[5px] rounded-full bg-current animate-pulse align-middle" />
                )}
                {meta.label}
              </span>
            </div>
            {job.status === 'completed' && isStt && (
              <div className="flex gap-[6px] px-[10px] pb-[10px]">
                <button
                  type="button"
                  onClick={() => copyTranscript(job)}
                  className="flex-1 px-[10px] py-[7px] rounded-[8px] bg-btnSimple text-textColor text-[12px] hover:bg-boxHover transition-all"
                >
                  Copy
                </button>
                <button
                  type="button"
                  onClick={() => insertTranscript(job)}
                  className="flex-1 px-[10px] py-[7px] rounded-[8px] bg-[#2B5CD3] text-white text-[12px] font-[500] hover:bg-[#2B5CD3]/80 transition-all"
                >
                  To composer
                </button>
              </div>
            )}
            {job.status === 'completed' && !isStt && (
              <div className="flex gap-[6px] px-[10px] pb-[10px]">
                <button
                  type="button"
                  onClick={() => openInDesigner(job)}
                  className="flex-1 px-[10px] py-[7px] rounded-[8px] bg-btnSimple text-textColor text-[12px] hover:bg-boxHover transition-all"
                >
                  Edit in Designer
                </button>
                <button
                  type="button"
                  onClick={() => post(job)}
                  className="flex-1 px-[10px] py-[7px] rounded-[8px] bg-[#2B5CD3] text-white text-[12px] font-[500] hover:bg-[#2B5CD3]/80 transition-all"
                >
                  Post
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};
