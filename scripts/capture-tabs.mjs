/**
 * Capture screenshots of every app tab for UX review.
 * Usage: node scripts/capture-tabs.mjs [outputDir]
 */
import puppeteer from 'puppeteer';
import { mkdirSync, existsSync } from 'fs';
import { join } from 'path';

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

async function main() {
  const browser = await puppeteer.launch({
    headless: 'new',
    defaultViewport: { width: 1920, height: 1080 },
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await browser.newPage();

  for (const tab of TABS) {
    const url = `${BASE}${tab.route}`;
    console.log(`Capturing ${tab.name} → ${url}`);
    try {
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 15000 });
      // Wait a bit for any animations/renders to settle
      await new Promise(r => setTimeout(r, 2000));
      const filePath = join(outDir, `${tab.name}.png`);
      await page.screenshot({ path: filePath, fullPage: false });
      console.log(`  Saved: ${filePath}`);
    } catch (err) {
      console.error(`  Error on ${tab.name}: ${err.message}`);
    }
  }

  await browser.close();
  console.log(`\nAll screenshots saved to: ${outDir}`);
}

main().catch(console.error);
