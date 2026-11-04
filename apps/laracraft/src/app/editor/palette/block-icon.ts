import { HttpClient } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  Injectable,
  InjectionToken,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import type { BlockDefinition } from '@laracraft/core-model';
import { firstValueFrom } from 'rxjs';
import { ATLAS_URL } from '../renderer-loader';

/** The part of `atlas.json` the icons need. */
export interface AtlasInfo {
  readonly width: number;
  readonly height: number;
  readonly textures: Readonly<
    Record<string, { readonly x: number; readonly y: number; readonly w: number }>
  >;
}

/** Loads `atlas.json`; replaced in tests. */
export const ATLAS_LOADER = new InjectionToken<() => Promise<AtlasInfo | null>>('ATLAS_LOADER', {
  providedIn: 'root',
  factory: () => {
    const http = inject(HttpClient);
    return () => firstValueFrom(http.get<AtlasInfo>(ATLAS_URL));
  },
});

/** Texture shown as a block's icon: the side of the block (front for directional blocks). */
export function iconTexture(def: BlockDefinition): string | undefined {
  const t = def.render.textures;
  if (!t) return undefined;
  if ('all' in t) return t.all;
  if ('side' in t) return t.side;
  const faces = t.faces;
  return faces.north ?? faces.side ?? Object.values(faces)[0];
}

/** Shared, lazily loaded atlas metadata for block icons. */
@Injectable({ providedIn: 'root' })
export class BlockIconAtlas {
  private readonly loader = inject(ATLAS_LOADER);
  private readonly atlasSignal = signal<AtlasInfo | null>(null);
  private requested = false;

  readonly atlas = this.atlasSignal.asReadonly();

  load(): void {
    if (this.requested) return;
    this.requested = true;
    this.loader().then(
      (atlas) => this.atlasSignal.set(atlas),
      // Icons are decorative: without the atlas the palette shows names only.
      () => this.atlasSignal.set(null),
    );
  }
}

/** Decorative block icon cut out of the texture atlas (CSS sprite). */
@Component({
  selector: 'lc-block-icon',
  template: '',
  host: {
    'aria-hidden': 'true',
    '[style.background-image]': 'sprite() ? "url(assets/textures/atlas.png)" : null',
    '[style.background-size]': 'sprite()?.size',
    '[style.background-position]': 'sprite()?.position',
  },
  styles: `
    :host {
      display: inline-block;
      flex: none;
      width: var(--lc-icon-size, 2rem);
      height: var(--lc-icon-size, 2rem);
      background-color: var(--lc-border);
      background-repeat: no-repeat;
      border-radius: 0.25rem;
      image-rendering: pixelated;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BlockIcon {
  private readonly icons = inject(BlockIconAtlas);

  readonly block = input.required<BlockDefinition>();

  protected readonly sprite = computed(() => {
    const atlas = this.icons.atlas();
    const name = iconTexture(this.block());
    const tex = name ? atlas?.textures[name] : undefined;
    if (!atlas || !tex) return null;
    // Percentages scale with the element size: the texture fills the box.
    const scale = atlas.width / tex.w;
    const rows = atlas.height / tex.w;
    const pos = (offset: number, count: number) =>
      count <= 1 ? '0%' : `${((offset / tex.w) * 100) / (count - 1)}%`;
    return {
      size: `${scale * 100}% ${rows * 100}%`,
      position: `${pos(tex.x, scale)} ${pos(tex.y, rows)}`,
    };
  });

  constructor() {
    this.icons.load();
  }
}
