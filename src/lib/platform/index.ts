import { createChromePlatform, isExtensionPage } from './chrome';
import type { Platform } from './types';
import { createWebPlatform } from './web';

export type * from './types';

/**
 * Ve stránce rozšíření (`chrome-extension://…`) platforma Chrome, jinak web
 * (`npm run dev` na localhostu, ladění přes Claude in Chrome a Playwright).
 */
export const platform: Platform = isExtensionPage() ? createChromePlatform() : createWebPlatform();
