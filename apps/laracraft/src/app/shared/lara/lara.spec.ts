import { TestBed } from '@angular/core/testing';
import { LARA_MOODS, Lara, type LaraMood } from './lara';

async function render(inputs: { mood?: LaraMood; size?: string; label?: string | null } = {}) {
  const fixture = TestBed.createComponent(Lara);
  for (const [key, value] of Object.entries(inputs)) fixture.componentRef.setInput(key, value);
  await fixture.whenStable();
  return fixture.nativeElement as HTMLElement;
}

describe('Lara', () => {
  it.each(LARA_MOODS)('renders the %s mood as an SVG drawing', async (mood) => {
    const el = await render({ mood });
    expect(el.getAttribute('data-mood')).toBe(mood);
    const svg = el.querySelector('svg');
    expect(svg?.getAttribute('viewBox')).toBe('0 0 100 100');
    // Body, hat and face are always there.
    expect(svg?.querySelectorAll('rect').length).toBeGreaterThanOrEqual(5);
    expect(svg?.querySelector('.fig')).not.toBeNull();
  });

  it('draws each mood differently', async () => {
    const drawings = new Set<string>();
    for (const mood of LARA_MOODS) {
      const el = await render({ mood });
      drawings.add(
        (el.querySelector('svg')?.innerHTML ?? '').replace(/<!--.*?-->|lc-lara-clip-\d+/g, ''),
      );
    }
    expect(drawings.size).toBe(LARA_MOODS.length);
  });

  it('shows pose details per mood', async () => {
    expect((await render({ mood: 'wave' })).querySelector('.wave')).not.toBeNull();
    expect((await render({ mood: 'sleep' })).querySelector('.zz')).not.toBeNull();
    expect((await render({ mood: 'sleep' })).querySelector('.eyes')).toBeNull();
    expect((await render({ mood: 'happy' })).querySelector('.eyes')).not.toBeNull();
  });

  it('is decorative by default', async () => {
    const el = await render();
    expect(el.getAttribute('aria-hidden')).toBe('true');
    expect(el.hasAttribute('role')).toBe(false);
    expect(el.hasAttribute('aria-label')).toBe(false);
    expect(el.getAttribute('data-mood')).toBe('happy');
  });

  it('becomes a labelled image when a label is given', async () => {
    const el = await render({ label: 'Lara waves', mood: 'wave', size: '3rem' });
    expect(el.getAttribute('role')).toBe('img');
    expect(el.getAttribute('aria-label')).toBe('Lara waves');
    expect(el.hasAttribute('aria-hidden')).toBe(false);
    expect(el.style.getPropertyValue('--lara-size')).toBe('3rem');
    expect(el.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('uses a unique clip path id per instance', async () => {
    const a = await render();
    const b = await render();
    const id = (el: HTMLElement) => el.querySelector('clipPath')?.id;
    expect(id(a)).toBeTruthy();
    expect(id(a)).not.toBe(id(b));
  });
});
