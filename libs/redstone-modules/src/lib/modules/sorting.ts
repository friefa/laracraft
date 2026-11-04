import { LocalBuilder, defineModule, moduleKey, wire } from '../define';

const STONE = 'minecraft:stone';

export type SorterStackSize = '64' | '16';

/**
 * How to load the filter hopper of {@link ITEM_SORTER} (Java Edition comparator math).
 *
 * The comparator reads the filter hopper as `floor(1 + 14 · fullness)` with
 * `fullness = Σ(count / maxStack) / 5`. The signal reaches the torch block through three
 * dusts, so it must be 2 at rest and 3 with one extra sorted item:
 * - items stacking to 64: 41 sorted items in slot 1 + 1 filler in each other slot
 *   (45 items → 2, 46 → 3);
 * - items stacking to 16: 10 sorted items + 4 fillers ((10 + 1)/16 → 2, (11 + 1)/16 → 3).
 * Fillers must never reach the hopper line and stack to 64 (e.g. renamed sticks).
 * Unstackable items cannot be sorted with this design.
 */
export function sorterFilterLoadout(stackSize: SorterStackSize): {
  readonly sortItems: number;
  readonly fillerSlots: number;
  readonly fillerPerSlot: number;
} {
  return { sortItems: stackSize === '64' ? 41 : 10, fillerSlots: 4, fillerPerSlot: 1 };
}

/** Comparator output for a hopper holding the given counts (each entry one slot). */
export function hopperComparatorSignal(
  slots: readonly { count: number; maxStack: number }[],
): number {
  const fullness = slots.reduce((sum, s) => sum + s.count / s.maxStack, 0) / 5;
  if (fullness <= 0) return 0;
  return Math.floor(1 + fullness * 14);
}

/**
 * Single-item hopper sorter with overflow (Java Edition).
 *
 * Design: the classic comparator hopper sorter. Items travel along the hopper line on top
 * (L0 → L1 → overflow chest). The filter hopper F under L1 is pre-loaded so that it only
 * accepts the sorted item and reads signal 2. A redstone torch under F keeps F locked.
 * When F receives one more sorted item the comparator outputs 3; after three dusts
 * (3 → 2 → 1) block Bk is powered, the torch on it turns off, F passes one item into the
 * output chest, the signal drops back to 2 and the torch locks F again. The filter count
 * therefore never changes and non-matching items pass on to the overflow chest.
 *
 * The `stackSize` parameter does not change any block; it selects the filter loadout
 * returned by {@link sorterFilterLoadout} (41 items for 64-stacks, 10 for 16-stacks).
 *
 * References:
 * - https://minecraft.wiki/w/Tutorials/Hopper (item sorter)
 * - https://minecraft.wiki/w/Redstone_Comparator (container fullness formula)
 * - https://minecraft.wiki/w/Hopper (locking by redstone power)
 *
 * Local layout, facing north = comparator line at the −Z edge:
 *
 *   y=2   z=2:  L0>  L1>  O          hopper line (facing east) into overflow chest O
 *   y=1   z=0:  w    w    .          comparator line: C → w(1,1,0) → w(0,1,0) → down to (0,0,1)
 *         z=1:  .    C    .          C = comparator facing south (reads F)
 *         z=2:  .    F    S          F = filter hopper facing south into K; S = stone under O
 *         z=3:  .    K    .          K = output chest
 *   y=0   z=0:  S    S    .
 *         z=1:  w    S    .          w(0,0,1) points south into Bk
 *         z=2:  Bk   T    S          T = redstone wall torch on Bk (facing east), powers F above
 *         z=3:  .    S    .          stone under K
 *         x=    0    1    2
 */
export const ITEM_SORTER = defineModule({
  id: 'item_sorter',
  nameKey: moduleKey('item_sorter', 'name'),
  descriptionKey: moduleKey('item_sorter', 'description'),
  category: 'sorting',
  editions: { java: 'tested', bedrock: 'untested' },
  editionNotes: {
    bedrock:
      'Hopper sorters exist in Bedrock, but hopper transfer timing and comparator readings are ' +
      'reported to differ; the filter counts here are Java values and not verified for Bedrock.',
  },
  size: { x: 3, y: 3, z: 4 },
  anchor: { x: 0, y: 0, z: 0 },
  design:
    'Comparator-locked filter hopper under a hopper line; one item type to the chest, the rest overflows.',
  references: [
    'https://minecraft.wiki/w/Tutorials/Hopper',
    'https://minecraft.wiki/w/Redstone_Comparator',
    'https://minecraft.wiki/w/Hopper',
  ],
  ports: [
    { name: 'itemsIn', kind: 'input', pos: { x: 0, y: 2, z: 2 }, side: 'west', carrier: 'items' },
    { name: 'sorted', kind: 'output', pos: { x: 1, y: 1, z: 3 }, side: 'south', carrier: 'items' },
    { name: 'overflow', kind: 'output', pos: { x: 2, y: 2, z: 2 }, side: 'east', carrier: 'items' },
  ],
  params: {
    stackSize: {
      type: 'string',
      enum: ['64', '16'],
      default: '64',
      descriptionKey: moduleKey('item_sorter', 'param.stackSize'),
    },
  },
  behaviour: {
    status: 'specified',
    params: { stackSize: '64' },
    preload: [
      { pos: { x: 1, y: 1, z: 2 }, item: 'sort', count: 41 },
      { pos: { x: 1, y: 1, z: 2 }, item: 'other', count: 4 },
    ],
    notes:
      'Filter hopper (1,1,2): slot 1 = 41 sorted items, slots 2–5 = 1 filler each (stack size 64). ' +
      'Hoppers move 2.5 items per second, so waits are generous.',
    initial: {
      properties: [{ pos: { x: 1, y: 1, z: 2 }, property: 'enabled', value: 'false' }],
    },
    steps: [
      {
        description: 'Sorted items end up in the output chest; the filter keeps its count.',
        insertItems: [{ port: 'itemsIn', item: 'sort', count: 10 }],
        waitTicks: 300,
        expect: {
          items: [
            { port: 'sorted', item: 'sort', count: 10 },
            { port: 'overflow', item: 'sort', count: 0 },
          ],
        },
      },
      {
        description: 'Other items pass over the filter into the overflow chest.',
        insertItems: [{ port: 'itemsIn', item: 'other', count: 5 }],
        waitTicks: 200,
        expect: {
          items: [
            { port: 'overflow', item: 'other', count: 5 },
            { port: 'sorted', item: 'other', count: 0 },
          ],
        },
      },
    ],
  },
  blocks() {
    return new LocalBuilder()
      .set(0, 0, 0, STONE)
      .set(1, 0, 0, STONE)
      .set(0, 0, 1, wire({ n: 'up', s: 'side' }))
      .set(1, 0, 1, STONE)
      .set(0, 0, 2, STONE)
      .set(1, 0, 2, 'minecraft:redstone_wall_torch[facing=east,lit=true]')
      .set(2, 0, 2, STONE)
      .set(1, 0, 3, STONE)
      .set(0, 1, 0, wire({ e: 'side', s: 'side' }))
      .set(1, 1, 0, wire({ s: 'side', w: 'side' }))
      .set(1, 1, 1, 'minecraft:comparator[facing=south,mode=compare,powered=false]')
      .set(1, 1, 2, 'minecraft:hopper[enabled=false,facing=south]')
      .set(2, 1, 2, STONE)
      .set(1, 1, 3, 'minecraft:chest[facing=south,type=single,waterlogged=false]')
      .set(0, 2, 2, 'minecraft:hopper[enabled=true,facing=east]')
      .set(1, 2, 2, 'minecraft:hopper[enabled=true,facing=east]')
      .set(2, 2, 2, 'minecraft:chest[facing=east,type=single,waterlogged=false]')
      .blocks();
  },
});
