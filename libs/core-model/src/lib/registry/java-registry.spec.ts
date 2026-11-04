import {
  JAVA_BLOCKS,
  JAVA_REGISTRY_VERSION,
  collectTextureNames,
  createJavaBlockRegistry,
} from './java-registry';
import { defaultState, resolveBlockState } from './registry';
import { faceSupport, requiredSupport, satisfiesSupport } from './support';
import { parseBlockState } from '../blockstate/blockstate';
import type { BlockDefinition, PlacementSource, SupportRule } from './types';

const registry = createJavaBlockRegistry();

function get(path: string): BlockDefinition {
  const def = registry.get(`minecraft:${path}`);
  if (!def) throw new Error(`missing ${path}`);
  return def;
}

function source(path: string, property: string): PlacementSource | undefined {
  return get(path).placement?.find((r) => r.property === property)?.source;
}

function values(def: BlockDefinition, property: string): readonly string[] {
  return def.properties[property]?.values ?? [];
}

/** Collects (property, value?) references made by a support rule. */
function supportRefs(rule: SupportRule): [string, string | undefined][] {
  switch (rule.kind) {
    case 'facing':
      return [[rule.property, undefined]];
    case 'face':
      return [
        [rule.faceProperty, undefined],
        [rule.facingProperty, undefined],
      ];
    case 'conditional':
      return [
        ...Object.keys(rule.cases).map((v): [string, string] => [rule.property, v]),
        ...Object.values(rule.cases).flatMap(supportRefs),
      ];
    default:
      return [];
  }
}

describe('Java block registry', () => {
  it('creates without throwing and has the expected size', () => {
    expect(() => createJavaBlockRegistry()).not.toThrow();
    expect(registry.version).toBe(JAVA_REGISTRY_VERSION);
    expect(registry.all().length).toBe(JAVA_BLOCKS.length);
    expect(registry.all().length).toBeGreaterThanOrEqual(140);
  });

  it('contains every required block', () => {
    const required = [
      'air', 'stone', 'cobblestone', 'stone_bricks', 'mossy_stone_bricks', 'cracked_stone_bricks',
      'smooth_stone', 'andesite', 'polished_andesite', 'diorite', 'polished_diorite', 'granite',
      'polished_granite', 'deepslate', 'cobbled_deepslate', 'bricks', 'dirt', 'grass_block', 'sand',
      'red_sand', 'gravel', 'clay', 'glass', 'red_stained_glass', 'glass_pane', 'white_wool',
      'gray_wool', 'black_wool', 'red_wool', 'blue_wool', 'white_carpet', 'blue_carpet',
      'white_concrete', 'white_concrete_powder', 'terracotta', 'sandstone', 'sandstone_stairs',
      'sandstone_slab', 'cobblestone_stairs', 'cobblestone_slab', 'cobblestone_wall',
      'stone_brick_stairs', 'stone_brick_slab', 'quartz_block', 'bookshelf', 'crafting_table',
      'furnace', 'chest', 'barrel', 'torch', 'wall_torch', 'lantern', 'glowstone', 'sea_lantern',
      'ladder', 'water', 'lava', 'iron_block', 'gold_block', 'diamond_block', 'obsidian',
      'redstone_wire', 'redstone_torch', 'redstone_wall_torch', 'redstone_block', 'lever',
      'stone_button', 'oak_button', 'stone_pressure_plate', 'repeater', 'comparator', 'piston',
      'sticky_piston', 'piston_head', 'observer', 'dispenser', 'dropper', 'hopper',
      'redstone_lamp', 'note_block', 'target', 'daylight_detector', 'tnt', 'slime_block',
      'honey_block', 'rail', 'powered_rail', 'detector_rail', 'activator_rail', 'iron_door',
      'iron_trapdoor',
    ]; // prettier-ignore
    for (const wood of ['oak', 'spruce', 'birch', 'dark_oak']) {
      for (const part of [
        'log',
        'planks',
        'stairs',
        'slab',
        'fence',
        'fence_gate',
        'door',
        'trapdoor',
      ]) {
        required.push(`${wood}_${part}`);
      }
    }
    const missing = required.filter((p) => !registry.has(`minecraft:${p}`));
    expect(missing).toEqual([]);
  });

  it('resolves every default state', () => {
    for (const def of registry.all()) {
      const res = resolveBlockState(registry, defaultState(def));
      expect(res, def.id).toEqual({ ok: true, state: defaultState(def) });
    }
  });

  it('has consistent ids and name keys', () => {
    for (const def of registry.all()) {
      expect(def.id).toMatch(/^minecraft:[a-z0-9_]+$/);
      expect(def.nameKey).toBe(`block.${def.id.slice('minecraft:'.length)}`);
      expect(def.tags?.length ?? 0, def.id).toBeGreaterThan(0);
    }
  });

  it('only references existing properties and values in rules', () => {
    for (const def of registry.all()) {
      for (const rule of def.placement ?? []) {
        expect(def.properties, `${def.id} placement`).toHaveProperty(rule.property);
      }
      for (const [prop, value] of supportRefs(def.physics.support)) {
        expect(def.properties, `${def.id} support`).toHaveProperty(prop);
        if (value !== undefined) expect(values(def, prop), `${def.id} support`).toContain(value);
      }
      const cbp = def.item?.countByProperty;
      if (cbp) {
        expect(def.properties, `${def.id} cost`).toHaveProperty(cbp.property);
        // every value must have a count, and only existing values may be listed
        expect(Object.keys(cbp.counts).sort(), `${def.id} cost`).toEqual(
          [...values(def, cbp.property)].sort(),
        );
      }
      const primary = def.item?.primaryPart;
      if (primary) expect(values(def, primary.property), def.id).toContain(primary.value);
    }
  });

  it('has consistent render data', () => {
    for (const def of registry.all()) {
      const { render } = def;
      if (render.shape === 'model') expect(render.modelId, def.id).toBeTruthy();
      if (render.shape !== 'none') expect(render.textures, def.id).toBeDefined();
      if (def.category === 'technical' || def.id.endsWith('air')) {
        expect(render.shape, def.id).toBe('none');
        expect(def.item?.count, def.id).toBe(0);
      }
      if (render.lightEmission !== undefined) {
        expect(render.lightEmission).toBeGreaterThanOrEqual(0);
        expect(render.lightEmission).toBeLessThanOrEqual(15);
      }
    }
  });

  it('collects sorted unique texture names', () => {
    const names = collectTextureNames(registry);
    expect(names).toEqual([...new Set(names)].sort());
    expect(names).toContain('oak_planks');
    expect(names).toContain('grass_block_side');
    expect(names).toContain('observer_front');
    expect(names).not.toContain('unused');
    for (const n of names) expect(n).toMatch(/^[a-z0-9_]+$/);
  });

  describe('spot checks', () => {
    it('stairs', () => {
      const d = get('oak_stairs');
      expect(defaultState(d)).toBe(
        'minecraft:oak_stairs[facing=north,half=bottom,shape=straight,waterlogged=false]',
      );
      expect(values(d, 'shape')).toEqual(
        expect.arrayContaining(['inner_left', 'inner_right', 'outer_left', 'outer_right']),
      );
      expect(source('oak_stairs', 'facing')).toBe('playerFacing');
      expect(source('oak_stairs', 'half')).toBe('clickedHalf');
      expect(d.render.modelId).toBe('stairs');
    });

    it('slab double costs 2', () => {
      const d = get('stone_brick_slab');
      expect(d.item?.countByProperty?.counts['double']).toBe(2);
      expect(d.item?.countByProperty?.counts['bottom']).toBe(1);
      expect(source('stone_brick_slab', 'type')).toBe('clickedHalf');
    });

    it('repeater', () => {
      const d = get('repeater');
      expect(defaultState(d)).toBe(
        'minecraft:repeater[delay=1,facing=north,locked=false,powered=false]',
      );
      expect(values(d, 'delay')).toEqual(['1', '2', '3', '4']);
      expect(source('repeater', 'facing')).toBe('playerFacingOpposite');
      expect(source('repeater', 'delay')).toBe('interaction');
      expect(d.physics.support).toEqual({ kind: 'below', needs: 'rigid' });
      expect(d.redstone?.role).toBe('repeater');
    });

    it('comparator', () => {
      expect(defaultState(get('comparator'))).toBe(
        'minecraft:comparator[facing=north,mode=compare,powered=false]',
      );
      expect(source('comparator', 'mode')).toBe('interaction');
    });

    it('observer', () => {
      const d = get('observer');
      expect(d.properties['facing']?.default).toBe('south');
      expect(values(d, 'facing')).toHaveLength(6);
      expect(source('observer', 'facing')).toBe('playerLook3d');
      expect(d.redstone).toEqual({ role: 'observer', triggersOnPlace: true });
    });

    it('piston family', () => {
      for (const p of ['piston', 'sticky_piston', 'dispenser', 'dropper']) {
        expect(source(p, 'facing'), p).toBe('playerLook3dOpposite');
        expect(get(p).redstone?.triggersOnPlace, p).toBe(true);
      }
      const head = get('piston_head');
      expect(head.item).toEqual({ item: 'minecraft:air', count: 0 });
      expect(head.physics.support).toEqual({ kind: 'facing', property: 'facing' });
      expect(values(head, 'type')).toEqual(['normal', 'sticky']);
      expect(get('tnt').redstone?.triggersOnPlace).toBe(true);
      expect(get('redstone_lamp').redstone?.triggersOnPlace).toBeUndefined();
    });

    it('redstone wire', () => {
      const d = get('redstone_wire');
      expect(defaultState(d)).toBe(
        'minecraft:redstone_wire[east=none,north=none,power=0,south=none,west=none]',
      );
      expect(values(d, 'north')).toEqual(['up', 'side', 'none']);
      expect(values(d, 'power')).toHaveLength(16);
      expect(d.item?.item).toBe('minecraft:redstone');
      expect(d.physics.support.kind).toBe('below');
      expect(d.render.modelId).toBe('wire');
    });

    it('wall torches', () => {
      const t = get('wall_torch');
      expect(t.physics.support).toEqual({ kind: 'facing', property: 'facing' });
      expect(source('wall_torch', 'facing')).toBe('clickedFace');
      expect(t.item?.item).toBe('minecraft:torch');
      expect(get('torch').physics.support.kind).toBe('below');
      const r = get('redstone_wall_torch');
      expect(r.item?.item).toBe('minecraft:redstone_torch');
      expect(r.properties['lit']?.default).toBe('true');
    });

    it('lever and buttons', () => {
      for (const p of ['lever', 'stone_button', 'oak_button']) {
        const d = get(p);
        expect(d.physics.support, p).toEqual({
          kind: 'face',
          faceProperty: 'face',
          facingProperty: 'facing',
        });
        expect(values(d, 'face'), p).toEqual(['floor', 'wall', 'ceiling']);
        expect(d.properties['face']?.default, p).toBe('wall');
      }
    });

    it('doors', () => {
      for (const p of ['oak_door', 'iron_door']) {
        const d = get(p);
        expect(defaultState(d)).toBe(
          `minecraft:${p}[facing=north,half=lower,hinge=left,open=false,powered=false]`,
        );
        expect(d.item?.primaryPart).toEqual({ property: 'half', value: 'lower' });
        expect(d.physics.support.kind).toBe('below');
        expect(source(p, 'facing')).toBe('playerFacing');
      }
    });

    it('trapdoor and fence gate', () => {
      expect(defaultState(get('spruce_trapdoor'))).toBe(
        'minecraft:spruce_trapdoor[facing=north,half=bottom,open=false,powered=false,waterlogged=false]',
      );
      expect(defaultState(get('oak_fence_gate'))).toBe(
        'minecraft:oak_fence_gate[facing=north,in_wall=false,open=false,powered=false]',
      );
      expect(source('oak_fence_gate', 'facing')).toBe('playerFacing');
    });

    it('gravity blocks', () => {
      for (const p of ['sand', 'red_sand', 'gravel', 'white_concrete_powder']) {
        expect(get(p).physics, p).toEqual({ gravity: true, support: { kind: 'none' } });
      }
      expect(get('white_concrete').physics.gravity).toBeUndefined();
    });

    it('fluids', () => {
      const w = get('water');
      expect(w.physics.fluid).toBe(true);
      expect(w.render.modelId).toBe('fluid');
      expect(w.render.layer).toBe('translucent');
      expect(w.item?.item).toBe('minecraft:water_bucket');
      expect(w.item?.countByProperty?.counts['0']).toBe(1);
      expect(w.item?.countByProperty?.counts['8']).toBe(0);
      expect(get('lava').item?.item).toBe('minecraft:lava_bucket');
      expect(get('lava').render.lightEmission).toBe(15);
    });

    it('lantern is conditional on hanging', () => {
      expect(get('lantern').physics.support).toEqual({
        kind: 'conditional',
        property: 'hanging',
        cases: {
          true: { kind: 'ceiling', needs: 'center' },
          false: { kind: 'below', needs: 'center' },
        },
      });
    });

    it('ladder', () => {
      const d = get('ladder');
      expect(d.physics.support).toEqual({ kind: 'facing', property: 'facing' });
      expect(defaultState(d)).toBe('minecraft:ladder[facing=north,waterlogged=false]');
    });

    it('logs and pillars use the clicked face axis', () => {
      expect(defaultState(get('spruce_log'))).toBe('minecraft:spruce_log[axis=y]');
      expect(source('spruce_log', 'axis')).toBe('clickedFace');
      expect(source('deepslate', 'axis')).toBe('clickedFace');
    });

    it('connection blocks', () => {
      expect(defaultState(get('cobblestone_wall'))).toBe(
        'minecraft:cobblestone_wall[east=none,north=none,south=none,up=true,waterlogged=false,west=none]',
      );
      expect(defaultState(get('glass_pane'))).toBe(
        'minecraft:glass_pane[east=false,north=false,south=false,waterlogged=false,west=false]',
      );
      expect(source('oak_fence', 'north')).toBe('neighbors');
    });

    it('hopper, chest, note block', () => {
      expect(defaultState(get('hopper'))).toBe('minecraft:hopper[enabled=true,facing=down]');
      expect(values(get('hopper'), 'facing')).not.toContain('up');
      expect(defaultState(get('chest'))).toBe(
        'minecraft:chest[facing=north,type=single,waterlogged=false]',
      );
      expect(values(get('note_block'), 'note')).toHaveLength(25);
      expect(source('note_block', 'note')).toBe('interaction');
    });

    it('rails', () => {
      expect(values(get('rail'), 'shape')).toHaveLength(10);
      expect(values(get('powered_rail'), 'shape')).toHaveLength(6);
      expect(get('detector_rail').physics.support.kind).toBe('below');
    });

    it('render layers and solidity', () => {
      expect(get('stone')).toMatchObject({
        solid: true,
        render: { shape: 'full', layer: 'opaque' },
      });
      expect(get('glass').render.layer).toBe('cutout');
      expect(get('glass').solid).toBe(true);
      expect(get('red_stained_glass').render.layer).toBe('translucent');
      expect(get('oak_leaves').render.layer).toBe('cutout');
      expect(get('oak_leaves').solid).toBe(false);
      expect(get('torch').solid).toBe(false);
      expect(get('air').render.shape).toBe('none');
      expect(get('grass_block').render.textures).toEqual({
        top: 'grass_block_top',
        bottom: 'dirt',
        side: 'grass_block_side',
      });
    });
  });

  describe('face support (P2.0)', () => {
    const reg = createJavaBlockRegistry();
    const at = (state: string, face: 'up' | 'down' | 'north') => {
      const st = parseBlockState(state);
      return faceSupport(reg.get(st.id), st, face);
    };
    it('distinguishes full, rigid, center and none', () => {
      expect(at('minecraft:stone', 'north')).toBe('full');
      expect(at('minecraft:glass', 'north')).toBe('full');
      expect(at('minecraft:oak_leaves', 'up')).toBe('none');
      expect(at('minecraft:oak_fence', 'up')).toBe('center');
      expect(at('minecraft:hopper', 'up')).toBe('rigid');
      expect(at('minecraft:oak_slab[type=bottom]', 'up')).toBe('none');
      expect(at('minecraft:oak_slab[type=top]', 'up')).toBe('full');
      expect(at('minecraft:oak_stairs[half=top]', 'up')).toBe('full');
      expect(at('minecraft:air', 'up')).toBe('none');
    });
    it('matches Java attachment rules', () => {
      const need = (id: string) =>
        requiredSupport(reg.get(id)?.physics.support ?? { kind: 'none' });
      expect(satisfiesSupport('center', need('minecraft:torch'))).toBe(true); // torch on fence
      expect(satisfiesSupport('center', need('minecraft:rail'))).toBe(false);
      expect(satisfiesSupport('rigid', need('minecraft:redstone_wire'))).toBe(true); // wire on hopper
      expect(satisfiesSupport('none', need('minecraft:white_carpet'))).toBe(true);
      expect(satisfiesSupport('rigid', need('minecraft:ladder'))).toBe(false);
    });
  });
});
