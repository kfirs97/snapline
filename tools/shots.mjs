// Store images: the Snapline panel UI and a real exported snap, rendered by the actual webview bundle.
import puppeteer from 'puppeteer-core';
import { readFileSync, writeFileSync } from 'node:fs';

const CODE = `export async function retry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  for (let i = 1; ; i++) {
    try {
      return await fn();
    } catch (err) {
      if (i >= attempts) throw err;
      // Exponential backoff: 200ms, 400ms, 800ms…
      await sleep(200 * 2 ** (i - 1));
    }
  }
}`;
// Minimal Dark+ style highlighter, only for producing sample clipboard HTML.
const color = { kw: '#569cd6', ctl: '#c586c0', fn: '#dcdcaa', ty: '#4ec9b0', str: '#ce9178', num: '#b5cea8', cm: '#6a9955', id: '#9cdcfe', p: '#d4d4d4' };
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const line = l => {
  if (/^\s*\/\//.test(l)) return `<span style="color:${color.cm}">${esc(l)}</span>`;
  return l.replace(/(\/\/.*$)|\b(export|async|function|let|const|return|await|throw)\b|\b(for|try|catch|if)\b|\b(retry|fn|sleep)\b(?=\s*[<(])|\b(Promise|T)\b|(\d+)|(\w+)|([^\w]+)/g,
    (m, cm, kw, ctl, fn, ty, num, id, p) => {
      const c = cm ? color.cm : kw ? color.kw : ctl ? color.ctl : fn ? color.fn : ty ? color.ty : num ? color.num : id ? color.id : color.p;
      return `<span style="color:${c}">${esc(m)}</span>`;
    });
};
const html = `<div style="color:#d4d4d4;background-color:#1e1e1e;white-space:pre">${CODE.split('\n').map(l => `<div>${line(l)}</div>`).join('')}</div>`;

const page = (vars, pro, settings) => `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>:root{${vars}}</style><style>${readFileSync('dist/webview.css', 'utf8')}</style></head><body><script>
window.__out = null;
window.acquireVsCodeApi = () => ({ postMessage(m) {
  if (m.type === 'save') window.__out = m.dataUrl;
  if (m.type === 'ready') {
    window.postMessage({ type: 'init', pro: ${pro}, settings: ${JSON.stringify(settings)} }, '*');
    window.postMessage({ type: 'code', text: ${JSON.stringify(CODE)}, fileName: 'retry.ts', startLine: 1, languageId: 'typescript' }, '*');
    setTimeout(() => { const dt = new DataTransfer(); dt.setData('text/html', ${JSON.stringify(html)}); document.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt })); }, 50);
  }
}});
</script><script>${readFileSync('dist/webview.js', 'utf8')}</script></body></html>`;

const vars = '--vscode-foreground:#ccc;--vscode-editor-background:#1f1f1f;--vscode-button-background:#0078d4;--vscode-button-foreground:#fff;--vscode-button-secondaryBackground:#313131;--vscode-button-secondaryForeground:#ccc;--vscode-panel-border:#2b2b2b;--vscode-focusBorder:#0078d4;--vscode-font-family:-apple-system,sans-serif;--vscode-font-size:13px;--vscode-editor-font-family:Menlo,monospace';
const settings = { background: 'candy', padding: 56, lineNumbers: false, windowControls: true, showTitle: true, watermark: true, scale: 2 };
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const p = await browser.newPage();
await p.setViewport({ width: 1180, height: 640, deviceScaleFactor: 2 });
await p.setContent(page(vars, false, settings));
await new Promise(r => setTimeout(r, 600));
await p.screenshot({ path: 'media/screenshot-panel.png' });
await p.click('#save');
await p.waitForFunction(() => window.__out, { timeout: 10000 });
writeFileSync('media/example-snap.png', Buffer.from((await p.evaluate(() => window.__out)).split(',')[1], 'base64'));
await browser.close();
console.log('ok');
