import { parseInline, parseMarkdownLite } from './markdown-lite';

describe('markdown-lite', () => {
  it('parses bold runs; an unclosed marker (mid-stream) bolds the rest', () => {
    expect(parseInline('a **b** c')).toEqual([
      { text: 'a ', bold: false },
      { text: 'b', bold: true },
      { text: ' c', bold: false },
    ]);
    expect(parseInline('streaming **hal')).toEqual([
      { text: 'streaming ', bold: false },
      { text: 'hal', bold: true },
    ]);
    expect(parseInline('a **')).toEqual([{ text: 'a ', bold: false }]);
    expect(parseInline('')).toEqual([]);
  });

  it('splits paragraphs, line breaks and lists', () => {
    const blocks = parseMarkdownLite(
      'Klar! Ich baue dir\neine **Mauer**.\n\n- 12 lang\n* 4 hoch\n1. erst\n2) dann\nEnde',
    );
    expect(blocks.map((b) => b.kind)).toEqual(['p', 'ul', 'ol', 'p']);
    const first = blocks[0];
    expect(first?.kind === 'p' && first.lines).toHaveLength(2);
    const ul = blocks[1];
    expect(ul?.kind === 'ul' && ul.items.map((i) => i[0]?.text)).toEqual(['12 lang', '4 hoch']);
    const ol = blocks[2];
    expect(ol?.kind === 'ol' && ol.items).toHaveLength(2);
  });

  it('never produces markup: HTML stays text', () => {
    const blocks = parseMarkdownLite('<img src=x onerror=alert(1)> **<b>hi</b>**');
    expect(blocks).toEqual([
      {
        kind: 'p',
        lines: [
          [
            { text: '<img src=x onerror=alert(1)> ', bold: false },
            { text: '<b>hi</b>', bold: true },
          ],
        ],
      },
    ]);
  });
});
