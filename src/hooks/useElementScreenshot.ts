import { useEffect, useRef } from 'react';
import { registerElement, setCachedImage } from '../services/elementRegistry';
import { captureToBase64 } from '../services/screenshotService';

/**
 * Hook that registers a DOM element for screenshot capture and caches
 * a screenshot on unmount. Replaces the duplicated pattern found across
 * 8+ components.
 *
 * Usage:
 *   const ref = useElementScreenshot('my-tab');
 *   return <div ref={ref}>...</div>;
 */
export function useElementScreenshot<T extends HTMLElement = HTMLDivElement>(
  key: string,
): React.RefObject<T> {
  const ref = useRef<T>(null);

  useEffect(() => {
    if (ref.current) {
      registerElement(key, ref.current);
    }

    return () => {
      // Capture screenshot on unmount for cross-tab artifact saving
      if (ref.current) {
        captureToBase64(ref.current).then((base64) => {
          setCachedImage(key, base64);
        }).catch(() => {
          // Screenshot capture is non-critical — element may already be detached
        });
      }
      registerElement(key, null);
    };
  }, [key]);

  return ref;
}
