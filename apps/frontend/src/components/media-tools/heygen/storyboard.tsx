'use client';

import React, { FC, useState } from 'react';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { useMediaDirectory } from '@gitroom/react/helpers/use.media.directory';
import { useModals } from '@gitroom/frontend/components/layout/new-modal';
import { MediaSelectorModal } from '@gitroom/frontend/components/media-tools/media-selector-modal';
import { AvatarPicker } from './avatar-picker';
import { VoicePicker } from './voice-picker';
import { HeyGenAvatar, HeyGenVoice } from './use-heygen';

interface SceneState {
  key: string;
  avatar?: { avatarId: string; name: string; previewImageUrl: string | null };
  voice?: { voiceId: string; name: string };
  inputText: string;
  background?: { type: 'color' | 'image' | 'video'; color?: string; fileId?: string; previewUrl?: string };
}

const DIMENSIONS = [
  { key: '16:9', label: 'Landscape 16:9', width: 1280, height: 720 },
  { key: '9:16', label: 'Portrait 9:16', width: 720, height: 1280 },
  { key: '1:1', label: 'Square 1:1', width: 1080, height: 1080 },
];

let sceneCounter = 0;
const newScene = (): SceneState => ({ key: `scene-${++sceneCounter}`, inputText: '' });

interface StoryboardProps {
  avatars: HeyGenAvatar[];
  voices: HeyGenVoice[];
  onGenerated: () => void;
}

export const Storyboard: FC<StoryboardProps> = ({ avatars, voices, onGenerated }) => {
  const fetch = useFetch();
  const toaster = useToaster();
  const modal = useModals();
  const mediaDirectory = useMediaDirectory();

  const [scenes, setScenes] = useState<SceneState[]>([newScene()]);
  const [dimensionKey, setDimensionKey] = useState('16:9');
  const [title, setTitle] = useState('');
  const [generating, setGenerating] = useState(false);
  const [bgPickerScene, setBgPickerScene] = useState<string | null>(null);

  const patchScene = (key: string, patch: Partial<SceneState>) =>
    setScenes((prev) => prev.map((s) => (s.key === key ? { ...s, ...patch } : s)));

  const removeScene = (key: string) => setScenes((prev) => prev.filter((s) => s.key !== key));

  const moveScene = (index: number, dir: -1 | 1) =>
    setScenes((prev) => {
      const next = [...prev];
      const target = index + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });

  const openAvatarPicker = (scene: SceneState) =>
    modal.openModal({
      classNames: { modal: 'text-textColor' },
      children: (
        <AvatarPicker
          avatars={avatars}
          selectedId={scene.avatar?.avatarId}
          onSelect={(a) =>
            patchScene(scene.key, { avatar: { avatarId: a.avatarId, name: a.name, previewImageUrl: a.previewImageUrl } })
          }
        />
      ),
    });

  const openVoicePicker = (scene: SceneState) =>
    modal.openModal({
      classNames: { modal: 'text-textColor' },
      children: (
        <VoicePicker
          voices={voices}
          selectedId={scene.voice?.voiceId}
          onSelect={(v) => patchScene(scene.key, { voice: { voiceId: v.voiceId, name: v.name } })}
        />
      ),
    });

  const validation = (() => {
    for (let i = 0; i < scenes.length; i++) {
      const s = scenes[i];
      if (!s.avatar) return `Scene ${i + 1} needs an avatar`;
      if (!s.voice) return `Scene ${i + 1} needs a voice`;
      if (!s.inputText.trim()) return `Scene ${i + 1} needs a script`;
    }
    return null;
  })();

  const generate = async () => {
    if (validation) {
      toaster.show(validation, 'warning');
      return;
    }
    const dim = DIMENSIONS.find((d) => d.key === dimensionKey)!;
    setGenerating(true);
    try {
      const res = await fetch('/media/heygen/video', {
        method: 'POST',
        body: JSON.stringify({
          title: title.trim() || undefined,
          dimension: { width: dim.width, height: dim.height },
          scenes: scenes.map((s) => ({
            avatarId: s.avatar!.avatarId,
            voiceId: s.voice!.voiceId,
            inputText: s.inputText,
            ...(s.background
              ? {
                  background:
                    s.background.type === 'color'
                      ? { type: 'color', color: s.background.color }
                      : { type: s.background.type, fileId: s.background.fileId },
                }
              : {}),
          })),
        }),
      });
      if (!res.ok) {
        toaster.show('Failed to start the render', 'warning');
        return;
      }
      toaster.show('Render started — track it in the queue', 'success');
      onGenerated();
    } catch {
      toaster.show('Failed to start the render', 'warning');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="flex flex-col gap-[16px]">
      <div className="flex items-center gap-[10px] flex-wrap">
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Video title (optional)"
          className="flex-1 min-w-[180px] h-[38px] px-[12px] rounded-[8px] bg-newBgColorInner border border-studioBorder text-[13px] text-textColor outline-none focus:border-[#2B5CD3]"
        />
        <select
          value={dimensionKey}
          onChange={(e) => setDimensionKey(e.target.value)}
          className="h-[38px] px-[10px] rounded-[8px] bg-newBgColorInner border border-studioBorder text-[13px] text-textColor outline-none focus:border-[#2B5CD3]"
        >
          {DIMENSIONS.map((d) => (
            <option key={d.key} value={d.key}>{d.label}</option>
          ))}
        </select>
      </div>

      {/* Scene strip */}
      <div className="flex gap-[12px] overflow-x-auto pb-[8px]">
        {scenes.map((scene, index) => (
          <div
            key={scene.key}
            className="shrink-0 w-[260px] rounded-[12px] border border-studioBorder bg-newBgColorInner flex flex-col"
          >
            <div className="flex items-center justify-between px-[10px] py-[8px] border-b border-studioBorder">
              <span className="text-[12px] font-[600] text-textColor">Scene {index + 1}</span>
              <div className="flex items-center gap-[2px]">
                <button type="button" aria-label="Move left" disabled={index === 0} onClick={() => moveScene(index, -1)} className="w-[24px] h-[24px] flex items-center justify-center rounded-[5px] text-newTextColor/60 hover:text-textColor hover:bg-boxHover disabled:opacity-30">‹</button>
                <button type="button" aria-label="Move right" disabled={index === scenes.length - 1} onClick={() => moveScene(index, 1)} className="w-[24px] h-[24px] flex items-center justify-center rounded-[5px] text-newTextColor/60 hover:text-textColor hover:bg-boxHover disabled:opacity-30">›</button>
                <button type="button" aria-label="Remove scene" disabled={scenes.length === 1} onClick={() => removeScene(scene.key)} className="w-[24px] h-[24px] flex items-center justify-center rounded-[5px] text-newTextColor/60 hover:text-dangerText hover:bg-boxHover disabled:opacity-30">✕</button>
              </div>
            </div>

            <div className="p-[10px] flex flex-col gap-[10px]">
              <button
                type="button"
                onClick={() => openAvatarPicker(scene)}
                className="flex items-center gap-[10px] p-[8px] rounded-[8px] border border-studioBorder hover:border-[#2B5CD3] transition-all text-left"
              >
                <div className="w-[40px] h-[40px] rounded-[6px] bg-newBgColor overflow-hidden flex items-center justify-center shrink-0">
                  {scene.avatar?.previewImageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- external provider asset
                    <img src={scene.avatar.previewImageUrl} alt={scene.avatar.name} className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-newTextColor/60 text-[18px]">＋</span>
                  )}
                </div>
                <div className="min-w-0">
                  <div className="text-[12px] text-textColor truncate">{scene.avatar?.name || 'Pick avatar'}</div>
                  <div className="text-[10px] text-newTextColor/60">Avatar</div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => openVoicePicker(scene)}
                className="flex items-center justify-between gap-[8px] px-[10px] py-[8px] rounded-[8px] border border-studioBorder hover:border-[#2B5CD3] transition-all text-left"
              >
                <div className="min-w-0">
                  <div className="text-[12px] text-textColor truncate">{scene.voice?.name || 'Pick voice'}</div>
                  <div className="text-[10px] text-newTextColor/60">Voice</div>
                </div>
                <span className="text-newTextColor/60">🎙️</span>
              </button>

              <textarea
                value={scene.inputText}
                onChange={(e) => patchScene(scene.key, { inputText: e.target.value })}
                placeholder="What should the avatar say?"
                rows={4}
                className="w-full px-[10px] py-[8px] rounded-[8px] bg-newBgColor border border-studioBorder text-[12px] text-textColor outline-none focus:border-[#2B5CD3] resize-none"
              />

              {/* Background */}
              <div className="flex items-center gap-[6px]">
                <input
                  type="color"
                  aria-label="Background color"
                  value={scene.background?.type === 'color' ? scene.background.color || '#000000' : '#000000'}
                  onChange={(e) => patchScene(scene.key, { background: { type: 'color', color: e.target.value } })}
                  className="w-[32px] h-[32px] rounded-[6px] border border-studioBorder bg-transparent cursor-pointer"
                />
                <button
                  type="button"
                  onClick={() => setBgPickerScene(scene.key)}
                  className="flex-1 px-[10px] h-[32px] rounded-[8px] border border-studioBorder text-[11px] text-newTextColor/70 hover:border-[#2B5CD3] hover:text-textColor transition-all truncate"
                >
                  {scene.background && scene.background.type !== 'color' ? 'Image/Video bg ✓' : 'Image/Video bg'}
                </button>
                {scene.background && (
                  <button
                    type="button"
                    aria-label="Clear background"
                    onClick={() => patchScene(scene.key, { background: undefined })}
                    className="w-[28px] h-[32px] flex items-center justify-center rounded-[6px] text-newTextColor/65 hover:text-dangerText"
                  >
                    ✕
                  </button>
                )}
              </div>
              {scene.background?.previewUrl && scene.background.type !== 'color' && (
                <div className="text-[10px] text-newTextColor/60 truncate">bg: {scene.background.previewUrl}</div>
              )}
            </div>
          </div>
        ))}

        {/* Add scene */}
        <button
          type="button"
          onClick={() => setScenes((prev) => [...prev, newScene()])}
          className="shrink-0 w-[88px] rounded-[12px] border-[2px] border-dashed border-studioBorder hover:border-[#2B5CD3] text-newTextColor/65 hover:text-btnPrimaryAccent flex flex-col items-center justify-center gap-[6px] transition-all"
        >
          <span className="text-[26px] leading-none">＋</span>
          <span className="text-[11px]">Scene</span>
        </button>
      </div>

      <div className="flex items-center gap-[12px]">
        <button
          type="button"
          onClick={generate}
          disabled={generating || !!validation}
          className="px-[20px] h-[42px] rounded-[10px] bg-[#2B5CD3] text-white text-[14px] font-[600] hover:bg-[#2B5CD3]/80 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
        >
          {generating ? 'Starting…' : `Generate video → Files`}
        </button>
        {validation && <span className="text-[12px] text-amber-600">{validation}</span>}
      </div>

      <MediaSelectorModal
        open={!!bgPickerScene}
        onClose={() => setBgPickerScene(null)}
        onSelect={(item) => {
          if (!bgPickerScene) return;
          if (item.source !== 'file' || !item.fileId) {
            toaster.show('Save the asset to Files first, then pick it as a background', 'warning');
            return;
          }
          if (item.type !== 'image' && item.type !== 'video') {
            toaster.show('Background must be an image or video', 'warning');
            return;
          }
          patchScene(bgPickerScene, {
            background: { type: item.type, fileId: item.fileId, previewUrl: mediaDirectory.set(item.url) },
          });
          setBgPickerScene(null);
        }}
      />
    </div>
  );
};
