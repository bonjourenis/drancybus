#!/usr/bin/env node
/**
 * Render the PWA icons in public/icons/ from src/app/icon.svg with headless
 * Chrome (no image library needed). Re-run after changing the SVG:
 *
 *   CHROME_PATH="/path/to/chrome" node scripts/generate-icons.mjs
 *
 * "any" icons are the SVG as drawn (rounded corners, transparent outside).
 * "maskable" icons fill the square with the background colour and shrink the
 * drawing into the central safe zone, so Android can crop them to any shape.
 */
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = path.join(ROOT, 'src/app/icon.svg');
const OUT = path.join(ROOT, 'public/icons');
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9400 + Math.floor(Math.random() * 400);
// Content must fit the safe zone: a circle of 40% radius. The drawing's
// bounding box diagonal is ~0.93 of the viewBox, so 0.78 leaves a margin.
const MASKABLE_SCALE = 0.78;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function maskable(svg) {
  const viewBox = svg.match(/viewBox="([^"]+)"/)?.[1] ?? '0 0 64 64';
  const [, , width, height] = viewBox.split(/\s+/).map(Number);
  const background = svg.match(/<rect[^>]*fill="([^"]+)"/)?.[1] ?? '#0A0086';
  const inner = svg.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
  const cx = width / 2;
  const cy = height / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}">
  <rect width="${width}" height="${height}" fill="${background}"/>
  <g transform="translate(${cx} ${cy}) scale(${MASKABLE_SCALE}) translate(${-cx} ${-cy})">${inner}</g>
</svg>`;
}

async function cdp(wsUrl) {
  const ws = new WebSocket(wsUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });
  let id = 0;
  const pending = new Map();
  ws.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      pending.get(message.id)(message);
      pending.delete(message.id);
    }
  });
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const messageId = ++id;
      pending.set(messageId, (m) => (m.error ? reject(new Error(`${method}: ${m.error.message}`)) : resolve(m.result)));
      ws.send(JSON.stringify({ id: messageId, method, params }));
    });
  return { send, close: () => ws.close() };
}

async function render(page, svg, size, file) {
  await page.send('Emulation.setDeviceMetricsOverride', { width: size, height: size, deviceScaleFactor: 1, mobile: false });
  const src = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
  const html = `<!doctype html><html><body style="margin:0;background:transparent"><img src="${src}" width="${size}" height="${size}" style="display:block"></body></html>`;
  await page.send('Page.navigate', { url: `data:text/html;base64,${Buffer.from(html).toString('base64')}` });
  await page.send('Runtime.evaluate', { expression: 'document.images[0].decode()', awaitPromise: true });
  const { data } = await page.send('Page.captureScreenshot', {
    format: 'png',
    clip: { x: 0, y: 0, width: size, height: size, scale: 1 },
  });
  await writeFile(path.join(OUT, file), Buffer.from(data, 'base64'));
  console.log(`  ${file}`);
}

async function main() {
  const svg = await readFile(SOURCE, 'utf8');
  const profile = await mkdtemp(path.join(tmpdir(), 'icons-chrome-'));
  const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, 'about:blank'], {
    stdio: 'ignore',
  });

  try {
    let targets;
    for (let i = 0; i < 50 && !targets; i++) {
      await sleep(200);
      targets = await fetch(`http://127.0.0.1:${PORT}/json/list`).then((r) => r.json()).catch(() => null);
    }
    const target = targets?.find((t) => t.type === 'page');
    if (!target) throw new Error(`Chrome did not start (CHROME_PATH=${CHROME})`);

    const page = await cdp(target.webSocketDebuggerUrl);
    await page.send('Page.enable');
    await page.send('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } });

    console.log(`Rendering ${path.relative(ROOT, SOURCE)} into ${path.relative(ROOT, OUT)}/`);
    for (const size of [192, 512]) {
      await render(page, svg, size, `icon-${size}.png`);
      await render(page, maskable(svg), size, `maskable-${size}.png`);
    }
    page.close();
  } finally {
    chrome.kill();
    await rm(profile, { recursive: true, force: true }).catch(() => {});
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
