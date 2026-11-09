import { describe, expect, it } from 'vitest';
import { domainLabels, glyphHue, glyphInitials } from '../src/lib/glyph';

describe('glyph', () => {
  it.each([
    ['youtube.com', 'http://www.youtube.com', 'YT'],
    ['novinky.cz', 'http://www.novinky.cz', 'NV'],
    ['Member cam 1', 'https://www.youtube.com/watch?v=x', 'MC'],
    ['Soliman 1', 'https://www.youtube.com/watch?v=y', 'S1'],
    ['zpravy.idnes.cz', 'http://zpravy.idnes.cz', 'ZI'],
    ['nintendo-insider.com', 'https://www.nintendo-insider.com/', 'NI'],
    ['speeddial2.com/bookmarks', 'https://www.speeddial2.com/bookmarks', 'S2'],
    ['nintendo.co.uk', 'https://www.nintendo.co.uk/index.html', 'NT'],
    ['Počasí', 'https://example.com', 'PC'],
  ])('iniciály %s → %s', (title, url, expected) => {
    expect(glyphInitials(title, url)).toBe(expected);
  });

  it('domainLabels zahodí TLD i co.uk', () => {
    expect(domainLabels('www.nintendo.co.uk')).toEqual(['nintendo']);
    expect(domainLabels('news.google.com')).toEqual(['news', 'google']);
  });

  it('barva podle domény: stejná doména stejná barva', () => {
    expect(glyphHue('https://www.youtube.com/a')).toBe(glyphHue('https://www.youtube.com/b'));
    expect(glyphHue('https://www.youtube.com')).not.toBe(glyphHue('https://www.wikipedia.org'));
    expect(glyphHue('https://example.com')).toBeGreaterThanOrEqual(0);
    expect(glyphHue('https://example.com')).toBeLessThan(360);
  });
});
