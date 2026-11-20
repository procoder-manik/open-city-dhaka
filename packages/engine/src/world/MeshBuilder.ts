import * as THREE from 'three/webgpu';

/**
 * Collects many simple shapes and merges them into ONE mesh per material.
 * Keeps draw calls low (important on phones) without external geometry utils.
 */
export class MeshBuilder {
  private parts: THREE.BufferGeometry[] = [];

  get count(): number {
    return this.parts.length;
  }

  /** Add geometry already transformed into world space. Optional vertex colour. */
  add(geo: THREE.BufferGeometry, color?: THREE.ColorRepresentation): this {
    const g = geo.index ? geo : geo;
    if (!g.getAttribute('uv')) {
      g.setAttribute(
        'uv',
        new THREE.Float32BufferAttribute(new Float32Array(g.getAttribute('position').count * 2), 2),
      );
    }
    const n = g.getAttribute('position').count;
    const c = new THREE.Color(color ?? 0xffffff);
    const colors = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
    g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    this.parts.push(g);
    return this;
  }

  box(
    size: [number, number, number],
    pos: [number, number, number],
    color?: THREE.ColorRepresentation,
    rotY = 0,
    /** World-scale UVs: one texture repeat every `uvTile` metres (no stretching). */
    uvTile?: number,
  ): this {
    const g = new THREE.BoxGeometry(...size);
    if (uvTile) boxWorldUV(g, size, uvTile);
    if (rotY) g.rotateY(rotY);
    g.translate(...pos);
    return this.add(g, color);
  }

  cylinder(
    rTop: number,
    rBottom: number,
    h: number,
    pos: [number, number, number],
    color?: THREE.ColorRepresentation,
    segments = 10,
    rot?: [number, number, number],
  ): this {
    const g = new THREE.CylinderGeometry(rTop, rBottom, h, segments);
    if (rot) {
      g.rotateX(rot[0]);
      g.rotateY(rot[1]);
      g.rotateZ(rot[2]);
    }
    g.translate(...pos);
    return this.add(g, color);
  }

  /**
   * Vertical plane facing +X (dir=1) or -X (dir=-1) at x, centred at (y, z).
   * uvRect = [u0, v0, u1, v1] maps texture coordinates.
   */
  facadeX(
    x: number,
    y: number,
    z: number,
    width: number,
    height: number,
    dir: 1 | -1,
    uvRect: [number, number, number, number],
    color?: THREE.ColorRepresentation,
  ): this {
    const g = new THREE.PlaneGeometry(width, height);
    const uv = g.getAttribute('uv');
    for (let i = 0; i < uv.count; i++) {
      uv.setXY(
        i,
        uvRect[0] + uv.getX(i) * (uvRect[2] - uvRect[0]),
        uvRect[1] + uv.getY(i) * (uvRect[3] - uvRect[1]),
      );
    }
    g.rotateY(dir === 1 ? Math.PI / 2 : -Math.PI / 2);
    g.translate(x, y, z);
    return this.add(g, color);
  }

  /** Horizontal plane (ground decals, road surface). */
  ground(
    x: number,
    y: number,
    z: number,
    width: number,
    depth: number,
    uvRepeat: [number, number] = [1, 1],
    color?: THREE.ColorRepresentation,
  ): this {
    const g = new THREE.PlaneGeometry(width, depth);
    const uv = g.getAttribute('uv');
    for (let i = 0; i < uv.count; i++)
      uv.setXY(i, uv.getX(i) * uvRepeat[0], uv.getY(i) * uvRepeat[1]);
    g.rotateX(-Math.PI / 2);
    g.translate(x, y, z);
    return this.add(g, color);
  }

  build(
    material: THREE.Material,
    opts: { castShadow?: boolean; receiveShadow?: boolean } = {},
  ): THREE.Mesh | null {
    if (!this.parts.length) return null;
    const merged = mergeIndexed(this.parts);
    for (const p of this.parts) p.dispose();
    this.parts = [];
    const mesh = new THREE.Mesh(merged, material);
    mesh.castShadow = opts.castShadow ?? true;
    mesh.receiveShadow = opts.receiveShadow ?? true;
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    return mesh;
  }
}

/** Rescale a BoxGeometry's UVs so textures tile at real-world size. Face order: px nx py ny pz nz. */
export function boxWorldUV(
  g: THREE.BufferGeometry,
  [w, h, d]: [number, number, number],
  tile: number,
) {
  const uv = g.getAttribute('uv');
  const dims: Array<[number, number]> = [
    [d, h],
    [d, h],
    [w, d],
    [w, d],
    [w, h],
    [w, h],
  ];
  const perFace = uv.count / 6;
  for (let f = 0; f < 6; f++) {
    const [du, dv] = dims[f]!;
    for (let i = f * perFace; i < (f + 1) * perFace; i++) {
      uv.setXY(i, (uv.getX(i) * du) / tile, (uv.getY(i) * dv) / tile);
    }
  }
}

/** Merge geometries sharing position/normal/uv/color attributes (indexed or not). */
export function mergeIndexed(geos: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const names = ['position', 'normal', 'uv', 'color'] as const;
  const sizes = { position: 3, normal: 3, uv: 2, color: 3 };
  let vertexCount = 0;
  let indexCount = 0;
  for (const g of geos) {
    vertexCount += g.getAttribute('position').count;
    indexCount += g.index ? g.index.count : g.getAttribute('position').count;
  }
  const out = new THREE.BufferGeometry();
  const arrays = Object.fromEntries(
    names.map((n) => [n, new Float32Array(vertexCount * sizes[n])]),
  ) as Record<(typeof names)[number], Float32Array>;
  const index = vertexCount > 65535 ? new Uint32Array(indexCount) : new Uint16Array(indexCount);
  let vOff = 0;
  let iOff = 0;
  for (const g of geos) {
    const n = g.getAttribute('position').count;
    for (const name of names) {
      const attr = g.getAttribute(name);
      if (attr) arrays[name].set(attr.array as Float32Array, vOff * sizes[name]);
    }
    if (g.index) {
      const idx = g.index.array;
      for (let i = 0; i < idx.length; i++) index[iOff + i] = idx[i]! + vOff;
      iOff += idx.length;
    } else {
      for (let i = 0; i < n; i++) index[iOff + i] = vOff + i;
      iOff += n;
    }
    vOff += n;
  }
  for (const name of names)
    out.setAttribute(name, new THREE.Float32BufferAttribute(arrays[name], sizes[name]));
  out.setIndex(new THREE.BufferAttribute(index, 1));
  out.computeBoundingSphere();
  out.computeBoundingBox();
  return out;
}
