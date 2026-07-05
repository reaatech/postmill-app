import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

/**
 * Invariant: every tool registered in `tool.list.ts` carries an in-`execute`
 * access guard (`requireRead(` or `requireWrite(`). Over MCP/A2A the HTTP-layer
 * scope check is not enough — a tool with no in-tool guard executes for any
 * authenticated caller regardless of scope/mode (this is exactly how the
 * unguarded generateImage/generateVideo/designerDesign spend tools shipped).
 * This test fails the moment a guard is deleted from any registered tool, or a
 * new tool is registered without one.
 */

const TOOLS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..');
const TOOL_LIST_SRC = readFileSync(join(TOOLS_DIR, 'tool.list.ts'), 'utf8');

// Tools that are intentionally guard-free (static, no org data, no spend).
// Keep EMPTY — every current tool has a guard. Adding an entry must be justified.
const ALLOWLIST = new Set<string>([]);

/** class name -> module basename, parsed from the import statements. */
function buildClassToBasename(): Record<string, string> {
  const map: Record<string, string> = {};
  const importRe = /import\s*\{\s*([A-Za-z0-9_]+)\s*\}\s*from\s*'([^']+)'/g;
  let m: RegExpExecArray | null;
  while ((m = importRe.exec(TOOL_LIST_SRC))) {
    const className = m[1];
    const importPath = m[2];
    const basename = importPath.split('/').pop()!;
    map[className] = basename;
  }
  return map;
}

/** class names inside the `export const toolList = [ ... ]` array. */
function registeredClassNames(): string[] {
  const arrayMatch = TOOL_LIST_SRC.match(/export const toolList\s*=\s*\[([\s\S]*?)\]/);
  if (!arrayMatch) throw new Error('Could not locate toolList array');
  return arrayMatch[1]
    .split(',')
    .map((s) => s.replace(/\/\/.*$/gm, '').trim())
    .filter((s) => /^[A-Za-z0-9_]+$/.test(s));
}

describe('tool guard coverage', () => {
  const classToBasename = buildClassToBasename();
  const registered = registeredClassNames();

  it('registers a non-trivial set of tools', () => {
    expect(registered.length).toBeGreaterThanOrEqual(30);
  });

  it.each(registered)('%s has an in-execute access guard', (className) => {
    if (ALLOWLIST.has(className)) return;
    const basename = classToBasename[className];
    expect(basename, `no import mapping for ${className}`).toBeTruthy();
    const src = readFileSync(join(TOOLS_DIR, `${basename}.ts`), 'utf8');
    const hasGuard = /require(Read|Write)\s*\(/.test(src);
    expect(
      hasGuard,
      `${basename} (${className}) is registered but has no requireRead(/requireWrite( guard`
    ).toBe(true);
  });
});
