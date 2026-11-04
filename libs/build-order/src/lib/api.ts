import type { BlockRegistry, BuildDocument, BuildFileV1 } from '@laracraft/core-model';
import type { BuildOrderOptions, BuildPlan, ValidationIssue } from './types';

/**
 * Public entry points (contract). Implemented in `planner/plan-build.ts` and
 * `validator/validate-plan.ts`; re-exported from the lib index.
 *
 * export function planBuild(doc: BuildDocument, registry: BlockRegistry,
 *   options?: Partial<BuildOrderOptions>): BuildPlan;
 * export function validatePlan(doc: BuildDocument, registry: BlockRegistry, plan: BuildPlan,
 *   options?: Partial<BuildOrderOptions>): ValidationIssue[];
 */
export type PlanBuildFn = (
  doc: BuildDocument,
  registry: BlockRegistry,
  options?: Partial<BuildOrderOptions>,
) => BuildPlan;

export type ValidatePlanFn = (
  doc: BuildDocument,
  registry: BlockRegistry,
  plan: BuildPlan,
  options?: Partial<BuildOrderOptions>,
) => ValidationIssue[];

/** Web Worker protocol (main thread ⇄ build-order worker). */
export type BuildOrderRequest = {
  readonly type: 'plan';
  readonly id: number;
  readonly file: BuildFileV1;
  readonly options?: Partial<BuildOrderOptions>;
};

export type BuildOrderResponse =
  | {
      readonly type: 'progress';
      readonly id: number;
      readonly done: number;
      readonly total: number;
    }
  | { readonly type: 'result'; readonly id: number; readonly plan: BuildPlan }
  | { readonly type: 'error'; readonly id: number; readonly message: string };
