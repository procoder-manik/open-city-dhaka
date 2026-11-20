// Optimise a glTF/GLB for the web: dedupe, weld, simplify-safe prune, Meshopt compression.
// Usage: pnpm --filter @game/asset-pipeline optimize <in.glb> <out.glb>
// Textures → KTX2: run `toktx` / `gltf-transform uastc|etc1s` separately (needs KTX-Software installed).
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, meshopt, prune, resample, weld, quantize } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import { statSync } from 'node:fs';

const [input, output] = process.argv.slice(2);
if (!input || !output) {
  console.error('Usage: node optimize.mjs <in.glb> <out.glb>');
  process.exit(1);
}

await MeshoptDecoder.ready;
await MeshoptEncoder.ready;
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });

const doc = await io.read(input);
await doc.transform(
  dedup(),
  prune(),
  weld(),
  resample(),
  quantize(),
  meshopt({ encoder: MeshoptEncoder, level: 'medium' }),
);
await io.write(output, doc);

const kb = (p) => (statSync(p).size / 1024).toFixed(0);
console.log(`${input} (${kb(input)} KB) → ${output} (${kb(output)} KB)`);
