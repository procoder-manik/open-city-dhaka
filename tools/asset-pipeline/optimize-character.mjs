// Make a rigged character GLB phone-ready: simplify the mesh to a triangle budget (skin
// weights + UVs kept), resize textures to WebP, resample animations, Meshopt-compress.
// Usage: node optimize-character.mjs <in.glb> <out.glb> [targetTris=14000] [texSize=1024]
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import {
  dedup,
  meshopt,
  prune,
  resample,
  simplify,
  textureCompress,
  weld,
} from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';
import { statSync } from 'node:fs';

const [input, output, targetArg, texArg] = process.argv.slice(2);
if (!input || !output) {
  console.error('Usage: node optimize-character.mjs <in.glb> <out.glb> [targetTris] [texSize]');
  process.exit(1);
}
const target = Number(targetArg ?? 14000);
const tex = Number(texArg ?? 1024);

await MeshoptDecoder.ready;
await MeshoptEncoder.ready;
await MeshoptSimplifier.ready;
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });

const doc = await io.read(input);
const countTris = () => {
  let t = 0;
  for (const m of doc.getRoot().listMeshes())
    for (const p of m.listPrimitives()) {
      const idx = p.getIndices();
      t += (idx ? idx.getCount() : p.getAttribute('POSITION').getCount()) / 3;
    }
  return t;
};
const before = countTris();
// Body regions per vertex from the bind-pose height (metres): x = legs, y = feet, z = torso.
// The game's shader uses them to dress the model (trousers, shoes, shirt colour).
const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
for (const mesh of doc.getRoot().listMeshes())
  for (const prim of mesh.listPrimitives()) {
    const pos = prim.getAttribute('POSITION');
    const n = pos.getCount();
    const out = new Float32Array(n * 3);
    const v = [0, 0, 0];
    for (let i = 0; i < n; i++) {
      pos.getElement(i, v);
      const y = v[1];
      const feet = (1 - smooth(0.07, 0.11, y)) * (1 - smooth(0.3, 0.36, Math.abs(v[0])));
      // Legs = below the hips AND near the centre line (the hands hang at hip height in the rest pose)
      const legs =
        (1 - smooth(0.9, 0.97, y)) * (1 - feet) * (1 - smooth(0.24, 0.3, Math.abs(v[0])));
      const torso = smooth(0.9, 0.97, y) * (1 - smooth(1.42, 1.48, y));
      out[i * 3] = legs;
      out[i * 3 + 1] = feet;
      out[i * 3 + 2] = torso;
    }
    prim.setAttribute(
      '_REGION',
      doc.createAccessor().setType('VEC3').setArray(out).setBuffer(pos.getBuffer()),
    );
  }
await doc.transform(dedup(), weld());
const ratio = Math.min(1, target / countTris());
await doc.transform(
  simplify({ simplifier: MeshoptSimplifier, ratio, error: 0.02, lockBorder: false }),
  resample(),
  prune(),
  textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [tex, tex], quality: 82 }),
  meshopt({ encoder: MeshoptEncoder, level: 'medium' }),
);
await io.write(output, doc);
const kb = (p) => (statSync(p).size / 1024).toFixed(0);
console.log(
  `${input} (${kb(input)} KB, ${before} tris) → ${output} (${kb(output)} KB, ${countTris()} tris)`,
);
