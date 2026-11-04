import {
  AIR,
  type BlockChange,
  type BlockRegistry,
  type BlockStateString,
  type BuildDocument,
  type ChangeSet,
  mirrorState,
  rotateStateY,
} from '@laracraft/core-model';
import { boxCells, bresenham3d, rotateLocal, rotatedBox } from '../geometry';
import {
  DEFAULT_DSL_LIMITS,
  type DslError,
  type DslLimits,
  type OperationReport,
  type Pos,
} from '../types';
import { type BlockPattern, createPatternMatcher, replacementState } from '../validate/block-args';
import type { ModuleCatalogue } from '../validate/module-catalogue';
import {
  type ResolvedOperation,
  type ResolveResult,
  resolveOperation,
  resolveToolCall,
} from '../validate/validate-operation';
import { roofCells, roofStates } from './roof';

/**
 * Lara DSL interpreter: turns validated operations into ONE {@link ChangeSet} per Lara turn
 * (origin `'lara'`, one undo step).
 *
 * The interpreter never mutates the document. It reads through an overlay of the changes
 * made earlier in the same turn, so later operations see earlier ones. Two ways to use it:
 *
 * - **Batch** — {@link applyOperations}: all operations of a turn at once, all-or-nothing.
 * - **Streaming** — {@link createLaraTurn}: apply operations one by one as tool calls stream
 *   in. Each step returns its own delta (render it as a preview, or `doc.apply` it right
 *   away); {@link LaraTurn.finish} returns the merged change set for the undo stack. An
 *   invalid operation is rejected on its own (no effect) so its errors can go back to the
 *   model as a tool error. While a turn is open, the document must only change through the
 *   turn's own step deltas.
 */

export interface InterpreterOptions {
  readonly limits?: DslLimits;
  /** Catalogue for `insertModule`. */
  readonly modules?: ModuleCatalogue;
  /** ChangeSet label (UI text, already localised by the caller). Default `'Lara'`. */
  readonly label?: string;
}

export interface OperationErrors {
  /** Index of the operation in the turn (in call order). */
  readonly index: number;
  readonly errors: readonly DslError[];
}

export interface ApplyResult {
  /** Merged changes of the turn; empty when there are errors (all-or-nothing). */
  readonly changeSet: ChangeSet;
  /** One report per operation (empty when there are errors). */
  readonly reports: readonly OperationReport[];
  /** Errors per failing operation; empty on success. */
  readonly errors: readonly OperationErrors[];
}

export type StepResult =
  | {
      readonly ok: true;
      readonly report: OperationReport;
      /** Delta of this step only: `before` = state before this operation (turn view). */
      readonly changes: readonly BlockChange[];
    }
  | { readonly ok: false; readonly errors: readonly DslError[] };

export interface LaraTurn {
  /** Validates and applies one operation (contract form, e.g. from the SSE stream). */
  apply(operation: unknown): StepResult;
  /** Validates and applies one tool call (tool name + arguments, see `LARA_TOOLS`). */
  applyToolCall(name: string, input: unknown): StepResult;
  /** State of a cell as seen by this turn (document + changes so far). */
  getBlock(x: number, y: number, z: number): BlockStateString;
  /** Number of operations offered so far (accepted and rejected). */
  readonly operationCount: number;
  /** Number of distinct cells changed so far in this turn. */
  readonly changedCells: number;
  readonly reports: readonly OperationReport[];
  /** The whole turn as one change set relative to the document at turn start. */
  finish(): ChangeSet;
}

interface Touched {
  readonly pos: Pos;
  readonly original: BlockStateString;
  current: BlockStateString;
}

const key = (x: number, y: number, z: number): string => `${x},${y},${z}`;

/** Starts a Lara turn (streaming accumulator). */
export function createLaraTurn(
  doc: BuildDocument,
  registry: BlockRegistry,
  opts: InterpreterOptions = {},
): LaraTurn {
  const limits = opts.limits ?? DEFAULT_DSL_LIMITS;
  const ctx = opts.modules ? { modules: opts.modules } : {};
  const touched = new Map<string, Touched>();
  const reports: OperationReport[] = [];
  let operationCount = 0;

  const getBlock = (x: number, y: number, z: number): BlockStateString =>
    touched.get(key(x, y, z))?.current ?? doc.getBlock(x, y, z);

  const step = (resolve: () => ResolveResult): StepResult => {
    if (operationCount >= limits.maxOpsPerTurn) {
      operationCount++;
      return {
        ok: false,
        errors: [
          {
            code: 'limit',
            path: '',
            message: `at most ${limits.maxOpsPerTurn} operations per turn; finish this answer and continue in the next one`,
          },
        ],
      };
    }
    operationCount++;
    const r = resolve();
    if (!r.ok) return r;
    const writes = execute(r.resolved, registry, getBlock);
    // Effective changes of this step (later writes to the same cell win).
    const changes: BlockChange[] = [];
    let newCells = 0;
    for (const w of writes.values()) {
      const before = getBlock(w.pos.x, w.pos.y, w.pos.z);
      if (before === w.state) continue;
      changes.push({ pos: w.pos, before, after: w.state });
      if (!touched.has(key(w.pos.x, w.pos.y, w.pos.z))) newCells++;
    }
    if (touched.size + newCells > limits.maxCellsPerTurn) {
      return {
        ok: false,
        errors: [
          {
            code: 'limit',
            path: '',
            message: `this operation would bring the turn to ${touched.size + newCells} changed cells; at most ${limits.maxCellsPerTurn} per turn`,
          },
        ],
      };
    }
    for (const c of changes) {
      const k = key(c.pos.x, c.pos.y, c.pos.z);
      const t = touched.get(k);
      if (t) t.current = c.after;
      else touched.set(k, { pos: c.pos, original: c.before, current: c.after });
    }
    const report = makeReport(r.resolved.op, changes);
    reports.push(report);
    return { ok: true, report, changes };
  };

  return {
    apply: (operation) => step(() => resolveOperation(operation, registry, limits, ctx)),
    applyToolCall: (name, input) => step(() => resolveToolCall(name, input, registry, limits, ctx)),
    getBlock,
    get operationCount() {
      return operationCount;
    },
    get changedCells() {
      return touched.size;
    },
    reports,
    finish() {
      const changes: BlockChange[] = [];
      for (const t of touched.values()) {
        if (t.current !== t.original) {
          changes.push({ pos: t.pos, before: t.original, after: t.current });
        }
      }
      return { changes, origin: 'lara', label: opts.label ?? 'Lara' };
    },
  };
}

/**
 * Applies all operations of one Lara turn. All-or-nothing: if any operation is invalid or a
 * limit is exceeded, the change set is empty and `errors` lists every failing operation.
 * The document is not modified; commit `changeSet` as one undo step.
 */
export function applyOperations(
  doc: BuildDocument,
  registry: BlockRegistry,
  ops: readonly unknown[],
  opts: InterpreterOptions = {},
): ApplyResult {
  const limits = opts.limits ?? DEFAULT_DSL_LIMITS;
  const empty: ChangeSet = { changes: [], origin: 'lara', label: opts.label ?? 'Lara' };
  if (!Array.isArray(ops)) {
    return {
      changeSet: empty,
      reports: [],
      errors: [
        {
          index: 0,
          errors: [{ code: 'schema', path: '', message: 'expected a list of operations' }],
        },
      ],
    };
  }
  if (ops.length > limits.maxOpsPerTurn) {
    return {
      changeSet: empty,
      reports: [],
      errors: [
        {
          index: limits.maxOpsPerTurn,
          errors: [
            {
              code: 'limit',
              path: '',
              message: `${ops.length} operations; at most ${limits.maxOpsPerTurn} per turn`,
            },
          ],
        },
      ],
    };
  }
  const turn = createLaraTurn(doc, registry, opts);
  const errors: OperationErrors[] = [];
  ops.forEach((op, index) => {
    const r = turn.apply(op);
    if (!r.ok) errors.push({ index, errors: r.errors });
  });
  if (errors.length) return { changeSet: empty, reports: [], errors };
  return { changeSet: turn.finish(), reports: [...turn.reports], errors: [] };
}

/**
 * Single-operation variant: validates and interprets one operation against the document
 * (as its own turn). For streaming several operations into one undo step use
 * {@link createLaraTurn}.
 */
export function applyOperation(
  doc: BuildDocument,
  registry: BlockRegistry,
  op: unknown,
  opts: InterpreterOptions = {},
): ApplyResult {
  return applyOperations(doc, registry, [op], opts);
}

function makeReport(op: OperationReport['op'], changes: readonly BlockChange[]): OperationReport {
  const counts = new Map<BlockStateString, number>();
  for (const c of changes) counts.set(c.after, (counts.get(c.after) ?? 0) + 1);
  const blocks = [...counts]
    .map(([state, count]) => ({ state, count }))
    .sort((a, b) => b.count - a.count || (a.state < b.state ? -1 : a.state > b.state ? 1 : 0));
  return { op, changed: changes.length, blocks };
}

type Writes = Map<string, { pos: Pos; state: BlockStateString }>;

/** Computes the writes of one operation from the current turn view (pure). */
function execute(
  op: ResolvedOperation,
  registry: BlockRegistry,
  read: (x: number, y: number, z: number) => BlockStateString,
): Writes {
  const writes: Writes = new Map();
  const write = (pos: Pos, state: BlockStateString): void => {
    const k = key(pos.x, pos.y, pos.z);
    // Re-inserting moves the entry to the end, so iteration order follows the last write.
    writes.delete(k);
    writes.set(k, { pos, state });
  };
  const masked = (mask: readonly BlockPattern[] | undefined) => {
    const match = mask ? createPatternMatcher(mask) : undefined;
    return (pos: Pos, state: BlockStateString): void => {
      if (match && !match(read(pos.x, pos.y, pos.z))) return;
      write(pos, state);
    };
  };

  switch (op.op) {
    case 'fill':
    case 'floor': {
      const put = masked(op.mask);
      for (const pos of boxCells(op.box)) put(pos, op.state);
      break;
    }
    case 'hollowBox': {
      const put = masked(op.mask);
      const { min, max } = op.box;
      for (const pos of boxCells(op.box)) {
        const shell =
          pos.x === min.x ||
          pos.x === max.x ||
          pos.y === min.y ||
          pos.y === max.y ||
          pos.z === min.z ||
          pos.z === max.z;
        if (shell) put(pos, op.state);
        else if (!op.keepInterior) put(pos, AIR);
      }
      break;
    }
    case 'line': {
      const put = masked(op.mask);
      for (const pos of bresenham3d(op.from, op.to)) put(pos, op.state);
      break;
    }
    case 'wall': {
      const put = masked(op.mask);
      const base = bresenham3d({ ...op.from, y: 0 }, { ...op.to, y: 0 });
      for (let dy = 0; dy < op.height; dy++) {
        for (const p of base) put({ x: p.x, y: op.from.y + dy, z: p.z }, op.state);
      }
      break;
    }
    case 'roof':
      for (const c of roofStates(registry, roofCells(op.spec), op.stairs, op.block)) {
        write(c.pos, c.state);
      }
      break;
    case 'placeBlock':
      write(op.pos, op.state);
      break;
    case 'replace': {
      const match = createPatternMatcher([op.from]);
      const cache = new Map<BlockStateString, BlockStateString>();
      for (const pos of boxCells(op.box)) {
        const current = read(pos.x, pos.y, pos.z);
        if (!match(current)) continue;
        let next = cache.get(current);
        if (next === undefined) {
          next = replacementState(registry, op.to, current);
          cache.set(current, next);
        }
        write(pos, next);
      }
      break;
    }
    case 'clear':
      for (const pos of boxCells(op.box)) write(pos, AIR);
      break;
    case 'mirror': {
      const { min, max } = op.box;
      const cache = new Map<BlockStateString, BlockStateString>();
      const snapshot = [...boxCells(op.box)].map((pos) => ({
        pos,
        state: read(pos.x, pos.y, pos.z),
      }));
      for (const { pos, state } of snapshot) {
        let mirrored = cache.get(state);
        if (mirrored === undefined) {
          mirrored = state === AIR ? AIR : mirrorState(registry, state, op.axis);
          cache.set(state, mirrored);
        }
        const target =
          op.axis === 'x'
            ? { x: min.x + max.x - pos.x, y: pos.y, z: pos.z }
            : { x: pos.x, y: pos.y, z: min.z + max.z - pos.z };
        write(target, mirrored);
      }
      break;
    }
    case 'rotate': {
      const { min, max } = op.box;
      const sx = max.x - min.x + 1;
      const sz = max.z - min.z + 1;
      const cache = new Map<BlockStateString, BlockStateString>();
      const snapshot = [...boxCells(op.box)].map((pos) => ({
        pos,
        state: read(pos.x, pos.y, pos.z),
      }));
      const target = rotatedBox(op.box, op.turns);
      // Source cells outside the result become air; the result overwrites its whole box.
      for (const { pos } of snapshot) write(pos, AIR);
      for (const { pos, state } of snapshot) {
        let rotated = cache.get(state);
        if (rotated === undefined) {
          rotated = state === AIR ? AIR : rotateStateY(registry, state, op.turns);
          cache.set(state, rotated);
        }
        const l = rotateLocal(pos.x - min.x, pos.z - min.z, sx, sz, op.turns);
        write({ x: target.min.x + l.x, y: pos.y, z: target.min.z + l.z }, rotated);
      }
      break;
    }
    case 'copy': {
      const { min } = op.box;
      const snapshot = [...boxCells(op.box)].map((pos) => ({
        pos,
        state: read(pos.x, pos.y, pos.z),
      }));
      for (let i = 0; i < op.repeat; i++) {
        const ox = op.to.x + i * op.step.x - min.x;
        const oy = op.to.y + i * op.step.y - min.y;
        const oz = op.to.z + i * op.step.z - min.z;
        for (const { pos, state } of snapshot) {
          write({ x: pos.x + ox, y: pos.y + oy, z: pos.z + oz }, state);
        }
      }
      break;
    }
    case 'insertModule':
      for (const b of op.blocks) write(b.pos, b.state);
      break;
  }
  return writes;
}
