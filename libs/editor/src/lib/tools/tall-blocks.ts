import {
  type BlockRegistry,
  type BlockStateString,
  type Vec3,
  parseBlockState,
  stringifyBlockState,
} from '@laracraft/core-model';

/**
 * Two-block-tall blocks (doors, tall plants) carry `half=lower|upper`. Returns
 * the other half's position and state, or undefined for ordinary blocks.
 */
export function tallPartner(
  registry: BlockRegistry,
  state: BlockStateString,
  pos: Vec3,
): { pos: Vec3; state: BlockStateString } | undefined {
  const parsed = parseBlockState(state);
  const half = registry.get(parsed.id)?.properties['half'];
  if (!half?.values.includes('lower') || !half.values.includes('upper')) return undefined;
  const current = parsed.properties['half'];
  if (current !== 'lower' && current !== 'upper') return undefined;
  const other = current === 'lower' ? 'upper' : 'lower';
  return {
    pos: { x: pos.x, y: pos.y + (current === 'lower' ? 1 : -1), z: pos.z },
    state: stringifyBlockState({
      id: parsed.id,
      properties: { ...parsed.properties, half: other },
    }),
  };
}
