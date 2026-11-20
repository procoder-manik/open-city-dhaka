import * as THREE from 'three/webgpu';
import type { QualityPreset } from '@game/shared';

export interface RendererResult {
  renderer: THREE.WebGPURenderer;
  backend: 'webgpu' | 'webgl2';
}

/**
 * three.js WebGPURenderer: uses WebGPU where available and falls back to WebGL2
 * automatically, so one code path serves every device.
 */
export async function createRenderer(
  preset: QualityPreset,
  opts: { forceWebGL?: boolean } = {},
): Promise<RendererResult> {
  const renderer = new THREE.WebGPURenderer({
    antialias: preset.antialias,
    powerPreference: 'high-performance',
    forceWebGL: opts.forceWebGL ?? false,
  });
  await renderer.init();

  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = preset.shadows;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const canvas = renderer.domElement;
  canvas.style.display = 'block';
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  canvas.style.touchAction = 'none';
  canvas.setAttribute('aria-label', 'Game view');
  canvas.tabIndex = 0;

  const backendObj = renderer.backend as { isWebGPUBackend?: boolean };
  return { renderer, backend: backendObj.isWebGPUBackend ? 'webgpu' : 'webgl2' };
}

export function renderStats(renderer: THREE.WebGPURenderer): {
  drawCalls: number;
  triangles: number;
} {
  const r = renderer.info.render as unknown as {
    drawCalls?: number;
    calls?: number;
    triangles?: number;
  };
  return { drawCalls: r.drawCalls ?? r.calls ?? 0, triangles: r.triangles ?? 0 };
}
