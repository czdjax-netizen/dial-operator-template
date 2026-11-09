import type { Dial } from '../lib/model';

/** Stav UI mimo data: otevřené dialogy, kontextové menu a toast s možností vrátit. */

export type DialogState =
  | { kind: 'dial'; mode: 'add'; groupId: string; url?: string }
  | { kind: 'dial'; mode: 'edit'; dialId: string }
  | { kind: 'group'; mode: 'add' }
  | { kind: 'group'; mode: 'edit'; groupId: string }
  | { kind: 'import' }
  | { kind: 'settings'; tab?: SettingsTab };

export type SettingsTab = 'look' | 'grid' | 'behavior' | 'thumbs' | 'backup' | 'sync';

export interface ToastState {
  id: number;
  text: string;
  undo?: () => void;
}

class Ui {
  dialog = $state<DialogState | null>(null);
  menu = $state<{ dial: Dial; x: number; y: number } | null>(null);
  toast = $state<ToastState | null>(null);
  /** Id přetahovaného odkazu (HTML5 drag & drop). */
  dragging = $state<string | null>(null);
  /** Naposledy otevřená sekce nastavení (jen během otevřené karty). */
  settingsTab = $state<SettingsTab>('look');
  private toastTimer: ReturnType<typeof setTimeout> | null = null;

  open(dialog: DialogState): void {
    this.menu = null;
    this.dialog = dialog;
  }

  close(): void {
    this.dialog = null;
  }

  showToast(text: string, undo?: () => void, ms = 7000): void {
    if (this.toastTimer) clearTimeout(this.toastTimer);
    const id = Date.now();
    this.toast = { id, text, undo };
    this.toastTimer = setTimeout(() => {
      if (this.toast?.id === id) this.toast = null;
    }, ms);
  }

  get busy(): boolean {
    return this.dialog !== null;
  }
}

export const ui = new Ui();
