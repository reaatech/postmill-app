'use client';

import React, { FC, useCallback } from 'react';
import { useMediaDirectory } from '@gitroom/react/helpers/use.media.directory';
import { useModals } from '@gitroom/frontend/components/layout/new-modal';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { HeyGenJob } from './use-heygen';

const STATUS_META: Record<HeyGenJob['status'], { label: string; className: string }> = {
  pending: { label: 'Queued', className: 'text-yellow-400 bg-yellow-400/10' },
  processing: { label: 'Rendering', className: 'text-yellow-400 bg-yellow-400/10' },
  completed: { label: 'Ready', className: 'text-green-400 bg-green-400/10' },
  failed: { label: 'Failed', className: 'text-red-400 bg-red-400/10' },
};

const OPERATION_LABEL: Record<string, string> = {
  avatar: 'Avatar video',
  video: 'Avatar video',
  audio: 'Voiceover',
};

export const RenderQueue: FC<{ jobs: HeyGenJob[] | undefined; isLoading: boolean }> = ({ jobs, isLoading }) => {
  const mediaDirectory = useMediaDirectory();
  const modal = useModals();
  const toaster = useToaster();
  const fetch = useFetch();

  const openInDesigner = useCallback((job: HeyGenJob) => {
    if (!job.artifactUrl) return;
    const isAudio = job.operation === 'audio';
    const params = new URLSearchParams({ url: job.artifactUrl, type: isAudio ? 'audio' : 'video', w: '', h: '' });
    window.open(`/media/designer?${params.toString()}`, '_blank');
  }, []);

  const post = useCallback(
    async (job: HeyGenJob) => {
      if (!job.artifactUrl || !job.fileId) {
        toaster.show('This render is not ready to post yet', 'warning');
        return;
      }
      const integrationsRes = await fetch('/integrations');
      if (!integrationsRes.ok) {
        toaster.show('Could not load channels', 'warning');
        return;
      }
      const integrations = await integrationsRes.json();
      const { Composer } = await import('@gitroom/frontend/components/composer/composer');
      const dayjs = (await import('dayjs')).default;
      modal.openModal({
        fullScreen: true,
        removeLayout: true,
        children: (
          <Composer
            date={dayjs()}
            integrations={integrations}
            allIntegrations={integrations}
            onlyValues={[{ content: '', id: 'new', image: [{ id: job.fileId, path: job.artifactUrl }] }]}
            mutate={() => {}}
            reopenModal={() => {}}
          />
        ),
      });
    },
    [fetch, modal, toaster]
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
        const isAudio = job.operation === 'audio';
        const previewUrl = job.artifactUrl ? mediaDirectory.set(job.artifactUrl) : null;
        return (
          <div key={job.id} className="rounded-[10px] border border-studioBorder bg-newBgColorInner overflow-hidden">
            {job.status === 'completed' && previewUrl && !isAudio && (
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
                  <div className="text-[11px] text-red-400/80 truncate" title={job.error}>{job.error}</div>
                )}
              </div>
              <span className={`shrink-0 text-[10px] font-[600] px-[7px] py-[3px] rounded-full ${meta.className}`}>
                {(job.status === 'pending' || job.status === 'processing') && (
                  <span className="inline-block w-[8px] h-[8px] mr-[5px] rounded-full bg-current animate-pulse align-middle" />
                )}
                {meta.label}
              </span>
            </div>
            {job.status === 'completed' && (
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
