import { describe, it, expect } from 'vitest';
import { stripHtmlValidation } from './strip.html.validation';

describe('stripHtmlValidation', () => {
  it('decodes &amp; last so a literal &amp;nbsp; stays as &nbsp;', () => {
    expect(stripHtmlValidation('none', '&amp;nbsp;')).toBe('&nbsp;');
  });

  it('still decodes an ordinary &amp; into &', () => {
    expect(stripHtmlValidation('none', 'A &amp; B')).toBe('A & B');
  });
});
