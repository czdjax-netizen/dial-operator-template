import type { ThemeName } from '../lib/model';

export type ConcreteTheme = Exclude<ThemeName, 'auto'>;

/** 'auto' = tmavý motiv v tmavém režimu systému, jinak světlý. */
export function resolveTheme(theme: ThemeName, prefersDark: boolean): ConcreteTheme {
  if (theme === 'auto') return prefersDark ? 'dark' : 'light';
  return theme;
}
