import type { RenderLayer } from '@laracraft/core-model';
import * as THREE from 'three';
import type { MeshBuffers } from '../mesh/types';

const VERTEX = /* glsl */ `
attribute float layer;
varying vec2 vUv;
varying vec3 vColor;
varying float vLayer;

void main() {
  vUv = uv;
  vLayer = layer;
  #ifdef USE_COLOR
    vColor = color.rgb;
  #else
    vColor = vec3(1.0);
  #endif
  vec4 p = vec4(position, 1.0);
  #ifdef USE_INSTANCING
    p = instanceMatrix * p;
  #endif
  gl_Position = projectionMatrix * modelViewMatrix * p;
}
`;

const FRAGMENT = /* glsl */ `
uniform sampler2DArray map;
uniform float opacity;
uniform float alphaCutoff;
varying vec2 vUv;
varying vec3 vColor;
varying float vLayer;

void main() {
  // Repeat wrapping on the texture tiles greedy quads (UVs in block units).
  vec4 texel = texture(map, vec3(vUv, floor(vLayer + 0.5)));
  if (texel.a < alphaCutoff) discard;
  // Vertex colours are sRGB (tint × shade); the texture is decoded to linear by the GPU.
  vec3 tint = sRGBTransferEOTF(vec4(vColor, 1.0)).rgb;
  #ifdef OPAQUE_PASS
    gl_FragColor = vec4(texel.rgb * tint, 1.0);
  #else
    gl_FragColor = vec4(texel.rgb * tint, texel.a * opacity);
  #endif
  #include <colorspace_fragment>
}
`;

export type BlockMaterialKind = RenderLayer | 'ghost';

/**
 * Shared block material (chunk meshes and instanced models use the same instance; three.js
 * compiles an instancing variant automatically). Samples the texture array with the
 * per-vertex `layer` attribute.
 */
export function createBlockMaterial(
  kind: BlockMaterialKind,
  map: THREE.Texture,
  opacity = 0.5,
): THREE.ShaderMaterial {
  const translucent = kind === 'translucent' || kind === 'ghost';
  const material = new THREE.ShaderMaterial({
    name: `laracraft-block-${kind}`,
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    uniforms: {
      map: { value: map },
      opacity: { value: kind === 'ghost' ? opacity : 1 },
      alphaCutoff: { value: kind === 'opaque' ? -1 : kind === 'cutout' ? 0.5 : 0.02 },
    },
    vertexColors: true,
    transparent: translucent,
    depthWrite: !translucent,
    side: THREE.FrontSide,
  });
  if (kind === 'opaque') material.defines = { OPAQUE_PASS: '' };
  if (kind === 'ghost') {
    // Draw ghosts slightly in front of coplanar block faces.
    material.polygonOffset = true;
    material.polygonOffsetFactor = -1;
    material.polygonOffsetUnits = -1;
  }
  return material;
}

/** Converts mesher/model buffers to a BufferGeometry (normals are not needed: shading is baked). */
export function geometryFromBuffers(buffers: MeshBuffers): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(buffers.positions, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(buffers.uvs, 2));
  g.setAttribute('color', new THREE.BufferAttribute(buffers.colors, 3));
  g.setAttribute('layer', new THREE.BufferAttribute(buffers.layers, 1));
  g.setIndex(new THREE.BufferAttribute(buffers.indices, 1));
  g.computeBoundingBox();
  g.computeBoundingSphere();
  return g;
}

export const isEmptyBuffers = (b: MeshBuffers): boolean => b.indices.length === 0;
