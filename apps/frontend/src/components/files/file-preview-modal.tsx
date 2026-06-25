'use client';

import React, { FC } from 'react';
import { useRouter } from 'next/navigation';
import { useMediaDirectory } from '@gitroom/react/helpers/use.media.directory';
import { hasExtension } from '@gitroom/helpers/utils/has.extension';
import { useModals } from '@gitroom/frontend/components/layout/new-modal';
import { AudioPlayer } from '@gitroom/frontend/components/media-tools/audio-player';
import type { FileItem } from './file-manager';

const fileSize = (bytes: number) => {
  if (!bytes) return '-';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
};

export const FilePreviewModal: FC<{
  file: FileItem;
  onDetails?: (file: FileItem) => void;
}> = ({ file, onDetails }) => {
  const router = useRouter();
  const modal = useModals();
  const mediaDirectory = useMediaDirectory();

  const url = mediaDirectory.set(file.path);
  const isVideo = hasExtension(file.path, 'mp4', 'mov', 'webm');
  const isAudio = hasExtension(file.path, 'mp3', 'wav', 'ogg', 'm4a');
  const isImage = hasExtension(file.path, 'jpg', 'jpeg', 'png', 'gif', 'webp', 'avif', 'svg', 'bmp');
  const canDesign = isImage || isVideo; // only images/videos render on the canvas

  const openInDesigner = () => {
    const params = new URLSearchParams();
    params.set('url', url);
    params.set('type', isVideo ? 'video' : 'photo');
    params.set('source', 'files');
    if (isVideo && file.thumbnail) {
      params.set('thumbUrl', mediaDirectory.set(file.thumbnail));
    }
    modal.closeAll();
    router.push(`/media/designer?${params.toString()}`);
  };

  return (
    <div className="flex flex-col gap-[15px] w-[760px] max-w-full text-textColor">
      <div className="text-[16px] font-[600] truncate">{file.name}</div>

      {isAudio ? (
        <div className="rounded-[8px] bg-newBgColorInner border border-newColColor p-[16px]">
          <AudioPlayer src={url} height={56} />
        </div>
      ) : (
        <div className="rounded-[8px] overflow-hidden bg-black/30 flex items-center justify-center max-h-[60vh]">
          {isVideo ? (
            <video controls src={url} className="w-full max-h-[60vh] object-contain" />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt={file.alt || ''} className="w-full max-h-[60vh] object-contain" />
          )}
        </div>
      )}

      <div className="flex items-center justify-between gap-[10px] flex-wrap">
        <div className="text-[12px] text-newTextColor/50">
          {(file.type || 'file')} · {fileSize(file.fileSize)}
        </div>
        <div className="flex items-center gap-[10px] flex-wrap">
          {onDetails && (
            <button
              onClick={() => {
                modal.closeAll();
                onDetails(file);
              }}
              className="px-[16px] py-[10px] rounded-[8px] border border-newColColor text-textColor text-[13px] font-[500] hover:bg-boxHover transition-all"
            >
              Details
            </button>
          )}
          <button
            onClick={() => window.open(url, '_blank')}
            className="px-[16px] py-[10px] rounded-[8px] border border-newColColor text-textColor text-[13px] font-[500] hover:bg-boxHover transition-all"
          >
            Download
          </button>
          {canDesign && (
            <button
              onClick={openInDesigner}
              className="px-[16px] py-[10px] rounded-[8px] bg-green-600 text-white text-[13px] font-[500] hover:bg-green-700 transition-all flex items-center gap-[6px]"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 20h9" />
                <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
              </svg>
              Open in Designer
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
