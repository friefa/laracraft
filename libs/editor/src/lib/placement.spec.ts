import { registry, st } from '../testing/fixtures';
import type { Pick } from './api';
import { placementStateFor } from './placement';

const pick = (face: Pick['face']): Pick => ({ pos: { x: 0, y: 0, z: 0 }, face });
const place = (state: string, face: Pick['face'], look?: 'north' | 'east' | 'south' | 'west') =>
  placementStateFor(registry, st(state), pick(face), look);

describe('placementStateFor', () => {
  it('keeps the state without a pick or without placement rules', () => {
    expect(placementStateFor(registry, st('minecraft:oak_log[axis=x]'), null, 'east')).toBe(
      st('minecraft:oak_log[axis=x]'),
    );
    expect(place('minecraft:stone', 'east', 'north')).toBe(st('minecraft:stone'));
  });

  it('log axis from clicked face', () => {
    expect(place('minecraft:oak_log', 'north')).toBe(st('minecraft:oak_log[axis=z]'));
    expect(place('minecraft:oak_log[axis=x]', 'up')).toBe(st('minecraft:oak_log[axis=y]'));
  });

  it('stairs: facing from look direction, half from clicked face', () => {
    expect(place('minecraft:oak_stairs', 'up', 'east')).toBe(
      st('minecraft:oak_stairs[facing=east,half=bottom]'),
    );
    expect(place('minecraft:oak_stairs', 'down', 'south')).toBe(
      st('minecraft:oak_stairs[facing=south,half=top]'),
    );
    // Without a look direction the palette facing is kept.
    expect(place('minecraft:oak_stairs[facing=west]', 'up')).toBe(
      st('minecraft:oak_stairs[facing=west]'),
    );
  });

  it('slab type from clicked half', () => {
    expect(place('minecraft:stone_slab', 'down')).toBe(st('minecraft:stone_slab[type=top]'));
    expect(place('minecraft:stone_slab[type=top]', 'up')).toBe(
      st('minecraft:stone_slab[type=bottom]'),
    );
  });

  it('lever: face from clicked face, facing from clicked face on walls else from look', () => {
    expect(place('minecraft:lever', 'east', 'north')).toBe(
      st('minecraft:lever[face=wall,facing=east]'),
    );
    expect(place('minecraft:lever[powered=true]', 'up', 'south')).toBe(
      st('minecraft:lever[face=floor,facing=south,powered=false]'),
    );
    expect(place('minecraft:lever', 'down', 'west')).toBe(
      st('minecraft:lever[face=ceiling,facing=west]'),
    );
  });

  it('doors are placed from the lower half', () => {
    expect(place('minecraft:oak_door[half=upper]', 'up', 'west')).toBe(
      st('minecraft:oak_door[facing=west,half=lower]'),
    );
  });

  it('every registry block yields a registry-valid state for every face/look', () => {
    const faces: Pick['face'][] = ['up', 'down', 'north', 'south', 'east', 'west'];
    for (const def of registry.all()) {
      const state = st(def.id);
      for (const face of faces) {
        for (const look of ['north', 'east', 'south', 'west'] as const) {
          const out = placementStateFor(registry, state, pick(face), look);
          expect(st(out)).toBe(out);
        }
      }
    }
  });
});
