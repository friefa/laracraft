import {
  BuildDocument,
  createJavaBlockRegistry,
  serializeBuild,
  type BlockStateString,
} from '@laracraft/core-model';
import type { BuildOrderResponse } from '../api';
import { generateCity } from '../../testing/city';
import { handleBuildOrderRequest } from './handle-request';

describe('build-order worker protocol', () => {
  it('posts progress and then the plan for a serialized build', () => {
    const doc = generateCity(createJavaBlockRegistry(), 3000);
    const out: BuildOrderResponse[] = [];
    handleBuildOrderRequest({ type: 'plan', id: 7, file: serializeBuild(doc) }, (r) => out.push(r));
    const last = out[out.length - 1];
    expect(last?.type).toBe('result');
    expect(last?.id).toBe(7);
    const progress = out.filter((r) => r.type === 'progress');
    expect(progress.length).toBeGreaterThan(0);
    const final = progress[progress.length - 1];
    expect(final?.type === 'progress' && final.done === final.total).toBe(true);
    if (last?.type === 'result') expect(last.plan.stats.blocks).toBe(doc.volume.blockCount);
  });

  it('reports malformed input as an error response', () => {
    const doc = new BuildDocument({
      name: 'x',
      dataVersion: 4189,
      edition: 'java',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    });
    doc.setBlock({ x: 0, y: 0, z: 0 }, 'minecraft:stone' as BlockStateString);
    const file = { ...serializeBuild(doc), palette: [] as string[] };
    const out: BuildOrderResponse[] = [];
    handleBuildOrderRequest({ type: 'plan', id: 3, file }, (r) => out.push(r));
    expect(out).toEqual([{ type: 'error', id: 3, message: expect.any(String) }]);
  });
});
