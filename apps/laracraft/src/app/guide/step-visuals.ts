import type { BuildPlan, PlaceAction, StepAction } from '@laracraft/build-order';
import type { Vec3 } from '@laracraft/core-model';
import type { GhostBlock, HighlightGroup } from '@laracraft/renderer';

export const GUIDE_COLORS = {
  current: 0x4caf50,
  removal: 0xe53935,
  selected: 0xffd600,
  stand: 0x2196f3,
  clickTarget: 0xff9800,
  hint: 0xab47bc,
} as const;

export interface StepVisualOptions {
  /** Show the next step's placements as ghosts. */
  readonly showNext: boolean;
  /** Only render up to the step's highest layer. */
  readonly layerOnly: boolean;
  readonly selected?: StepAction | null;
  /** Positions of a selected hint. */
  readonly hintPositions?: readonly Vec3[];
}

export interface StepVisuals {
  readonly highlights: HighlightGroup[];
  readonly ghosts: GhostBlock[];
  readonly layerLimit: number | null;
}

const above = (p: Vec3): Vec3 => ({ x: p.x, y: p.y + 1, z: p.z });

/**
 * Highlights, ghosts and layer limit for step `index`: the step's placements
 * are filled green, its removals outlined red (with a ghost of the removed
 * block), the next step optionally shown as ghosts, and the selected action
 * gets markers for itself, the player's stand position and the clicked block.
 */
export function stepVisuals(
  plan: BuildPlan,
  index: number,
  options: StepVisualOptions,
): StepVisuals {
  const step = plan.steps[index];
  if (!step) return { highlights: [], ghosts: [], layerLimit: null };
  const placed = step.actions.filter((a): a is PlaceAction => a.kind === 'place');
  const removed = step.actions.filter((a) => a.kind === 'remove');

  const highlights: HighlightGroup[] = [
    {
      id: 'current',
      positions: placed.map((a) => a.pos),
      color: GUIDE_COLORS.current,
      style: 'fill',
    },
  ];
  if (removed.length > 0) {
    highlights.push({
      id: 'removal',
      positions: removed.map((a) => a.pos),
      color: GUIDE_COLORS.removal,
      style: 'outline',
    });
  }
  const ghosts: GhostBlock[] = removed.map((a) => ({ pos: a.pos, state: a.state }));
  if (options.showNext) {
    for (const a of plan.steps[index + 1]?.actions ?? []) {
      if (a.kind === 'place') ghosts.push({ pos: a.pos, state: a.state });
    }
  }

  const sel = options.selected;
  if (sel) {
    highlights.push({
      id: 'selected',
      positions: [sel.pos],
      color: GUIDE_COLORS.selected,
      style: 'outline',
    });
    if (sel.kind === 'remove' && sel.standAt) {
      highlights.push({
        id: 'stand',
        positions: [sel.standAt, above(sel.standAt)],
        color: GUIDE_COLORS.stand,
        style: 'fill',
      });
    }
    if (sel.kind === 'place') {
      highlights.push(
        {
          id: 'stand',
          positions: [sel.standAt, above(sel.standAt)],
          color: GUIDE_COLORS.stand,
          style: 'fill',
        },
        {
          id: 'click-target',
          positions: [sel.clickOn.pos],
          color: GUIDE_COLORS.clickTarget,
          style: 'outline',
        },
      );
    }
  }
  if (options.hintPositions?.length) {
    highlights.push({
      id: 'hint',
      positions: options.hintPositions,
      color: GUIDE_COLORS.hint,
      style: 'outline',
    });
  }

  return {
    highlights,
    ghosts,
    layerLimit: options.layerOnly ? step.yRange[1] : null,
  };
}
