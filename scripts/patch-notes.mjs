// Render the player-facing patch notes: scripts/patch-notes/notes.tsx → docs/patch-notes/<version>-balance.{html,pdf}.
// Usage: npm run patch-notes   (CHROME=/path/to/chrome to pick the browser)
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createServer } from 'vite';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'docs', 'patch-notes');
mkdirSync(outDir, { recursive: true });

// Load the TSX module (and the game data it imports) through Vite's SSR loader.
const server = await createServer({ root, configFile: false, logLevel: 'error', appType: 'custom', server: { middlewareMode: true } });
let mod;
try {
  mod = await server.ssrLoadModule('/scripts/patch-notes/notes.tsx');
} finally {
  await server.close();
}

const simFile = join(root, 'scripts', 'patch-notes', 'sim.json');
const sim = existsSync(simFile) ? JSON.parse(readFileSync(simFile, 'utf8')) : null;
const fontBase = relative(outDir, join(root, 'node_modules', '@fontsource')).split('\\').join('/');
const html = mod.renderPatchNotes(sim, fontBase);
const base = `${mod.VERSION}-balance`;
const htmlPath = join(outDir, `${base}.html`);
const pdfPath = join(outDir, `${base}.pdf`);
writeFileSync(htmlPath, html);

const candidates = [process.env.CHROME, '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', 'chromium', 'google-chrome'].filter(Boolean);
let done = false;
for (const chrome of candidates) {
  try {
    execFileSync(
      chrome,
      [
        '--headless',
        '--no-sandbox',
        '--disable-gpu',
        '--no-pdf-header-footer',
        '--virtual-time-budget=15000',
        `--print-to-pdf=${pdfPath}`,
        pathToFileURL(htmlPath).href,
      ],
      { stdio: 'ignore' },
    );
    done = true;
    break;
  } catch {
    // Try the next browser.
  }
}
console.log(`HTML: ${relative(root, htmlPath)}`);
console.log(done ? `PDF:  ${relative(root, pdfPath)}` : 'PDF: no Chrome/Chromium found (set CHROME=...)');
