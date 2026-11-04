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
    expect(svg?.querySelector('.fig')).not.toBeNull();
    // v2: ponytail with hair tie, head, dungarees and two arms in every mood.
    expect(svg?.querySelector('.ponytail')).not.toBeNull();
    expect(svg?.querySelector('.hair-tie')).not.toBeNull();
    expect(svg?.querySelector('.head')).not.toBeNull();
    expect(svg?.querySelector('.dungarees')).not.toBeNull();
    expect(svg?.querySelectorAll('.arm').length).toBe(2);
  });

  it('has no hard hat any more', async () => {
    for (const mood of LARA_MOODS) {
      const svg = (await render({ mood })).querySelector('svg');
      expect(svg?.querySelector('.hat')).toBeNull();
      // The old hat was the only yellow-shade shape.
      expect(svg?.innerHTML).not.toContain('--lc-yellow-shade');
    }
  });

  it('draws each mood differently', async () => {
    const drawings = new Set<string>();
    for (const mood of LARA_MOODS) {
      const el = await render({ mood });
      drawings.add((el.querySelector('svg')?.innerHTML ?? '').replace(/<!--.*?-->/g, ''));
    }
    expect(drawings.size).toBe(LARA_MOODS.length);
  });

  it('shows pose details per mood', async () => {
    const wave = await render({ mood: 'wave' });
    expect(wave.querySelectorAll('.wave').length).toBe(1);
    expect((await render({ mood: 'happy' })).querySelector('.wave')).toBeNull();

    const sleep = await render({ mood: 'sleep' });
    expect(sleep.querySelector('.zz')).not.toBeNull();
    expect(sleep.querySelector('.eyes')).toBeNull();
    expect(sleep.querySelector('.head')?.getAttribute('transform')).toContain('rotate');

    for (const mood of ['happy', 'wave', 'think'] as const) {
      expect((await render({ mood })).querySelector('.eyes')).not.toBeNull();
    }
    expect((await render({ mood: 'cheer' })).querySelector('.eyes')).toBeNull();
    expect((await render({ mood: 'cheer' })).querySelector('.sparkles')).not.toBeNull();
    expect((await render({ mood: 'think' })).querySelector('.bubbles')).not.toBeNull();
  });

  it('draws the thinking hand in front of the torso', async () => {
    const children = (el: HTMLElement) =>
      [...(el.querySelector('.fig')?.children ?? [])].map((c) =>
        c.classList.contains('arm') ? 'arm' : c.classList.contains('dungarees') ? 'torso' : '',
      );
    const order = (el: HTMLElement) => children(el).filter(Boolean).join(' ');
    expect(order(await render({ mood: 'happy' }))).toBe('arm arm torso');
    expect(order(await render({ mood: 'think' }))).toBe('arm torso arm');
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

  it('defines no ids, so several instances can share a page', async () => {
    expect((await render()).querySelector('[id]')).toBeNull();
  });
});
