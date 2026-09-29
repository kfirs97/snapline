import { dedent, parseHighlightedHtml, plainCode } from '../webview/code';
import { highlight } from '../webview/highlight';

const results: string[] = [];
const check = (name: string, ok: boolean, detail = '') => results.push(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : ` ${detail}`}`);
const text = (lines: { text: string }[][]) => lines.map(l => l.map(t => t.text).join(''));

// Shape of VS Code's "copy with syntax highlighting" HTML.
const vscodeHtml = `<meta charset='utf-8'><div style="color: #cccccc;background-color: #1f1f1f;font-family: Menlo, monospace;font-weight: normal;font-size: 12px;line-height: 18px;white-space: pre;"><div><span style="color: #569cd6;">const</span><span style="color: #cccccc;"> </span><span style="color: #4fc1ff;">x</span><span style="color: #cccccc;"> = </span><span style="color: #ce9178;">"&lt;b&gt;"</span><span style="color: #cccccc;">;</span></div><br><div><span style="color: #6a9955;font-style: italic;">// note</span></div><div><span style="color: #cccccc;" onclick="alert(1)">  y</span><img src=x onerror="alert(1)"></div></div>`;

let executed = false;
(window as unknown as { alert: () => void }).alert = () => (executed = true);
const parsed = parseHighlightedHtml(vscodeHtml)!;
check('parses lines', JSON.stringify(text(parsed.lines)) === JSON.stringify(['const x = "<b>";', '// note', '  y']), JSON.stringify(text(parsed.lines)));
check('keeps token colors', parsed.lines[0][0].color === 'rgb(86, 156, 214)' || parsed.lines[0][0].color === '#569cd6', String(parsed.lines[0][0].color));
check('keeps italics', parsed.lines[1][0].italic === true);
check('theme background', !!parsed.background && /31|1f1f1f/.test(parsed.background), String(parsed.background));
check('drops attributes/elements', !JSON.stringify(parsed).includes('alert'));
check('non-VS Code html rejected', parseHighlightedHtml('<p>hello</p>') === undefined);

const d = dedent(plainCode('    if (a) {\n      b();\n\n    }'));
check('dedent removes shared indent', JSON.stringify(text(d.lines)) === JSON.stringify(['if (a) {', '  b();', '', '}']), JSON.stringify(text(d.lines)));
const split = dedent({ lines: [[{ text: '  ' }, { text: '  a' }], [{ text: '    b', color: 'red' }]] });
check('dedent across split tokens', JSON.stringify(text(split.lines)) === JSON.stringify(['a', 'b']) && split.lines[1][0].color === 'red', JSON.stringify(split.lines));

const h = highlight('const s = "x"; // hi\nreturn 1;', 'typescript');
check('fallback highlighter keeps lines', JSON.stringify(text(h.lines)) === JSON.stringify(['const s = "x"; // hi', 'return 1;']), JSON.stringify(text(h.lines)));
check('fallback highlighter colors keywords/strings/comments', h.lines[0][0].color === '#569cd6' && h.lines[0].some(t => t.color === '#ce9178') && h.lines[0].some(t => t.color === '#6a9955' && t.italic), JSON.stringify(h.lines[0]));
check('fallback highlighter maps VS Code language ids', highlight('<div a="1"></div>', 'vue').lines[0].some(t => t.color === '#569cd6'));

// Give any (wrongly) live <img onerror> a chance to fire before reporting.
setTimeout(() => {
  check('pasted html never executes', !executed);
  document.getElementById('result')!.textContent = results.join('\n');
}, 300);
