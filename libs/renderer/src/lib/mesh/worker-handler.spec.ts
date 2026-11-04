import type { BlockStateString } from '@laracraft/core-model';
import { PADDED_VOLUME, paddedIndex } from './extract';
import type { PaletteRenderInfo } from './types';
import { createMesherHandler } from './worker-handler';

const palette: PaletteRenderInfo[] = [
  { state: 'minecraft:air' as BlockStateString, shape: 'none', layer: 'cutout', occludes: false },
  {
    state: 'minecraft:stone' as BlockStateString,
    shape: 'full',
    layer: 'opaque',
    faces: { up: 's', down: 's', north: 's', south: 's', west: 's', east: 's' },
    occludes: true,
  },
  {
    state: 'minecraft:torch' as BlockStateString,
    shape: 'model',
    layer: 'cutout',
    modelId: 'torch',
    occludes: false,
  },
];

describe('createMesherHandler', () => {
  it('errors before init, then meshes and lists transferable buffers', () => {
    const handle = createMesherHandler();
    const data = new Uint16Array(PADDED_VOLUME);
    data[paddedIndex(0, 0, 0)] = 1;
    data[paddedIndex(2, 0, 0)] = 2;
    const input = { coord: { x: 0, y: 0, z: 0 }, data };
    expect(handle({ type: 'mesh', id: 1, input })?.response).toEqual({
      type: 'error',
      id: 1,
      message: 'Mesher not initialised',
    });
    expect(handle({ type: 'init', palette, textures: { missing: 0, s: 1 } })).toBeNull();
    const reply = handle({ type: 'mesh', id: 2, input });
    expect(reply?.response.type).toBe('mesh');
    if (reply?.response.type !== 'mesh') return;
    expect(reply.response.id).toBe(2);
    expect(reply.response.output.opaque.indices.length).toBe(36);
    expect(reply.response.output.models).toHaveLength(1);
    // 3 layers × 6 arrays + 1 instance array, all distinct buffers.
    expect(reply.transfer).toHaveLength(19);
    expect(reply.transfer).toContain(reply.response.output.opaque.positions.buffer);
  });

  it('reports meshing errors with the request id', () => {
    const handle = createMesherHandler();
    handle({ type: 'init', palette, textures: {} });
    const reply = handle({
      type: 'mesh',
      id: 9,
      input: { coord: { x: 0, y: 0, z: 0 }, data: new Uint16Array(3) },
    });
    expect(reply?.response).toMatchObject({ type: 'error', id: 9 });
  });
});
