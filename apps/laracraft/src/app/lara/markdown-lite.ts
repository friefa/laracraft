/**
 * Tiny Markdown subset for Lara's replies: paragraphs with line breaks, `**bold**`,
 * bulleted (`-`, `*`, `•`) and numbered (`1.`) lists. The result is plain data rendered by
 * an Angular template (text interpolation only), so model output can never inject HTML.
 */
export interface Inline {
  readonly text: string;
  readonly bold: boolean;
}

/** One visual line: a run of inline pieces. */
export type Line = readonly Inline[];

export type MdBlock =
  | { readonly kind: 'p'; readonly lines: readonly Line[] }
  | { readonly kind: 'ul' | 'ol'; readonly items: readonly Line[] };

const BULLET = /^\s*[-*•]\s+(.*)$/;
const NUMBERED = /^\s*\d{1,3}[.)]\s+(.*)$/;

/**
 * Splits `**bold**` runs. An unclosed `**` (mid-stream, before the closing marker arrived)
 * makes the rest of the line bold, so streaming text does not flash raw markers.
 */
export function parseInline(text: string): Line {
  const out: Inline[] = [];
  let rest = text;
  for (;;) {
    const start = rest.indexOf('**');
    if (start < 0) break;
    const end = rest.indexOf('**', start + 2);
    if (end < 0) {
      if (start > 0) out.push({ text: rest.slice(0, start), bold: false });
      const tail = rest.slice(start + 2);
      if (tail) out.push({ text: tail, bold: true });
      return out;
    }
    if (start > 0) out.push({ text: rest.slice(0, start), bold: false });
    const bold = rest.slice(start + 2, end);
    if (bold) out.push({ text: bold, bold: true });
    rest = rest.slice(end + 2);
  }
  if (rest) out.push({ text: rest, bold: false });
  return out;
}

export function parseMarkdownLite(text: string): MdBlock[] {
  const blocks: MdBlock[] = [];
  let para: Line[] = [];
  type ListBlock = { kind: 'ul' | 'ol'; items: Line[] };
  // Typed via a cast: TS does not see the closures below resetting it.
  let list = null as ListBlock | null;
  const flushPara = () => {
    if (para.length) blocks.push({ kind: 'p', lines: para });
    para = [];
  };
  const flushList = () => {
    if (list) blocks.push(list);
    list = null;
  };
  for (const raw of text.replace(/\r\n?/g, '\n').split('\n')) {
    const bullet = BULLET.exec(raw);
    const numbered = bullet ? null : NUMBERED.exec(raw);
    const item = bullet ?? numbered;
    if (item) {
      const kind = bullet ? 'ul' : 'ol';
      flushPara();
      if (list?.kind !== kind) {
        flushList();
        list = { kind, items: [] };
      }
      list.items.push(parseInline(item[1] ?? ''));
    } else if (!raw.trim()) {
      flushPara();
      flushList();
    } else {
      flushList();
      para.push(parseInline(raw.trim()));
    }
  }
  flushPara();
  flushList();
  return blocks;
}
