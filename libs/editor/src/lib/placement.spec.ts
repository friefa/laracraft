import { AIR } from '@laracraft/core-model';
import { registry, st } from '../testing/fixtures';
import type { Pick } from './api';
import { type LookVertical, placementStateFor, wallVariantPairs } from './placement';

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

describe('placementStateFor: hit point, 3D look, wall variants', () => {
  const side = (face: Pick['face'], y: number): Pick => ({
    pos: { x: 0, y: 0, z: 0 },
    face,
    hit: { x: 0.5, y, z: 0.5 },
  });
  const at = (state: string, p: Pick) => placementStateFor(registry, st(state), p);

  it('side faces use the hit point for the half; top/bottom faces ignore it', () => {
    for (const face of ['north', 'south', 'east', 'west'] as const) {
      expect(at('minecraft:oak_stairs', side(face, 0.7))).toBe(
        st('minecraft:oak_stairs[half=top]'),
      );
      expect(at('minecraft:oak_stairs[half=top]', side(face, 0.3))).toBe(
        st('minecraft:oak_stairs[half=bottom]'),
      );
    }
    expect(at('minecraft:stone_slab', side('east', 0.5))).toBe(
      st('minecraft:stone_slab[type=top]'),
    );
    expect(at('minecraft:oak_trapdoor', side('west', 0.9))).toBe(
      st('minecraft:oak_trapdoor[half=top]'),
    );
    expect(at('minecraft:stone_slab', side('up', 0.9))).toBe(
      st('minecraft:stone_slab[type=bottom]'),
    );
    expect(at('minecraft:stone_slab', side('down', 0.1))).toBe(
      st('minecraft:stone_slab[type=top]'),
    );
    // Without a hit point side faces give the bottom half.
    expect(place('minecraft:stone_slab[type=top]', 'east')).toBe(
      st('minecraft:stone_slab[type=bottom]'),
    );
  });

  it('3D look: steep pitch faces pistons/observers vertically, else horizontally', () => {
    const look = (state: string, h: 'north' | 'east' | undefined, vert?: LookVertical) =>
      placementStateFor(registry, st(state), pick('up'), h, vert);
    // Pistons face away from the player (opposite of the look).
    expect(look('minecraft:piston', 'north', 'down')).toBe(st('minecraft:piston[facing=up]'));
    expect(look('minecraft:piston', 'north', 'up')).toBe(st('minecraft:piston[facing=down]'));
    expect(look('minecraft:piston', 'north', 'level')).toBe(st('minecraft:piston[facing=south]'));
    expect(look('minecraft:sticky_piston', 'east')).toBe(
      st('minecraft:sticky_piston[facing=west]'),
    );
    // Observers face the look direction (registry: `playerLook3d`).
    expect(look('minecraft:observer', 'north', 'down')).toBe(st('minecraft:observer[facing=down]'));
    expect(look('minecraft:observer', 'north', 'up')).toBe(st('minecraft:observer[facing=up]'));
    expect(look('minecraft:observer', 'east', 'level')).toBe(st('minecraft:observer[facing=east]'));
    expect(look('minecraft:dispenser', undefined, 'down')).toBe(
      st('minecraft:dispenser[facing=up]'),
    );
    expect(look('minecraft:barrel', 'east', 'up')).toBe(st('minecraft:barrel[facing=down]'));
    // Neither look keeps the palette facing.
    expect(look('minecraft:dropper[facing=east]', undefined, 'level')).toBe(
      st('minecraft:dropper[facing=east]'),
    );
  });

  it('derives floor/wall pairs from registry ids', () => {
    const { wallOf, floorOf } = wallVariantPairs(registry);
    expect(Object.fromEntries(wallOf)).toEqual({
      'minecraft:torch': 'minecraft:wall_torch',
      'minecraft:redstone_torch': 'minecraft:redstone_wall_torch',
    });
    expect(floorOf.get('minecraft:wall_torch')).toBe('minecraft:torch');
    expect(wallOf.has('minecraft:cobblestone')).toBe(false);
    expect(wallVariantPairs(registry)).toBe(wallVariantPairs(registry));
  });

  it('torches become wall torches facing the clicked side face', () => {
    for (const face of ['north', 'south', 'east', 'west'] as const) {
      expect(place('minecraft:torch', face)).toBe(st(`minecraft:wall_torch[facing=${face}]`));
      expect(place('minecraft:redstone_torch[lit=false]', face)).toBe(
        st(`minecraft:redstone_wall_torch[facing=${face},lit=false]`),
      );
      expect(place('minecraft:wall_torch[facing=north]', face)).toBe(
        st(`minecraft:wall_torch[facing=${face}]`),
      );
    }
    expect(place('minecraft:torch', 'up')).toBe(st('minecraft:torch'));
    expect(place('minecraft:wall_torch[facing=east]', 'up')).toBe(st('minecraft:torch'));
    expect(place('minecraft:redstone_wall_torch', 'up')).toBe(st('minecraft:redstone_torch'));
    expect(place('minecraft:torch', 'down')).toBe(AIR);
    expect(place('minecraft:redstone_wall_torch', 'down')).toBe(AIR);
  });

  it('redstone wire placed as a dot starts as a cross', () => {
    expect(place('minecraft:redstone_wire', 'up')).toBe(
      st('minecraft:redstone_wire[east=side,north=side,south=side,west=side]'),
    );
    expect(place('minecraft:redstone_wire[east=side]', 'up')).toBe(
      st('minecraft:redstone_wire[east=side]'),
    );
  });
});
