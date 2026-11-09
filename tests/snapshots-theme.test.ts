import { describe, expect, it } from 'vitest';
import { makeSnapshot, needsDailySnapshot, pushSnapshot } from '../src/lib/snapshots';
import { resolveTheme } from '../src/theme/theme';

describe('snapshoty', () => {
  it('drží max. 20, nejnovější první', () => {
    let list = [] as ReturnType<typeof pushSnapshot>;
    for (let i = 0; i < 25; i++) list = pushSnapshot(list, makeSnapshot([], [], 'x', 1000 + i));
    expect(list).toHaveLength(20);
    expect(list[0].createdAt).toBe(1024);
  });

  it('denní snapshot jednou za den', () => {
    const now = Date.UTC(2026, 10, 8, 12);
    expect(needsDailySnapshot([], now)).toBe(true);
    expect(needsDailySnapshot([makeSnapshot([], [], 'daily', now - 1000)], now)).toBe(false);
    expect(needsDailySnapshot([makeSnapshot([], [], 'import', now)], now)).toBe(true);
  });
});

describe('motivy', () => {
  it('auto podle systému', () => {
    expect(resolveTheme('auto', true)).toBe('dark');
    expect(resolveTheme('auto', false)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
  });
});
