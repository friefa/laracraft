import {
  DIRECTION_OFFSET,
  DIRECTIONS,
  OPPOSITE,
  addVec3,
  equalsVec3,
  faceSupport,
  isDirection,
  parseBlockState,
  requiredSupport,
  resolveBlockState,
  satisfiesSupport,
  stringifyBlockState,
  vec3Key,
  withProperties,
  type BlockDefinition,
  type BlockRegistry,
  type BlockState,
  type BlockStateString,
  type BuildDocument,
  type Direction,
  type FaceSupport,
  type SupportRule,
  type Vec3,
} from '@laracraft/core-model';
import {
  DEFAULT_REACH,
  type BuildOrderOptions,
  type BuildPhase,
  type BuildPlan,
  type PlaceAction,
  type RemoveAction,
  type RuleId,
  type ValidationIssue,
} from '../types';
import {
  distance,
  eyePosition,
  faceCentre,
  facePoints,
  faceVisibleFrom,
  horizontalOf,
  nearest3dOf,
  withinReach,
} from './geometry';
import { derivePlacedProperties, lookDirection3d } from './orientation';

/**
 * Build-order validator: the reference for what a "correct" build plan is.
 *
 * It is deliberately independent of the planner. It replays the plan in a
 * simulated world, starting empty (positions with `y <= groundY` are solid
 * terrain), and checks every action against the rules in {@link RuleId}. All
 * violations are reported; the validator never stops at the first one.
 *
 * Issue coordinates: `step`/`action` are array indices into `plan.steps` and
 * `step.actions`. Issues about the final state that belong to no action
 * (a document block that was never placed) use `step: -1, action: -1`.
 *
 * Simulation simplifications (documented so planner and validator agree):
 * - Nothing moves on its own: fluids do not spread, gravity blocks do not fall,
 *   unsupported attachments do not pop off. A violation is reported instead and
 *   the world keeps the block, so one mistake does not cascade into dozens.
 * - Actions that cannot be performed at all (placing into an occupied position,
 *   removing a non-temporary block) are reported and not simulated.
 * - Two-block structures (doors): placing the primary part (`item.primaryPart`,
 *   e.g. `half=lower`) also places the other half one block above (below for an
 *   `upper` primary part). The other half must never be placed explicitly.
 */
export function validatePlan(
  doc: BuildDocument,
  registry: BlockRegistry,
  plan: BuildPlan,
  options?: Partial<BuildOrderOptions>,
): ValidationIssue[] {
  return new PlanValidator(doc, registry, options ?? {}).run(plan);
}

const PHASE_RANK: Readonly<Record<BuildPhase, number>> = {
  structure: 0,
  redstone: 1,
  power: 2,
  fluids: 3,
  cleanup: 4,
};

const AIR_IDS: ReadonlySet<string> = new Set([
  'minecraft:air',
  'minecraft:cave_air',
  'minecraft:void_air',
]);

/** Parsed, registry-checked view of one blockstate string. */
interface StateInfo {
  readonly state: BlockStateString;
  readonly block: BlockState;
  readonly def: BlockDefinition | undefined;
  /** Why the string is not a canonical, registry-valid state (undefined = fine). */
  readonly error?: string;
}

/** A block in the simulated world. */
interface Cell {
  readonly info: StateInfo;
  readonly temporary: boolean;
  /** Where it was placed (for unremoved temporary blocks). */
  readonly step: number;
  readonly action: number;
}

/** What a block needs to stay in place: the block at `pos` must offer `needs` on `face`. */
interface SupportNeed {
  readonly pos: Vec3;
  readonly face: Direction;
  readonly needs: FaceSupport;
}

const below = (p: Vec3): Vec3 => addVec3(p, DIRECTION_OFFSET.down);
const above = (p: Vec3): Vec3 => addVec3(p, DIRECTION_OFFSET.up);
const fmt = (p: Vec3): string => `(${p.x}, ${p.y}, ${p.z})`;

const isFluid = (def: BlockDefinition | undefined): boolean => def?.physics.fluid === true;

/** Power sources per the briefing: registry role `source`, plus the redstone block explicitly. */
const isPowerSource = (def: BlockDefinition | undefined): boolean =>
  def !== undefined && (def.redstone?.role === 'source' || def.id === 'minecraft:redstone_block');

/**
 * Blocks that react to a right-click, so a player holding a block must sneak to
 * place against them. The registry has no flag for this (contract gap), so it is
 * derived: blocks with an `interaction` property, containers, wooden doors,
 * trapdoors and fence gates, buttons, and a few named blocks.
 */
function isInteractive(def: BlockDefinition | undefined): boolean {
  if (!def) return false;
  if ((def.placement ?? []).some((r) => r.source === 'interaction')) return true;
  if (def.redstone?.role === 'container') return true;
  const id = def.id;
  if (id.startsWith('minecraft:iron_')) return false; // iron doors/trapdoors need power
  if (/_(door|trapdoor|fence_gate|button)$/.test(id)) return true;
  return (
    id === 'minecraft:lever' ||
    id === 'minecraft:crafting_table' ||
    id === 'minecraft:dispenser' ||
    id === 'minecraft:dropper'
  );
}

class PlanValidator {
  private readonly issues: ValidationIssue[] = [];
  private readonly infoCache = new Map<string, StateInfo>();
  /** Target build: position key → non-air state. */
  private readonly target = new Map<string, StateInfo>();
  private readonly targetPos = new Map<string, Vec3>();
  /** Simulated world: position key → block. Ground is implicit (`y <= groundY`). */
  private readonly world = new Map<string, Cell>();
  /** Positions that already have a completeness issue (avoid duplicate reports). */
  private readonly completenessFlagged = new Set<string>();
  /** Item id → definitions placed with it (torch ↔ wall_torch variants). */
  private readonly defsByItem = new Map<string, BlockDefinition[]>();
  private readonly groundY: number;
  private readonly reach: number;
  private fluidsStarted = false;
  private step = 0;
  private action = 0;

  constructor(
    doc: BuildDocument,
    private readonly registry: BlockRegistry,
    options: Partial<BuildOrderOptions>,
  ) {
    let minY = Number.POSITIVE_INFINITY;
    doc.volume.forEachBlock((x, y, z, index) => {
      const info = this.info(doc.palette.stateAt(index));
      if (AIR_IDS.has(info.block.id)) return;
      const pos = { x, y, z };
      const key = vec3Key(pos);
      this.target.set(key, info);
      this.targetPos.set(key, pos);
      if (y < minY) minY = y;
    });
    this.groundY = options.groundY ?? (Number.isFinite(minY) ? minY - 1 : -1);
    this.reach = options.reach ?? DEFAULT_REACH;
    for (const def of registry.all()) {
      const item = def.item?.item ?? def.id;
      const list = this.defsByItem.get(item);
      if (list) list.push(def);
      else this.defsByItem.set(item, [def]);
    }
  }

  run(plan: BuildPlan): ValidationIssue[] {
    plan.steps.forEach((step, s) => {
      this.step = s;
      step.actions.forEach((action, a) => {
        this.action = a;
        if (action.kind === 'place') this.place(action, step.phase);
        else this.remove(action);
      });
    });
    this.checkFinalState();
    return this.issues;
  }

  // ---------------------------------------------------------------- helpers

  private report(rule: RuleId, pos: Vec3, message: string, step = this.step, action = this.action) {
    this.issues.push({ rule, step, action, pos, message });
  }

  private reportCompleteness(pos: Vec3, message: string, step?: number, action?: number) {
    this.completenessFlagged.add(vec3Key(pos));
    this.report('completeness', pos, message, step, action);
  }

  /** Parses and checks a state string once; never throws. */
  private info(state: string): StateInfo {
    const cached = this.infoCache.get(state);
    if (cached) return cached;
    let result: StateInfo;
    try {
      const block = parseBlockState(state);
      const canonical = stringifyBlockState(block);
      const def = this.registry.get(block.id);
      let error: string | undefined;
      if (canonical !== state) error = `"${state}" is not canonical (expected "${canonical}")`;
      else if (def) {
        const resolved = resolveBlockState(this.registry, block);
        if (!resolved.ok) error = resolved.error;
        else if (resolved.state !== canonical) {
          error = `"${state}" is not fully specified (expected "${resolved.state}")`;
        }
      }
      result = { state: canonical, block, def, ...(error ? { error } : {}) };
    } catch (e) {
      const block: BlockState = { id: 'minecraft:air', properties: {} };
      result = { state: state as BlockStateString, block, def: undefined, error: String(e) };
    }
    this.infoCache.set(state, result);
    return result;
  }

  private isGround(p: Vec3): boolean {
    return p.y <= this.groundY;
  }

  /** Something occupies the position (a simulated block or the terrain). */
  private occupied(p: Vec3): boolean {
    return this.isGround(p) || this.world.has(vec3Key(p));
  }

  /** A solid, non-fluid thing occupies the position (stand on it, rest sand on it, click it). */
  private occupiedNonFluid(p: Vec3): boolean {
    if (this.isGround(p)) return true;
    const cell = this.world.get(vec3Key(p));
    return cell !== undefined && !isFluid(cell.info.def);
  }

  /** Support offered by `face` of whatever is at `p` (terrain offers a full face). */
  private offeredSupport(p: Vec3, face: Direction): FaceSupport {
    const cell = this.world.get(vec3Key(p));
    if (cell) return faceSupport(cell.info.def, cell.info.block, face);
    return this.isGround(p) ? 'full' : 'none';
  }

  /**
   * The block another block needs to stay in place, or undefined when free-standing.
   * - below / ceiling: the block under / over it, its top / bottom face.
   * - facing: the block on the side opposite of the `facing` value, its face
   *   pointing back (wall torch facing=north hangs on the south block's north face).
   * - face: floor → below, ceiling → ceiling, wall → like `facing`.
   * - conditional: the case selected by the property value (no case = free).
   * - secondary part of a two-block structure (upper door half): rests on its
   *   primary part, which only has to exist.
   */
  private supportNeed(info: StateInfo, pos: Vec3): SupportNeed | undefined {
    const def = info.def;
    if (!def) return undefined;
    const primary = def.item?.primaryPart;
    if (primary && info.block.properties[primary.property] !== primary.value) {
      const dir: Direction = primary.value === 'upper' ? 'up' : 'down';
      return { pos: addVec3(pos, DIRECTION_OFFSET[dir]), face: OPPOSITE[dir], needs: 'none' };
    }
    return this.needForRule(def.physics.support, info.block, pos);
  }

  private needForRule(rule: SupportRule, block: BlockState, pos: Vec3): SupportNeed | undefined {
    const needs = requiredSupport(rule);
    const hangOn = (facing: string | undefined): SupportNeed | undefined => {
      if (facing === undefined || !isDirection(facing)) return undefined;
      return { pos: addVec3(pos, DIRECTION_OFFSET[OPPOSITE[facing]]), face: facing, needs };
    };
    switch (rule.kind) {
      case 'none':
        return undefined;
      case 'below':
        return { pos: below(pos), face: 'up', needs };
      case 'ceiling':
        return { pos: above(pos), face: 'down', needs };
      case 'facing':
        return hangOn(block.properties[rule.property]);
      case 'face': {
        const face = block.properties[rule.faceProperty];
        if (face === 'floor') return { pos: below(pos), face: 'up', needs };
        if (face === 'ceiling') return { pos: above(pos), face: 'down', needs };
        return hangOn(block.properties[rule.facingProperty]);
      }
      case 'conditional': {
        const value = block.properties[rule.property];
        const next = value !== undefined ? rule.cases[value] : undefined;
        return next ? this.needForRule(next, block, pos) : undefined;
      }
    }
  }

  /** For a primary part (lower door half): the implicitly placed other part. */
  private implicitPart(info: StateInfo, pos: Vec3): { pos: Vec3; info: StateInfo } | undefined {
    const primary = info.def?.item?.primaryPart;
    if (!primary || info.block.properties[primary.property] !== primary.value) return undefined;
    const prop = info.def?.properties[primary.property];
    const other = prop?.values.find((v) => v !== primary.value);
    if (other === undefined) return undefined;
    // Only vertical two-part structures are modelled (doors). Beds would need facing.
    if (primary.value !== 'lower' && primary.value !== 'upper') return undefined;
    const dir: Direction = primary.value === 'lower' ? 'up' : 'down';
    const state = stringifyBlockState(withProperties(info.block, { [primary.property]: other }));
    return { pos: addVec3(pos, DIRECTION_OFFSET[dir]), info: this.info(state) };
  }

  // ---------------------------------------------------------------- place

  private place(action: PlaceAction, phase: BuildPhase): void {
    const { pos } = action;
    const info = this.info(action.state);
    const def = info.def;

    if (info.error) {
      this.reportCompleteness(pos, `Invalid blockstate: ${info.error}`);
      return;
    }
    if (AIR_IDS.has(info.block.id)) {
      this.reportCompleteness(pos, 'Placing air is not an action; use a remove action');
      return;
    }

    // fluids-last: buckets only in the fluids phase; afterwards only cleanup removals.
    if (isFluid(def)) {
      if (phase !== 'fluids') {
        this.report('fluids-last', pos, `Fluid ${info.block.id} placed in phase "${phase}"`);
      }
      this.fluidsStarted = true;
    } else if (this.fluidsStarted) {
      this.report('fluids-last', pos, `${info.block.id} placed after the first fluid placement`);
    }

    // The secondary half of a door appears with its primary half and is never placed.
    const primary = def?.item?.primaryPart;
    if (primary && info.block.properties[primary.property] !== primary.value) {
      this.reportCompleteness(
        pos,
        `${info.block.id}[${primary.property}=${info.block.properties[primary.property]}] is placed implicitly with its ${primary.property}=${primary.value} part`,
      );
      return;
    }

    // Occupancy: placing into a block (or the terrain) is impossible.
    if (this.occupied(pos)) {
      this.reportCompleteness(pos, `Position ${fmt(pos)} is already occupied`);
      return;
    }
    const part = this.implicitPart(info, pos);
    if (part && this.occupied(part.pos)) {
      this.reportCompleteness(part.pos, `No room for the other half at ${fmt(part.pos)}`);
      return;
    }

    if (!action.temporary) {
      this.checkAgainstTarget(pos, info);
      if (part) this.checkAgainstTarget(part.pos, part.info);
    }

    this.checkClickTarget(action);
    this.checkReachability(action, def);
    if (def) {
      this.checkSupportAtPlacement(pos, info);
      this.checkGravityAtPlacement(pos, def);
      this.checkOrientation(action, info, def);
      this.checkRedstoneSafety(action, info, def, phase);
    }

    // Simulate.
    const cell: Cell = {
      info,
      temporary: action.temporary === true,
      step: this.step,
      action: this.action,
    };
    this.world.set(vec3Key(pos), cell);
    if (part) this.world.set(vec3Key(part.pos), { ...cell, info: part.info });
  }

  /** completeness: a final (non-temporary) placement must put exactly the document's state. */
  private checkAgainstTarget(pos: Vec3, info: StateInfo): void {
    const want = this.target.get(vec3Key(pos));
    if (!want) {
      this.reportCompleteness(pos, `${info.state} at ${fmt(pos)} is not part of the build`);
    } else if (want.state !== info.state) {
      this.reportCompleteness(pos, `Places ${info.state}, the build has ${want.state}`);
    }
  }

  /** click-target: an existing, non-fluid block whose clicked face points at `pos`. */
  private checkClickTarget(action: PlaceAction): void {
    const { pos, clickOn } = action;
    if (!isDirection(clickOn.face)) {
      this.report('click-target', pos, `Invalid clicked face "${String(clickOn.face)}"`);
      return;
    }
    if (!this.occupied(clickOn.pos)) {
      this.report('click-target', pos, `Clicked block ${fmt(clickOn.pos)} does not exist yet`);
    } else if (!this.occupiedNonFluid(clickOn.pos)) {
      this.report('click-target', pos, `Clicked block ${fmt(clickOn.pos)} is a fluid`);
    } else {
      const clicked = this.world.get(vec3Key(clickOn.pos));
      if (clicked && isInteractive(clicked.info.def) && !action.sneak) {
        this.report(
          'click-target',
          pos,
          `Clicking ${clicked.info.block.id} opens/uses it; sneak to place against it`,
        );
      }
    }
    if (!equalsVec3(addVec3(clickOn.pos, DIRECTION_OFFSET[clickOn.face]), pos)) {
      this.report(
        'click-target',
        pos,
        `Face ${clickOn.face} of ${fmt(clickOn.pos)} does not point to ${fmt(pos)}`,
      );
    }
  }

  /** reachability: eye-to-face distance, visible face, free and supported stand position. */
  private checkReachability(action: PlaceAction, def: BlockDefinition | undefined): void {
    const { pos, standAt, clickOn } = action;
    if (isDirection(clickOn.face)) {
      const eye = eyePosition(standAt);
      const centre = faceCentre(clickOn.pos, clickOn.face);
      if (!withinReach(eye, centre, this.reach)) {
        const d = distance(eye, centre).toFixed(2);
        this.report('reachability', pos, `Clicked face is ${d} blocks away (reach ${this.reach})`);
      }
      if (!faceVisibleFrom(eye, clickOn.pos, clickOn.face)) {
        this.report(
          'reachability',
          pos,
          `Face ${clickOn.face} of ${fmt(clickOn.pos)} faces away from the player`,
        );
      }
    }
    const head = above(standAt);
    if (this.occupied(standAt) || this.occupied(head)) {
      this.report('reachability', pos, `Stand position ${fmt(standAt)} is not two blocks of air`);
    }
    if (!this.occupiedNonFluid(below(standAt))) {
      this.report('reachability', pos, `Nothing to stand on below ${fmt(standAt)}`);
    }
    if (def?.render.shape === 'full' && (equalsVec3(pos, standAt) || equalsVec3(pos, head))) {
      this.report('reachability', pos, 'A full block cannot be placed inside the player');
    }
  }

  /** support: the block this one attaches to exists now and offers enough support. */
  private checkSupportAtPlacement(pos: Vec3, info: StateInfo): void {
    const need = this.supportNeed(info, pos);
    if (!need) return;
    if (!this.occupied(need.pos)) {
      this.report('support', pos, `${info.block.id} needs a block at ${fmt(need.pos)} first`);
      return;
    }
    const offered = this.offeredSupport(need.pos, need.face);
    if (!satisfiesSupport(offered, need.needs)) {
      this.report(
        'support',
        pos,
        `Face ${need.face} of ${fmt(need.pos)} offers "${offered}" support, ${info.block.id} needs "${need.needs}"`,
      );
    }
  }

  /** gravity: a falling block needs a non-air, non-fluid block below when placed. */
  private checkGravityAtPlacement(pos: Vec3, def: BlockDefinition): void {
    if (def.physics.gravity && !this.occupiedNonFluid(below(pos))) {
      this.report('gravity', pos, `${def.id} would fall: nothing below ${fmt(pos)}`);
    }
  }

  /** orientation: look/click/half/interactions must produce the target's player-controlled properties. */
  private checkOrientation(action: PlaceAction, info: StateInfo, def: BlockDefinition): void {
    const { pos } = action;
    if (!isDirection(action.clickOn.face)) return;
    const derived = derivePlacedProperties(def, info.block, action);
    let usesHorizontal = false;
    let uses3d = false;
    for (const d of derived) {
      const actual = info.block.properties[d.property];
      // A double slab is two placements in one space; its `type` is not derived from the click.
      if (d.source === 'clickedHalf' && actual === 'double') continue;
      if (d.source === 'playerFacing' || d.source === 'playerFacingOpposite') usesHorizontal = true;
      if (d.source === 'playerLook3d' || d.source === 'playerLook3dOpposite') uses3d = true;
      if (d.value === undefined) {
        this.report(
          'orientation',
          pos,
          `${d.property}: clicking face ${action.clickOn.face} cannot place ${info.state}`,
        );
      } else if (actual !== d.value) {
        this.report(
          'orientation',
          pos,
          `${d.property}=${String(actual)} wanted, this placement gives ${d.property}=${d.value} (${d.source})`,
        );
      }
    }

    // Standing vs. wall variant of the same item (torch / wall_torch): the
    // standing variant only results from clicking a top face.
    const item = def.item?.item ?? def.id;
    const variants = this.defsByItem.get(item) ?? [];
    const kind = def.physics.support.kind;
    if (
      kind === 'below' &&
      action.clickOn.face !== 'up' &&
      variants.some((v) => v !== def && v.physics.support.kind === 'facing')
    ) {
      this.report(
        'orientation',
        pos,
        `Clicking face ${action.clickOn.face} places the wall variant, not ${def.id}`,
      );
    }

    // The declared look direction must be achievable while aiming at the clicked face.
    if (usesHorizontal || uses3d) {
      const eye = eyePosition(action.standAt);
      const half =
        action.clickOn.face === 'up' || action.clickOn.face === 'down'
          ? undefined
          : action.clickHalf;
      const want3d = lookDirection3d(action);
      let okH = !usesHorizontal;
      let ok3d = !uses3d;
      for (const p of facePoints(action.clickOn.pos, action.clickOn.face, half)) {
        const dx = p.x - eye.x;
        const dy = p.y - eye.y;
        const dz = p.z - eye.z;
        if (!okH && horizontalOf(dx, dz) === action.look.horizontal) okH = true;
        if (!ok3d && nearest3dOf(dx, dy, dz) === want3d) ok3d = true;
        if (okH && ok3d) break;
      }
      if (!okH) {
        this.report(
          'orientation',
          pos,
          `Cannot look ${action.look.horizontal} while aiming at face ${action.clickOn.face} of ${fmt(action.clickOn.pos)} from ${fmt(action.standAt)}`,
        );
      }
      if (!ok3d) {
        this.report(
          'orientation',
          pos,
          `Cannot look ${want3d} (3D) while aiming at face ${action.clickOn.face} of ${fmt(action.clickOn.pos)} from ${fmt(action.standAt)}`,
        );
      }
    }
  }

  /**
   * redstone-safety:
   * - power sources only from the `power` phase on (the circuit is closed last);
   * - `triggersOnPlace` components never next to an already present power source;
   * - observers after the block they watch (if it is part of the build), except
   *   for fluids (placed last by rule) and mutually facing observer pairs (clock),
   *   where one of the two necessarily comes first.
   */
  private checkRedstoneSafety(
    action: PlaceAction,
    info: StateInfo,
    def: BlockDefinition,
    phase: BuildPhase,
  ): void {
    const { pos } = action;
    if (isPowerSource(def) && PHASE_RANK[phase] < PHASE_RANK.power) {
      this.report('redstone-safety', pos, `Power source ${def.id} placed in phase "${phase}"`);
    }
    if (def.redstone?.triggersOnPlace) {
      for (const dir of DIRECTIONS) {
        const n = addVec3(pos, DIRECTION_OFFSET[dir]);
        const cell = this.world.get(vec3Key(n));
        if (cell && isPowerSource(cell.info.def)) {
          this.report(
            'redstone-safety',
            pos,
            `${def.id} placed next to power source ${cell.info.block.id} at ${fmt(n)}`,
          );
          break;
        }
      }
    }
    if (def.redstone?.role === 'observer') {
      const facing = info.block.properties['facing'];
      if (facing === undefined || !isDirection(facing)) return;
      const watched = addVec3(pos, DIRECTION_OFFSET[facing]);
      const want = this.target.get(vec3Key(watched));
      if (!want || isFluid(want.def)) return;
      const have = this.world.get(vec3Key(watched));
      if (have && have.info.state === want.state) return;
      const mutual =
        want.def?.redstone?.role === 'observer' &&
        want.block.properties['facing'] === OPPOSITE[facing];
      if (mutual) return;
      this.report(
        'redstone-safety',
        pos,
        `Observer placed before the block it watches at ${fmt(watched)} (${want.state})`,
      );
    }
  }

  // ---------------------------------------------------------------- remove

  private remove(action: RemoveAction): void {
    const { pos } = action;
    const key = vec3Key(pos);
    const cell = this.world.get(key);
    if (!cell) {
      this.report('temporary-cleanup', pos, `Nothing to remove at ${fmt(pos)}`);
      return;
    }
    if (!cell.temporary) {
      this.report(
        'temporary-cleanup',
        pos,
        `Removes ${cell.info.state}, which is not a temporary block`,
      );
      return;
    }
    if (cell.info.state !== action.state) {
      this.report(
        'temporary-cleanup',
        pos,
        `Expected ${action.state} at ${fmt(pos)}, found ${cell.info.state}`,
      );
    }
    if (this.fluidsStarted && this.touchesFluid(pos)) {
      this.report('fluids-last', pos, `Removal at ${fmt(pos)} next to a fluid lets it flow`);
    }

    const removed: Vec3[] = [pos];
    this.world.delete(key);
    const part = this.implicitPart(cell.info, pos);
    if (part && this.world.get(vec3Key(part.pos))?.info.state === part.info.state) {
      this.world.delete(vec3Key(part.pos));
      removed.push(part.pos);
    }
    for (const r of removed) this.checkNeighboursAfterRemoval(r);
  }

  /** Any of the six neighbours holds (or will hold, per the build) a fluid. */
  private touchesFluid(pos: Vec3): boolean {
    return DIRECTIONS.some((dir) => {
      const key = vec3Key(addVec3(pos, DIRECTION_OFFSET[dir]));
      return isFluid(this.world.get(key)?.info.def) || isFluid(this.target.get(key)?.def);
    });
  }

  /** support + gravity: nothing may lose the block it depends on. */
  private checkNeighboursAfterRemoval(removed: Vec3): void {
    for (const dir of DIRECTIONS) {
      const n = addVec3(removed, DIRECTION_OFFSET[dir]);
      const cell = this.world.get(vec3Key(n));
      if (!cell?.info.def) continue;
      const need = this.supportNeed(cell.info, n);
      if (need && equalsVec3(need.pos, removed)) {
        this.report(
          'support',
          removed,
          `Removing ${fmt(removed)} leaves ${cell.info.block.id} at ${fmt(n)} without support`,
        );
      }
      if (dir === 'up' && cell.info.def.physics.gravity) {
        this.report(
          'gravity',
          removed,
          `Removing ${fmt(removed)} lets ${cell.info.block.id} at ${fmt(n)} fall`,
        );
      }
    }
  }

  // ---------------------------------------------------------------- final state

  private checkFinalState(): void {
    // temporary-cleanup: every temporary block is gone.
    for (const [key, cell] of this.world) {
      if (!cell.temporary) continue;
      const [x, y, z] = key.split(',').map(Number) as [number, number, number];
      this.report(
        'temporary-cleanup',
        { x, y, z },
        `Temporary ${cell.info.state} is never removed`,
        cell.step,
        cell.action,
      );
    }
    // completeness: every build block is present with its exact state.
    const optional = new FlowingFluidCheck(this.target, this.targetPos, this.world);
    for (const [key, want] of this.target) {
      const have = this.world.get(key);
      if (have && !have.temporary && have.info.state === want.state) continue;
      if (this.completenessFlagged.has(key)) continue;
      const pos = this.targetPos.get(key) as Vec3;
      if (optional.isOptional(key, want)) continue;
      const why = this.isGround(pos) ? ' (inside the terrain below groundY)' : '';
      this.reportCompleteness(pos, `${want.state} at ${fmt(pos)} is never placed${why}`, -1, -1);
    }
  }
}

/**
 * Flowing fluid (level > 0) in the document appears by itself once its source is
 * there, so it is optional: a flowing cell is satisfied if the document fluid
 * body it belongs to (6-connected cells of the same fluid) contains a source that
 * was placed in the simulated world.
 */
class FlowingFluidCheck {
  private readonly component = new Map<string, boolean>();

  constructor(
    private readonly target: ReadonlyMap<string, StateInfo>,
    private readonly targetPos: ReadonlyMap<string, Vec3>,
    private readonly world: ReadonlyMap<string, Cell>,
  ) {}

  isOptional(key: string, want: StateInfo): boolean {
    if (!isFluid(want.def) || want.block.properties['level'] === '0') return false;
    const cached = this.component.get(key);
    if (cached !== undefined) return cached;
    const id = want.block.id;
    const seen = new Set<string>([key]);
    const queue = [key];
    let hasSource = false;
    while (queue.length > 0) {
      const k = queue.pop() as string;
      const info = this.target.get(k) as StateInfo;
      if (info.block.properties['level'] === '0' && this.world.get(k)?.info.state === info.state) {
        hasSource = true;
      }
      const p = this.targetPos.get(k) as Vec3;
      for (const dir of DIRECTIONS) {
        const nk = vec3Key(addVec3(p, DIRECTION_OFFSET[dir]));
        if (!seen.has(nk) && this.target.get(nk)?.block.id === id) {
          seen.add(nk);
          queue.push(nk);
        }
      }
    }
    for (const k of seen) this.component.set(k, hasSource);
    return hasSource;
  }
}
