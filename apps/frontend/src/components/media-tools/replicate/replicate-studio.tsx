'use client';

import React, { useCallback, useMemo, useState } from 'react';
import useSWR from 'swr';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import {
  useModals,
} from '@gitroom/frontend/components/layout/new-modal';
import { MediaSelectorModal } from '@gitroom/frontend/components/media-tools/media-selector-modal';
import {
  useReplicateStore,
  type CategoryDefinition,
} from './replicate.store';
import { ModelPicker } from './model-picker';
import { DynamicForm } from './dynamic-form';
import { CostBar } from './cost-bar';
import { ResultPanel } from './result-panel';
import { MaskPainter } from './mask-painter';
import { MergeEditor } from './merge-editor';
import { MemeEditor } from './meme-editor';
import type { FileValue } from './fields/file';

function useReplicateStatus() {
  const fetch = useFetch();
  return useSWR('replicate-status', async () => {
    const res = await fetch('/media/replicate/status');
    return (await res.json()) as { configured: boolean };
  });
}

function useCategories() {
  const fetch = useFetch();
  return useSWR('replicate-categories', async () => {
    const res = await fetch('/media/replicate/categories');
    return (await res.json()) as CategoryDefinition[];
  });
}

interface FolderNode {
  id: string;
  name: string;
  children?: FolderNode[];
}

function flattenFolders(nodes: FolderNode[], depth = 0): Array<{ id: string; label: string }> {
  return nodes.reduce<Array<{ id: string; label: string }>>((acc, node) => {
    acc.push({ id: node.id, label: `${'\u00A0'.repeat(depth * 2)}${node.name}` });
    if (node.children?.length) {
      acc.push(...flattenFolders(node.children, depth + 1));
    }
    return acc;
  }, []);
}

function SaveFolderPicker() {
  const fetch = useFetch();
  const store = useReplicateStore();
  const { data: tree } = useSWR<FolderNode[]>('replicate-folders', async () => {
    const res = await fetch('/files/folders');
    return res.json();
  });

  const folders = useMemo(() => (tree ? flattenFolders(tree) : []), [tree]);

  return (
    <div className="flex items-center gap-2">
      <label className="text-xs text-gray-400">Save folder:</label>
      <select
        value={store.saveFolderId || ''}
        onChange={(e) => store.setSaveFolderId(e.target.value || null)}
        className="px-2 py-1 rounded-lg border border-newBorder bg-newBgColorInner text-white text-xs"
      >
        <option value="">Select folder...</option>
        {folders.map((f) => (
          <option key={f.id} value={f.id}>
            {f.label}
          </option>
        ))}
      </select>
    </div>
  );
}

const MEDIUM_ICONS: Record<string, string> = {
  image: '\uD83D\uDDBC',
  video: '\uD83C\uDFAC',
  audio: '\uD83C\uDFB5',
};

function InpaintMaskSection() {
  const store = useReplicateStore();
  const fetch = useFetch();
  const modals = useModals();
  const [source, setSource] = useState<FileValue | null>(null);
  const [uploadingMask, setUploadingMask] = useState(false);

  const openSourcePicker = useCallback(() => {
    modals.openModal({
      title: 'Select source image',
      removeLayout: true,
      children: (close) => (
        <MediaSelectorModal
          open
          onClose={close}
          onSelect={(item) => {
            setSource({ fileId: item.fileId, url: item.url, type: item.type });
            close();
          }}
        />
      ),
    });
  }, [modals]);

  const handleMaskReady = useCallback(async (maskFile: File) => {
    if (!source?.fileId || !source.url) {
      store.setError('Select a source image before using a mask');
      return;
    }
    setUploadingMask(true);
    store.setError(null);
    try {
      const formData = new FormData();
      formData.append('file', maskFile, 'mask.png');
      if (store.saveFolderId) {
        formData.append('folderId', store.saveFolderId);
      }
      const res = await fetch('/files/upload-simple', { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || 'Mask upload failed');
      }
      store.updateFormField('image', source);
      store.updateFormField('mask', { fileId: data.id, url: data.path, type: 'image' });
    } catch (err: any) {
      store.setError(err.message || 'Failed to upload mask');
    } finally {
      setUploadingMask(false);
    }
  }, [fetch, source, store]);

  return (
    <div className="flex flex-col gap-3 mt-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium text-white">Inpaint mask</h4>
        <button
          type="button"
          onClick={openSourcePicker}
          className="px-3 py-1.5 rounded-lg bg-gray-800 text-white text-xs hover:bg-gray-700 transition-colors"
        >
          {source ? 'Change source image' : 'Select source image'}
        </button>
      </div>
      {source?.url ? (
        <>
          <MaskPainter sourceImage={source.url} onMaskReady={handleMaskReady} />
          {uploadingMask && (
            <p className="text-xs text-gray-400">Uploading mask...</p>
          )}
        </>
      ) : (
        <p className="text-xs text-gray-500">Select a source image to paint the inpaint mask.</p>
      )}
    </div>
  );
}

function LocalEditor({ categoryKey }: { categoryKey: string }) {
  if (categoryKey === 'meme') return <MemeEditor />;
  if (categoryKey === 'merge') return <MergeEditor />;
  return (
    <div className="text-sm text-gray-500 text-center py-4">
      Local editor not implemented for this category.
    </div>
  );
}

export function ReplicateStudio() {
  const { data: status } = useReplicateStatus();
  const { data: categories } = useCategories();
  const store = useReplicateStore();
  const configured = status?.configured ?? true;
  const selectedCategoryDef = categories?.find((c) => c.key === store.selectedCategory);

  if (!status) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-designerAccent" />
      </div>
    );
  }

  if (!configured) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 text-gray-400">
        <svg
          width="48"
          height="48"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          className="text-gray-500"
        >
          <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
        </svg>
        <h2 className="text-lg font-medium text-white">
          Replicate is not configured
        </h2>
        <p className="text-sm">
          Connect your Replicate API key to start generating media.
        </p>
        <a
          href="/settings?tab=media_providers"
          className="mt-2 px-4 py-2 bg-designerAccent text-white rounded-lg hover:bg-designerAccent/80 transition-colors"
        >
          Configure Replicate
        </a>
      </div>
    );
  }

  return (
    <div className="flex flex-col mobile:flex-row h-full">
      {/* Category rail: horizontal on mobile, vertical on desktop */}
      <div className="w-full mobile:w-56 flex-shrink-0 border-b border-newBorder mobile:border-r mobile:border-b-0 overflow-x-auto mobile:overflow-y-auto bg-newBgColorInner">
        <div className="p-3 flex mobile:block gap-2 mobile:gap-0 min-w-max mobile:min-w-0">
          <h3 className="hidden mobile:block text-xs uppercase tracking-wider text-gray-500 mb-2 px-2">
            Categories
          </h3>
          {categories?.map((cat) => (
            <button
              key={cat.key}
              onClick={() => {
                store.setCategory(cat.key);
              }}
              className={`text-left px-3 py-2 rounded-lg text-sm mb-0 mobile:mb-0.5 transition-colors flex items-center gap-2 whitespace-nowrap ${
                store.selectedCategory === cat.key
                  ? 'bg-designerAccent/20 text-white'
                  : 'text-gray-400 hover:bg-boxHover hover:text-gray-200'
              }`}
            >
              <span className="text-base">
                {MEDIUM_ICONS[cat.medium] || '\uD83D\uDCE6'}
              </span>
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 flex flex-col overflow-hidden">
        {!store.selectedCategory ? (
          <div className="flex-1 flex items-center justify-center text-gray-500">
            <div className="text-center">
              <p className="text-lg">Select a category to get started</p>
              <p className="text-sm mt-1">
                Choose from 18 media generation categories
              </p>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="flex-shrink-0 border-b border-newBorder p-4 space-y-3">
              {selectedCategoryDef?.execution !== 'local' && (
                <ModelPicker categoryKey={store.selectedCategory} />
              )}
              <SaveFolderPicker />
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {selectedCategoryDef?.execution === 'local' ? (
                <LocalEditor categoryKey={store.selectedCategory} />
              ) : store.selectedModel ? (
                <>
                  <DynamicForm />
                  {store.selectedCategory === 'inpaint' && <InpaintMaskSection />}
                  <CostBar />
                </>
              ) : null}
            </div>
            {selectedCategoryDef?.execution !== 'local' && (
              <div className="flex-shrink-0 border-t border-newBorder p-4">
                <ResultPanel />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
