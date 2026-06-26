'use client';

import React, { useMemo, useState } from 'react';
import useSWR from 'swr';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { Logo } from '@gitroom/frontend/components/new-layout/logo';
import { FullscreenButton } from '@gitroom/frontend/components/media-tools/fullscreen-button';
import { useFullscreen } from '@gitroom/frontend/components/media-tools/use-fullscreen';
import { useReplicateStore, type CategoryDefinition } from './replicate.store';
import { ModelPicker } from './model-picker';
import { DynamicForm } from './dynamic-form';
import { CostBar } from './cost-bar';
import { ResultPanel } from './result-panel';
import { InpaintMaskEditor } from './inpaint-mask-editor';
import { MergeEditor } from './merge-editor';
import { MemeEditor } from './meme-editor';
import { CommandPalette } from './command-palette';
import { StudioLanding } from '@gitroom/frontend/components/media-tools/studio-kit/studio-landing';
import { useGenerate, missingRequiredFields, FOLDER_REQUIRED_CATEGORIES } from './use-generate';

const REPLICATE_LANDING = {
  website: 'https://replicate.com',
  tagline: 'Run thousands of AI models with one line',
  description:
    'A cloud hub for running thousands of open-source models via API — image, video, speech, and music generation — with pay-per-use pricing, fine-tuning, and custom deploys.',
  badges: ['Image', 'Video', 'Audio'],
  highlights: [
    'Thousands of community models via API',
    'Image, video, and audio generation models',
    'Run and fine-tune with one line of code',
    'Pay only for active compute time',
    'Inpaint, merge, upscale and meme tools built in',
  ],
};

type Medium = 'image' | 'video' | 'audio';

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
    acc.push({ id: node.id, label: `${' '.repeat(depth * 2)}${node.name}` });
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
      <label className="text-xs text-gray-500 mobile:hidden">Save to</label>
      <select
        value={saveFolderId || ''}
        onChange={(e) => setSaveFolderId(e.target.value || null)}
        className="px-2 py-1 rounded-lg border border-studioBorder bg-newBgColorInner text-white text-xs focus:outline-none max-w-[140px]"
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

const MEDIUM_ICONS: Record<Medium, string> = { image: '🖼️', video: '🎬', audio: '🎵' };
const MEDIUM_ORDER: Medium[] = ['image', 'video', 'audio'];
const MEDIUM_TITLE: Record<Medium, string> = { image: 'Image', video: 'Video', audio: 'Audio' };

// ── The icon menu rail (the Designer's 48px panel spine) ─────────────────────
function MenuSpine({
  categories,
  openMedium,
  onToggleMedium,
  controlsOpen,
  onToggleControls,
  hasControls,
  activeMedium,
}: {
  categories: CategoryDefinition[];
  openMedium: Medium | null;
  onToggleMedium: (m: Medium) => void;
  controlsOpen: boolean;
  onToggleControls: () => void;
  hasControls: boolean;
  activeMedium: Medium | null;
}) {
  const mediums = MEDIUM_ORDER.filter((m) => categories.some((c) => c.medium === m));
  return (
    <div className="w-[52px] flex-shrink-0 flex flex-col items-center pt-2 gap-1 border-r border-studioBorder bg-newBgColorInner z-30">
      {mediums.map((m) => {
        const active = openMedium === m || activeMedium === m;
        return (
          <button
            key={m}
            onClick={() => onToggleMedium(m)}
            title={MEDIUM_TITLE[m]}
            aria-label={`${MEDIUM_TITLE[m]} tools`}
            className={`w-10 h-10 flex items-center justify-center rounded-lg text-lg transition-colors ${
              active ? 'bg-designerAccent/20 ring-1 ring-designerAccent/40' : 'hover:bg-boxHover'
            }`}
          >
            {MEDIUM_ICONS[m]}
          </button>
        );
      })}
      {hasControls && (
        <>
          <div className="flex-1" />
          <button
            onClick={onToggleControls}
            title="Toggle controls"
            aria-label="Toggle controls panel"
            className={`w-10 h-10 mb-2 flex items-center justify-center rounded-lg text-lg transition-colors ${
              controlsOpen ? 'bg-designerAccent/20 text-designerAccent' : 'text-gray-400 hover:bg-boxHover'
            }`}
          >
            ⚙
          </button>
        </>
      )}
    </div>
  );
}

// ── Category picker panel (absolute overlay, Designer-style) ──────────────────
function CategoryPanel({
  medium,
  categories,
  selectedCategory,
  onPick,
  onClose,
}: {
  medium: Medium;
  categories: CategoryDefinition[];
  selectedCategory: string | null;
  onPick: (key: string) => void;
  onClose: () => void;
}) {
  return (
    <>
      {/* mobile tap-out scrim */}
      <div className="hidden mobile:block absolute inset-0 z-10 bg-black/40" onClick={onClose} />
      <div className="absolute left-[52px] inset-y-0 w-[220px] z-20 border-r border-studioBorder bg-newBgColorInner overflow-y-auto shadow-2xl">
        <div className="flex items-center justify-between px-3 h-12 border-b border-studioBorder sticky top-0 bg-newBgColorInner">
          <span className="text-xs uppercase tracking-wider text-gray-500">
            {MEDIUM_ICONS[medium]} {MEDIUM_TITLE[medium]}
          </span>
          <button onClick={onClose} className="text-gray-500 hover:text-white" aria-label="Close">
            ✕
          </button>
        </div>
        <div className="p-2">
          {categories.map((cat) => (
            <button
              key={cat.key}
              onClick={() => onPick(cat.key)}
              className={`w-full text-left px-3 py-2 rounded-lg text-sm mb-0.5 transition-colors ${
                selectedCategory === cat.key
                  ? 'bg-designerAccent/20 text-textColor'
                  : 'text-gray-400 hover:bg-boxHover hover:text-gray-200'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>
    </>
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

function StudioHeader({ activeCategoryLabel }: { activeCategoryLabel?: string }) {
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
    <div className="flex items-center justify-between h-12 flex-shrink-0 border-b border-studioBorder px-3 bg-newBgColorInner">
      <div className="flex items-center gap-2 min-w-0">
        <Logo size={20} className="" />
        <h1 className="text-sm font-semibold text-textColor whitespace-nowrap">Replicate Studio</h1>
        {activeCategoryLabel && (
          <span className="text-xs text-gray-500 truncate mobile:hidden">› {activeCategoryLabel}</span>
        )}
        {stateLabel && <span className={`text-xs ${stateColor} mobile:hidden`}>· {stateLabel}</span>}
      </div>
      <div className="flex items-center gap-3">
        <SaveFolderPicker />
        <span className="mobile:hidden text-[10px] text-gray-600 border border-studioBorder rounded px-1.5 py-0.5">
          ⌘K
        </span>
        <FullscreenButton />
      </div>
    </div>
  );
}

export function ReplicateStudio() {
  const { data: status } = useReplicateStatus();
  const { data: categories } = useCategories();
  const selectedCategory = useReplicateStore((s) => s.selectedCategory);
  const selectedModel = useReplicateStore((s) => s.selectedModel);
  const setCategory = useReplicateStore((s) => s.setCategory);
  const runState = useReplicateStore((s) => s.runState);
  const result = useReplicateStore((s) => s.result);
  const configured = status?.configured ?? true;
  // Full-screen fills the canvas app, not the page (see HeyGen studio for the rationale).
  const { isFullscreen } = useFullscreen();

  const selectedCategoryDef = categories?.find((c) => c.key === selectedCategory);
  const medium: Medium = selectedCategoryDef?.medium ?? 'image';
  const isLocal = selectedCategoryDef?.execution === 'local';
  const hasControls = !!selectedCategory && !isLocal;

  const [openMedium, setOpenMedium] = useState<Medium | null>(null);
  // Controls are an in-flow column on desktop and an overlay on mobile; open by
  // default on desktop (>1025px = the repo `mobile` breakpoint), closed on mobile.
  const [controlsOpen, setControlsOpen] = useState(
    () => typeof window === 'undefined' || window.innerWidth > 1025
  );

  if (!status) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-designerAccent" />
      </div>
    );
  }

  if (!configured) {
    return <StudioLanding identifier="replicate" title="Replicate" landing={REPLICATE_LANDING} />;
  }

  // Controls: rendered only when open (⚙ toggles). In-flow column on desktop,
  // absolute overlay on mobile. When closed, the hero takes the full width.
  const controlsClasses =
    'w-[360px] flex-shrink-0 border-r border-studioBorder flex flex-col bg-newBgColor ' +
    'mobile:absolute mobile:left-[52px] mobile:inset-y-0 mobile:z-20 mobile:w-[min(340px,82vw)] mobile:shadow-2xl';

  return (
    <div className={`flex flex-col h-full bg-studioBg${isFullscreen ? ' fixed inset-0 z-[100]' : ' rounded-[12px] overflow-hidden'}`}>
      <StudioHeader activeCategoryLabel={selectedCategoryDef?.label} />

      <div className="relative flex flex-1 overflow-hidden">
        {categories && (
          <MenuSpine
            categories={categories}
            openMedium={openMedium}
            onToggleMedium={(m) => setOpenMedium((cur) => (cur === m ? null : m))}
            controlsOpen={controlsOpen}
            onToggleControls={() => setControlsOpen((o) => !o)}
            hasControls={hasControls}
            activeMedium={selectedCategory ? medium : null}
          />
        )}

        {openMedium && categories && (
          <CategoryPanel
            medium={openMedium}
            categories={categories.filter((c) => c.medium === openMedium)}
            selectedCategory={selectedCategory}
            onPick={(key) => {
              setCategory(key);
              setOpenMedium(null);
              setControlsOpen(true); // reveal controls (matters on mobile)
            }}
            onClose={() => setOpenMedium(null)}
          />
        )}

        {/* Display area */}
        {!selectedCategory ? (
          <div className="flex-1 flex items-center justify-center text-gray-500 px-6 text-center">
            <div>
              <p className="text-lg">Pick a tool to get started</p>
              <p className="text-sm mt-1">Tap a medium on the left — image, video, or audio.</p>
            </div>
          </div>
        ) : isLocal ? (
          <div className="flex-1 overflow-hidden">
            {selectedCategory === 'meme' && <MemeEditor />}
            {selectedCategory === 'merge' && <MergeEditor />}
          </div>
        ) : (
          <>
            {/* mobile scrim behind the controls overlay */}
            {controlsOpen && (
              <div
                className="hidden mobile:block absolute inset-0 z-10 bg-black/40"
                onClick={() => setControlsOpen(false)}
              />
            )}

            {/* Controls column */}
            {controlsOpen && (
              <div className={controlsClasses}>
                <div className="flex items-center justify-between px-4 h-10 border-b border-studioBorder mobile:flex hidden">
                  <span className="text-xs uppercase tracking-wider text-gray-500">Controls</span>
                  <button onClick={() => setControlsOpen(false)} className="text-gray-500 hover:text-white" aria-label="Close controls">
                    ✕
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                  <ModelPicker categoryKey={selectedCategory} />
                  {selectedModel && <DynamicForm />}
                </div>
                {selectedModel && (
                  <div className="flex-shrink-0 border-t border-studioBorder p-4 space-y-3">
                    <CostBar />
                    <GenerateButton category={selectedCategory} />
                  </div>
                )}
              </div>
            )}

            {/* Hero output (inpaint paints its mask here until a run starts) */}
            <div className="flex-1 overflow-hidden bg-studioBg">
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
