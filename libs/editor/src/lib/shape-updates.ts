import {
  AIR,
  type BlockChange,
  type BlockDefinition,
  type BlockRegistry,
  type BlockState,
  type BlockStateString,
  type ChangeSet,
  DIRECTION_OFFSET,
  type Direction,
  HORIZONTAL_DIRECTIONS,
  type HorizontalDirection,
  OPPOSITE,
  type Vec3,
  addVec3,
  faceSupport,
  isValidCoordinate,
  parseBlockState,
  satisfiesSupport,
  stringifyBlockState,
  vec3Key,
} from '@laracraft/core-model';

/**
 * Neighbour-derived blockstates, modelled on Java Edition's `updateShape`.
 *
 * After an edit, the editor recomputes the `neighbors` properties of the changed
 * blocks and of their six face neighbours (redstone wire additionally looks at the
 * eight diagonal up/down neighbours, like Java's indirect wire updates). Updates do
 * not cascade further: a block two steps away from the edit is never touched.
 *
 * Rules (block families are recognised from registry data — `render.modelId`
 * and `redstone.role` — not from block ids):
 * - fences: connect to fences, to fence gates whose gate spans across the
 *   connection, and to full sturdy faces.
 * - panes / iron bars: connect to panes, iron bars, walls and full sturdy faces.
 * - walls: connect to walls, panes, perpendicular fence gates and full sturdy faces.
 *   Side height (simplified): `tall` when the block above has a full sturdy bottom
 *   face or is a wall connected on the same side, otherwise `low`. `up` (post):
 *   false only for straight runs (N+S or E+W, or a full cross) that are tall on one
 *   axis or have nothing post-forcing above (a wall post, torch or pressure plate).
 * - fence gates: `in_wall` when a wall is left or right of the gate.
 * - redstone wire: Java's `getConnectingSide`/`getConnectionState` (side, up
 *   onto a full block, down off a block; one connection makes a line, none a
 *   cross; an explicit dot stays a dot while isolated).
 * - stairs: `shape` straight / inner / outer left / right from neighbour stairs
 *   with the same `half` (Java `getStairsShape`).
 * - chests: an edited chest pairs with a single chest of the same id and facing on
 *   its left/right; neighbours follow a partner that points at them and fall back
 *   to `single` when their partner is gone.
 * - doors: the upper half copies `facing`, `hinge`, `open` and `powered` from the
 *   lower half.
 */

/** Read-only block access (a {@link BuildDocument} or an overlay). */
export interface BlockReader {
  getBlock(x: number, y: number, z: number): BlockStateString;
}

/** At most this many shape-relevant blocks are recomputed per edit; the rest keep their state. */
export const MAX_SHAPE_UPDATES = 65_536;

/** Number of relaxation passes (enough for order dependencies like wall above wall). */
const PASSES = 3;

type Kind = 'fence' | 'pane' | 'wall' | 'gate' | 'wire' | 'stairs' | 'chest' | 'door';

const MODEL_KINDS: Readonly<Record<string, Kind>> = {
  fence: 'fence',
  pane: 'pane',
  wall: 'wall',
  fence_gate: 'gate',
  stairs: 'stairs',
  chest: 'chest',
  door: 'door',
};

/** Model ids that force a wall post when standing on a wall (Java `wall_post_override`, subset). */
const POST_OVERRIDE_MODELS: ReadonlySet<string> = new Set(['torch', 'pressure_plate']);

const CW: Readonly<Record<HorizontalDirection, HorizontalDirection>> = {
  north: 'east',
  east: 'south',
  south: 'west',
  west: 'north',
};
const CCW: Readonly<Record<HorizontalDirection, HorizontalDirection>> = {
  north: 'west',
  west: 'south',
  south: 'east',
  east: 'north',
};
const isHorizontal = (v: string | undefined): v is HorizontalDirection =>
  v === 'north' || v === 'south' || v === 'east' || v === 'west';
const opposite = (d: HorizontalDirection): HorizontalDirection => CW[CW[d]];
const axisOf = (d: HorizontalDirection): 'x' | 'z' => (d === 'north' || d === 'south' ? 'z' : 'x');

const UP = DIRECTION_OFFSET.up;
const DOWN = DIRECTION_OFFSET.down;

const insideWorld = (p: Vec3): boolean =>
  isValidCoordinate(p.x) && isValidCoordinate(p.y) && isValidCoordinate(p.z);

/** Largest bounding box (cells) that {@link PosMap} stores densely. */
const DENSE_LIMIT = 2 ** 21;

/**
 * Position → value map for the hot loops: dense array over the bounding box of
 * `positions` (grown by `margin`) when it is small enough, a string-keyed map
 * for everything else.
 */
class PosMap<T> {
  private readonly dense: (T | undefined)[] | null = null;
  private readonly sparse = new Map<string, T>();
  private readonly min: Vec3 = { x: 0, y: 0, z: 0 };
  private readonly sx: number = 0;
  private readonly sy: number = 0;
  private readonly sz: number = 0;

  constructor(positions: readonly Vec3[], margin: number) {
    if (positions.length === 0) return;
    let [x0, y0, z0] = [Infinity, Infinity, Infinity];
    let [x1, y1, z1] = [-Infinity, -Infinity, -Infinity];
    for (const p of positions) {
      x0 = Math.min(x0, p.x);
      y0 = Math.min(y0, p.y);
      z0 = Math.min(z0, p.z);
      x1 = Math.max(x1, p.x);
      y1 = Math.max(y1, p.y);
      z1 = Math.max(z1, p.z);
    }
    const sx = x1 - x0 + 1 + 2 * margin;
    const sy = y1 - y0 + 1 + 2 * margin;
    const sz = z1 - z0 + 1 + 2 * margin;
    if (sx * sy * sz > DENSE_LIMIT) return;
    this.min = { x: x0 - margin, y: y0 - margin, z: z0 - margin };
    [this.sx, this.sy, this.sz] = [sx, sy, sz];
    this.dense = new Array<T | undefined>(sx * sy * sz);
  }

  private slot(x: number, y: number, z: number): number {
    const dx = x - this.min.x;
    const dy = y - this.min.y;
    const dz = z - this.min.z;
    if (dx < 0 || dy < 0 || dz < 0 || dx >= this.sx || dy >= this.sy || dz >= this.sz) return -1;
    return (dx * this.sy + dy) * this.sz + dz;
  }

  get(x: number, y: number, z: number): T | undefined {
    const i = this.dense ? this.slot(x, y, z) : -1;
    return i >= 0 ? this.dense?.[i] : this.sparse.get(`${x},${y},${z}`);
  }

  set(x: number, y: number, z: number, value: T): void {
    const i = this.dense ? this.slot(x, y, z) : -1;
    if (i >= 0 && this.dense) this.dense[i] = value;
    else this.sparse.set(`${x},${y},${z}`, value);
  }
}

interface Info {
  readonly state: BlockStateString;
  readonly parsed: BlockState;
  readonly def: BlockDefinition | undefined;
  readonly kind: Kind | undefined;
}

function hasProps(def: BlockDefinition, keys: readonly string[]): boolean {
  return keys.every((k) => def.properties[k] !== undefined);
}

function kindOf(def: BlockDefinition | undefined): Kind | undefined {
  if (!def) return undefined;
  const kind: Kind | undefined =
    def.redstone?.role === 'wire' ? 'wire' : MODEL_KINDS[def.render.modelId ?? ''];
  switch (kind) {
    case 'fence':
    case 'pane':
    case 'wall':
    case 'wire':
      return hasProps(def, HORIZONTAL_DIRECTIONS) ? kind : undefined;
    case 'gate':
      return hasProps(def, ['facing', 'in_wall']) ? kind : undefined;
    case 'stairs':
      return hasProps(def, ['facing', 'half', 'shape']) ? kind : undefined;
    case 'chest':
      return hasProps(def, ['facing', 'type']) ? kind : undefined;
    case 'door':
      return hasProps(def, ['facing', 'half']) ? kind : undefined;
    default:
      return undefined;
  }
}

/** Overlay over a reader that collects the recomputed states. */
class ShapeWorld {
  private readonly infos = new Map<BlockStateString, Info>();
  private readonly overlay: PosMap<BlockStateString>;
  /** Recomputed cells, in order of their first write. */
  readonly written: Vec3[] = [];

  constructor(
    private readonly base: BlockReader,
    private readonly registry: BlockRegistry,
    edited: readonly Vec3[],
  ) {
    this.overlay = new PosMap(edited, 2);
  }

  info(state: BlockStateString): Info {
    let info = this.infos.get(state);
    if (!info) {
      const parsed = parseBlockState(state);
      const def = this.registry.get(parsed.id);
      info = { state, parsed, def, kind: kindOf(def) };
      this.infos.set(state, info);
    }
    return info;
  }

  at(p: Vec3): Info {
    if (!insideWorld(p)) return this.info(AIR);
    const w = this.written.length > 0 ? this.overlay.get(p.x, p.y, p.z) : undefined;
    return this.info(w ?? this.base.getBlock(p.x, p.y, p.z));
  }

  set(pos: Vec3, state: BlockStateString): void {
    if (this.overlay.get(pos.x, pos.y, pos.z) === undefined) this.written.push(pos);
    this.overlay.set(pos.x, pos.y, pos.z, state);
  }
}

const prop = (info: Info, key: string): string | undefined => info.parsed.properties[key];

/** True if `info`'s face towards us (`face`, seen from the neighbour) is a full sturdy face. */
const sturdy = (info: Info, face: Direction): boolean =>
  faceSupport(info.def, info.parsed, face) === 'full';

/** Java `FenceGateBlock.connectsToDirection`: the gate spans across `dir`. */
function gateSpans(gate: Info, dir: HorizontalDirection): boolean {
  const facing = prop(gate, 'facing');
  return isHorizontal(facing) && axisOf(facing) !== axisOf(dir);
}

function connects(self: Kind, n: Info, dir: HorizontalDirection): boolean {
  if (sturdy(n, OPPOSITE[dir])) return true;
  switch (self) {
    case 'fence':
      return n.kind === 'fence' || (n.kind === 'gate' && gateSpans(n, dir));
    case 'pane':
      return n.kind === 'pane' || n.kind === 'wall';
    case 'wall':
      return n.kind === 'wall' || n.kind === 'pane' || (n.kind === 'gate' && gateSpans(n, dir));
    default:
      return false;
  }
}

/** Java `isRedstoneConductor`, approximated: opaque full solid cubes that are not power sources. */
function isConductor(info: Info): boolean {
  const def = info.def;
  if (!def || !def.solid || def.render.shape !== 'full' || def.render.layer !== 'opaque') {
    return false;
  }
  const role = def.redstone?.role;
  return role !== 'source' && role !== 'observer';
}

/** Java `RedStoneWireBlock.shouldConnectTo(state, dir)`; `dir` points from the wire to `n`. */
function wireConnectsTo(n: Info, dir: HorizontalDirection): boolean {
  if (n.kind === 'wire') return true;
  const role = n.def?.redstone?.role;
  const facing = prop(n, 'facing');
  switch (role) {
    case 'repeater':
      return facing === dir || facing === OPPOSITE[dir];
    case 'observer':
      return facing === dir;
    case 'source':
    case 'comparator':
      return true;
    default:
      return false;
  }
}

type Props = Record<string, string>;

function computeFenceLike(world: ShapeWorld, pos: Vec3, info: Info, kind: Kind): Props {
  const props: Props = { ...info.parsed.properties };
  for (const d of HORIZONTAL_DIRECTIONS) {
    props[d] = String(connects(kind, world.at(addVec3(pos, DIRECTION_OFFSET[d])), d));
  }
  return props;
}

function computeWall(world: ShapeWorld, pos: Vec3, info: Info): Props {
  const props: Props = { ...info.parsed.properties };
  const above = world.at(addVec3(pos, UP));
  const aboveFull = sturdy(above, 'down');
  for (const d of HORIZONTAL_DIRECTIONS) {
    if (!connects('wall', world.at(addVec3(pos, DIRECTION_OFFSET[d])), d)) props[d] = 'none';
    else {
      const tall = aboveFull || (above.kind === 'wall' && (prop(above, d) ?? 'none') !== 'none');
      props[d] = tall ? 'tall' : 'low';
    }
  }
  props['up'] = String(wallPost(props, above));
  return props;
}

/** Java `WallBlock.shouldRaisePost`, simplified (see module docs). */
function wallPost(sides: Props, above: Info): boolean {
  if (above.kind === 'wall' && prop(above, 'up') === 'true') return true;
  const none = (d: HorizontalDirection) => sides[d] === 'none';
  const allNone = none('north') && none('south') && none('east') && none('west');
  if (allNone || none('north') !== none('south') || none('east') !== none('west')) return true;
  const tall = (d: HorizontalDirection) => sides[d] === 'tall';
  if ((tall('north') && tall('south')) || (tall('east') && tall('west'))) return false;
  return POST_OVERRIDE_MODELS.has(above.def?.render.modelId ?? '');
}

function computeGate(world: ShapeWorld, pos: Vec3, info: Info): Props {
  const props: Props = { ...info.parsed.properties };
  const facing = prop(info, 'facing');
  if (!isHorizontal(facing)) return props;
  const inWall = [CW[facing], CCW[facing]].some(
    (d) => world.at(addVec3(pos, DIRECTION_OFFSET[d])).kind === 'wall',
  );
  props['in_wall'] = String(inWall);
  return props;
}

/** Java `RedStoneWireBlock.getConnectingSide`. */
function wireSide(
  world: ShapeWorld,
  pos: Vec3,
  dir: HorizontalDirection,
  aboveConductor: boolean,
): 'up' | 'side' | 'none' {
  const relPos = addVec3(pos, DIRECTION_OFFSET[dir]);
  const rel = world.at(relPos);
  if (!aboveConductor) {
    const canHoldWire = satisfiesSupport(faceSupport(rel.def, rel.parsed, 'up'), 'rigid');
    if (canHoldWire && world.at(addVec3(relPos, UP)).kind === 'wire') {
      return sturdy(rel, OPPOSITE[dir]) ? 'up' : 'side';
    }
  }
  if (wireConnectsTo(rel, dir)) return 'side';
  if (!isConductor(rel) && world.at(addVec3(relPos, DOWN)).kind === 'wire') return 'side';
  return 'none';
}

/** Java `RedStoneWireBlock.getConnectionState`. */
function computeWire(world: ShapeWorld, pos: Vec3, info: Info): Props {
  const props: Props = { ...info.parsed.properties };
  const wasDot = HORIZONTAL_DIRECTIONS.every((d) => props[d] === 'none');
  const aboveConductor = isConductor(world.at(addVec3(pos, UP)));
  const sides = {} as Record<HorizontalDirection, string>;
  for (const d of HORIZONTAL_DIRECTIONS) sides[d] = wireSide(world, pos, d, aboveConductor);
  const has = (d: HorizontalDirection) => sides[d] !== 'none';
  if (wasDot && !HORIZONTAL_DIRECTIONS.some(has)) return props;
  const noNS = !has('north') && !has('south');
  const noEW = !has('east') && !has('west');
  if (!has('west') && noNS) sides.west = 'side';
  if (!has('east') && noNS) sides.east = 'side';
  if (!has('north') && noEW) sides.north = 'side';
  if (!has('south') && noEW) sides.south = 'side';
  return { ...props, ...sides };
}

/** Java `StairBlock.getStairsShape`. */
function computeStairs(world: ShapeWorld, pos: Vec3, info: Info): Props {
  const props: Props = { ...info.parsed.properties };
  const facing = prop(info, 'facing');
  const half = prop(info, 'half');
  if (!isHorizontal(facing)) return props;
  const stairsAt = (d: HorizontalDirection): Info | undefined => {
    const n = world.at(addVec3(pos, DIRECTION_OFFSET[d]));
    return n.kind === 'stairs' && prop(n, 'half') === half ? n : undefined;
  };
  // A side may only take a corner shape if the stairs there do not continue this run.
  const canTakeShape = (d: HorizontalDirection): boolean => {
    const n = stairsAt(d);
    return !n || prop(n, 'facing') !== facing;
  };
  let shape = 'straight';
  const front = stairsAt(facing);
  const frontFacing = front && prop(front, 'facing');
  const back = stairsAt(opposite(facing));
  const backFacing = back && prop(back, 'facing');
  if (
    isHorizontal(frontFacing) &&
    axisOf(frontFacing) !== axisOf(facing) &&
    canTakeShape(opposite(frontFacing))
  ) {
    shape = frontFacing === CCW[facing] ? 'outer_left' : 'outer_right';
  } else if (
    isHorizontal(backFacing) &&
    axisOf(backFacing) !== axisOf(facing) &&
    canTakeShape(backFacing)
  ) {
    shape = backFacing === CCW[facing] ? 'inner_left' : 'inner_right';
  }
  props['shape'] = shape;
  return props;
}

function computeChest(world: ShapeWorld, pos: Vec3, info: Info, edited: boolean): Props {
  const props: Props = { ...info.parsed.properties };
  const facing = prop(info, 'facing');
  if (!isHorizontal(facing)) return props;
  /** Java `ChestBlock.getConnectedDirection`. */
  const partnerDir = (type: string | undefined): HorizontalDirection | undefined =>
    type === 'left' ? CW[facing] : type === 'right' ? CCW[facing] : undefined;
  const sameChest = (n: Info) => n.parsed.id === info.parsed.id && prop(n, 'facing') === facing;
  const at = (d: HorizontalDirection) => world.at(addVec3(pos, DIRECTION_OFFSET[d]));
  const pointsAtMe = (d: HorizontalDirection): boolean => {
    const n = at(d);
    return sameChest(n) && partnerDir(prop(n, 'type')) === OPPOSITE[d];
  };
  const typeFor = (d: HorizontalDirection) => (d === CW[facing] ? 'left' : 'right');

  const current = partnerDir(prop(info, 'type'));
  if (current && pointsAtMe(current)) return props;
  for (const d of [CW[facing], CCW[facing]]) {
    if (pointsAtMe(d)) return { ...props, type: typeFor(d) };
  }
  if (edited) {
    for (const d of [CW[facing], CCW[facing]]) {
      const n = at(d);
      if (sameChest(n) && prop(n, 'type') === 'single') return { ...props, type: typeFor(d) };
    }
  }
  return { ...props, type: 'single' };
}

const DOOR_SHARED = ['facing', 'hinge', 'open', 'powered'];

function computeDoor(world: ShapeWorld, pos: Vec3, info: Info): Props {
  const props: Props = { ...info.parsed.properties };
  if (prop(info, 'half') !== 'upper') return props;
  const lower = world.at(addVec3(pos, DOWN));
  if (lower.parsed.id !== info.parsed.id || prop(lower, 'half') !== 'lower') return props;
  for (const key of DOOR_SHARED) {
    const value = prop(lower, key);
    if (value !== undefined && props[key] !== undefined) props[key] = value;
  }
  return props;
}

function recompute(world: ShapeWorld, pos: Vec3, info: Info, edited: boolean): Props {
  switch (info.kind) {
    case 'fence':
    case 'pane':
      return computeFenceLike(world, pos, info, info.kind);
    case 'wall':
      return computeWall(world, pos, info);
    case 'gate':
      return computeGate(world, pos, info);
    case 'wire':
      return computeWire(world, pos, info);
    case 'stairs':
      return computeStairs(world, pos, info);
    case 'chest':
      return computeChest(world, pos, info, edited);
    case 'door':
      return computeDoor(world, pos, info);
    default:
      return { ...info.parsed.properties };
  }
}

/** Keeps only values the registry allows (defensive; all computed values are valid ones). */
function validProps(def: BlockDefinition, props: Props, fallback: BlockState['properties']): Props {
  const out: Props = {};
  for (const [key, value] of Object.entries(props)) {
    const p = def.properties[key];
    out[key] = p && !p.values.includes(value) ? (fallback[key] ?? p.default) : value;
  }
  return out;
}

const DIAGONALS: readonly Vec3[] = HORIZONTAL_DIRECTIONS.flatMap((d) => [
  addVec3(DIRECTION_OFFSET[d], UP),
  addVec3(DIRECTION_OFFSET[d], DOWN),
]);
const FACE_OFFSETS: readonly Vec3[] = Object.values(DIRECTION_OFFSET);

/**
 * Recomputes neighbour-derived blockstates around edited positions.
 *
 * `doc` must already show the edit (e.g. an overlay of a pending change set, see
 * {@link withShapeUpdates}). Looks at `positions` and their six face neighbours
 * (plus diagonal wires) and returns the changes needed to make their shapes
 * consistent; `before` is the state in `doc`. Edited chests may form new pairs;
 * neighbours only follow (see module docs). Blocks outside that set are never
 * touched, and at most {@link MAX_SHAPE_UPDATES} blocks are recomputed.
 *
 * `previous` (optional) shows the world before the edit. With it, diagonal wires
 * are only looked at around positions that held or hold a wire (the only edits
 * that can change a diagonal wire connection), which keeps large fills cheap.
 */
export function updateNeighbourShapes(
  doc: BlockReader,
  registry: BlockRegistry,
  positions: Iterable<Vec3>,
  previous?: BlockReader,
): BlockChange[] {
  const edited = [...positions];
  const world = new ShapeWorld(doc, registry, edited);
  const seen = new PosMap<true>(edited, 2);
  const queue: { pos: Vec3; edited: boolean }[] = [];
  const consider = (pos: Vec3, edited: boolean): void => {
    if (queue.length >= MAX_SHAPE_UPDATES || !insideWorld(pos)) return;
    if (!world.at(pos).kind) return;
    if (seen.get(pos.x, pos.y, pos.z)) return;
    seen.set(pos.x, pos.y, pos.z, true);
    queue.push({ pos, edited });
  };
  for (const pos of edited) consider(pos, true);
  const wireAt = (reader: BlockReader, p: Vec3) =>
    world.info(reader.getBlock(p.x, p.y, p.z)).kind === 'wire';
  for (const pos of edited) {
    for (const o of FACE_OFFSETS) consider(addVec3(pos, o), false);
    if (previous && !wireAt(doc, pos) && !wireAt(previous, pos)) continue;
    for (const o of DIAGONALS) {
      const q = addVec3(pos, o);
      if (insideWorld(q) && world.at(q).kind === 'wire') consider(q, false);
    }
  }

  for (let pass = 0; pass < PASSES; pass++) {
    let changed = false;
    for (const { pos, edited: isEdited } of queue) {
      const info = world.at(pos);
      if (!info.def || !info.kind) continue;
      const props = validProps(
        info.def,
        recompute(world, pos, info, isEdited),
        info.parsed.properties,
      );
      const next = stringifyBlockState({ id: info.parsed.id, properties: props });
      if (next !== info.state) {
        world.set(pos, next);
        changed = true;
      }
    }
    if (!changed) break;
  }

  const changes: BlockChange[] = [];
  for (const pos of world.written) {
    const state = world.at(pos).state;
    const before = doc.getBlock(pos.x, pos.y, pos.z);
    if (before !== state) changes.push({ pos, before, after: state });
  }
  return changes;
}

/** Reader that shows `doc` with a pending change set applied. */
class PendingReader implements BlockReader {
  private readonly pending: PosMap<BlockStateString>;

  constructor(
    private readonly doc: BlockReader,
    changes: readonly BlockChange[],
    positions: readonly Vec3[],
  ) {
    this.pending = new PosMap(positions, 0);
    for (const c of changes) this.pending.set(c.pos.x, c.pos.y, c.pos.z, c.after);
  }

  getBlock(x: number, y: number, z: number): BlockStateString {
    return this.pending.get(x, y, z) ?? this.doc.getBlock(x, y, z);
  }
}

/**
 * Returns `changeSet` extended by the neighbour shape updates it causes (see
 * {@link updateNeighbourShapes}), so the edit and its consequences form one undo
 * step. Changes to already edited cells replace their `after` state; new cells
 * are appended with `before` read from `doc`. Apply it once per edit: running it
 * again on its own result would also treat the updated neighbours as edited.
 */
export function withShapeUpdates(
  doc: BlockReader,
  registry: BlockRegistry,
  changeSet: ChangeSet,
): ChangeSet {
  if (changeSet.changes.length === 0) return changeSet;
  const positions = changeSet.changes.map((c) => c.pos);
  const reader = new PendingReader(doc, changeSet.changes, positions);
  const updates = updateNeighbourShapes(reader, registry, positions, doc);
  if (updates.length === 0) return changeSet;
  const changes = [...changeSet.changes];
  const index = new Map<string, number>();
  changes.forEach((c, i) => index.set(vec3Key(c.pos), i));
  for (const u of updates) {
    const i = index.get(vec3Key(u.pos));
    const existing = i === undefined ? undefined : changes[i];
    if (i !== undefined && existing) changes[i] = { ...existing, after: u.after };
    else
      changes.push({ pos: u.pos, before: doc.getBlock(u.pos.x, u.pos.y, u.pos.z), after: u.after });
  }
  return { ...changeSet, changes };
}
