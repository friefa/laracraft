import type { BlockStateString } from '@laracraft/core-model';
import { docOf, place, planOf, registry, remove, step, v } from '../../testing';
import type { BuildPlan, PlaceAction, RuleId, ValidationIssue } from '../types';
import { validatePlan } from './validate-plan';

const S = 'minecraft:stone';
const DIRT = 'minecraft:dirt';
const WATER = 'minecraft:water[level=0]';

type Blocks = Parameters<typeof docOf>[0];

const validate = (blocks: Blocks, plan: BuildPlan, groundY?: number) =>
  validatePlan(docOf(blocks), registry, plan, groundY === undefined ? {} : { groundY });
const rules = (issues: readonly ValidationIssue[]): RuleId[] => issues.map((i) => i.rule);

describe('validatePlan', () => {
  describe('completeness', () => {
    it('accepts a plan that places every block exactly', () => {
      expect(validate([[0, 0, 0, S]], planOf(step('structure', place(v(0, 0, 0), S))))).toEqual([]);
    });

    it('reports a block that is never placed (step -1)', () => {
      const issues = validate(
        [
          [0, 0, 0, S],
          [1, 0, 0, S],
        ],
        planOf(step('structure', place(v(0, 0, 0), S))),
      );
      expect(issues).toHaveLength(1);
      expect(issues[0]).toMatchObject({
        rule: 'completeness',
        step: -1,
        action: -1,
        pos: v(1, 0, 0),
      });
    });

    it('reports a block that is not part of the build', () => {
      const issues = validate(
        [[0, 0, 0, S]],
        planOf(step('structure', place(v(0, 0, 0), S), place(v(1, 0, 0), S))),
      );
      expect(issues).toEqual([
        expect.objectContaining({ rule: 'completeness', step: 0, action: 1 }),
      ]);
    });

    it('reports a wrong state', () => {
      const issues = validate(
        [[0, 0, 0, S]],
        planOf(step('structure', place(v(0, 0, 0), 'minecraft:cobblestone'))),
      );
      expect(rules(issues)).toEqual(['completeness']);
    });

    it('reports placing into an occupied position', () => {
      const issues = validate(
        [[0, 0, 0, S]],
        planOf(step('structure', place(v(0, 0, 0), S), place(v(0, 0, 0), S))),
      );
      expect(issues).toEqual([
        expect.objectContaining({
          rule: 'completeness',
          action: 1,
          message: expect.stringContaining('occupied'),
        }),
      ]);
    });

    it('reports a non-canonical state string', () => {
      const action: PlaceAction = {
        ...place(v(0, 0, 0), 'minecraft:oak_log[axis=y]'),
        state: 'minecraft:oak_log' as BlockStateString,
      };
      const issues = validate(
        [[0, 0, 0, 'minecraft:oak_log[axis=y]']],
        planOf(step('structure', action)),
      );
      expect(issues[0]).toMatchObject({ rule: 'completeness', step: 0, action: 0 });
    });

    it('treats flowing water as optional once its source is placed', () => {
      const blocks: Blocks = [
        [0, 0, 0, S],
        [0, 1, 0, WATER],
        [1, 1, 0, 'minecraft:water[level=1]'],
      ];
      const stone = step('structure', place(v(0, 0, 0), S));
      const water = step('fluids', place(v(0, 1, 0), WATER, { standAt: v(0, 0, 2) }));
      expect(validate(blocks, planOf(stone, water))).toEqual([]);
      expect(validate(blocks, planOf(stone)).map((i) => i.pos)).toEqual([v(0, 1, 0), v(1, 1, 0)]);
    });

    it('places the upper door half implicitly and rejects placing it explicitly', () => {
      const lower = 'minecraft:oak_door[facing=north,half=lower]';
      const upper = 'minecraft:oak_door[facing=north,half=upper]';
      const blocks: Blocks = [
        [0, 0, 0, S],
        [0, 1, 0, lower],
        [0, 2, 0, upper],
      ];
      const base = [place(v(0, 0, 0), S), place(v(0, 1, 0), lower, { standAt: v(0, 0, 2) })];
      expect(validate(blocks, planOf(step('structure', ...base)))).toEqual([]);
      const explicit = place(v(0, 2, 0), upper, {
        standAt: v(0, 0, 2),
        clickOn: { pos: v(0, 1, 0), face: 'up' },
      });
      const issues = validate(blocks, planOf(step('structure', ...base, explicit)));
      expect(issues).toEqual([
        expect.objectContaining({
          rule: 'completeness',
          action: 2,
          message: expect.stringContaining('implicitly'),
        }),
      ]);
    });
  });

  describe('support', () => {
    const torch = 'minecraft:wall_torch[facing=east]';
    const torchOnStone = place(v(1, 0, 0), torch, {
      clickOn: { pos: v(0, 0, 0), face: 'east' },
      standAt: v(1, 0, 2),
    });

    it('accepts a wall torch placed after its wall', () => {
      const blocks: Blocks = [
        [0, 0, 0, S],
        [1, 0, 0, torch],
      ];
      expect(
        validate(blocks, planOf(step('structure', place(v(0, 0, 0), S), torchOnStone))),
      ).toEqual([]);
    });

    it('rejects a wall torch placed before its wall', () => {
      const blocks: Blocks = [
        [0, 0, 0, S],
        [1, 0, 0, torch],
      ];
      const issues = validate(
        blocks,
        planOf(step('structure', torchOnStone, place(v(0, 0, 0), S))),
      );
      expect(rules(issues)).toContain('support');
      expect(issues.find((i) => i.rule === 'support')).toMatchObject({ step: 0, action: 0 });
    });

    it('checks the strength of the supporting face (torch on a fence ok, dust not)', () => {
      const fence = 'minecraft:oak_fence';
      const onFence = (state: string) =>
        validate(
          [
            [0, 0, 0, fence],
            [0, 1, 0, state],
          ],
          planOf(
            step(
              'structure',
              place(v(0, 0, 0), fence),
              place(v(0, 1, 0), state, { standAt: v(0, 0, 2) }),
            ),
          ),
        );
      expect(onFence('minecraft:torch')).toEqual([]);
      expect(rules(onFence('minecraft:redstone_wire'))).toEqual(['support']);
    });

    it('rejects removing the block an attachment hangs on', () => {
      const issues = validate(
        [[1, 0, 0, torch]],
        planOf(
          step('structure', place(v(0, 0, 0), DIRT, { temporary: true }), torchOnStone),
          step('cleanup', remove(v(0, 0, 0), DIRT)),
        ),
      );
      expect(issues).toEqual([expect.objectContaining({ rule: 'support', step: 1, action: 0 })]);
    });

    it('resolves conditional support (hanging lantern needs a ceiling)', () => {
      const lantern = 'minecraft:lantern[hanging=true]';
      const issues = validate(
        [[0, 0, 0, lantern]],
        planOf(
          step(
            'structure',
            place(v(0, 0, 0), lantern, { clickOn: { pos: v(0, 1, 0), face: 'down' } }),
          ),
        ),
      );
      expect(rules(issues)).toContain('support');
    });
  });

  describe('gravity', () => {
    it('accepts sand on the ground', () => {
      expect(
        validate(
          [[0, 0, 0, 'minecraft:sand']],
          planOf(step('structure', place(v(0, 0, 0), 'minecraft:sand'))),
        ),
      ).toEqual([]);
    });

    it('rejects sand placed over air', () => {
      const issues = validate(
        [
          [0, 0, 0, S],
          [0, 1, 0, S],
          [1, 1, 0, 'minecraft:sand'],
        ],
        planOf(
          step(
            'structure',
            place(v(0, 0, 0), S),
            place(v(0, 1, 0), S, { standAt: v(0, 0, 2) }),
            place(v(1, 1, 0), 'minecraft:sand', {
              clickOn: { pos: v(0, 1, 0), face: 'east' },
              standAt: v(1, 0, 2),
            }),
          ),
        ),
      );
      expect(issues).toEqual([expect.objectContaining({ rule: 'gravity', action: 2 })]);
    });

    it('rejects removing a temporary support under sand', () => {
      const issues = validate(
        [[0, 1, 0, 'minecraft:sand']],
        planOf(
          step(
            'structure',
            place(v(0, 0, 0), DIRT, { temporary: true }),
            place(v(0, 1, 0), 'minecraft:sand', { standAt: v(0, 0, 2) }),
          ),
          step('cleanup', remove(v(0, 0, 0), DIRT)),
        ),
        -1, // the build starts at y=1; the terrain stays at y=-1
      );
      expect(issues).toEqual([expect.objectContaining({ rule: 'gravity', step: 1 })]);
    });
  });

  describe('click-target', () => {
    it('rejects clicking a block that does not exist yet', () => {
      const issues = validate(
        [
          [0, 0, 0, S],
          [0, 1, 0, S],
        ],
        planOf(
          step('structure', place(v(0, 1, 0), S, { standAt: v(0, 0, 2) }), place(v(0, 0, 0), S)),
        ),
      );
      expect(issues).toEqual([expect.objectContaining({ rule: 'click-target', action: 0 })]);
    });

    it('rejects a face that does not point to the new block', () => {
      const issues = validate(
        [[0, 0, 0, S]],
        planOf(
          step('structure', place(v(0, 0, 0), S, { clickOn: { pos: v(0, -1, 0), face: 'south' } })),
        ),
      );
      expect(rules(issues)).toEqual(['click-target']);
    });

    it('rejects clicking a fluid', () => {
      const issues = validate(
        [
          [0, 0, 0, WATER],
          [1, 0, 0, S],
        ],
        planOf(
          step('fluids', place(v(0, 0, 0), WATER)),
          step(
            'structure',
            place(v(1, 0, 0), S, {
              clickOn: { pos: v(0, 0, 0), face: 'east' },
              standAt: v(1, 0, 2),
            }),
          ),
        ),
      );
      expect(issues).toContainEqual(
        expect.objectContaining({
          rule: 'click-target',
          message: expect.stringContaining('fluid'),
        }),
      );
    });

    it('requires sneaking to place against an interactive block', () => {
      const chest = 'minecraft:chest[facing=south]';
      const blocks: Blocks = [
        [0, 0, 0, chest],
        [0, 1, 0, S],
      ];
      const plan = (sneak: boolean) =>
        planOf(
          step(
            'structure',
            place(v(0, 0, 0), chest),
            place(v(0, 1, 0), S, { standAt: v(0, 0, 2), sneak }),
          ),
        );
      expect(rules(validate(blocks, plan(false)))).toEqual(['click-target']);
      expect(validate(blocks, plan(true))).toEqual([]);
    });
  });

  describe('orientation', () => {
    const stairs = 'minecraft:oak_stairs[facing=north,half=bottom]';

    it('accepts stairs placed looking in their facing direction', () => {
      expect(
        validate([[0, 0, 0, stairs]], planOf(step('structure', place(v(0, 0, 0), stairs)))),
      ).toEqual([]);
    });

    it('rejects stairs placed with the wrong look direction', () => {
      const issues = validate(
        [[0, 0, 0, stairs]],
        planOf(step('structure', place(v(0, 0, 0), stairs, { look: { horizontal: 'east' } }))),
      );
      // Wrong facing, and "east" is not even achievable while aiming at that face.
      expect(rules(issues)).toEqual(['orientation', 'orientation']);
    });

    it('derives slab type from the clicked half', () => {
      const slab = 'minecraft:oak_slab[type=top]';
      const blocks: Blocks = [
        [0, 0, 0, S],
        [1, 0, 0, slab],
      ];
      const plan = (o: Parameters<typeof place>[2]) =>
        planOf(
          step(
            'structure',
            place(v(0, 0, 0), S),
            place(v(1, 0, 0), slab, { standAt: v(1, 0, 2), ...o }),
          ),
        );
      const side = { pos: v(0, 0, 0), face: 'east' } as const;
      expect(validate(blocks, plan({ clickOn: side, clickHalf: 'top' }))).toEqual([]);
      expect(rules(validate(blocks, plan({ clickOn: side, clickHalf: 'bottom' })))).toEqual([
        'orientation',
      ]);
      // Clicking a top face always gives a bottom slab.
      expect(rules(validate(blocks, plan({ clickHalf: 'top' })))).toEqual(['orientation']);
    });

    it('derives wall torch facing from the clicked face', () => {
      const torch = 'minecraft:wall_torch[facing=east]';
      const issues = validate(
        [
          [0, 0, 0, S],
          [1, 0, -1, S],
          [1, 0, 0, torch],
        ],
        planOf(
          step(
            'structure',
            place(v(0, 0, 0), S),
            place(v(1, 0, -1), S),
            place(v(1, 0, 0), torch, {
              clickOn: { pos: v(1, 0, -1), face: 'south' },
              standAt: v(1, 0, 2),
            }),
          ),
        ),
      );
      expect(issues).toEqual([expect.objectContaining({ rule: 'orientation', action: 2 })]);
    });

    it('rejects a standing torch placed by clicking a side face', () => {
      const issues = validate(
        [
          [0, 0, 0, S],
          [1, 0, 0, 'minecraft:torch'],
        ],
        planOf(
          step(
            'structure',
            place(v(0, 0, 0), S),
            place(v(1, 0, 0), 'minecraft:torch', {
              clickOn: { pos: v(0, 0, 0), face: 'east' },
              standAt: v(1, 0, 2),
            }),
          ),
        ),
      );
      expect(issues).toEqual([
        expect.objectContaining({
          rule: 'orientation',
          message: expect.stringContaining('wall variant'),
        }),
      ]);
    });

    it('uses the 3D look direction for observers', () => {
      const observer = 'minecraft:observer[facing=down]';
      const plan = (vertical: 'down' | 'level') =>
        planOf(
          step(
            'structure',
            place(v(0, 0, 0), observer, {
              standAt: v(0, 0, 1),
              look: { horizontal: 'north', vertical },
            }),
          ),
        );
      expect(validate([[0, 0, 0, observer]], plan('down'))).toEqual([]);
      expect(rules(validate([[0, 0, 0, observer]], plan('level')))).toEqual([
        'orientation',
        'orientation',
      ]);
    });

    it('points pistons towards the player and keeps them retracted', () => {
      const plan = (state: string) =>
        planOf(
          step(
            'structure',
            place(v(0, 0, 0), state, {
              standAt: v(0, 0, 3),
              look: { horizontal: 'north', vertical: 'level' },
            }),
          ),
        );
      const ok = 'minecraft:piston[extended=false,facing=south]';
      expect(validate([[0, 0, 0, ok]], plan(ok))).toEqual([]);
      const wrong = 'minecraft:piston[extended=false,facing=north]';
      expect(rules(validate([[0, 0, 0, wrong]], plan(wrong)))).toEqual(['orientation']);
      const extended = 'minecraft:piston[extended=true,facing=south]';
      expect(rules(validate([[0, 0, 0, extended]], plan(extended)))).toEqual(['orientation']);
    });

    it('counts interactions for repeater delay and comparator mode', () => {
      const check = (state: string, interactions: number) =>
        validate(
          [
            [0, 0, 0, S],
            [0, 1, 0, state],
          ],
          planOf(
            step(
              'structure',
              place(v(0, 0, 0), S),
              place(v(0, 1, 0), state, { standAt: v(0, 0, 2), interactions }),
            ),
          ),
        );
      expect(check('minecraft:repeater[delay=3,facing=south]', 2)).toEqual([]);
      expect(rules(check('minecraft:repeater[delay=3,facing=south]', 0))).toEqual(['orientation']);
      expect(check('minecraft:comparator[facing=south,mode=subtract]', 1)).toEqual([]);
      expect(rules(check('minecraft:comparator[facing=south,mode=subtract]', 2))).toEqual([
        'orientation',
      ]);
    });

    it('applies conditional rules (lever on a wall faces away from it)', () => {
      const lever = (facing: string) => `minecraft:lever[face=wall,facing=${facing}]`;
      const check = (facing: string) =>
        validate(
          [
            [0, 0, 0, S],
            [1, 0, 0, lever(facing)],
          ],
          planOf(
            step('structure', place(v(0, 0, 0), S)),
            step(
              'power',
              place(v(1, 0, 0), lever(facing), {
                clickOn: { pos: v(0, 0, 0), face: 'east' },
                standAt: v(1, 0, 2),
              }),
            ),
          ),
        );
      expect(check('east')).toEqual([]);
      expect(rules(check('north'))).toContain('orientation');
    });
  });

  describe('reachability', () => {
    it('rejects a clicked face out of reach', () => {
      const issues = validate(
        [[0, 0, 0, S]],
        planOf(step('structure', place(v(0, 0, 0), S, { standAt: v(0, 0, 8) }))),
      );
      expect(rules(issues)).toEqual(['reachability']);
    });

    it('rejects standing inside a block', () => {
      const issues = validate(
        [
          [0, 0, 0, S],
          [0, 0, 2, S],
        ],
        planOf(
          step('structure', place(v(0, 0, 2), S, { standAt: v(0, 0, 4) }), place(v(0, 0, 0), S)),
        ),
      );
      expect(issues).toEqual([expect.objectContaining({ rule: 'reachability', action: 1 })]);
    });

    it('rejects standing on air', () => {
      const issues = validate(
        [[0, 0, 0, S]],
        planOf(step('structure', place(v(0, 0, 0), S, { standAt: v(0, 1, 2) }))),
      );
      expect(rules(issues)).toEqual(['reachability']);
    });

    it('rejects clicking a face that points away from the player', () => {
      const issues = validate(
        [
          [0, 0, 0, S],
          [1, 0, 0, S],
        ],
        planOf(
          step(
            'structure',
            place(v(0, 0, 0), S),
            place(v(1, 0, 0), S, {
              clickOn: { pos: v(0, 0, 0), face: 'east' },
              standAt: v(-2, 0, 0),
            }),
          ),
        ),
      );
      expect(rules(issues)).toEqual(['reachability']);
    });

    it('rejects placing a full block into the player', () => {
      const issues = validate(
        [[0, 0, 0, S]],
        planOf(step('structure', place(v(0, 0, 0), S, { standAt: v(0, 0, 0) }))),
      );
      expect(rules(issues)).toEqual(['reachability']);
    });
  });

  describe('redstone-safety', () => {
    const lever = 'minecraft:lever[face=floor,facing=north]';

    it('allows power sources only from the power phase on', () => {
      expect(validate([[0, 0, 0, lever]], planOf(step('power', place(v(0, 0, 0), lever))))).toEqual(
        [],
      );
      expect(
        rules(validate([[0, 0, 0, lever]], planOf(step('structure', place(v(0, 0, 0), lever))))),
      ).toEqual(['redstone-safety']);
    });

    it('rejects a piston placed next to an existing power source', () => {
      const piston = 'minecraft:piston[facing=south]';
      const blocks: Blocks = [
        [0, 0, 0, 'minecraft:redstone_block'],
        [1, 0, 0, piston],
      ];
      const pistonAction = place(v(1, 0, 0), piston, {
        standAt: v(1, 0, 3),
        look: { horizontal: 'north', vertical: 'level' },
      });
      const block = place(v(0, 0, 0), 'minecraft:redstone_block');
      expect(
        validate(blocks, planOf(step('redstone', pistonAction), step('power', block))),
      ).toEqual([]);
      expect(validate(blocks, planOf(step('power', block, pistonAction)))).toEqual([
        expect.objectContaining({ rule: 'redstone-safety', action: 1 }),
      ]);
    });

    it('places observers after the block they watch', () => {
      const observer = 'minecraft:observer[facing=west]';
      const blocks: Blocks = [
        [0, 0, 0, S],
        [1, 0, 0, observer],
      ];
      const obs = place(v(1, 0, 0), observer, {
        standAt: v(4, 0, 0),
        look: { horizontal: 'west', vertical: 'level' },
      });
      const stone = place(v(0, 0, 0), S);
      expect(validate(blocks, planOf(step('structure', stone), step('redstone', obs)))).toEqual([]);
      expect(
        rules(validate(blocks, planOf(step('redstone', obs), step('structure', stone)))),
      ).toEqual(['redstone-safety']);
    });
  });

  describe('fluids-last', () => {
    it('rejects fluids outside the fluids phase', () => {
      expect(
        rules(validate([[0, 0, 0, WATER]], planOf(step('structure', place(v(0, 0, 0), WATER))))),
      ).toEqual(['fluids-last']);
    });

    it('rejects blocks placed after the first fluid', () => {
      const issues = validate(
        [
          [0, 0, 0, WATER],
          [2, 0, 0, S],
        ],
        planOf(step('fluids', place(v(0, 0, 0), WATER)), step('structure', place(v(2, 0, 0), S))),
      );
      expect(issues).toEqual([expect.objectContaining({ rule: 'fluids-last', step: 1 })]);
    });

    it('allows cleanup removals only away from fluids', () => {
      const check = (x: number) =>
        validate(
          [[0, 0, 0, WATER]],
          planOf(
            step('structure', place(v(x, 0, 0), DIRT, { temporary: true })),
            step('fluids', place(v(0, 0, 0), WATER)),
            step('cleanup', remove(v(x, 0, 0), DIRT)),
          ),
        );
      expect(check(3)).toEqual([]);
      expect(check(1)).toEqual([expect.objectContaining({ rule: 'fluids-last', step: 2 })]);
    });
  });

  describe('temporary-cleanup', () => {
    const blocks: Blocks = [[0, 0, 0, S]];
    const stone = place(v(0, 0, 0), S);
    const temp = place(v(3, 0, 0), DIRT, { temporary: true });

    it('accepts temporary blocks that are removed again', () => {
      expect(
        validate(
          blocks,
          planOf(step('structure', stone, temp), step('cleanup', remove(v(3, 0, 0), DIRT))),
        ),
      ).toEqual([]);
    });

    it('reports a temporary block that is never removed, at its placement', () => {
      expect(validate(blocks, planOf(step('structure', stone, temp)))).toEqual([
        expect.objectContaining({ rule: 'temporary-cleanup', step: 0, action: 1, pos: v(3, 0, 0) }),
      ]);
    });

    it('rejects removing a non-temporary block', () => {
      const issues = validate(
        blocks,
        planOf(step('structure', stone), step('cleanup', remove(v(0, 0, 0), S))),
      );
      expect(rules(issues)).toEqual(['temporary-cleanup']);
    });

    it('rejects removals with a mismatching state or of nothing', () => {
      const mismatch = validate(
        blocks,
        planOf(
          step('structure', stone, temp),
          step('cleanup', remove(v(3, 0, 0), 'minecraft:cobblestone')),
        ),
      );
      expect(rules(mismatch)).toEqual(['temporary-cleanup']);
      const nothing = validate(
        blocks,
        planOf(step('structure', stone), step('cleanup', remove(v(5, 0, 0), DIRT))),
      );
      expect(rules(nothing)).toEqual(['temporary-cleanup']);
    });
  });

  describe('scale', () => {
    it('validates a 100×100 floor quickly', () => {
      const blocks: [number, number, number, string][] = [];
      const actions: PlaceAction[] = [];
      for (let z = 0; z < 100; z++) {
        for (let x = 0; x < 100; x++) {
          blocks.push([x, 0, z, S]);
          // Stand on the not yet built row behind (south of) the block.
          actions.push(place(v(x, 0, z), S, { standAt: v(x, 0, z + 1) }));
        }
      }
      const doc = docOf(blocks);
      const t0 = performance.now();
      const issues = validatePlan(doc, registry, planOf(step('structure', ...actions)));
      expect(issues).toEqual([]);
      expect(performance.now() - t0).toBeLessThan(2000);
    });
  });
});
