import type React from 'react';

// A media file reference produced by the media picker (MediaSelectorModal).
export interface FileFieldValue {
  fileId?: string;
  url?: string;
  type?: 'image' | 'video' | 'audio';
}

export type StudioFieldValue = string | number | boolean | FileFieldValue | undefined;

interface StudioFieldBase {
  name: string;
  label?: string;
  required?: boolean;
  help?: string;
}

export interface PromptField extends StudioFieldBase {
  type: 'prompt' | 'text';
  placeholder?: string;
}
export interface SelectField extends StudioFieldBase {
  type: 'select';
  options?: { value: string; label: string }[];
  default?: string;
  // When 'models', the dropdown is populated at runtime from
  // GET /media/studio/:provider/models?operation=<tab operation> and rendered as a
  // searchable combobox. Any static `options` act as a fallback when the catalog is
  // empty/unavailable. Used for the hub studios' large, changing model catalogs.
  source?: 'models';
}
export interface NumberField extends StudioFieldBase {
  type: 'number';
  min?: number;
  max?: number;
  step?: number;
  default?: number;
}
export interface ToggleField extends StudioFieldBase {
  type: 'toggle';
  default?: boolean;
}
export interface MediaField extends StudioFieldBase {
  type: 'media';
  accept: 'image' | 'video' | 'audio';
}

export type StudioField = PromptField | SelectField | NumberField | ToggleField | MediaField;

export interface StudioCustomProps {
  provider: string;
  onGenerated: () => void;
}

export interface StudioTab {
  key: string;
  label: string;
  // Media kind → backend routing (generate) + Designer handoff type.
  operation: 'video' | 'image' | 'audio';
  // Fixed model id, or omit and add a `select` field named "model".
  model?: string;
  description?: string;
  fields: StudioField[];
  // Escape hatch: a bespoke panel (HeyGen-style structured tools) instead of the form.
  custom?: React.ComponentType<StudioCustomProps>;
}

// Marketing content for the "not configured yet" landing page. Most users have never
// heard of these providers, so each studio ships a short, grounded pitch — what it is,
// what it supports, why use it, and where to learn more / sign up.
export interface StudioLanding {
  // Official provider homepage (opened in a new tab via an external-link button).
  website: string;
  // Punchy one-line headline.
  tagline: string;
  // 1-2 sentence description of what the provider is and why it's notable.
  description: string;
  // Capability tags (e.g. 'Image', 'Video', 'Audio', 'Avatar', 'Voice').
  badges: string[];
  // 4-5 short benefit bullets.
  highlights: string[];
  // Optional brand-icon override (ProviderIcon id) for studios whose `provider` is a
  // shared credential id rather than the brand — e.g. Pika/Kling ride `fal`, Sora rides `openai`.
  icon?: string;
}

export interface StudioDescriptor {
  provider: string;
  title: string;
  tabs: StudioTab[];
  landing?: StudioLanding;
}

export interface StudioJob {
  id: string;
  operation: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  artifactUrl: string | null;
  fileId: string | null;
  error: string | null;
  createdAt: string;
}

export interface StudioGenerateBody {
  operation: 'video' | 'image' | 'audio';
  model?: string;
  input: Record<string, string | number | boolean>;
  mediaInputs?: Record<string, string>;
  folderId?: string | null;
}
