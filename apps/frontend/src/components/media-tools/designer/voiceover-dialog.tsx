'use client';

import React, { FC, useState } from 'react';
import { useMediaVoices } from './use-media-voices';

interface VoiceoverDialogProps {
  onClose: () => void;
  onGenerate: (text: string, voiceId: string) => void | Promise<void>;
}

const inputClass =
  'w-full px-[12px] py-[9px] rounded-[8px] bg-newBgColorInner border border-studioBorder text-[13px] text-textColor outline-none focus:border-[#2B5CD3] transition-colors';

export const VoiceoverDialog: FC<VoiceoverDialogProps> = ({
  onClose,
  onGenerate,
}) => {
  const [text, setText] = useState('');
  const [selectedVoice, setSelectedVoice] = useState('');
  const [generating, setGenerating] = useState(false);
  const { data: voices, isLoading, error } = useMediaVoices();

  const canGenerate = text.trim().length > 0 && selectedVoice.length > 0;

  const handleGenerate = async () => {
    if (!canGenerate || generating) return;
    setGenerating(true);
    try {
      await onGenerate(text.trim(), selectedVoice);
      onClose();
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="flex flex-col gap-[16px] p-[4px] min-w-[320px]">
      <h3 className="text-[14px] font-medium text-textColor">Generate AI voiceover</h3>

      <div>
        <label className="block text-[12px] text-newTextColor/70 mb-[6px]">
          Script <span className="text-amber-600">*</span>
        </label>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Type the voiceover text…"
          rows={4}
          className={`${inputClass} resize-y min-h-[88px]`}
        />
      </div>

      <div>
        <label className="block text-[12px] text-newTextColor/70 mb-[6px]">
          Voice <span className="text-amber-600">*</span>
        </label>
        {isLoading && (
          <div className="text-[13px] text-newTextColor/60">Loading voices…</div>
        )}
        {error && (
          <div className="text-[13px] text-amber-600">
            Could not load voices. Make sure a TTS-capable provider is configured.
          </div>
        )}
        {!isLoading && !error && (
          <select
            value={selectedVoice}
            onChange={(e) => setSelectedVoice(e.target.value)}
            className={inputClass}
          >
            <option value="" disabled>
              Choose a voice…
            </option>
            {(voices || []).map((voice) => (
              <option key={voice.id} value={voice.id}>
                {voice.label}
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="flex justify-end gap-[8px] pt-[4px]">
        <button
          type="button"
          onClick={onClose}
          className="px-[12px] py-[8px] rounded-[8px] text-[13px] text-textColor hover:bg-studioBorder/30 transition-colors"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleGenerate}
          disabled={!canGenerate || generating}
          className="px-[12px] py-[8px] rounded-[8px] text-[13px] bg-[#2B5CD3] text-white disabled:opacity-50 disabled:cursor-not-allowed hover:bg-[#244bb0] transition-colors"
        >
          {generating ? 'Generating…' : 'Generate'}
        </button>
      </div>
    </div>
  );
};
