import type { RenderLayer } from '@laracraft/core-model';
import * as THREE from 'three';
import type { ChunkMeshOutput } from '../mesh/types';
import { geometryFromBuffers, isEmptyBuffers } from './block-material';
import type { ChunkSink } from './chunk-scheduler';

export type LayerMaterials = Readonly<Record<RenderLayer, THREE.Material>>;

/** Shared instanced geometry for a model palette entry. */
export interface ModelSource {
  readonly geometry: THREE.BufferGeometry;
  readonly layer: RenderLayer;
}

const LAYERS: readonly RenderLayer[] = ['opaque', 'cutout', 'translucent'];
const RENDER_ORDER: Readonly<Record<RenderLayer, number>> = {
  opaque: 0,
  cutout: 1,
  translucent: 2,
};

/**
 * three.js side of the chunk store: one group per chunk holding a merged mesh per render
 * layer and one `InstancedMesh` per model palette index. Chunk geometries are owned and
 * disposed here; model geometries are shared (owned by the caller's cache).
 */
export class ChunkMeshes implements ChunkSink {
  readonly root = new THREE.Group();
  private readonly chunks = new Map<string, THREE.Group>();

  constructor(
    private readonly materials: LayerMaterials,
    private readonly modelSource: (paletteIndex: number) => ModelSource | null,
  ) {
    this.root.name = 'chunks';
  }

  get size(): number {
    return this.chunks.size;
  }

  setChunk(key: string, output: ChunkMeshOutput): void {
    this.removeChunk(key);
    const group = new THREE.Group();
    group.name = `chunk ${key}`;
    group.matrixAutoUpdate = false;
    for (const layer of LAYERS) {
      const buffers = output[layer];
      if (isEmptyBuffers(buffers)) continue;
      const mesh = new THREE.Mesh(geometryFromBuffers(buffers), this.materials[layer]);
      mesh.name = layer;
      mesh.matrixAutoUpdate = false;
      mesh.renderOrder = RENDER_ORDER[layer];
      group.add(mesh);
    }
    const m = new THREE.Matrix4();
    for (const inst of output.models) {
      const src = this.modelSource(inst.paletteIndex);
      if (!src) continue;
      const count = inst.positions.length / 3;
      const mesh = new THREE.InstancedMesh(src.geometry, this.materials[src.layer], count);
      mesh.name = `model ${inst.paletteIndex}`;
      mesh.matrixAutoUpdate = false;
      mesh.renderOrder = RENDER_ORDER[src.layer];
      for (let i = 0; i < count; i++) {
        const p = inst.positions;
        m.makeTranslation(p[i * 3] as number, p[i * 3 + 1] as number, p[i * 3 + 2] as number);
        mesh.setMatrixAt(i, m);
      }
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
      mesh.computeBoundingBox();
      group.add(mesh);
    }
    group.updateMatrixWorld(true);
    this.chunks.set(key, group);
    this.root.add(group);
  }

  removeChunk(key: string): void {
    const group = this.chunks.get(key);
    if (!group) return;
    this.chunks.delete(key);
    this.root.remove(group);
    disposeChunkGroup(group);
  }

  clear(): void {
    for (const key of [...this.chunks.keys()]) this.removeChunk(key);
  }
}

function disposeChunkGroup(group: THREE.Group): void {
  for (const child of group.children) {
    if (child instanceof THREE.InstancedMesh) {
      child.dispose(); // instance buffers only; geometry is shared
    } else if (child instanceof THREE.Mesh) {
      (child.geometry as THREE.BufferGeometry).dispose();
    }
  }
}
