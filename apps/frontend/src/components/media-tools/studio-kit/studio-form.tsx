'use client';

import React, { FC } from 'react';
import { useModals } from '@gitroom/frontend/components/layout/new-modal';
import { MediaSelectorModal } from '@gitroom/frontend/components/media-tools/media-selector-modal';
import { ModelSelect } from './model-select';
import type { FileFieldValue, StudioField, StudioFieldValue } from './types';

interface StudioFormProps {
  fields: StudioField[];
  values: Record<string, StudioFieldValue>;
  onChange: (name: string, value: StudioFieldValue) => void;
  provider: string;
  operation: string;
}

const Label: FC<{ field: StudioField }> = ({ field }) => {
  if (!field.label) return null;
  return (
    <label className="block text-[12px] text-newTextColor/70 mb-[6px]">
      {field.label}
      {field.required && <span className="text-amber-600 ml-[3px]">*</span>}
    </label>
  );
};

const inputClass =
  'w-full px-[12px] py-[9px] rounded-[8px] bg-newBgColorInner border border-studioBorder text-[13px] text-textColor outline-none focus:border-[#2B5CD3] transition-colors';

const MediaPicker: FC<{ field: StudioField & { type: 'media' }; value?: FileFieldValue; onChange: (v: FileFieldValue | undefined) => void }> = ({
  field,
  value,
  onChange,
}) => {
  const modals = useModals();
  const display = value?.url || value?.fileId;

  const choose = () => {
    modals.openModal({
      title: `Select ${field.accept} file`,
      removeLayout: true,
      children: (close: () => void) => (
        <MediaSelectorModal
          open
          onClose={close}
          onSelect={(item) => {
            onChange({ fileId: item.fileId, url: item.url, type: item.type });
            close();
          }}
        />
      ),
    });
  };

  return (
    <div className="flex gap-[8px]">
      <button
        type="button"
        onClick={choose}
        className={`${inputClass} text-left ${display ? 'text-textColor' : 'text-newTextColor/50'}`}
      >
        {display ? <span className="truncate block">{display}</span> : `Choose ${field.accept}…`}
      </button>
      {display && (
        <button
          type="button"
          onClick={() => onChange(undefined)}
          className="px-[10px] rounded-[8px] text-newTextColor/50 hover:text-red-500 transition-colors"
          aria-label="Clear"
        >
          ✕
        </button>
      )}
    </div>
  );
};

export const StudioForm: FC<StudioFormProps> = ({ fields, values, onChange, provider, operation }) => {
  return (
    <div className="flex flex-col gap-[16px]">
      {fields.map((field) => {
        const value = values[field.name];
        return (
          <div key={field.name}>
            <Label field={field} />

            {(field.type === 'prompt' || field.type === 'text') &&
              (field.type === 'prompt' ? (
                <textarea
                  value={(value as string) ?? ''}
                  onChange={(e) => onChange(field.name, e.target.value)}
                  placeholder={field.placeholder}
                  rows={4}
                  className={`${inputClass} resize-y min-h-[88px]`}
                />
              ) : (
                <input
                  type="text"
                  value={(value as string) ?? ''}
                  onChange={(e) => onChange(field.name, e.target.value)}
                  placeholder={field.placeholder}
                  className={inputClass}
                />
              ))}

            {field.type === 'select' &&
              (field.source === 'models' ? (
                <ModelSelect
                  provider={provider}
                  operation={operation}
                  value={(value as string) ?? (field.default as string)}
                  staticOptions={field.options}
                  onChange={(v) => onChange(field.name, v)}
                />
              ) : (
                <select
                  value={(value as string) ?? (field.default as string) ?? ''}
                  onChange={(e) => onChange(field.name, e.target.value)}
                  className={inputClass}
                >
                  {(field.options ?? []).map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              ))}

            {field.type === 'number' &&
              (field.min !== undefined && field.max !== undefined ? (
                <div className="flex items-center gap-[12px]">
                  <input
                    type="range"
                    min={field.min}
                    max={field.max}
                    step={field.step ?? 1}
                    value={(value as number) ?? (field.default as number) ?? field.min}
                    onChange={(e) => onChange(field.name, Number(e.target.value))}
                    className="flex-1 accent-[#2B5CD3]"
                  />
                  <span className="text-[12px] text-textColor w-[40px] text-right tabular-nums">
                    {(value as number) ?? (field.default as number) ?? field.min}
                  </span>
                </div>
              ) : (
                <input
                  type="number"
                  min={field.min}
                  max={field.max}
                  step={field.step ?? 1}
                  value={(value as number) ?? (field.default as number) ?? ''}
                  onChange={(e) => onChange(field.name, e.target.value === '' ? undefined : Number(e.target.value))}
                  className={inputClass}
                />
              ))}

            {field.type === 'toggle' && (
              <button
                type="button"
                onClick={() => onChange(field.name, !((value as boolean) ?? (field.default as boolean) ?? false))}
                className={`flex items-center gap-[8px] text-[13px] ${(value as boolean) ?? (field.default as boolean) ? 'text-textColor' : 'text-newTextColor/60'}`}
              >
                <span
                  className={`w-[36px] h-[20px] rounded-full p-[2px] transition-colors ${(value as boolean) ?? (field.default as boolean) ? 'bg-[#2B5CD3]' : 'bg-studioBorder'}`}
                >
                  <span
                    className={`block w-[16px] h-[16px] rounded-full bg-white transition-transform ${(value as boolean) ?? (field.default as boolean) ? 'translate-x-[16px]' : ''}`}
                  />
                </span>
                {field.help || field.label}
              </button>
            )}

            {field.type === 'media' && (
              <MediaPicker
                field={field}
                value={value as FileFieldValue | undefined}
                onChange={(v) => onChange(field.name, v)}
              />
            )}

            {field.help && field.type !== 'toggle' && (
              <div className="text-[11px] text-newTextColor/45 mt-[5px]">{field.help}</div>
            )}
          </div>
        );
      })}
    </div>
  );
};
