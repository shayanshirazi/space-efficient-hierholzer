import assert from "node:assert/strict";
import test from "node:test";

import {
  analyzeGraph,
  calculateMemoryScale,
  compressedEdgeCount,
  parseEdgeList,
} from "./graph-algorithm.js";
import { GRAPH_PRESETS } from "./graph-presets.js";

const MEMORY_SCALE_REGRESSION_GRAPH = `1 2
2 3
3 4
4 5
5 6
6 7
7 1
1 4
4 6
6 7
7 1
1 5
1 5
3 1
1 7
7 3
3 4
4 7
7 3
1 5
1 5
2 1
1 6
6 5
5 3
3 7
7 2
1 2
2 3
3 1
4 5
5 7
7 4
1 5
5 6
6 1
6 5
5 3
3 7
7 1
1 4
4 6`;

const DYNAMIC_MEMORY_SCALE_REGRESSION_GRAPH = `1 2 2
1 1 3
2 2 1`;

test("rejects markup in vertex labels", () => {
  assert.throws(
    () => parseEdgeList("<img/src=x/onerror=alert(1)> 2 2"),
    /vertices must be positive integers/,
  );
});

test("rejects vertex labels with leading zeros", () => {
  assert.throws(() => parseEdgeList("1 01 2"), /without leading zeros/);
});

test("uses one key for both orientations of an undirected pair", () => {
  const graph = parseEdgeList("1 2\n2 1");

  assert.equal(graph.edges[0].pair, graph.edges[1].pair);
});

test("writes every edge exactly once", () => {
  const graphAnalysis = analyzeGraph(GRAPH_PRESETS.paper.edges);

  assert.equal(graphAnalysis.outputTour.edges.length, graphAnalysis.graph.edges.length);
  assert.equal(new Set(graphAnalysis.outputTour.edges).size, graphAnalysis.graph.edges.length);
});

test("writes a closed Eulerian tour", () => {
  const graphAnalysis = analyzeGraph(GRAPH_PRESETS.paper.edges);

  assert.equal(graphAnalysis.outputTour.vertices[0], graphAnalysis.outputTour.vertices.at(-1));
});

test("keeps the final carry forest empty", () => {
  const graphAnalysis = analyzeGraph(GRAPH_PRESETS["looped-hexagon"].edges);

  assert.equal(graphAnalysis.batches.at(-1).carryOut.length, 0);
});

test("the default example produces multiple batches", () => {
  const graphAnalysis = analyzeGraph(GRAPH_PRESETS["looped-hexagon"].edges);

  assert.equal(graphAnalysis.batches.length, 2);
});

test("the large preset exercises a dense multigraph across three batches", () => {
  const graphAnalysis = analyzeGraph(GRAPH_PRESETS["large-multigraph"].edges);

  assert.equal(graphAnalysis.graph.nodes.length, 12);
  assert.equal(graphAnalysis.graph.edges.length, 56);
  assert.equal(graphAnalysis.batches.length, 3);
});

test("the memory scale includes the combined carry and fresh batch", () => {
  const graphAnalysis = analyzeGraph(MEMORY_SCALE_REGRESSION_GRAPH);
  const secondBatch = graphAnalysis.batches[1];
  const displayedBatchSize = compressedEdgeCount([
    ...secondBatch.carryIn,
    ...secondBatch.freshEdges,
  ]);

  assert.equal(displayedBatchSize, 16);
  assert.equal(calculateMemoryScale(graphAnalysis), 16);
});

test("the memory scale covers every state while a batch is written", () => {
  const graphAnalysis = analyzeGraph(DYNAMIC_MEMORY_SCALE_REGRESSION_GRAPH);

  assert.equal(calculateMemoryScale(graphAnalysis), 3);
});

test("accepts loops when every degree remains even", () => {
  const graphAnalysis = analyzeGraph("1 2 2\n1 1\n2 2");

  assert.equal(graphAnalysis.outputTour.edges.length, 4);
});

test("writes a one-loop Eulerian tour for a singleton graph", () => {
  const graphAnalysis = analyzeGraph("1 1");

  assert.deepEqual(graphAnalysis.outputTour.vertices, ["1", "1"]);
  assert.equal(graphAnalysis.outputTour.edges.length, 1);
});

test("rejects disconnected Eulerian components", () => {
  assert.throws(() => analyzeGraph("1 2 2\n3 4 2"), /must be connected/);
});

test("rejects odd vertex degrees", () => {
  assert.throws(() => analyzeGraph("1 2\n2 3\n3 1\n1 2"), /degree must be even/);
});
