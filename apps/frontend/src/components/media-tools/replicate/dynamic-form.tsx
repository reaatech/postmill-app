'use client';

import React, { useMemo } from 'react';
import { useReplicateStore } from './replicate.store';
import { FileInput, type FileValue } from './fields/file';

interface SchemaField {
  type: string;
  title?: string;
  description?: string;
  default?: unknown;
  enum?: unknown[];
  minimum?: number;
  maximum?: number;
  'x-order'?: number;
  format?: string;
  anyOf?: Array<{ type: string; format?: string }>;
}

interface InputSchema {
  type: string;
  required?: string[];
  properties?: Record<string, SchemaField>;
}

function inferAcceptType(name: string, title?: string): 'image' | 'video' | 'audio' {
  const haystack = `${name} ${title || ''}`.toLowerCase();
  if (haystack.includes('video')) return 'video';
  if (haystack.includes('audio') || haystack.includes('sound')) return 'audio';
  return 'image';
}

const SIZE_PRESETS = ['1:1', '16:9', '9:16', '4:3'];

function isSizeField(name: string, title?: string): boolean {
  return name === 'size' || title?.toLowerCase() === 'size';
}

function SizeField({ label, value, onChange, required, description }: {
  label: string;
  value: unknown;
  onChange: (value: unknown) => void;
  required?: boolean;
  description?: string;
}) {
  const current = typeof value === 'string' ? value : '';
  return (
    <div className="mb-3">
      <label className="block text-xs text-gray-400 mb-1">
        {label}
        {required && <span className="text-red-400 ml-1">*</span>}
      </label>
      <div className="flex flex-wrap gap-2 mb-2">
        {SIZE_PRESETS.map((preset) => (
          <button
            key={preset}
            type="button"
            onClick={() => onChange(preset)}
            className={`px-2 py-1 rounded-lg border text-xs transition-colors ${
              current === preset
                ? 'bg-blue-900/50 border-blue-500 text-blue-300'
                : 'border-newBorder bg-newBgColorInner text-white hover:bg-boxHover'
            }`}
          >
            {preset}
          </button>
        ))}
      </div>
      <input
        type="text"
        value={current}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Custom size (e.g. 1024x1024)"
        className="w-full px-3 py-2 rounded-lg border border-newBorder bg-newBgColorInner text-white text-sm"
      />
      {description && (
        <p className="text-[10px] text-gray-600 mt-1">{description}</p>
      )}
    </div>
  );
}

function FieldRenderer({ name, schema, value, onChange, required }: {
  name: string;
  schema: SchemaField;
  value: unknown;
  onChange: (value: unknown) => void;
  required?: boolean;
}) {
  const isUri = schema.format === 'uri' || schema.anyOf?.some((a) => a.format === 'uri');

  if (isUri) {
    return (
      <FileInput
        label={schema.title || name}
        required={required}
        acceptType={inferAcceptType(name, schema.title)}
        value={(value as FileValue | string | undefined) || undefined}
        onChange={(fileValue) => onChange(fileValue as unknown)}
      />
    );
  }

  if (isSizeField(name, schema.title) && !schema.enum) {
    return (
      <SizeField
        label={schema.title || name}
        value={value}
        onChange={onChange}
        required={required}
        description={schema.description}
      />
    );
  }

  if (schema.enum) {
    return (
      <div className="mb-3">
        <label className="block text-xs text-gray-400 mb-1">
          {schema.title || name}
          {required && <span className="text-red-400 ml-1">*</span>}
        </label>
        <select
          value={String(value ?? '')}
          onChange={(e) => onChange(e.target.value)}
          className="w-full px-3 py-2 rounded-lg border border-newBorder bg-newBgColorInner text-white text-sm"
        >
          <option value="">Select...</option>
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
      <div className="mb-3 flex items-center gap-2">
        <input
          type="checkbox"
          checked={!!value}
          onChange={(e) => onChange(e.target.checked)}
          className="rounded bg-gray-800 border-gray-600"
        />
        <label className="text-xs text-gray-400">
          {schema.title || name}
          {required && <span className="text-red-400 ml-1">*</span>}
        </label>
      </div>
    );
  }

  if (schema.type === 'integer' || schema.type === 'number') {
    return (
      <div className="mb-3">
        <label className="block text-xs text-gray-400 mb-1">
          {schema.title || name}
          {required && <span className="text-red-400 ml-1">*</span>}
        </label>
        <input
          type="number"
          value={value !== undefined ? String(value) : ''}
          onChange={(e) => onChange(e.target.value ? Number(e.target.value) : undefined)}
          min={schema.minimum}
          max={schema.maximum}
          placeholder={schema.default !== undefined ? String(schema.default) : ''}
          className="w-full px-3 py-2 rounded-lg border border-newBorder bg-newBgColorInner text-white text-sm"
        />
      </div>
    );
  }

  // Default: string / text input
  return (
    <div className="mb-3">
      <label className="block text-xs text-gray-400 mb-1">
        {schema.title || name}
        {required && <span className="text-red-400 ml-1">*</span>}
      </label>
      {name === 'prompt' || name === 'text' ? (
        <textarea
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder={schema.description || `Enter ${name}...`}
          rows={3}
          className="w-full px-3 py-2 rounded-lg border border-newBorder bg-newBgColorInner text-white text-sm resize-none"
        />
      ) : (
        <input
          type="text"
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder={schema.default !== undefined ? String(schema.default) : ''}
          className="w-full px-3 py-2 rounded-lg border border-newBorder bg-newBgColorInner text-white text-sm"
        />
      )}
      {schema.description && (
        <p className="text-[10px] text-gray-600 mt-1">{schema.description}</p>
      )}
    </div>
  );
}

const ALWAYS_EXCLUDED = ['mask'];

export function DynamicForm() {
  const store = useReplicateStore();
  const schema = store.selectedModel?.inputSchema as unknown as InputSchema | null;

  const excludedFields = useMemo(() => {
    const set = new Set<string>(ALWAYS_EXCLUDED);
    // Inpaint uses a dedicated mask painter + source picker in the studio.
    if (store.selectedCategory === 'inpaint') {
      set.add('image');
    }
    return set;
  }, [store.selectedCategory]);

  const sortedFields = useMemo(() => {
    if (!schema?.properties) return [];
    const required = new Set(schema.required || []);
    return Object.entries(schema.properties)
      .filter(([name]) => !excludedFields.has(name))
      .map(([name, field]) => ({ name, field, required: required.has(name) }))
      .sort((a, b) => (a.field['x-order'] ?? 99) - (b.field['x-order'] ?? 99));
  }, [schema, excludedFields]);

  if (!schema?.properties) {
    return (
      <div className="text-sm text-gray-500 text-center py-4">
        No configurable parameters for this model.
      </div>
    );
  }

  return (
    <div className="max-w-md">
      {sortedFields.map(({ name, field, required }) => (
        <FieldRenderer
          key={name}
          name={name}
          schema={field}
          value={(store.formInput as Record<string, unknown>)[name]}
          onChange={(value) => store.updateFormField(name, value)}
          required={required}
        />
      ))}
    </div>
  );
}
