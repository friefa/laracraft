import type { BlockStateString, Box3, Vec3 } from '@laracraft/core-model';
import * as THREE from 'three';
import type { GhostBlock, HighlightGroup } from './api';

/** Edges of a unit cube as 12 segments (pairs of corner indices; corner bit 0 = x, 1 = y, 2 = z). */
const EDGES: readonly (readonly [number, number])[] = [
  [0, 1],
  [2, 3],
  [4, 5],
  [6, 7],
  [0, 2],
  [1, 3],
  [4, 6],
  [5, 7],
  [0, 4],
  [1, 5],
  [2, 6],
  [3, 7],
];

/**
 * Line-segment positions (xyz pairs) outlining each block cell, grown by `inset` on every
 * side so the lines sit just outside the block faces. 24 vertices per block.
 */
export function blockOutlinePositions(positions: readonly Vec3[], inset = 0.004): Float32Array {
  const out = new Float32Array(positions.length * EDGES.length * 2 * 3);
  let o = 0;
  for (const p of positions) {
    for (const [a, b] of EDGES) {
      for (const c of [a, b]) {
        out[o++] = p.x + (c & 1 ? 1 + inset : -inset);
        out[o++] = p.y + (c & 2 ? 1 + inset : -inset);
        out[o++] = p.z + (c & 4 ? 1 + inset : -inset);
      }
    }
  }
  return out;
}

/** Line-segment positions outlining an inclusive block box. */
export function boxOutlinePositions(box: Box3, inset = 0.01): Float32Array {
  const min = [box.min.x - inset, box.min.y - inset, box.min.z - inset];
  const max = [box.max.x + 1 + inset, box.max.y + 1 + inset, box.max.z + 1 + inset];
  const out = new Float32Array(EDGES.length * 2 * 3);
  let o = 0;
  for (const [a, b] of EDGES) {
    for (const c of [a, b]) {
      out[o++] = (c & 1 ? max[0] : min[0]) as number;
      out[o++] = (c & 2 ? max[1] : min[1]) as number;
      out[o++] = (c & 4 ? max[2] : min[2]) as number;
    }
  }
  return out;
}

/** Groups ghost blocks by state (one instanced draw per state). */
export function groupGhosts(blocks: readonly GhostBlock[]): Map<BlockStateString, Vec3[]> {
  const map = new Map<BlockStateString, Vec3[]>();
  for (const b of blocks) {
    let list = map.get(b.state);
    if (!list) map.set(b.state, (list = []));
    list.push(b.pos);
  }
  return map;
}

function disposeTree(
  root: THREE.Object3D,
  keepGeometry?: (g: THREE.BufferGeometry) => boolean,
): void {
  root.traverse((obj) => {
    if (obj instanceof THREE.InstancedMesh) obj.dispose();
    const withGeometry = obj as THREE.Object3D & {
      geometry?: THREE.BufferGeometry;
      material?: THREE.Material | THREE.Material[];
    };
    if (withGeometry.geometry && !keepGeometry?.(withGeometry.geometry)) {
      withGeometry.geometry.dispose();
    }
    const mat = withGeometry.material;
    if (mat && !(mat as THREE.Material).userData['shared']) {
      if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
      else mat.dispose();
    }
  });
}

/**
 * Highlights, ghosts, selection box and ground grid. Pure scene-graph code (no renderer),
 * so it can be exercised in Node.
 */
export class Overlays {
  readonly root = new THREE.Group();
  private readonly highlights = new THREE.Group();
  private readonly ghosts = new THREE.Group();
  private selection: THREE.LineSegments | null = null;
  private grid: THREE.GridHelper | null = null;
  private gridKey = '';
  private readonly unitBox = new THREE.BoxGeometry(1.01, 1.01, 1.01).translate(0.5, 0.5, 0.5);
  private ghostGeometries = new Set<THREE.BufferGeometry>();

  constructor(
    private readonly ghostMaterial: THREE.Material,
    /** Unit-space geometry of a blockstate (cached by the caller; not disposed here). */
    private readonly geometryForState: (state: BlockStateString) => THREE.BufferGeometry,
  ) {
    this.root.name = 'overlays';
    this.highlights.name = 'highlights';
    this.ghosts.name = 'ghosts';
    ghostMaterial.userData['shared'] = true;
    this.root.add(this.highlights, this.ghosts);
  }

  setHighlights(groups: readonly HighlightGroup[]): void {
    this.clearGroup(this.highlights);
    for (const g of groups) {
      if (g.positions.length === 0) continue;
      if (g.style === 'outline') {
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute(
          'position',
          new THREE.BufferAttribute(blockOutlinePositions(g.positions), 3),
        );
        const lines = new THREE.LineSegments(
          geometry,
          new THREE.LineBasicMaterial({ color: g.color, transparent: true, opacity: 0.95 }),
        );
        lines.name = g.id;
        lines.renderOrder = 10;
        this.highlights.add(lines);
      } else {
        const material = new THREE.MeshBasicMaterial({
          color: g.color,
          transparent: true,
          opacity: 0.35,
          depthWrite: false,
          polygonOffset: true,
          polygonOffsetFactor: -1,
          polygonOffsetUnits: -1,
        });
        const mesh = new THREE.InstancedMesh(this.unitBox, material, g.positions.length);
        const m = new THREE.Matrix4();
        g.positions.forEach((p, i) => mesh.setMatrixAt(i, m.makeTranslation(p.x, p.y, p.z)));
        mesh.instanceMatrix.needsUpdate = true;
        mesh.computeBoundingSphere();
        mesh.name = g.id;
        mesh.renderOrder = 10;
        this.highlights.add(mesh);
      }
    }
  }

  setGhosts(blocks: readonly GhostBlock[]): void {
    this.clearGroup(this.ghosts);
    const m = new THREE.Matrix4();
    for (const [state, positions] of groupGhosts(blocks)) {
      const geometry = this.geometryForState(state);
      this.ghostGeometries.add(geometry);
      const mesh = new THREE.InstancedMesh(geometry, this.ghostMaterial, positions.length);
      positions.forEach((p, i) => mesh.setMatrixAt(i, m.makeTranslation(p.x, p.y, p.z)));
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
      mesh.name = state;
      mesh.renderOrder = 5;
      this.ghosts.add(mesh);
    }
  }

  setSelectionBox(box: Box3 | null): void {
    if (this.selection) {
      this.root.remove(this.selection);
      disposeTree(this.selection);
      this.selection = null;
    }
    if (!box) return;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(boxOutlinePositions(box), 3));
    this.selection = new THREE.LineSegments(
      geometry,
      new THREE.LineBasicMaterial({ color: 0xffd23f, depthTest: false, transparent: true }),
    );
    this.selection.name = 'selection';
    this.selection.renderOrder = 20;
    this.root.add(this.selection);
  }

  /**
   * Ground grid at `y` (block boundary) covering the X/Z extent of `bounds` plus a margin,
   * aligned to block edges. Rebuilt only when the extent changes.
   */
  setGrid(y: number, bounds: Box3 | null, margin = 8): void {
    const minX = (bounds?.min.x ?? 0) - margin;
    const maxX = (bounds?.max.x ?? 0) + 1 + margin;
    const minZ = (bounds?.min.z ?? 0) - margin;
    const maxZ = (bounds?.max.z ?? 0) + 1 + margin;
    // Even square size around an integer centre keeps the lines on block edges.
    let size = Math.max(32, maxX - minX, maxZ - minZ);
    size += size % 2;
    const cx = Math.round((minX + maxX) / 2);
    const cz = Math.round((minZ + maxZ) / 2);
    const key = `${y},${size},${cx},${cz}`;
    if (key === this.gridKey) return;
    this.gridKey = key;
    if (this.grid) {
      this.root.remove(this.grid);
      disposeTree(this.grid);
    }
    const grid = new THREE.GridHelper(size, size, 0x000000, 0x000000);
    const mat = grid.material as THREE.Material;
    mat.transparent = true;
    mat.opacity = 0.12;
    mat.depthWrite = false;
    grid.position.set(cx, y + 0.001, cz);
    grid.name = 'grid';
    grid.renderOrder = -1;
    this.grid = grid;
    this.root.add(grid);
  }

  /** Visible grid extent for tests/debugging. */
  get gridInfo(): { y: number; size: number; cx: number; cz: number } | null {
    if (!this.grid || !this.gridKey) return null;
    const [y, size, cx, cz] = this.gridKey.split(',').map(Number);
    return { y: y ?? 0, size: size ?? 0, cx: cx ?? 0, cz: cz ?? 0 };
  }

  dispose(): void {
    this.clearGroup(this.highlights);
    this.clearGroup(this.ghosts);
    this.setSelectionBox(null);
    if (this.grid) {
      this.root.remove(this.grid);
      disposeTree(this.grid);
    }
    this.grid = null;
    this.gridKey = '';
    this.unitBox.dispose();
  }

  private clearGroup(group: THREE.Group): void {
    const keep = (g: THREE.BufferGeometry): boolean =>
      g === this.unitBox || this.ghostGeometries.has(g);
    for (const child of [...group.children]) {
      group.remove(child);
      disposeTree(child, keep);
    }
    if (group === this.ghosts) this.ghostGeometries = new Set();
  }
}
