/** Road network graph from the map's road segments (for traffic & pedestrians). */
export interface GraphNode {
  id: number;
  x: number;
  z: number;
  edges: number[];
}

export interface GraphEdge {
  id: number;
  a: number;
  b: number;
  length: number;
  /** Road rank: 1 service … 5 primary/trunk. */
  rank: number;
  /** Carriageway width (m). */
  width: number;
}

const WIDTH_BY_RANK = [4, 4.5, 6.5, 9, 11, 14];

export class RoadGraph {
  readonly nodes: GraphNode[] = [];
  readonly edges: GraphEdge[] = [];
  private keyToNode = new Map<string, number>();

  /** segments: [rank, ax, az, bx, bz] in metres. */
  constructor(
    segments: ReadonlyArray<readonly [number, number, number, number, number]>,
    minRank = 1,
  ) {
    for (const [rank, ax, az, bx, bz] of segments) {
      if (rank < minRank) continue;
      const a = this.node(ax, az);
      const b = this.node(bx, bz);
      if (a === b) continue;
      const length = Math.hypot(bx - ax, bz - az);
      const id = this.edges.length;
      this.edges.push({ id, a, b, length, rank, width: WIDTH_BY_RANK[Math.min(rank, 5)]! });
      this.nodes[a]!.edges.push(id);
      this.nodes[b]!.edges.push(id);
    }
  }

  private node(x: number, z: number): number {
    const k = `${Math.round(x)},${Math.round(z)}`;
    let id = this.keyToNode.get(k);
    if (id === undefined) {
      id = this.nodes.length;
      this.nodes.push({ id, x, z, edges: [] });
      this.keyToNode.set(k, id);
    }
    return id;
  }

  /** Closest node to (x, z) (linear scan — call occasionally). */
  nearestNode(x: number, z: number): number {
    let best = 0;
    let bestD = Infinity;
    for (const n of this.nodes) {
      const d = (n.x - x) ** 2 + (n.z - z) ** 2;
      if (d < bestD) {
        bestD = d;
        best = n.id;
      }
    }
    return best;
  }

  other(edge: GraphEdge, node: number): number {
    return edge.a === node ? edge.b : edge.a;
  }

  /** Next edge at `node` arriving via `fromEdge`: prefers going straight-ish, never U-turns unless dead end. */
  nextEdge(node: number, fromEdge: number, rand: () => number, minRank = 1): GraphEdge {
    const n = this.nodes[node]!;
    const from = this.edges[fromEdge]!;
    const prev = this.nodes[this.other(from, node)]!;
    const inX = n.x - prev.x;
    const inZ = n.z - prev.z;
    const inL = Math.hypot(inX, inZ) || 1;
    const options = n.edges
      .map((e) => this.edges[e]!)
      .filter((e) => e.id !== fromEdge && e.rank >= minRank);
    if (!options.length) return from; // dead end: turn around
    // Weight: straight ahead is likeliest, bigger roads preferred
    let total = 0;
    const weights = options.map((e) => {
      const o = this.nodes[this.other(e, node)]!;
      const ox = o.x - n.x;
      const oz = o.z - n.z;
      const cos = (inX * ox + inZ * oz) / (inL * (Math.hypot(ox, oz) || 1));
      const w = Math.max(0.05, 0.6 + cos) * (1 + e.rank * 0.3);
      total += w;
      return w;
    });
    let r = rand() * total;
    for (let i = 0; i < options.length; i++) {
      r -= weights[i]!;
      if (r <= 0) return options[i]!;
    }
    return options.at(-1)!;
  }

  /** Random edge whose midpoint lies in the ring minR..maxR around (x, z) (for spawning). */
  edgeNear(
    x: number,
    z: number,
    minR: number,
    maxR: number,
    rand: () => number,
    minRank = 1,
  ): GraphEdge | null {
    const picks: GraphEdge[] = [];
    const min2 = minR * minR;
    const max2 = maxR * maxR;
    for (const e of this.edges) {
      if (e.rank < minRank) continue;
      const a = this.nodes[e.a]!;
      const b = this.nodes[e.b]!;
      const dx = (a.x + b.x) / 2 - x;
      const dz = (a.z + b.z) / 2 - z;
      const d2 = dx * dx + dz * dz;
      if (d2 >= min2 && d2 <= max2) picks.push(e);
    }
    if (!picks.length) return null;
    // Longer roads get proportionally more spawns
    let total = 0;
    for (const e of picks) total += e.length;
    let r = rand() * total;
    for (const e of picks) {
      r -= e.length;
      if (r <= 0) return e;
    }
    return picks.at(-1)!;
  }
}
