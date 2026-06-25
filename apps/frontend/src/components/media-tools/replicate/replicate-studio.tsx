'use client';

import React, { useMemo } from 'react';
import useSWR from 'swr';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useReplicateStore, type CategoryDefinition } from './replicate.store';
import { ModelPicker } from './model-picker';
import { DynamicForm } from './dynamic-form';
import { CostBar } from './cost-bar';
import { ResultPanel } from './result-panel';
import { InpaintMaskEditor } from './inpaint-mask-editor';
import { MergeEditor } from './merge-editor';
import { MemeEditor } from './meme-editor';
import { CommandPalette } from './command-palette';
import { useGenerate, missingRequiredFields, FOLDER_REQUIRED_CATEGORIES } from './use-generate';

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
    acc.push({ id: node.id, label: `${' '.repeat(depth * 2)}${node.name}` });
    if (node.children?.length) acc.push(...flattenFolders(node.children, depth + 1));
    return acc;
  }, []);
}

function SaveFolderPicker() {
  const fetch = useFetch();
  const saveFolderId = useReplicateStore((s) => s.saveFolderId);
  const setSaveFolderId = useReplicateStore((s) => s.setSaveFolderId);
  const { data: tree } = useSWR<FolderNode[]>('replicate-folders', async () => {
    const res = await fetch('/files/folders');
    return res.json();
  });
  const folders = useMemo(() => (tree ? flattenFolders(tree) : []), [tree]);

  return (
    <div className="flex items-center gap-2">
      <label className="text-xs text-gray-500">Save to</label>
      <select
        value={saveFolderId || ''}
        onChange={(e) => setSaveFolderId(e.target.value || null)}
        className="px-2 py-1 rounded-lg border border-newBorder bg-newBgColorInner text-white text-xs focus:outline-none"
      >
        <option value="">Files root…</option>
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
  image: '🖼️',
  video: '🎬',
  audio: '🎵',
};
const MEDIUM_ORDER: Array<'image' | 'video' | 'audio'> = ['image', 'video', 'audio'];
const MEDIUM_TITLE: Record<string, string> = { image: 'Image', video: 'Video', audio: 'Audio' };

function CategorySpine({ categories }: { categories: CategoryDefinition[] }) {
  const selectedCategory = useReplicateStore((s) => s.selectedCategory);
  const setCategory = useReplicateStore((s) => s.setCategory);
  const grouped = useMemo(() => {
    return MEDIUM_ORDER.map((medium) => ({
      medium,
      items: categories.filter((c) => c.medium === medium),
    })).filter((g) => g.items.length > 0);
  }, [categories]);

  return (
    <div className="w-56 flex-shrink-0 border-r border-newBorder overflow-y-auto bg-newBgColorInner mobile:w-56">
      <div className="p-3 space-y-4">
        {grouped.map(({ medium, items }) => (
          <div key={medium}>
            <div className="flex items-center gap-1.5 px-2 mb-1.5 text-[10px] uppercase tracking-wider text-gray-500">
              <span>{MEDIUM_ICONS[medium]}</span>
              {MEDIUM_TITLE[medium]}
            </div>
            {items.map((cat) => (
              <button
                key={cat.key}
                onClick={() => setCategory(cat.key)}
                className={`w-full text-left px-3 py-1.5 rounded-lg text-sm mb-0.5 transition-colors ${
                  selectedCategory === cat.key
                    ? 'bg-designerAccent/20 text-white'
                    : 'text-gray-400 hover:bg-boxHover hover:text-gray-200'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function GenerateButton({ category }: { category: string }) {
  const selectedModel = useReplicateStore((s) => s.selectedModel);
  const formInput = useReplicateStore((s) => s.formInput);
  const runState = useReplicateStore((s) => s.runState);
  const saveFolderId = useReplicateStore((s) => s.saveFolderId);
  const generate = useGenerate();

  const schema = selectedModel?.inputSchema as { required?: string[] } | undefined;
  const missing = useMemo(() => missingRequiredFields(schema, formInput), [schema, formInput]);
  const needsFolder = FOLDER_REQUIRED_CATEGORIES.includes(category) && !saveFolderId;
  const disabled = !selectedModel || runState === 'running' || missing.length > 0 || needsFolder;

  return (
    <div className="space-y-2">
      {needsFolder && <p className="text-[11px] text-yellow-400">Pick a save folder before generating.</p>}
      {missing.length > 0 && selectedModel && (
        <p className="text-[11px] text-gray-500">Required: {missing.join(', ')}</p>
      )}
      <button
        onClick={() => generate()}
        disabled={disabled}
        className="w-full py-2.5 rounded-xl bg-designerAccent text-white font-medium hover:bg-designerAccent/80 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        {runState === 'running' ? 'Generating…' : 'Generate'}
      </button>
    </div>
  );
}

function StudioHeader() {
  const runState = useReplicateStore((s) => s.runState);
  const stateLabel =
    runState === 'running' ? 'Generating…' : runState === 'error' ? 'Error' : runState === 'success' ? 'Done' : '';
  const stateColor =
    runState === 'running'
      ? 'text-yellow-400'
      : runState === 'error'
        ? 'text-red-400'
        : runState === 'success'
          ? 'text-green-400'
          : 'text-gray-500';

  return (
    <div className="flex items-center justify-between h-14 flex-shrink-0 border-b border-newBorder px-4 bg-newBgColorInner">
      <div className="flex items-center gap-3">
        <h1 className="text-sm font-semibold text-white">Replicate Studio</h1>
        {stateLabel && <span className={`text-xs ${stateColor}`}>{stateLabel}</span>}
      </div>
      <div className="flex items-center gap-4">
        <SaveFolderPicker />
        <span className="hidden mobile:inline text-[10px] text-gray-600 border border-newBorder rounded px-1.5 py-0.5">
          ⌘K
        </span>
      </div>
    </div>
  );
}

export function ReplicateStudio() {
  const { data: status } = useReplicateStatus();
  const { data: categories } = useCategories();
  const selectedCategory = useReplicateStore((s) => s.selectedCategory);
  const selectedModel = useReplicateStore((s) => s.selectedModel);
  const runState = useReplicateStore((s) => s.runState);
  const result = useReplicateStore((s) => s.result);
  const configured = status?.configured ?? true;
  const selectedCategoryDef = categories?.find((c) => c.key === selectedCategory);
  const medium = selectedCategoryDef?.medium ?? 'image';

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
        <span className="text-5xl">⚡</span>
        <h2 className="text-lg font-medium text-white">Replicate is not configured</h2>
        <p className="text-sm">Connect your Replicate API key to start generating media.</p>
        <a
          href="/settings?tab=media_providers"
          className="mt-2 px-4 py-2 bg-designerAccent text-white rounded-lg hover:bg-designerAccent/80 transition-colors"
        >
          Configure Replicate
        </a>
      </div>
    );
  }

  const isLocal = selectedCategoryDef?.execution === 'local';

  return (
    <div className="flex flex-col h-full bg-newBgColor">
      <StudioHeader />
      <div className="flex flex-1 overflow-hidden">
        {categories && <CategorySpine categories={categories} />}

        {!selectedCategory ? (
          <div className="flex-1 flex items-center justify-center text-gray-500">
            <div className="text-center">
              <p className="text-lg">Select a tool to get started</p>
              <p className="text-sm mt-1">18 media generation tools across image, video, and audio</p>
            </div>
          </div>
        ) : isLocal ? (
          <div className="flex-1 overflow-hidden">
            {selectedCategory === 'meme' && <MemeEditor />}
            {selectedCategory === 'merge' && <MergeEditor />}
          </div>
        ) : (
          <>
            {/* Controls column */}
            <div className="w-[380px] flex-shrink-0 border-r border-newBorder flex flex-col overflow-hidden">
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                <ModelPicker categoryKey={selectedCategory} />
                {selectedModel && <DynamicForm />}
              </div>
              {selectedModel && (
                <div className="flex-shrink-0 border-t border-newBorder p-4 space-y-3">
                  <CostBar />
                  <GenerateButton category={selectedCategory} />
                </div>
              )}
            </div>

            {/* Hero output (inpaint paints its mask here until a run starts) */}
            <div className="flex-1 overflow-hidden bg-newBgColor">
              {selectedCategory === 'inpaint' && selectedModel && runState === 'idle' && !result ? (
                <InpaintMaskEditor />
              ) : (
                <div className="h-full overflow-y-auto">
                  <ResultPanel medium={medium} />
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {categories && <CommandPalette categories={categories} />}
    </div>
  );
}
