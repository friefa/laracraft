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
 * Design: the classic comparator hopper sorter from
 * https://minecraft.wiki/w/Tutorials/Hopper (item sorter): "The hopper underneath is
 * powered so that it cannot remove items from the top." Items travel along the hopper line
 * on top (L0 → L1 → overflow chest O). The filter hopper F under L1 is never powered: it
 * pulls from L1 every item it can take, and pre-loaded with the sorted item plus one filler
 * in each other slot it can only take the sorted item. F points sideways into glass G, so
 * it pushes nowhere (G is also its click target when placing it; glass is no redstone
 * conductor, so the chest K below G can still be opened, https://minecraft.wiki/w/Chest).
 * The comparator C reads F (signal 2 at rest). A redstone torch T keeps
 * the lock hopper H under F locked through repeater R. When F receives one more sorted
 * item, C outputs 3; after three dusts (3 → 2 → 1) block Bk is powered, the torch on it
 * turns off, R turns off, H pulls that item out of F (first slot) and passes it into the
 * output chest K, C drops back to 2 and torch and repeater lock H again. The filter count
 * therefore never changes and non-matching items pass on to the overflow chest. (A powered
 * filter hopper could not pull from the line at all, https://minecraft.wiki/w/Hopper.)
 *
 * Why repeater R (delay 2): without it the torch turns off once per sorted item. At full
 * hopper speed (one item per 8 gt) that is 8 turn-offs within 56 gt, and Java burns a
 * torch out on the 8th turn-off within 60 gt
 * (https://minecraft.wiki/w/Redstone_Torch#Burnout); H would then stay unlocked and drain
 * the filter. With R, H unlocks 8 gt after an item arrives in F (C 2 + T 2 + R 4), in the
 * same game tick in which the next item of a full-speed stream arrives, so F never reads
 * less than 42 at a comparator tick: Bk stays powered and the torch stays off for the whole
 * stream while H pulls one item per 8 gt. After the last item the torch relights 4 gt
 * after H's pull and R relocks H 8 gt after it, in the scheduled-tick phase of the very
 * tick in which H would pull again; scheduled ticks run before block entities
 * (https://minecraft.wiki/w/Tick#Game_tick), so H stays locked and the filter keeps 41.
 * With gaps in the stream the torch turns off at most once per 16 gt.
 *
 * The `stackSize` parameter does not change any block; it selects the filter loadout
 * returned by {@link sorterFilterLoadout} (41 items for 64-stacks, 10 for 16-stacks).
 *
 * References:
 * - https://minecraft.wiki/w/Tutorials/Hopper (item sorter)
 * - https://minecraft.wiki/w/Redstone_Comparator (container fullness formula)
 * - https://minecraft.wiki/w/Hopper (locking by redstone power, pulling from above)
 * - https://minecraft.wiki/w/Redstone_Torch#Burnout
 * - https://minecraft.wiki/w/Tick#Game_tick (scheduled ticks before block entities)
 *
 * Local layout, facing north = comparator line at the −Z edge:
 *
 *   y=2   z=2:  L0>  L1>  O    .     hopper line (facing east) into overflow chest O
 *   y=1   z=0:  .    w    w    .     comparator line: C → w(1,1,0) → w(2,1,0) → w(2,1,1)
 *         z=1:  .    C    w    .     C = comparator facing south (reads F); w(2,1,1) on Bk
 *         z=2:  .    Fv   S    .     F = filter hopper facing south into G; S = stone under O
 *         z=3:  .    G    .    .     G = glass (no container) on top of K
 *   y=0   z=0:  .    S    S    .     stone under the first two dusts
 *         z=1:  .    S    Bk   T     S = stone under C; T = wall torch on Bk (facing east)
 *         z=2:  .    Hv   <R   w     w(3,0,2) carries T's signal into R; R powers H
 *         z=3:  .    K    .    .     H = lock hopper under F, facing south into K (chest)
 *         x=    0    1    2    3     (v = facing south, < = signal west)
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
  size: { x: 4, y: 3, z: 4 },
  anchor: { x: 0, y: 0, z: 0 },
  design:
    'Filter hopper under a hopper line, read by a comparator that unlocks the hopper below it; one item type to the chest, the rest overflows.',
  references: [
    'https://minecraft.wiki/w/Tutorials/Hopper',
    'https://minecraft.wiki/w/Redstone_Comparator',
    'https://minecraft.wiki/w/Hopper',
    'https://minecraft.wiki/w/Redstone_Torch',
    'https://minecraft.wiki/w/Tick',
  ],
  ports: [
    { name: 'itemsIn', kind: 'input', pos: { x: 0, y: 2, z: 2 }, side: 'west', carrier: 'items' },
    { name: 'sorted', kind: 'output', pos: { x: 1, y: 0, z: 3 }, side: 'south', carrier: 'items' },
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
      { pos: { x: 1, y: 1, z: 2 }, item: 'filler', count: 4 },
    ],
    notes:
      'Filter hopper (1,1,2): slot 1 = 41 sorted items, slots 2–5 = 1 filler each (stack size 64). ' +
      'Hoppers move 2.5 items per second, so waits are generous. The lock hopper H relocks right ' +
      'after each transfer, so the last sorted item of a batch waits in H until the next sorted ' +
      'item arrives; sorted counts in the chest therefore lag by one.',
    initial: {
      properties: [
        { pos: { x: 1, y: 1, z: 2 }, property: 'enabled', value: 'true' },
        { pos: { x: 1, y: 0, z: 2 }, property: 'enabled', value: 'false' },
      ],
    },
    steps: [
      {
        description:
          'A full-speed stream of 20 sorted items (more than the 8 turn-offs a torch survives): ' +
          'none overflow, 19 reach the chest, the last waits in the lock hopper, which is locked again.',
        insertItems: [{ port: 'itemsIn', item: 'sort', count: 20 }],
        waitTicks: 300,
        expect: {
          items: [
            { port: 'sorted', item: 'sort', count: 19 },
            { port: 'overflow', item: 'sort', count: 0 },
          ],
          properties: [
            { pos: { x: 1, y: 0, z: 2 }, property: 'enabled', value: 'false' },
            { pos: { x: 3, y: 0, z: 1 }, property: 'lit', value: 'true' },
          ],
        },
      },
      {
        description: 'Other items pass over the filter into the overflow chest; H stays locked.',
        insertItems: [{ port: 'itemsIn', item: 'other', count: 5 }],
        waitTicks: 200,
        expect: {
          items: [
            { port: 'overflow', item: 'other', count: 5 },
            { port: 'sorted', item: 'other', count: 0 },
            { port: 'sorted', item: 'sort', count: 19 },
          ],
        },
      },
      {
        description:
          'Mixed input: each item type goes to its own chest; the waiting item is pushed on, ' +
          'so the filter has kept its 41 (otherwise the chest would hold more).',
        insertItems: [
          { port: 'itemsIn', item: 'other', count: 3 },
          { port: 'itemsIn', item: 'sort', count: 4 },
        ],
        waitTicks: 300,
        expect: {
          items: [
            { port: 'sorted', item: 'sort', count: 23 },
            { port: 'sorted', item: 'other', count: 0 },
            { port: 'overflow', item: 'other', count: 8 },
            { port: 'overflow', item: 'sort', count: 0 },
          ],
        },
      },
    ],
  },
  blocks() {
    return new LocalBuilder()
      .set(1, 0, 0, STONE)
      .set(2, 0, 0, STONE)
      .set(1, 0, 1, STONE)
      .set(2, 0, 1, STONE)
      .set(3, 0, 1, 'minecraft:redstone_wall_torch[facing=east,lit=true]')
      .set(1, 0, 2, 'minecraft:hopper[enabled=false,facing=south]')
      .set(2, 0, 2, 'minecraft:repeater[delay=2,facing=east,locked=false,powered=true]')
      .set(3, 0, 2, wire({ n: 'side', w: 'side' }, 15))
      .set(1, 0, 3, 'minecraft:chest[facing=south,type=single,waterlogged=false]')
      .set(1, 1, 0, wire({ e: 'side', s: 'side' }))
      .set(2, 1, 0, wire({ s: 'side', w: 'side' }))
      .set(2, 1, 1, wire({ n: 'side', w: 'side' }))
      .set(1, 1, 1, 'minecraft:comparator[facing=south,mode=compare,powered=false]')
      .set(1, 1, 2, 'minecraft:hopper[enabled=true,facing=south]')
      .set(1, 1, 3, 'minecraft:glass')
      .set(2, 1, 2, STONE)
      .set(0, 2, 2, 'minecraft:hopper[enabled=true,facing=east]')
      .set(1, 2, 2, 'minecraft:hopper[enabled=true,facing=east]')
      .set(2, 2, 2, 'minecraft:chest[facing=east,type=single,waterlogged=false]')
      .blocks();
  },
});
