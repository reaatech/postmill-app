'use client';

import { Button } from '@gitroom/react/form/button';
import { FC, useCallback, useState } from 'react';
import clsx from 'clsx';
import Loading from '@gitroom/frontend/components/layout/loading';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { useModals } from '@gitroom/frontend/components/layout/new-modal';
import { AiErrorDisplay } from '@gitroom/frontend/components/ai/ai-error-display';

type OperationKey =
  | 'image'
  | 'video'
  | 'upscale'
  | 'bg-remove'
  | 'inpaint'
  | 'tts'
  | 'stt';

type FieldKey = 'prompt' | 'imageUrl' | 'maskUrl' | 'text' | 'voice';

interface OperationDef {
  key: OperationKey;
  label: string;
  available: boolean;
  // body fields this operation submits (prompt/imageUrl/maskUrl/text/voice).
  fields: FieldKey[];
  // whether this operation needs an uploaded audio file (stt).
  audio?: boolean;
}

const operations: readonly OperationDef[] = [
  { key: 'image', label: 'Generate Image', available: true, fields: ['prompt'] },
  { key: 'video', label: 'Generate Video', available: true, fields: ['prompt'] },
  { key: 'upscale', label: 'Upscale Image', available: true, fields: ['imageUrl'] },
  { key: 'bg-remove', label: 'Remove Background', available: true, fields: ['imageUrl'] },
  {
    key: 'inpaint',
    label: 'Inpaint',
    available: true,
    fields: ['imageUrl', 'maskUrl', 'prompt'],
  },
  { key: 'tts', label: 'Text to Speech', available: true, fields: ['text', 'voice'] },
  { key: 'stt', label: 'Speech to Text', available: true, fields: [], audio: true },
] as const;

const fieldLabels: Record<FieldKey, [string, string]> = {
  prompt: ['prompt', 'Prompt'],
  imageUrl: ['image_url', 'Image URL'],
  maskUrl: ['mask_url', 'Mask URL'],
  text: ['text', 'Text'],
  voice: ['voice', 'Voice (optional)'],
};

const AiMediaOperationsModal: FC<{ close: () => void }> = (props) => {
  const { close } = props;
  const t = useT();
  const fetch = useFetch();
  const toaster = useToaster();
  const [activeOperation, setActiveOperation] = useState<OperationKey | null>(
    null
  );
  const [values, setValues] = useState<Partial<Record<FieldKey, string>>>({});
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<
    | { kind: 'image' | 'video'; url: string }
    | { kind: 'text'; text: string }
    | { kind: 'audio'; src: string }
    | null
  >(null);
  const [error, setError] = useState<any>(null);
  const [unavailable, setUnavailable] = useState(false);
  const selectedOperation = operations.find((op) => op.key === activeOperation);

  const setField = useCallback((field: FieldKey, value: string) => {
    setValues((prev) => ({ ...prev, [field]: value }));
  }, []);

  const readAudioAsBase64 = useCallback((file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const r = reader.result as string;
        // strip the data:...;base64, prefix
        resolve(r.includes(',') ? r.split(',')[1] : r);
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }, []);

  const runOperation = useCallback(async () => {
    if (!activeOperation || !selectedOperation) {
      return;
    }

    // Validate required inputs per operation.
    if (selectedOperation.audio && !audioFile) {
      toaster.show(
        t('please_provide_audio', 'Please provide an audio file'),
        'warning'
      );
      return;
    }
    const requiredText = selectedOperation.fields.filter((f) => f !== 'voice');
    for (const f of requiredText) {
      if (!values[f]?.trim()) {
        toaster.show(
          t('please_fill_all_fields', 'Please fill in all required fields'),
          'warning'
        );
        return;
      }
    }

    setLoading(true);
    setError(null);
    setResult(null);
    setUnavailable(false);

    try {
      const body: Record<string, string> = { operation: activeOperation };
      for (const f of selectedOperation.fields) {
        if (values[f]) body[f] = values[f] as string;
      }
      if (selectedOperation.audio && audioFile) {
        body.audio = await readAudioAsBase64(audioFile);
      }

      const res = await fetch('/ai/media', {
        method: 'POST',
        body: JSON.stringify(body),
      });

      if (res.status === 503) {
        setUnavailable(true);
        const err = await res
          .json()
          .catch(() => ({ message: '' }));
        if (err?.message) setError(err.message);
        return;
      }

      if (!res.ok) {
        const err = await res
          .json()
          .catch(() => ({ message: 'Request failed' }));
        setError(err);
        return;
      }

      const data = await res.json();
      if (activeOperation === 'tts' && data.audio) {
        setResult({ kind: 'audio', src: `data:audio/mpeg;base64,${data.audio}` });
      } else if (activeOperation === 'stt') {
        setResult({ kind: 'text', text: data.text ?? '' });
      } else if (activeOperation === 'video' && data.url) {
        setResult({ kind: 'video', url: data.url });
      } else if (data.url) {
        setResult({ kind: 'image', url: data.url });
      } else {
        setResult({ kind: 'text', text: JSON.stringify(data) });
      }
    } catch {
      setError('Network error — please try again');
    } finally {
      setLoading(false);
    }
  }, [
    activeOperation,
    selectedOperation,
    values,
    audioFile,
    readAudioAsBase64,
    fetch,
    toaster,
    t,
  ]);

  return (
    <div className="flex flex-col gap-[16px]">
      {unavailable && (
        <div className="text-[14px] text-yellow-400 bg-yellow-400/10 p-[12px] rounded-[6px] border border-yellow-400/30">
          {error ||
            t(
              'media_operations_unavailable',
              'This operation is not available. Configure a media provider in Admin > AI Settings.'
            )}
        </div>
      )}

      <div className="flex flex-col gap-[6px]">
        <div className="text-[14px]">{t('operation', 'Operation')}</div>
        <div className="flex flex-wrap gap-[8px]">
          {operations.map((op) => (
            <div
              key={op.key}
              onClick={() => {
                setActiveOperation(op.key);
                setValues({});
                setAudioFile(null);
                setResult(null);
                setError(null);
                setUnavailable(false);
              }}
              className={clsx(
                'cursor-pointer rounded-[4px] px-[10px] h-[30px] flex items-center text-[12px] border',
                activeOperation === op.key
                  ? 'bg-[#2B5CD3] border-[#2B5CD3] text-white'
                  : 'bg-newColColor border-newBgLineColor'
              )}
            >
              {op.label}
            </div>
          ))}
        </div>
      </div>

      {selectedOperation && (
        <>
          {selectedOperation.fields.map((field) =>
            field === 'prompt' || field === 'text' ? (
              <div key={field} className="flex flex-col gap-[6px]">
                <div className="text-[14px]">
                  {t(fieldLabels[field][0], fieldLabels[field][1])}
                </div>
                <textarea
                  value={values[field] || ''}
                  onChange={(e) => setField(field, e.target.value)}
                  placeholder={t(
                    'describe_what_you_want',
                    'Describe what you want...'
                  )}
                  className="bg-input min-h-[100px] p-[16px] outline-none border-newTableBorder border rounded-[4px] text-inputText placeholder-inputText"
                />
              </div>
            ) : (
              <div key={field} className="flex flex-col gap-[6px]">
                <div className="text-[14px]">
                  {t(fieldLabels[field][0], fieldLabels[field][1])}
                </div>
                <input
                  type="text"
                  value={values[field] || ''}
                  onChange={(e) => setField(field, e.target.value)}
                  className="bg-input h-[44px] px-[16px] outline-none border-newTableBorder border rounded-[4px] text-inputText placeholder-inputText"
                />
              </div>
            )
          )}

          {selectedOperation.audio && (
            <div className="flex flex-col gap-[6px]">
              <div className="text-[14px]">{t('audio_file', 'Audio file')}</div>
              <input
                type="file"
                accept="audio/*"
                onChange={(e) => setAudioFile(e.target.files?.[0] || null)}
                className="text-[12px]"
              />
            </div>
          )}

          <div className="flex">
            <Button
              type="button"
              onClick={runOperation}
              className="flex-1"
              disabled={loading}
            >
              {loading ? (
                <Loading height={16} width={16} type="spin" color="#fff" />
              ) : (
                t('run_operation', 'Run Operation')
              )}
            </Button>
          </div>
        </>
      )}

      {error && !unavailable && (
        <AiErrorDisplay error={error} onDismiss={() => setError(null)} />
      )}

      {result?.kind === 'image' && (
        <div className="flex flex-col gap-[8px]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={result.url}
            alt={t('result', 'Result')}
            className="max-w-full rounded-[6px] border border-newBgLineColor"
          />
          <a
            href={result.url}
            target="_blank"
            rel="noreferrer"
            className="text-[12px] text-[#2B5CD3] break-all"
          >
            {result.url}
          </a>
        </div>
      )}

      {result?.kind === 'video' && (
        <video
          src={result.url}
          controls
          className="max-w-full rounded-[6px] border border-newBgLineColor"
        />
      )}

      {result?.kind === 'audio' && (
        <audio src={result.src} controls className="w-full" />
      )}

      {result?.kind === 'text' && (
        <div className="text-[12px] p-[12px] bg-newColColor rounded-[6px] border border-newBgLineColor whitespace-pre-wrap break-words">
          {result.text}
        </div>
      )}
    </div>
  );
};

export const AiMediaOperations: FC = () => {
  const t = useT();
  const modals = useModals();

  const openModal = useCallback(() => {
    modals.openModal({
      title: t('ai_media_tools', 'AI Media Tools'),
      children: (close) => <AiMediaOperationsModal close={close} />,
    });
  }, [modals, t]);

  return (
    <div className="relative">
      <div
        onClick={openModal}
        className={clsx(
          'cursor-pointer h-[30px] rounded-[6px] justify-center items-center flex bg-newColColor px-[8px]'
        )}
      >
        <div className="flex gap-[5px] items-center">
          <div>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
            >
              <path
                d="M8 14.5C11.5899 14.5 14.5 11.5899 14.5 8C14.5 4.41015 11.5899 1.5 8 1.5C4.41015 1.5 1.5 4.41015 1.5 8C1.5 11.5899 4.41015 14.5 8 14.5Z"
                stroke="currentColor"
                strokeWidth="1.2"
              />
              <path
                d="M5 8H11M8 5V11"
                stroke="currentColor"
                strokeWidth="1.2"
                strokeLinecap="round"
              />
            </svg>
          </div>
          <div className="text-[10px] font-[600] iconBreak:hidden block">
            {t('ai_media_tools', 'AI Media Tools')}
          </div>
        </div>
      </div>
    </div>
  );
};
