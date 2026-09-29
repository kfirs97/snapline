import { toPng, toBlob } from 'html-to-image';
import { dedent, parseHighlightedHtml, plainCode, ParsedCode, Token } from './code';
import { highlight } from './highlight';
import type { FromWebview, SnapSettings, ToWebview } from '../src/protocol';

declare function acquireVsCodeApi(): { postMessage(msg: FromWebview): void };
const vscode = acquireVsCodeApi();
const send = (m: FromWebview) => vscode.postMessage(m);

export const BACKGROUNDS: Record<string, string> = {
  dusk: 'linear-gradient(135deg, #ff6a88 0%, #ff99ac 45%, #fcb69f 100%)',
  ocean: 'linear-gradient(135deg, #2b5876 0%, #4e4376 100%)',
  mint: 'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)',
  candy: 'linear-gradient(135deg, #a18cd1 0%, #fbc2eb 100%)',
  sunrise: 'linear-gradient(135deg, #f6d365 0%, #fda085 100%)',
  midnight: 'linear-gradient(135deg, #0f2027 0%, #203a43 50%, #2c5364 100%)',
  none: 'transparent',
};

let settings: SnapSettings;
let pro = false;
let code: ParsedCode = plainCode('');
let meta = { fileName: '', startLine: 1 };

document.body.innerHTML = `
  <div class="toolbar">
    <div class="swatches" id="swatches"></div>
    <label title="Custom background color (Pro)" class="custom">
      <input type="color" id="customColor"> <span>Custom</span>
    </label>
    <label>Padding <input type="range" id="padding" min="16" max="128" step="8"></label>
    <label><input type="checkbox" id="lineNumbers"> Line numbers</label>
    <label><input type="checkbox" id="windowControls"> Window</label>
    <label><input type="checkbox" id="showTitle"> Title</label>
    <label id="wmLabel" title="Removing the watermark is a Pro feature"><input type="checkbox" id="watermark"> Watermark</label>
    <span class="spacer"></span>
    <button id="copy">Copy</button>
    <button id="save" class="primary">Save PNG</button>
  </div>
  <div class="stage"><div id="snap" class="snap">
    <div class="window" id="window">
      <div class="titlebar" id="titlebar"><span class="dots"><i></i><i></i><i></i></span><span class="title" id="title"></span></div>
      <div class="code" id="code"></div>
    </div>
    <div class="wm" id="wm">⌁ Snapline</div>
  </div></div>
  <div class="hint" id="hint"></div>`;

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const snap = $('snap');

function tokenHtml(t: Token): string {
  const esc = t.text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const style = [
    t.color && `color:${t.color}`,
    t.bold && 'font-weight:bold',
    t.italic && 'font-style:italic',
    (t.underline || t.strike) && `text-decoration:${[t.underline && 'underline', t.strike && 'line-through'].filter(Boolean).join(' ')}`,
  ].filter(Boolean).join(';');
  return style ? `<span style="${style}">${esc}</span>` : esc;
}

function render(): void {
  const bg = settings.background.startsWith('#') ? settings.background : BACKGROUNDS[settings.background] ?? BACKGROUNDS.dusk;
  snap.style.background = bg;
  snap.style.padding = `${settings.padding}px`;
  const win = $('window');
  win.style.background = code.background ?? '#1e1e1e';
  win.style.color = code.foreground ?? '#d4d4d4';
  $('titlebar').hidden = !settings.windowControls && !settings.showTitle;
  win.querySelector<HTMLElement>('.dots')!.hidden = !settings.windowControls;
  $('title').textContent = settings.showTitle ? meta.fileName : '';
  const width = String(meta.startLine + code.lines.length - 1).length;
  $('code').innerHTML = code.lines
    .map((tokens, i) => {
      const num = settings.lineNumbers ? `<span class="ln" style="width:${width}ch">${meta.startLine + i}</span>` : '';
      return `<div class="line">${num}<span class="lc">${tokens.map(tokenHtml).join('') || ' '}</span></div>`;
    })
    .join('');
  $('wm').hidden = pro && !settings.watermark;
  // Swatch + control state
  document.querySelectorAll<HTMLElement>('.swatch').forEach(s => s.classList.toggle('on', s.dataset.bg === settings.background));
  $<HTMLInputElement>('padding').value = String(settings.padding);
  $<HTMLInputElement>('lineNumbers').checked = settings.lineNumbers;
  $<HTMLInputElement>('windowControls').checked = settings.windowControls;
  $<HTMLInputElement>('showTitle').checked = settings.showTitle;
  $<HTMLInputElement>('watermark').checked = !pro || settings.watermark;
  $('wmLabel').classList.toggle('locked', !pro);
  document.querySelector('.custom')!.classList.toggle('locked', !pro);
}

function update(patch: Partial<SnapSettings>): void {
  settings = { ...settings, ...patch };
  send({ type: 'settings', settings });
  render();
}

$('swatches').innerHTML = Object.entries(BACKGROUNDS)
  .map(([name, css]) => `<button class="swatch" data-bg="${name}" title="${name}" style="background:${css === 'transparent' ? 'repeating-conic-gradient(#888 0 25%, #ccc 0 50%) 50% / 10px 10px' : css}"></button>`)
  .join('');
$('swatches').addEventListener('click', e => {
  const bg = (e.target as HTMLElement).dataset.bg;
  if (bg) update({ background: bg });
});
$<HTMLInputElement>('customColor').addEventListener('input', e => {
  if (!pro) return send({ type: 'getPro', feature: 'Custom backgrounds' });
  update({ background: (e.target as HTMLInputElement).value });
});
$<HTMLInputElement>('customColor').addEventListener('click', e => {
  if (!pro) {
    e.preventDefault();
    send({ type: 'getPro', feature: 'Custom backgrounds' });
  }
});
$<HTMLInputElement>('padding').addEventListener('input', e => update({ padding: Number((e.target as HTMLInputElement).value) }));
for (const key of ['lineNumbers', 'windowControls', 'showTitle'] as const) {
  $<HTMLInputElement>(key).addEventListener('change', e => update({ [key]: (e.target as HTMLInputElement).checked }));
}
$<HTMLInputElement>('watermark').addEventListener('change', e => {
  const on = (e.target as HTMLInputElement).checked;
  if (!on && !pro) {
    (e.target as HTMLInputElement).checked = true;
    return send({ type: 'getPro', feature: 'Removing the watermark' });
  }
  update({ watermark: on });
});

const renderOpts = () => ({ pixelRatio: settings.scale, cacheBust: true });
$('save').addEventListener('click', async () => {
  try {
    send({ type: 'save', dataUrl: await toPng(snap, renderOpts()) });
  } catch (e) {
    send({ type: 'error', message: `Could not render the image: ${e}` });
  }
});
$('copy').addEventListener('click', async () => {
  try {
    const blob = await toBlob(snap, renderOpts());
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob! })]);
    send({ type: 'copied' });
  } catch {
    // Some platforms block image clipboard writes from webviews; fall back to saving via the host.
    send({ type: 'copyFallback', dataUrl: await toPng(snap, renderOpts()) });
  }
});

let pendingText = '';
let pendingLanguage = '';
document.addEventListener('paste', e => {
  const html = e.clipboardData?.getData('text/html') ?? '';
  const parsed = html ? parseHighlightedHtml(html) : undefined;
  code = dedent(parsed ?? highlight(pendingText, pendingLanguage));
  render();
  send({ type: 'pasted', highlighted: !!parsed });
  e.preventDefault();
});

window.addEventListener('message', (ev: MessageEvent<ToWebview>) => {
  const m = ev.data;
  if (m.type === 'init') {
    settings = m.settings;
    pro = m.pro;
    render();
  } else if (m.type === 'pro') {
    pro = m.pro;
    render();
  } else if (m.type === 'code') {
    meta = { fileName: m.fileName, startLine: m.startLine };
    pendingText = m.text;
    pendingLanguage = m.languageId;
    code = dedent(highlight(m.text, m.languageId));
    render();
    // The host just copied the selection with syntax highlighting; paste it to pick up the theme colors.
    window.focus();
    document.execCommand('paste');
  }
});

send({ type: 'ready' });
