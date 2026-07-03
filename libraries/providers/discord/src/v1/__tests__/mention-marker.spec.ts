import { describe, it, expect } from 'vitest';

// Mirrors the regex used in social.adapter.ts for Discord mention markers.
const mentionMarkerRegex = /\[\[\[(@[^\]]*)]]]/g;
const formatMentions = (message: string) =>
  message.replace(mentionMarkerRegex, (match, p1) => `<${p1}>`);

describe('Discord mention marker regex', () => {
  it('replaces multiple markers without crossing a ]', () => {
    expect(formatMentions('[[[@alice]]] and [[[@bob]]]')).toBe('<@alice> and <@bob>');
  });

  it('does not cross a ] inside the marker', () => {
    expect(formatMentions('[[[@alice]suffix]]]')).toBe('[[[@alice]suffix]]]');
  });
});
