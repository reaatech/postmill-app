'use client';

import React, { useCallback, useMemo, useState } from 'react';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useReplicateStore } from './replicate.store';
import { FileInput, type FileValue } from './fields/file';
import {
  classifySchema,
  type ClassifiedField,
  type InputSchema,
  type SchemaField,
} from './field-classification';

function RequiredMark({ required }: { required?: boolean }) {
  return required ? <span className="text-red-400 ml-1">*</span> : null;
}

const inputClass =
  'w-full px-3 py-2 rounded-lg border border-newBorder bg-newBgColorInner text-white text-sm focus:outline-none focus:border-designerAccent';

// ── Prompt (with inline AI enhancement) ──────────────────────────────────────
function PromptField({
  name,
  schema,
  value,
  required,
  mode,
  onChange,
}: {
  name: string;
  schema: SchemaField;
  value: unknown;
  required?: boolean;
  mode: 'positive' | 'negative';
  onChange: (v: unknown) => void;
}) {
  const fetch = useFetch();
  const enhanceFlags = useReplicateStore((s) => s.enhanceFlags);
  const setEnhanceFlag = useReplicateStore((s) => s.setEnhanceFlag);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const enabled = enhanceFlags[name] ?? false;
  const text = typeof value === 'string' ? value : '';

  const enhance = useCallback(async () => {
    if (!text.trim()) {
      setNote('Write a prompt first.');
      return;
    }
    setBusy(true);
    setNote(null);
    try {
      const res = await fetch('/media/replicate/enhance-prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: text, mode }),
      });
      const data = (await res.json()) as { text: string; enhanced: boolean; reason?: string };
      if (data.enhanced) {
        onChange(data.text);
        setEnhanceFlag(name, true);
      } else if (data.reason === 'ai-not-configured') {
        setNote('AI is not configured for this workspace — enable a provider in Settings → AI.');
      } else {
        setNote('Could not enhance the prompt. Try again.');
      }
    } catch {
      setNote('Could not enhance the prompt. Try again.');
    } finally {
      setBusy(false);
    }
  }, [fetch, text, mode, onChange, setEnhanceFlag, name]);

  return (
    <div className="mb-4">
      <div className="flex items-center justify-between mb-1.5">
        <label className="text-xs text-gray-400">
          {schema.title || name}
          <RequiredMark required={required} />
        </label>
        <button
          type="button"
          onClick={enhance}
          disabled={busy}
          className="flex items-center gap-1 text-[11px] px-2 py-1 rounded-md bg-designerAccent/15 text-designerAccent hover:bg-designerAccent/25 disabled:opacity-50 transition-colors"
        >
          <span>✨</span>
          {busy ? 'Enhancing…' : mode === 'negative' ? 'Build negatives' : 'Enhance'}
        </button>
      </div>
      <textarea
        value={text}
        onChange={(e) => {
          onChange(e.target.value);
          if (enabled) setEnhanceFlag(name, false);
        }}
        placeholder={schema.description || `Enter ${name}…`}
        rows={mode === 'negative' ? 2 : 4}
        className={`${inputClass} resize-none`}
      />
      {note && <p className="text-[10px] text-yellow-400 mt-1">{note}</p>}
      {!note && schema.description && (
        <p className="text-[10px] text-gray-600 mt-1">{schema.description}</p>
      )}
    </div>
  );
}

// ── Advanced scalar fields ───────────────────────────────────────────────────
function AdvancedField({
  name,
  schema,
  value,
  required,
  onChange,
}: {
  name: string;
  schema: SchemaField;
  value: unknown;
  required?: boolean;
  onChange: (v: unknown) => void;
}) {
  const label = (
    <label className="block text-xs text-gray-400 mb-1">
      {schema.title || name}
      <RequiredMark required={required} />
    </label>
  );

  if (schema.enum) {
    const hasValue = value !== undefined && value !== null && value !== '';
    return (
      <div className="mb-3">
        {label}
        <select
          value={String(value ?? '')}
          onChange={(e) => onChange(e.target.value)}
          className={inputClass}
        >
          {!hasValue && <option value="">Select…</option>}
          {schema.enum.map((opt) => (
            <option key={String(opt)} value={String(opt)}>
              {String(opt)}
            </option>
          ))}
        </select>
      </div>
    );
  }

  if (schema.type === 'boolean') {
    return (
      <label className="mb-3 flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={!!value}
          onChange={(e) => onChange(e.target.checked)}
          className="rounded bg-gray-800 border-gray-600"
        />
        <span className="text-xs text-gray-400">
          {schema.title || name}
          <RequiredMark required={required} />
        </span>
      </label>
    );
  }

  if (schema.type === 'integer' || schema.type === 'number') {
    const hasRange = schema.minimum !== undefined && schema.maximum !== undefined;
    const step = schema.type === 'integer' ? 1 : 'any';
    return (
      <div className="mb-3">
        <div className="flex items-center justify-between mb-1">
          {label}
          <span className="text-[10px] text-gray-500 tabular-nums">
            {value !== undefined ? String(value) : ''}
          </span>
        </div>
        {hasRange ? (
          <input
            type="range"
            value={value !== undefined ? Number(value) : (schema.default as number) ?? schema.minimum}
            onChange={(e) => onChange(Number(e.target.value))}
            min={schema.minimum}
            max={schema.maximum}
            step={step}
            className="w-full accent-designerAccent"
          />
        ) : (
          <input
            type="number"
            value={value !== undefined ? String(value) : ''}
            onChange={(e) => onChange(e.target.value ? Number(e.target.value) : undefined)}
            min={schema.minimum}
            max={schema.maximum}
            placeholder={schema.default !== undefined ? String(schema.default) : ''}
            className={inputClass}
          />
        )}
      </div>
    );
  }

  return (
    <div className="mb-3">
      {label}
      <input
        type="text"
        value={typeof value === 'string' ? value : value !== undefined ? String(value) : ''}
        onChange={(e) => onChange(e.target.value)}
        placeholder={schema.default !== undefined ? String(schema.default) : ''}
        className={inputClass}
      />
      {schema.description && (
        <p className="text-[10px] text-gray-600 mt-1">{schema.description}</p>
      )}
    </div>
  );
}

function PrimaryField({ entry }: { entry: ClassifiedField }) {
  const value = useReplicateStore((s) => (s.formInput as Record<string, unknown>)[entry.name]);
  const updateFormField = useReplicateStore((s) => s.updateFormField);
  const onChange = useCallback(
    (v: unknown) => updateFormField(entry.name, v),
    [updateFormField, entry.name]
  );

  switch (entry.role) {
    case 'prompt':
      return (
        <PromptField name={entry.name} schema={entry.field} value={value} required={entry.required} mode="positive" onChange={onChange} />
      );
    case 'negative':
      return (
        <PromptField name={entry.name} schema={entry.field} value={value} required={entry.required} mode="negative" onChange={onChange} />
      );
    case 'file':
      return (
        <div className="mb-4">
          <FileInput
            label={entry.field.title || entry.name}
            required={entry.required}
            acceptType={entry.acceptType}
            value={(value as FileValue | string | undefined) || undefined}
            onChange={(v) => onChange(v as unknown)}
          />
        </div>
      );
    default:
      return null;
  }
}

function AdvancedFieldRow({ entry }: { entry: ClassifiedField }) {
  const value = useReplicateStore((s) => (s.formInput as Record<string, unknown>)[entry.name]);
  const updateFormField = useReplicateStore((s) => s.updateFormField);
  const onChange = useCallback(
    (v: unknown) => updateFormField(entry.name, v),
    [updateFormField, entry.name]
  );
  return <AdvancedField name={entry.name} schema={entry.field} value={value} required={entry.required} onChange={onChange} />;
}

const ALWAYS_EXCLUDED = ['mask'];

export function DynamicForm() {
  const selectedModel = useReplicateStore((s) => s.selectedModel);
  const selectedCategory = useReplicateStore((s) => s.selectedCategory);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const excluded = useMemo(() => {
    const set = new Set<string>(ALWAYS_EXCLUDED);
    // Inpaint drives image + mask via the dedicated mask editor.
    if (selectedCategory === 'inpaint') set.add('image');
    return set;
  }, [selectedCategory]);

  const { primary, advanced } = useMemo(
    () => classifySchema(selectedModel?.inputSchema as unknown as InputSchema | null, excluded),
    [selectedModel, excluded]
  );

  if (!selectedModel) return null;

  if (primary.length === 0 && advanced.length === 0) {
    return (
      <div className="text-sm text-gray-500 text-center py-4">
        No configurable parameters for this model.
      </div>
    );
  }

  return (
    <div>
      {primary.map((entry) => (
        <PrimaryField key={entry.name} entry={entry} />
      ))}

      {advanced.length > 0 && (
        <div className="mt-2 border-t border-newBorder pt-3">
          <button
            type="button"
            onClick={() => setAdvancedOpen((o) => !o)}
            className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-200 transition-colors"
          >
            <span className={`transition-transform ${advancedOpen ? 'rotate-90' : ''}`}>▸</span>
            Advanced settings
            <span className="text-gray-600">({advanced.length})</span>
          </button>
          {advancedOpen && (
            <div className="mt-3">
              {advanced.map((entry) => (
                <AdvancedFieldRow key={entry.name} entry={entry} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
