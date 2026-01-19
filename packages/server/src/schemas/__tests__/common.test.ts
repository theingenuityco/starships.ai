import { noXSS } from '@/schemas/common';

describe('noXSS', () => {
  it('allows common punctuation (slashes, quotes, ampersands)', () => {
    expect(noXSS('Widget builder for charts/tables/cards')).toBe(true);
    expect(noXSS(`It's fine to use quotes: "hello"`)).toBe(true);
    expect(noXSS('R&D and A/B tests')).toBe(true);
    expect(noXSS('Braces {like this} and backslashes \\ are fine as plain text')).toBe(true);
  });

  it('rejects HTML tags', () => {
    expect(noXSS('<b>bold</b>')).toBe(false);
    expect(noXSS('hello <script>alert(1)</script>')).toBe(false);
    expect(noXSS('<img src=x onerror=alert(1)>')).toBe(false);
  });

  it('rejects raw angle brackets even if not a full tag', () => {
    expect(noXSS('2 < 3')).toBe(false);
    expect(noXSS('x > y')).toBe(false);
  });

  it('rejects control characters (except newlines and tabs)', () => {
    expect(noXSS('hello\u0000world')).toBe(false);
    expect(noXSS('hello\u0008world')).toBe(false);
    expect(noXSS('hello\nworld')).toBe(true);
    expect(noXSS('hello\tworld')).toBe(true);
  });
});
