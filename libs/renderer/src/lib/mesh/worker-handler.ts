import { meshChunk, meshOutputTransferables } from './greedy-mesher';
import type { MesherRequest, MesherResponse, PaletteRenderInfo, TextureLayers } from './types';

export interface MesherReply {
  readonly response: MesherResponse;
  /** Buffers to transfer with `postMessage` (the output's typed arrays). */
  readonly transfer: ArrayBuffer[];
}

/**
 * Stateful mesher protocol handler, independent of the worker globals so it can be
 * tested in Node and reused for main-thread meshing. `init` produces no reply.
 */
export function createMesherHandler(): (request: MesherRequest) => MesherReply | null {
  let palette: readonly PaletteRenderInfo[] | undefined;
  let textures: TextureLayers | undefined;
  return (request) => {
    if (request.type === 'init') {
      palette = request.palette;
      textures = request.textures;
      return null;
    }
    if (!palette || !textures) {
      return {
        response: { type: 'error', id: request.id, message: 'Mesher not initialised' },
        transfer: [],
      };
    }
    try {
      const output = meshChunk(request.input, palette, textures);
      return {
        response: { type: 'mesh', id: request.id, output },
        transfer: meshOutputTransferables(output),
      };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return { response: { type: 'error', id: request.id, message }, transfer: [] };
    }
  };
}
