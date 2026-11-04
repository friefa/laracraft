import type { Box3, BuildDocument } from '@laracraft/core-model';
import type { GhostBlock, HighlightGroup, ViewInsets, VoxelPick } from '@laracraft/renderer';
import type { EditorRenderer, LookDirection } from '../renderer-loader';

type TapHandler = (pick: VoxelPick | null, event: PointerEvent) => void;

/** In-memory {@link EditorRenderer} for component tests: records calls, emits taps. */
export class FakeRenderer implements EditorRenderer {
  doc: BuildDocument | null = null;
  updates = 0;
  layerLimit: number | null = null;
  selectionBox: Box3 | null = null;
  ghosts: readonly GhostBlock[] = [];
  highlights: readonly HighlightGroup[] = [];
  frames: (Box3 | undefined)[] = [];
  disposed = false;
  look: LookDirection = { facing: 'north', pitch: 'level', yawDegrees: 0, pitchDegrees: 0 };
  lookQueries = 0;
  insets: ViewInsets[] = [];
  private readonly handlers = new Set<TapHandler>();

  setDocument(doc: BuildDocument): void {
    this.doc = doc;
  }
  update(): void {
    this.updates++;
  }
  setLayerLimit(maxY: number | null): void {
    this.layerLimit = maxY;
  }
  setHighlights(groups: readonly HighlightGroup[]): void {
    this.highlights = groups;
  }
  setGhosts(blocks: readonly GhostBlock[]): void {
    this.ghosts = blocks;
  }
  setSelectionBox(box: Box3 | null): void {
    this.selectionBox = box;
  }
  pick(): VoxelPick | null {
    return null;
  }
  onTap(handler: TapHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }
  frame(box?: Box3): void {
    this.frames.push(box);
  }
  stats() {
    return { fps: 60, drawCalls: 0, triangles: 0, chunks: 0 };
  }
  dispose(): void {
    this.disposed = true;
  }
  setViewInsets(insets: ViewInsets): void {
    this.insets.push(insets);
  }
  lookDirection(): LookDirection {
    this.lookQueries++;
    return this.look;
  }

  /** Simulates a tap/click that was not a camera gesture. */
  tap(
    pick: VoxelPick | null,
    modifiers: Partial<Pick<PointerEvent, 'shiftKey' | 'button'>> = {},
  ): void {
    const event = {
      button: 0,
      shiftKey: false,
      altKey: false,
      ctrlKey: false,
      metaKey: false,
      ...modifiers,
    } as PointerEvent;
    for (const handler of [...this.handlers]) handler(pick, event);
  }
}
