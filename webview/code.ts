/** A run of text with the styling we keep from VS Code's syntax-highlighted copy. */
export interface Token {
  text: string;
  color?: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
}

export interface ParsedCode {
  lines: Token[][];
  background?: string;
  foreground?: string;
}

const SAFE_COLOR = /^(#[0-9a-f]{3,8}|rgba?\([\d\s.,%]+\)|[a-z]+)$/i;
const safeColor = (c: string | null | undefined) => (c && SAFE_COLOR.test(c.trim()) ? c.trim() : undefined);

/**
 * Parses the HTML VS Code puts on the clipboard for "Copy with syntax highlighting":
 * an outer <div> with the theme's colors, one child <div> per line, <span style="color:…"> tokens.
 * Only colors and font styles survive; everything else is dropped, so pasted HTML can't inject markup.
 */
export function parseHighlightedHtml(html: string): ParsedCode | undefined {
  // Parse into an inert document: nothing in it loads or runs (unlike innerHTML on the live page).
  const root = new DOMParser().parseFromString(html, 'text/html').body;
  const outer = [...root.querySelectorAll<HTMLElement>('div')].find(d => d.style.whiteSpace === 'pre' || d.querySelector('div'));
  if (!outer) return undefined;
  const lineEls = [...outer.children].filter((c): c is HTMLElement => c.tagName === 'DIV');
  if (lineEls.length === 0) return undefined;
  const lines = lineEls.map(el => {
    const tokens: Token[] = [];
    const walk = (node: Node, inherited: Omit<Token, 'text'>) => {
      if (node.nodeType === Node.TEXT_NODE) {
        if (node.textContent) tokens.push({ ...inherited, text: node.textContent });
        return;
      }
      if (!(node instanceof HTMLElement)) return;
      if (node.tagName === 'BR') return;
      const s = node.style;
      const style: Omit<Token, 'text'> = {
        ...inherited,
        color: safeColor(s.color) ?? inherited.color,
        bold: s.fontWeight === 'bold' || Number(s.fontWeight) >= 600 || inherited.bold,
        italic: s.fontStyle === 'italic' || inherited.italic,
        underline: s.textDecoration.includes('underline') || inherited.underline,
        strike: s.textDecoration.includes('line-through') || inherited.strike,
      };
      node.childNodes.forEach(c => walk(c, style));
    };
    el.childNodes.forEach(c => walk(c, {}));
    return tokens;
  });
  return { lines, background: safeColor(outer.style.backgroundColor), foreground: safeColor(outer.style.color) };
}

/** Plain text fallback when no highlighted HTML is available. */
export function plainCode(text: string): ParsedCode {
  return { lines: text.replace(/\r\n/g, '\n').split('\n').map(line => (line ? [{ text: line }] : [])) };
}

/** Removes the indentation shared by all non-empty lines, so snaps of nested code start at the left edge. */
export function dedent(code: ParsedCode): ParsedCode {
  const indents = code.lines
    .map(tokens => tokens.map(t => t.text).join(''))
    .filter(l => l.trim())
    .map(l => /^[ \t]*/.exec(l)![0].length);
  const remove = indents.length ? Math.min(...indents) : 0;
  if (!remove) return code;
  const lines = code.lines.map(tokens => {
    let left = remove;
    const out: Token[] = [];
    for (const t of tokens) {
      if (left > 0) {
        const lead = /^[ \t]*/.exec(t.text)![0].length;
        const cut = Math.min(left, lead);
        left -= cut;
        if (t.text.length > cut) out.push({ ...t, text: t.text.slice(cut) });
        if (cut < lead || t.text.length > lead) left = 0;
      } else out.push(t);
    }
    return out;
  });
  return { ...code, lines };
}
