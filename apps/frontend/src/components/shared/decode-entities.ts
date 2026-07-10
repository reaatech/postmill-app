/**
 * Decode HTML entities in display text (e.g. stock-provider titles that arrive escaped or
 * double-escaped: `Etude &amp;quot;The Passion&amp;quot;`). Rendered as React TEXT afterwards,
 * so this is XSS-safe. Handles multiple escape levels; SSR-safe textual fallback.
 */
export function decodeEntities(input?: string | null): string {
  if (!input) return input ?? '';
  if (typeof document === 'undefined') {
    return input
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#0?39;|&apos;/g, "'")
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>');
  }
  let prev: string | undefined;
  let cur = input;
  for (let i = 0; i < 3 && cur !== prev; i++) {
    prev = cur;
    const el = document.createElement('textarea');
    el.innerHTML = cur;
    cur = el.value;
  }
  return cur;
}
