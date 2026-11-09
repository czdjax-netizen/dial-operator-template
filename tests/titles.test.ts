import { describe, expect, it } from 'vitest';
import { cleanTitle, isMachineTitle, tidyTitle } from '../src/lib/titles';

describe('titulky', () => {
  it.each([
    ['Novinky.cz', 'http://www.novinky.cz'],
    ['Youtube', 'http://www.youtube.com'],
    ['http://mestske.noviny.cz/', 'http://mestske.noviny.cz/'],
    ['https://www.facebook.com/?ref=lo', 'https://www.facebook.com/?ref=logo'],
    ['News.google home?hl=cs&gl=CZ&ceid=CZ:cs', 'https://news.google.com/home?hl=cs&gl=CZ&ceid=CZ:cs'],
    ['Helpdesk.example.local:8081 app/tickets', 'http://helpdesk.example.local:8081/app/tickets'],
    ['Nintendo.co.uk index.html', 'https://www.nintendo.co.uk/index.html'],
    ['Open.spotify', 'https://open.spotify.com/'],
    ['', 'https://x.cz/'],
  ])('strojový: %s', (title, url) => {
    expect(isMachineTitle(title, url)).toBe(true);
  });

  it.each([
    ['Member cam 1', 'https://www.youtube.com/watch?v=edD3fr8TbhY'],
    ['Store cam', 'https://www.youtube.com/watch?v=lu_HPe7Wj-4'],
    ['edge tv', 'https://www.youtube.com/watch?v=txLyRwYf5zU'],
    ['Moje zprávy', 'http://www.novinky.cz'],
  ])('lidský: %s', (title, url) => {
    expect(isMachineTitle(title, url)).toBe(false);
  });

  it.each([
    ['https://news.google.com/home?hl=cs', 'news.google.com'],
    ['http://www.reddit.com/r/aww/new/', 'reddit.com/r/aww'],
    ['http://www.oldgames.sk/casopis.php', 'oldgames.sk/casopis'],
    ['https://discord.com/channels/350467905391034391/590599799192027150', 'discord.com/channels'],
    ['http://windy.com/?49.800,15.500,5', 'windy.com'],
    ['https://meteosam.cz/predpoved-bourek-%E2%9A%A1/', 'meteosam.cz/predpoved-bourek-⚡'],
    ['https://www.nintendo.co.uk/index.html', 'nintendo.co.uk'],
  ])('cleanTitle %s → %s', (url, expected) => {
    expect(cleanTitle(url)).toBe(expected);
  });

  it('dlouhý titulek se zkrátí na 34 znaků s výpustkou', () => {
    const t = cleanTitle('https://www.chmi.cz/aktualni-situace/aktualni-stav-pocasi/ceska-republika/stanice');
    expect(t.length).toBe(34);
    expect(t.endsWith('…')).toBe(true);
  });

  it('tidyTitle nechá lidský titulek a uklidí strojový', () => {
    expect(tidyTitle('Member cam 1', 'https://www.youtube.com/watch?v=x')).toEqual({ title: 'Member cam 1', changed: false });
    expect(tidyTitle('Zpravy.idnes.cz', 'http://zpravy.idnes.cz')).toEqual({ title: 'zpravy.idnes.cz', changed: true });
  });
});
