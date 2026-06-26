'use client';

import React, { FC, useMemo, useState } from 'react';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { useMediaDirectory } from '@gitroom/react/helpers/use.media.directory';
import { MediaSelectorModal } from '@gitroom/frontend/components/media-tools/media-selector-modal';
import { useHeygenTranslateLanguages } from './use-heygen';

interface TranslateProps {
  onGenerated: () => void;
}

export const Translate: FC<TranslateProps> = ({ onGenerated }) => {
  const fetch = useFetch();
  const toaster = useToaster();
  const mediaDirectory = useMediaDirectory();
  const { data: langData, isLoading: langsLoading } = useHeygenTranslateLanguages(true);

  const [source, setSource] = useState<{ fileId: string; previewUrl: string } | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const [picking, setPicking] = useState(false);
  const [generating, setGenerating] = useState(false);

  const languages = useMemo(() => {
    const all = langData?.languages || [];
    const q = query.trim().toLowerCase();
    return q ? all.filter((l) => l.toLowerCase().includes(q)) : all;
  }, [langData, query]);

  const toggle = (lang: string) =>
    setSelected((prev) => (prev.includes(lang) ? prev.filter((l) => l !== lang) : [...prev, lang]));

  const valid = source && selected.length > 0;

  const generate = async () => {
    if (!valid) return;
    setGenerating(true);
    try {
      const res = await fetch('/media/heygen/translate', {
        method: 'POST',
        body: JSON.stringify({ fileId: source!.fileId, languages: selected }),
      });
      if (!res.ok) {
        toaster.show('Failed to start the translation', 'warning');
        return;
      }
      toaster.show(`Translating into ${selected.length} language(s) — track them in the queue`, 'success');
      onGenerated();
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="flex flex-col gap-[16px] max-w-[620px]">
      <p className="text-[13px] text-newTextColor/60">
        Translate a video from your Files into other languages with lip-sync. Each language becomes its own render.
        The source must be reachable by HeyGen — cloud-stored videos work best.
      </p>

      <button
        type="button"
        onClick={() => setPicking(true)}
        className="flex items-center gap-[12px] p-[12px] rounded-[10px] border border-studioBorder hover:border-[#2B5CD3] transition-all text-left"
      >
        <div className="w-[96px] h-[54px] rounded-[8px] bg-black overflow-hidden flex items-center justify-center shrink-0">
          {source ? (
            <video src={source.previewUrl} className="w-full h-full object-cover" muted preload="metadata" />
          ) : (
            <span className="text-newTextColor/40 text-[22px]">＋</span>
          )}
        </div>
        <div>
          <div className="text-[13px] text-textColor">{source ? 'Change source video' : 'Pick a source video from Files'}</div>
          <div className="text-[11px] text-newTextColor/40">MP4 with clear speech</div>
        </div>
      </button>

      <div>
        <div className="flex items-center justify-between mb-[8px]">
          <span className="text-[13px] font-[500] text-textColor">Target languages</span>
          {selected.length > 0 && <span className="text-[11px] text-newTextColor/50">{selected.length} selected</span>}
        </div>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search languages…"
          className="w-full h-[36px] px-[12px] mb-[8px] rounded-[8px] bg-newBgColorInner border border-studioBorder text-[13px] text-textColor outline-none focus:border-[#2B5CD3]"
        />
        {langsLoading ? (
          <div className="text-[12px] text-newTextColor/40 py-[10px]">Loading languages…</div>
        ) : languages.length === 0 ? (
          <div className="text-[12px] text-newTextColor/40 py-[10px]">No languages available</div>
        ) : (
          <div className="flex flex-wrap gap-[6px] max-h-[220px] overflow-y-auto">
            {languages.map((lang) => (
              <button
                key={lang}
                type="button"
                onClick={() => toggle(lang)}
                className={`px-[12px] h-[30px] rounded-full text-[12px] border transition-all ${
                  selected.includes(lang)
                    ? 'bg-[#2B5CD3] border-[#2B5CD3] text-white'
                    : 'border-studioBorder text-newTextColor/70 hover:border-[#2B5CD3] hover:text-textColor'
                }`}
              >
                {lang}
              </button>
            ))}
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={generate}
        disabled={!valid || generating}
        className="px-[20px] h-[42px] rounded-[10px] bg-[#2B5CD3] text-white text-[14px] font-[600] hover:bg-[#2B5CD3]/80 disabled:opacity-40 disabled:cursor-not-allowed transition-all w-fit"
      >
        {generating ? 'Starting…' : 'Translate → Files'}
      </button>

      <MediaSelectorModal
        open={picking}
        onClose={() => setPicking(false)}
        onSelect={(item) => {
          if (item.source !== 'file' || !item.fileId) {
            toaster.show('Save the video to Files first, then pick it here', 'warning');
            return;
          }
          if (item.type !== 'video') {
            toaster.show('Translation needs a video', 'warning');
            return;
          }
          setSource({ fileId: item.fileId, previewUrl: mediaDirectory.set(item.url) });
          setPicking(false);
        }}
      />
    </div>
  );
};
