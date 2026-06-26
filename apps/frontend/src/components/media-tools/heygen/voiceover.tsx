'use client';

import React, { FC, useState } from 'react';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { useModals } from '@gitroom/frontend/components/layout/new-modal';
import { VoicePicker } from './voice-picker';
import { HeyGenVoice } from './use-heygen';

interface VoiceoverProps {
  voices: HeyGenVoice[];
  onGenerated: () => void;
}

export const Voiceover: FC<VoiceoverProps> = ({ voices, onGenerated }) => {
  const fetch = useFetch();
  const toaster = useToaster();
  const modal = useModals();

  const [voice, setVoice] = useState<{ voiceId: string; name: string } | null>(null);
  const [text, setText] = useState('');
  const [generating, setGenerating] = useState(false);

  const valid = voice && text.trim();

  const generate = async () => {
    if (!valid) return;
    setGenerating(true);
    try {
      const res = await fetch('/media/heygen/tts', {
        method: 'POST',
        body: JSON.stringify({ voiceId: voice!.voiceId, text }),
      });
      if (!res.ok) {
        toaster.show('Failed to start the voiceover', 'warning');
        return;
      }
      toaster.show('Voiceover started — track it in the queue', 'success');
      onGenerated();
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="flex flex-col gap-[16px] max-w-[560px]">
      <p className="text-[13px] text-newTextColor/60">
        Generate a voiceover track from text using any HeyGen voice. It saves to your Files audio folder.
      </p>

      <button
        type="button"
        onClick={() =>
          modal.openModal({
            classNames: { modal: 'text-textColor' },
            children: <VoicePicker voices={voices} selectedId={voice?.voiceId} onSelect={(v) => setVoice({ voiceId: v.voiceId, name: v.name })} />,
          })
        }
        className="flex items-center justify-between gap-[8px] px-[12px] py-[10px] rounded-[10px] border border-newColColor hover:border-[#2B5CD3] transition-all text-left"
      >
        <div>
          <div className="text-[13px] text-textColor">{voice?.name || 'Pick a voice'}</div>
          <div className="text-[11px] text-newTextColor/40">Voice</div>
        </div>
        <span className="text-newTextColor/40">🎙️</span>
      </button>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Type the script to read aloud…"
        rows={7}
        className="w-full px-[12px] py-[10px] rounded-[10px] bg-newBgColorInner border border-newColColor text-[13px] text-textColor outline-none focus:border-[#2B5CD3] resize-none"
      />

      <button
        type="button"
        onClick={generate}
        disabled={!valid || generating}
        className="px-[20px] h-[42px] rounded-[10px] bg-[#2B5CD3] text-white text-[14px] font-[600] hover:bg-[#2B5CD3]/80 disabled:opacity-40 disabled:cursor-not-allowed transition-all w-fit"
      >
        {generating ? 'Starting…' : 'Generate voiceover → Files'}
      </button>
    </div>
  );
};
