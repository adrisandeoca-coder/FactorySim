/**
 * Module-level registry for DOM elements and cached screenshot images.
 * Elements are registered by key (e.g. "factory-canvas", "dashboard").
 * Cached images survive component unmounts so cross-tab screenshots work.
 */

const elements = new Map<string, HTMLElement>();
const cachedImages = new Map<string, string>(); // base64 PNG strings

export function registerElement(key: string, el: HTMLElement | null): void {
  if (el) {
    elements.set(key, el);
  } else {
    elements.delete(key);
  }
}

export function getElement(key: string): HTMLElement | null {
  return elements.get(key) ?? null;
}

export function setCachedImage(key: string, base64: string): void {
  cachedImages.set(key, base64);
}

export function getCachedImage(key: string): string | null {
  return cachedImages.get(key) ?? null;
}

export function clearCachedImage(key: string): void {
  cachedImages.delete(key);
}
