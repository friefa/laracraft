import type { BlockStateString } from '@laracraft/core-model';
import * as THREE from 'three';
import type { ChunkMeshOutput, MeshBuffers } from '../mesh/types';
import { createBlockMaterial, geometryFromBuffers } from './block-material';
import { ChunkMeshes } from './chunk-meshes';
import {
  blockOutlinePositions,
  boxOutlinePositions,
  groupGhosts,
  highlightOpacity,
  Overlays,
} from './overlays';

const empty: MeshBuffers = {
  positions: new Float32Array(0),
  normals: new Float32Array(0),
  uvs: new Float32Array(0),
  layers: new Float32Array(0),
  colors: new Float32Array(0),
  indices: new Uint32Array(0),
};

function quad(x: number): MeshBuffers {
  return {
    positions: new Float32Array([x, 0, 0, x + 1, 0, 0, x + 1, 1, 0, x, 1, 0]),
    normals: new Float32Array(12),
    uvs: new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]),
    layers: new Float32Array([2, 2, 2, 2]),
    colors: new Float32Array(12).fill(1),
    indices: new Uint32Array([0, 1, 2, 0, 2, 3]),
  };
}

const tex = new THREE.DataArrayTexture(new Uint8Array(16 * 16 * 4), 16, 16, 1);
const materials = {
  opaque: createBlockMaterial('opaque', tex),
  cutout: createBlockMaterial('cutout', tex),
  translucent: createBlockMaterial('translucent', tex),
};

describe('block material', () => {
  it('configures passes', () => {
    expect(materials.opaque.transparent).toBe(false);
    expect(materials.opaque.defines).toHaveProperty('OPAQUE_PASS');
    expect(materials.cutout.uniforms['alphaCutoff']?.value).toBe(0.5);
    expect(materials.translucent.transparent).toBe(true);
    expect(materials.translucent.depthWrite).toBe(false);
    const ghost = createBlockMaterial('ghost', tex, 0.4);
    expect(ghost.uniforms['opacity']?.value).toBe(0.4);
    expect(ghost.transparent).toBe(true);
  });

  it('builds geometry with bounds for frustum culling', () => {
    const g = geometryFromBuffers(quad(16));
    expect(g.getAttribute('layer').count).toBe(4);
    expect(g.boundingBox?.min.x).toBe(16);
    expect(g.boundingSphere?.radius).toBeGreaterThan(0);
  });
});

describe('ChunkMeshes', () => {
  const modelGeometry = geometryFromBuffers(quad(0));
  const store = new ChunkMeshes(materials, (i) =>
    i === 5 ? { geometry: modelGeometry, layer: 'cutout' } : null,
  );
  const output = (models: ChunkMeshOutput['models']): ChunkMeshOutput => ({
    coord: { x: 0, y: 0, z: 0 },
    opaque: quad(0),
    cutout: empty,
    translucent: quad(3),
    models,
  });

  it('creates one mesh per non-empty layer and one InstancedMesh per model', () => {
    store.setChunk(
      '0,0,0',
      output([{ paletteIndex: 5, positions: Int32Array.from([1, 2, 3, 4, 5, 6]) }]),
    );
    expect(store.size).toBe(1);
    const group = store.root.children[0] as THREE.Group;
    expect(group.children.map((c) => c.name)).toEqual(['opaque', 'translucent', 'model 5']);
    const inst = group.children[2] as THREE.InstancedMesh;
    expect(inst.count).toBe(2);
    const m = new THREE.Matrix4();
    inst.getMatrixAt(1, m);
    expect(new THREE.Vector3().setFromMatrixPosition(m).toArray()).toEqual([4, 5, 6]);
    expect(inst.material).toBe(materials.cutout);
    expect(group.children[1]?.renderOrder).toBe(2);
  });

  it('replaces and removes chunks, disposing owned geometry but not shared model geometry', () => {
    const group = store.root.children[0] as THREE.Group;
    const owned = (group.children[0] as THREE.Mesh).geometry;
    const disposed = vi.fn();
    owned.addEventListener('dispose', disposed);
    const sharedDisposed = vi.fn();
    modelGeometry.addEventListener('dispose', sharedDisposed);
    store.setChunk('0,0,0', output([{ paletteIndex: 9, positions: Int32Array.from([0, 0, 0]) }]));
    expect(disposed).toHaveBeenCalledTimes(1);
    expect(store.root.children.length).toBe(1);
    // Unknown palette index → skipped
    expect((store.root.children[0] as THREE.Group).children.length).toBe(2);
    store.removeChunk('0,0,0');
    store.removeChunk('nope');
    expect(store.size).toBe(0);
    expect(store.root.children.length).toBe(0);
    expect(sharedDisposed).not.toHaveBeenCalled();
  });
});

describe('overlay geometry', () => {
  it('outlines blocks with 12 edges each', () => {
    const p = blockOutlinePositions([{ x: 1, y: 2, z: 3 }], 0);
    expect(p.length).toBe(12 * 2 * 3);
    const xs = new Set<number>();
    for (let i = 0; i < p.length; i += 3) xs.add(p[i] as number);
    expect([...xs].sort()).toEqual([1, 2]);
  });

  it('outlines an inclusive box', () => {
    const p = boxOutlinePositions({ min: { x: 0, y: 0, z: 0 }, max: { x: 2, y: 0, z: 0 } }, 0);
    expect(Math.max(...p)).toBe(3);
    expect(Math.min(...p)).toBe(0);
  });

  it('groups ghosts by state', () => {
    const a = 'minecraft:stone' as BlockStateString;
    const b = 'minecraft:dirt' as BlockStateString;
    const g = groupGhosts([
      { pos: { x: 0, y: 0, z: 0 }, state: a },
      { pos: { x: 1, y: 0, z: 0 }, state: b },
      { pos: { x: 2, y: 0, z: 0 }, state: a },
    ]);
    expect(g.get(a)?.length).toBe(2);
    expect(g.get(b)?.length).toBe(1);
  });
});

describe('Overlays', () => {
  const ghostGeometry = new THREE.BoxGeometry();
  const ghostMat = createBlockMaterial('ghost', tex);
  const overlays = new Overlays(ghostMat, () => ghostGeometry);
  const names = (o: THREE.Object3D) => o.children.map((c) => c.name);

  it('manages highlights, ghosts, selection and grid', () => {
    overlays.setHighlights([
      { id: 'a', positions: [{ x: 0, y: 0, z: 0 }], color: 0xff0000, style: 'outline' },
      {
        id: 'b',
        positions: [
          { x: 1, y: 0, z: 0 },
          { x: 2, y: 0, z: 0 },
        ],
        color: 0x00ff00,
        style: 'fill',
      },
      { id: 'c', positions: [], color: 0, style: 'fill' },
    ]);
    const highlights = overlays.root.getObjectByName('highlights') as THREE.Group;
    expect(names(highlights)).toEqual(['a', 'b']);
    expect((highlights.children[1] as THREE.InstancedMesh).count).toBe(2);
    overlays.setHighlights([]);
    expect(highlights.children.length).toBe(0);

    overlays.setGhosts([
      { pos: { x: 0, y: 0, z: 0 }, state: 'minecraft:stone' as BlockStateString },
    ]);
    const ghosts = overlays.root.getObjectByName('ghosts') as THREE.Group;
    expect((ghosts.children[0] as THREE.InstancedMesh).material).toBe(ghostMat);
    const disposed = vi.fn();
    ghostGeometry.addEventListener('dispose', disposed);
    overlays.setGhosts([]);
    expect(ghosts.children.length).toBe(0);
    expect(disposed).not.toHaveBeenCalled();

    overlays.setSelectionBox({ min: { x: 0, y: 0, z: 0 }, max: { x: 1, y: 1, z: 1 } });
    expect(overlays.root.getObjectByName('selection')).toBeDefined();
    overlays.setSelectionBox(null);
    expect(overlays.root.getObjectByName('selection')).toBeUndefined();

    overlays.setGrid(0, null);
    expect(overlays.gridInfo).toEqual({ y: 0, size: 32, cx: 1, cz: 1 });
    overlays.setGrid(-3, { min: { x: 0, y: 0, z: 0 }, max: { x: 63, y: 5, z: 15 } });
    expect(overlays.gridInfo).toEqual({ y: -3, size: 80, cx: 32, cz: 8 });
    expect(overlays.root.getObjectsByProperty('name', 'grid').length).toBe(1);
    overlays.dispose();
    expect(overlays.root.getObjectByName('grid')).toBeUndefined();
  });

  it('applies a highlight group opacity (default per style, clamped)', () => {
    expect(highlightOpacity({ style: 'fill' })).toBe(0.35);
    expect(highlightOpacity({ style: 'outline' })).toBe(0.95);
    expect(highlightOpacity({ style: 'fill', opacity: 0.25 })).toBe(0.25);
    expect(highlightOpacity({ style: 'fill', opacity: 2 })).toBe(1);
    expect(highlightOpacity({ style: 'fill', opacity: -1 })).toBe(0);
    expect(highlightOpacity({ style: 'fill', opacity: Number.NaN })).toBe(0.35);

    const o = new Overlays(ghostMat, () => ghostGeometry);
    const p = [{ x: 0, y: 0, z: 0 }];
    o.setHighlights([
      { id: 'tint', positions: p, color: 0x00ff00, style: 'fill', opacity: 0.25 },
      { id: 'edge', positions: p, color: 0x00ff00, style: 'outline', opacity: 0.6 },
      { id: 'plain', positions: p, color: 0x00ff00, style: 'fill' },
    ]);
    const opacity = (name: string) =>
      ((o.root.getObjectByName(name) as THREE.Mesh).material as THREE.Material).opacity;
    expect(opacity('tint')).toBe(0.25);
    expect(opacity('edge')).toBe(0.6);
    expect(opacity('plain')).toBe(0.35);
    // Later groups draw over earlier ones (the selected block over the step outline).
    const order = ['tint', 'edge', 'plain'].map((n) => o.root.getObjectByName(n)?.renderOrder ?? 0);
    expect(order[0]).toBeLessThan(order[1] as number);
    expect(order[1]).toBeLessThan(order[2] as number);
    expect(order[2]).toBeLessThan(20); // below the selection box
    o.dispose();
  });
});
