import { describe, expect, it } from 'vitest';
import { hostOf, normalizeUrl, safeUrl } from '../src/lib/url';

describe('url', () => {
  it('safeUrl doplní https a odmítne jiná schémata', () => {
    expect(safeUrl('novinky.cz')?.href).toBe('https://novinky.cz/');
    expect(safeUrl('javascript:alert(1)')).toBeNull();
    expect(safeUrl('')).toBeNull();
  });

  it('hostOf bez www a m.', () => {
    expect(hostOf('http://www.novinky.cz')).toBe('novinky.cz');
    expect(hostOf('https://m.facebook.com/x')).toBe('facebook.com');
    expect(hostOf('http://helpdesk.example.local:8081/ih')).toBe('helpdesk.example.local');
  });

  it('normalizeUrl sjednotí schéma, www, lomítko, kotvu a sledovací parametry', () => {
    const a = normalizeUrl('http://www.reddit.com/r/aww/new/');
    const b = normalizeUrl('https://reddit.com/r/aww/new#top');
    expect(a).toBe(b);
    expect(normalizeUrl('https://x.cz/?utm_source=a&id=5&fbclid=z')).toBe('x.cz?id=5');
    expect(normalizeUrl('https://www.nintendo.co.uk/index.html')).toBe('nintendo.co.uk');
  });

  it('normalizeUrl zachová port a významné parametry', () => {
    expect(normalizeUrl('http://intranet.example.local:8099/portal')).toBe('intranet.example.local:8099/portal');
    expect(normalizeUrl('https://www.youtube.com/watch?v=abc')).toBe('youtube.com/watch?v=abc');
  });
});
