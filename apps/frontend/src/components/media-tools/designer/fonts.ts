/**
 * Curated set of open-licensed (SIL OFL) font families for the Designer.
 *
 * The corresponding @font-face / @import declarations live in
 * `apps/frontend/src/app/global.scss` (see the "Designer fonts" block).
 *
 * Leaf utility — no React, no side effects on import. `ensureFontLoaded` is the
 * runtime hook the FontPicker / canvas renderer call before drawing text.
 */

export interface DesignerFont {
  family: string;
  label: string;
  weights: number[];
  category: 'sans' | 'serif' | 'display' | 'mono';
}

/**
 * System default — always available, never needs network loading. Kept first so
 * it is the safe fallback for the picker.
 */
export const SYSTEM_FONT_FAMILY = 'Arial';

export const DESIGNER_FONTS: DesignerFont[] = [
  { family: 'Arial', label: 'Arial (system)', weights: [400, 700], category: 'sans' },
  { family: 'Inter', label: 'Inter', weights: [400, 500, 600, 700], category: 'sans' },
  { family: 'Roboto', label: 'Roboto', weights: [400, 500, 700], category: 'sans' },
  { family: 'Open Sans', label: 'Open Sans', weights: [400, 600, 700], category: 'sans' },
  { family: 'Lato', label: 'Lato', weights: [400, 700], category: 'sans' },
  { family: 'Montserrat', label: 'Montserrat', weights: [400, 500, 600, 700], category: 'sans' },
  { family: 'Poppins', label: 'Poppins', weights: [400, 500, 600, 700], category: 'sans' },
  { family: 'Oswald', label: 'Oswald', weights: [400, 500, 700], category: 'display' },
  { family: 'Playfair Display', label: 'Playfair Display', weights: [400, 600, 700], category: 'serif' },
  { family: 'Merriweather', label: 'Merriweather', weights: [400, 700], category: 'serif' },
  { family: 'JetBrains Mono', label: 'JetBrains Mono', weights: [400, 500, 700], category: 'mono' },
];

/** Just the family names — what the picker iterates over. */
export const FONT_FAMILIES: string[] = DESIGNER_FONTS.map((f) => f.family);

/** Families that ship with the OS and never need network loading. */
const SYSTEM_FAMILIES = new Set<string>([SYSTEM_FONT_FAMILY, 'Helvetica', 'Helvetica Neue']);

/**
 * Ensure a font family is loaded and ready to paint. Resolves even if loading
 * fails — never throws — so callers can always proceed (falling back to the
 * browser's default rendering). No-op for system fonts and SSR.
 */
export async function ensureFontLoaded(family: string): Promise<void> {
  if (!family || SYSTEM_FAMILIES.has(family)) {
    return;
  }
  if (typeof document === 'undefined' || !('fonts' in document)) {
    return;
  }
  try {
    await document.fonts.load(`16px "${family}"`);
    await document.fonts.ready;
  } catch {
    // Swallow — loading is best-effort; the canvas/picker still renders.
  }
}

/** Await loading of several families in parallel. Never throws. */
export async function ensureFontsLoaded(families: string[]): Promise<void> {
  await Promise.all(families.map((family) => ensureFontLoaded(family)));
}
