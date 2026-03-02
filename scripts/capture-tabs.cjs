/**
 * Capture screenshots of every app tab for UX review.
 * Usage: node scripts/capture-tabs.cjs [outputDir]
 */
const { execSync } = require('child_process');
const { mkdirSync, existsSync } = require('fs');
const { join } = require('path');

const BASE = 'http://localhost:3000';
const TABS = [
  { route: '/dashboard',  name: '1-dashboard' },
  { route: '/builder',    name: '2-factory-builder' },
  { route: '/scenarios',  name: '3-scenarios' },
  { route: '/orders',     name: '4-orders' },
  { route: '/code',       name: '5-code-editor' },
  { route: '/data',       name: '6-data-sync' },
  { route: '/settings',   name: '7-settings' },
];

const outDir = process.argv[2] || join(process.cwd(), 'screenshots-ux-review');
if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

for (const tab of TABS) {
  const url = `${BASE}${tab.route}`;
  const filePath = join(outDir, `${tab.name}.png`);
  console.log(`Capturing ${tab.name} -> ${url}`);
  try {
    execSync(
      `"${edgePath}" --headless=new --disable-gpu --screenshot="${filePath}" --window-size=1920,1080 --hide-scrollbars "${url}"`,
      { timeout: 20000, stdio: 'pipe' }
    );
    console.log(`  Saved: ${filePath}`);
  } catch (err) {
    console.error(`  Error on ${tab.name}: ${err.message?.slice(0, 200)}`);
  }
}

console.log(`\nAll screenshots saved to: ${outDir}`);
