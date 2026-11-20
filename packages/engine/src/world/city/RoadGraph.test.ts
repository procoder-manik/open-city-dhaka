import { describe, expect, it } from 'vitest';
import { seededRandom } from '../random';
import { RoadGraph } from './RoadGraph';

// A plus-shaped crossing: centre (0,0) with arms to N, S, E, W
const SEGS: Array<[number, number, number, number, number]> = [
  [3, 0, 0, 0, -50],
  [3, 0, 0, 0, 50],
  [2, 0, 0, 50, 0],
  [2, 0, 0, -50, 0],
];

describe('RoadGraph', () => {
  it('joins segments sharing endpoints into one node', () => {
    const g = new RoadGraph(SEGS);
    expect(g.nodes.length).toBe(5);
    const centre = g.nodes.find((n) => n.x === 0 && n.z === 0)!;
    expect(centre.edges.length).toBe(4);
  });

  it('never U-turns at a junction and turns around at dead ends', () => {
    const g = new RoadGraph(SEGS);
    const rand = seededRandom(3);
    const centre = g.nodes.find((n) => n.x === 0 && n.z === 0)!.id;
    const south = g.edges.find((e) => g.nodes[g.other(e, centre)]!.z === 50)!;
    for (let i = 0; i < 50; i++) expect(g.nextEdge(centre, south.id, rand).id).not.toBe(south.id);
    const end = g.other(south, centre);
    expect(g.nextEdge(end, south.id, rand).id).toBe(south.id);
  });

  it('respects a minimum road rank', () => {
    const g = new RoadGraph(SEGS);
    const rand = seededRandom(1);
    const centre = g.nodes.find((n) => n.x === 0 && n.z === 0)!.id;
    const south = g.edges.find((e) => g.nodes[g.other(e, centre)]!.z === 50)!;
    for (let i = 0; i < 30; i++) expect(g.nextEdge(centre, south.id, rand, 3).rank).toBe(3);
  });
});

describe('RoadGraph.edgeNear', () => {
  it('finds edges in a distance ring', () => {
    const g = new RoadGraph(SEGS);
    const rand = seededRandom(9);
    const e = g.edgeNear(0, 0, 10, 40, rand);
    expect(e).not.toBeNull();
    expect(g.edgeNear(0, 0, 100, 200, rand)).toBeNull();
  });
});
