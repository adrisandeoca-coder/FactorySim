/**
 * Offscreen tab screenshot capture.
 *
 * Renders each tab component into a hidden offscreen container,
 * captures a screenshot with html2canvas, caches it in the element
 * registry, then tears down the container. This ensures tab screenshots
 * are available in run artifacts even if the user never visited the tab.
 */

import { createRoot } from 'react-dom/client';
import { captureToBase64 } from './screenshotService';
import { getCachedImage, setCachedImage } from './elementRegistry';

// Lazy imports to avoid circular deps — each component only uses Zustand stores
const TAB_COMPONENTS: Array<{
  cacheKey: string;
  load: () => Promise<{ default: React.ComponentType }>;
}> = [
  {
    cacheKey: 'scenarios-tab',
    load: () =>
      import('../components/scenarios/ScenarioManager').then((m) => ({
        default: m.ScenarioManager,
      })),
  },
  {
    cacheKey: 'orders-tab',
    load: () =>
      import('../components/orders/OrderManager').then((m) => ({
        default: m.OrderManager,
      })),
  },
  {
    cacheKey: 'code-editor-tab',
    load: () =>
      import('../components/code-editor/CodeEditor').then((m) => ({
        default: m.CodeEditor,
      })),
  },
  {
    cacheKey: 'data-sync-tab',
    load: () =>
      import('../components/data-sync/DataSync').then((m) => ({
        default: m.DataSync,
      })),
  },
  {
    cacheKey: 'settings-tab',
    load: () =>
      import('../components/Settings').then((m) => ({
        default: m.Settings,
      })),
  },
];

/**
 * Capture screenshots of all tabs that don't already have a cached image.
 * Each tab is rendered offscreen in a hidden container, captured, then unmounted.
 */
export async function captureAllTabScreenshots(): Promise<void> {
  for (const tab of TAB_COMPONENTS) {
    // Skip if already cached this session
    if (getCachedImage(tab.cacheKey)) continue;

    try {
      const { default: Component } = await tab.load();

      // Create hidden offscreen container
      const container = document.createElement('div');
      container.style.cssText =
        'position:fixed;left:-10000px;top:0;width:1200px;min-height:800px;overflow:hidden;background:#fff;';
      document.body.appendChild(container);

      const root = createRoot(container);
      root.render(<Component />);

      // Wait for render + any async effects
      await new Promise((r) => setTimeout(r, 600));

      const base64 = await captureToBase64(container);
      if (base64 && base64.length > 1000) {
        setCachedImage(tab.cacheKey, base64);
      }

      root.unmount();
      document.body.removeChild(container);
    } catch {
      // Non-critical — skip this tab
    }
  }
}
