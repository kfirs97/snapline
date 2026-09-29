import hljs from 'highlight.js/lib/common';
import type { ParsedCode, Token } from './code';

/** Dark+-like colors for highlight.js scopes; used when VS Code's themed HTML isn't available. */
const COLORS: Record<string, string> = {
  keyword: '#569cd6', built_in: '#4ec9b0', type: '#4ec9b0', literal: '#569cd6', number: '#b5cea8',
  string: '#ce9178', regexp: '#d16969', comment: '#6a9955', doctag: '#608b4e', meta: '#9b9b9b',
  title: '#dcdcaa', 'title.function': '#dcdcaa', 'title.class': '#4ec9b0', params: '#9cdcfe', variable: '#9cdcfe',
  attr: '#9cdcfe', attribute: '#9cdcfe', property: '#9cdcfe', tag: '#569cd6', name: '#569cd6', 'selector-tag': '#d7ba7d',
  'selector-class': '#d7ba7d', symbol: '#b5cea8', subst: '#d4d4d4', operator: '#d4d4d4', punctuation: '#d4d4d4',
};

/** VS Code language ids that highlight.js names differently. */
const ALIASES: Record<string, string> = {
  typescriptreact: 'typescript', javascriptreact: 'javascript', shellscript: 'bash', jsonc: 'json', csharp: 'csharp', 'objective-c': 'objectivec', dockerfile: 'dockerfile', makefile: 'makefile', vue: 'xml', html: 'xml', svelte: 'xml',
};

export function highlight(text: string, languageId: string): ParsedCode {
  const lang = ALIASES[languageId] ?? languageId;
  const result = hljs.getLanguage(lang) ? hljs.highlight(text, { language: lang, ignoreIllegals: true }) : hljs.highlightAuto(text);
  const container = new DOMParser().parseFromString(`<pre>${result.value}</pre>`, 'text/html').body.firstElementChild!;
  const lines: Token[][] = [[]];
  const walk = (node: Node, color: string | undefined, italic: boolean) => {
    if (node.nodeType === Node.TEXT_NODE) {
      node.textContent!.split('\n').forEach((part, i) => {
        if (i > 0) lines.push([]);
        if (part) lines[lines.length - 1].push({ text: part, color, italic: italic || undefined });
      });
      return;
    }
    if (!(node instanceof HTMLElement)) return;
    const scope = [...node.classList].find(c => c.startsWith('hljs-'))?.slice(5).replace(/_$/, '');
    const key = scope && (COLORS[scope] ? scope : scope.split('.')[0]);
    const c = key && COLORS[key] ? COLORS[key] : color;
    node.childNodes.forEach(child => walk(child, c, italic || scope === 'comment'));
  };
  container.childNodes.forEach(n => walk(n, undefined, false));
  return { lines, background: '#1e1e1e', foreground: '#d4d4d4' };
}
