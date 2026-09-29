// Runs browser tests in headless Chrome: unit tests for webview/code.ts, then an end-to-end snap
// (init → code → synthetic paste → save) against the real webview bundle.
import * as esbuild from 'esbuild';
import puppeteer from 'puppeteer-core';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const dir = mkdtempSync(join(tmpdir(), 'snapline-web-'));
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--disable-gpu'] });
const dump = async (file, waitMs = 1500) => {
  const page = await browser.newPage();
  await page.goto(`file://${file}`);
  await new Promise(r => setTimeout(r, waitMs));
  const html = await page.content();
  const log = await page.evaluate(() => window.__log ?? null);
  await page.close();
  return Object.assign(new String(html), { log });
};
const pre = (html, id) => (new RegExp(`<pre id="${id}"[^>]*>([\\s\\S]*?)</pre>`).exec(html)?.[1] ?? '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

await esbuild.build({ entryPoints: ['test/web.test.ts'], bundle: true, outfile: join(dir, 'unit.js'), logLevel: 'warning' });
writeFileSync(join(dir, 'unit.html'), `<pre id="result"></pre><script src="unit.js"></script>`);
const unit = pre(String(await dump(join(dir, 'unit.html'))), 'result');

const e2e = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${readFileSync('dist/webview.css', 'utf8')}</style></head><body>
<script>
  const log = (window.__log = []);
  window.acquireVsCodeApi = () => ({ postMessage(m) {
    log.push(m.type === 'save' ? { type: 'save', bytes: m.dataUrl.length, png: m.dataUrl.startsWith('data:image/png;base64,') } : m);
    if (m.type === 'ready') {
      window.postMessage({ type: 'init', pro: false, settings: { background: 'ocean', padding: 48, lineNumbers: true, windowControls: true, showTitle: true, watermark: false, scale: 2 } }, '*');
      window.postMessage({ type: 'code', text: 'const a = 1;', fileName: 'demo.ts', startLine: 7, languageId: 'typescript' }, '*');
      setTimeout(() => {
        const dt = new DataTransfer();
        dt.setData('text/html', '<div style="color:#ccc;background-color:#1f1f1f;white-space:pre"><div><span style="color:#569cd6">const</span><span style="color:#ccc"> a = </span><span style="color:#b5cea8">1</span><span style="color:#ccc">;</span></div></div>');
        document.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt }));
        setTimeout(() => document.getElementById('save').click(), 100);
      }, 100);
    }
  }});
</script>
<script>${readFileSync('dist/webview.js', 'utf8')}</script></body></html>`;
writeFileSync(join(dir, 'e2e.html'), e2e);
const dom = await dump(join(dir, 'e2e.html'), 3000);
await browser.close();
const log = dom.log ?? [];
const results = unit.split('\n').filter(Boolean);
const check = (name, ok, detail = '') => results.push(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : ` ${detail}`}`);
check('e2e: webview reports ready', log.some(m => m.type === 'ready'));
check('e2e: paste uses highlighted html', log.some(m => m.type === 'pasted' && m.highlighted), JSON.stringify(log));
check('e2e: renders line numbers from startLine', />7<\/span>/.test(String(dom)));
check('e2e: free users keep the watermark even if the setting is off', /<div class="wm" id="wm">/.test(String(dom)));
const save = log.find(m => m.type === 'save');
check('e2e: save produces a PNG', !!save?.png && save.bytes > 5000, JSON.stringify(save));

console.log(results.join('\n'));
const failed = results.filter(r => r.startsWith('FAIL')).length;
console.log(`\n${results.length - failed} passed, ${failed} failed`);
process.exit(failed || results.length < 10 ? 1 : 0);
