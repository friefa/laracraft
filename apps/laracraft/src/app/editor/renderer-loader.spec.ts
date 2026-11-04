import { DEFAULT_SKY, parseHexColor, skyColor } from './renderer-loader';

describe('parseHexColor', () => {
  it('parses long and short hex colours', () => {
    expect(parseHexColor(' #20364a ')).toBe(0x20364a);
    expect(parseHexColor('#fA0')).toBe(0xffaa00);
  });

  it('rejects anything else', () => {
    expect(parseHexColor('')).toBeNull();
    expect(parseHexColor(undefined)).toBeNull();
    expect(parseHexColor('rgb(1 2 3)')).toBeNull();
  });
});

describe('skyColor', () => {
  it('reads the --lc-sky token and falls back to the default', () => {
    const el = document.createElement('div');
    document.body.append(el);
    expect(skyColor(document, el)).toBe(DEFAULT_SKY);
    el.style.setProperty('--lc-sky', '#123456');
    expect(skyColor(document, el)).toBe(0x123456);
    el.remove();
  });
});
