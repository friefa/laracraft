import { createJavaBlockRegistry, type BlockStateString } from '@laracraft/core-model';
import { resolvePaletteRenderInfo, resolveRenderInfo } from './render-info';

const registry = createJavaBlockRegistry();
const info = (s: string) => resolveRenderInfo(registry, s as BlockStateString);

describe('resolveRenderInfo', () => {
  it('resolves air as not rendered and stone as occluding full block', () => {
    expect(info('minecraft:air')).toEqual({
      state: 'minecraft:air',
      shape: 'none',
      layer: 'cutout',
      occludes: false,
    });
    const stone = info('minecraft:stone');
    expect(stone.occludes).toBe(true);
    expect(stone.faces?.north).toBe('stone');
    expect(stone.tint).toBeUndefined();
  });

  it('does not let cutout/translucent or model blocks occlude', () => {
    expect(info('minecraft:glass').occludes).toBe(false);
    expect(info('minecraft:glass').layer).toBe('cutout');
    expect(info('minecraft:ice').layer).toBe('translucent');
    const torch = info('minecraft:torch');
    expect(torch.shape).toBe('model');
    expect(torch.occludes).toBe(false);
    expect(torch.modelId).toBe('torch');
  });

  it('resolves top/bottom/side textures', () => {
    const f = info('minecraft:grass_block[snowy=false]').faces;
    expect(f).toEqual({
      up: 'grass_block_top',
      down: 'dirt',
      north: 'grass_block_side',
      south: 'grass_block_side',
      west: 'grass_block_side',
      east: 'grass_block_side',
    });
  });

  it('rotates furnace faces by horizontal facing', () => {
    for (const facing of ['north', 'east', 'south', 'west'] as const) {
      const f = info(`minecraft:furnace[facing=${facing},lit=false]`).faces;
      expect(f?.[facing]).toBe('furnace_front');
      expect(f?.up).toBe('furnace_top');
      expect(Object.values(f ?? {}).filter((t) => t === 'furnace_side')).toHaveLength(3);
    }
  });

  it('rotates 6-way facing blocks onto up/down', () => {
    const up = info('minecraft:dispenser[facing=up,triggered=false]').faces;
    expect(up?.up).toBe('dispenser_front');
    expect(up?.south).toBe('furnace_top');
    expect(up?.down).toBe('furnace_side');
    const down = info('minecraft:barrel[facing=down,open=false]').faces;
    expect(down?.down).toBe('barrel_top');
    expect(down?.up).toBe('barrel_bottom');
    expect(down?.north).toBe('barrel_side');
    const piston = info('minecraft:piston[extended=false,facing=east]');
    expect(piston.faces?.east).toBe('piston_top');
    expect(piston.faces?.west).toBe('piston_bottom');
  });

  it('places log end textures by axis', () => {
    expect(info('minecraft:oak_log[axis=y]').faces).toMatchObject({
      up: 'oak_log_top',
      north: 'oak_log',
    });
    expect(info('minecraft:oak_log[axis=x]').faces).toMatchObject({
      west: 'oak_log_top',
      east: 'oak_log_top',
      up: 'oak_log',
    });
    expect(info('minecraft:oak_log[axis=z]').faces).toMatchObject({
      north: 'oak_log_top',
      south: 'oak_log_top',
      down: 'oak_log',
    });
  });

  it('assigns tints', () => {
    expect(info('minecraft:grass_block[snowy=false]').tint).toEqual({ up: 'grass' });
    expect(
      info('minecraft:birch_leaves[distance=7,persistent=true,waterlogged=false]').tint?.north,
    ).toBe('foliage');
    expect(info('minecraft:water[level=0]').tint?.up).toBe('water');
    expect(
      info('minecraft:redstone_wire[east=none,north=none,power=7,south=none,west=none]').tint?.up,
    ).toBe('redstone');
  });

  it('renders unknown and malformed states with the missing texture', () => {
    for (const s of ['minecraft:does_not_exist', 'not a state[']) {
      const r = info(s);
      expect(r.shape).toBe('full');
      expect(r.occludes).toBe(true);
      expect(new Set(Object.values(r.faces ?? {}))).toEqual(new Set(['missing']));
    }
  });

  it('resolves a palette index-aligned', () => {
    const list = resolvePaletteRenderInfo(registry, [
      'minecraft:air' as BlockStateString,
      'minecraft:stone' as BlockStateString,
    ]);
    expect(list.map((i) => i.shape)).toEqual(['none', 'full']);
  });
});
