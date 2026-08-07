const MAX_VERTEX_COUNT = 12;
const MAX_EDGE_COPY_COUNT = 80;
const MAX_PARALLEL_COPIES_PER_LINE = 20;
const VERTEX_LABEL_PATTERN = /^[1-9]\d*$/;

function sortVertexLabels(labels) {
  return [...labels].sort((firstLabel, secondLabel) => Number(firstLabel) - Number(secondLabel));
}

function createUndirectedPairKey(firstVertex, secondVertex) {
  return sortVertexLabels([firstVertex, secondVertex]).join("\u0000");
}

function parseEdgeList(edgeListSource) {
  const labels = new Set();
  const edges = [];
  const lines = edgeListSource.split(/\r?\n/);

  lines.forEach((rawLine, lineIndex) => {
    const line = rawLine.replace(/#.*/, "").trim();
    if (!line) return;

    const parts = line.split(/\s+/);
    if (parts.length < 2 || parts.length > 3) {
      throw new Error(`Line ${lineIndex + 1}: use “vertex vertex [copies]”.`);
    }

    const [u, v] = parts;
    const invalidVertex = [u, v].find((vertex) => (
      !VERTEX_LABEL_PATTERN.test(vertex) || !Number.isSafeInteger(Number(vertex))
    ));
    if (invalidVertex !== undefined) {
      throw new Error(`Line ${lineIndex + 1}: vertices must be positive integers without leading zeros.`);
    }

    const copies = parts[2] === undefined ? 1 : Number(parts[2]);
    if (!Number.isInteger(copies) || copies < 1 || copies > MAX_PARALLEL_COPIES_PER_LINE) {
      throw new Error(
        `Line ${lineIndex + 1}: copies must be an integer from 1 to ${MAX_PARALLEL_COPIES_PER_LINE}.`,
      );
    }

    labels.add(u);
    labels.add(v);
    for (let copiesAdded = 0; copiesAdded < copies; copiesAdded += 1) {
      edges.push({
        id: `e${edges.length}`,
        u,
        v,
        pair: createUndirectedPairKey(u, v),
      });
    }
  });

  const nodes = sortVertexLabels(labels);
  if (nodes.length === 0) throw new Error("Add at least one edge.");
  if (nodes.length > MAX_VERTEX_COUNT) {
    throw new Error(`Keep the visual to at most ${MAX_VERTEX_COUNT} vertices.`);
  }
  if (edges.length > MAX_EDGE_COPY_COUNT) {
    throw new Error(`Keep the visual to at most ${MAX_EDGE_COPY_COUNT} edge copies.`);
  }

  return { nodes, edges };
}

function calculateVertexDegrees(graph) {
  const degrees = new Map(graph.nodes.map((node) => [node, 0]));
  graph.edges.forEach((edge) => {
    if (edge.u === edge.v) {
      degrees.set(edge.u, degrees.get(edge.u) + 2);
    } else {
      degrees.set(edge.u, degrees.get(edge.u) + 1);
      degrees.set(edge.v, degrees.get(edge.v) + 1);
    }
  });
  return degrees;
}

function createAdjacencyMap({ nodes, edges, includeLoops = true }) {
  const adjacency = new Map(nodes.map((node) => [node, []]));
  edges.forEach((edge) => {
    if (edge.u === edge.v) {
      if (includeLoops) adjacency.get(edge.u).push(edge);
      return;
    }
    adjacency.get(edge.u).push(edge);
    adjacency.get(edge.v).push(edge);
  });
  return adjacency;
}

function otherEndpoint(edge, vertex) {
  return edge.u === vertex ? edge.v : edge.u;
}

function validateEulerian(graph) {
  const degrees = calculateVertexDegrees(graph);
  const odd = graph.nodes.filter((node) => degrees.get(node) % 2 !== 0);
  if (odd.length) {
    throw new Error(`Every degree must be even. Odd now: ${odd.join(", ")}.`);
  }

  const adjacency = createAdjacencyMap({
    nodes: graph.nodes,
    edges: graph.edges,
    includeLoops: false,
  });
  const visited = new Set();
  const stack = [graph.nodes[0]];
  while (stack.length) {
    const vertex = stack.pop();
    if (visited.has(vertex)) continue;
    visited.add(vertex);
    adjacency.get(vertex).forEach((edge) => stack.push(otherEndpoint(edge, vertex)));
  }

  if (visited.size !== graph.nodes.length) {
    throw new Error("The graph must be connected; loops alone do not connect vertices.");
  }
}

function findSpanningTreeEdgeIds(graph) {
  const adjacency = createAdjacencyMap({
    nodes: graph.nodes,
    edges: graph.edges,
    includeLoops: false,
  });
  const visited = new Set();
  const selected = new Set();

  function visit(vertex) {
    visited.add(vertex);
    adjacency.get(vertex).forEach((edge) => {
      const next = otherEndpoint(edge, vertex);
      if (visited.has(next)) return;
      selected.add(edge.id);
      visit(next);
    });
  }

  visit(graph.nodes[0]);
  return selected;
}

function findForestLemmaEdgeIds(nodes, edges) {
  const degrees = calculateVertexDegrees({ nodes, edges });
  const adjacency = createAdjacencyMap({ nodes, edges, includeLoops: false });
  const visited = new Set();
  const children = new Map(nodes.map((node) => [node, []]));
  const parentEdge = new Map();
  const roots = [];

  function buildTree(vertex) {
    visited.add(vertex);
    adjacency.get(vertex).forEach((edge) => {
      const next = otherEndpoint(edge, vertex);
      if (visited.has(next)) return;
      children.get(vertex).push(next);
      parentEdge.set(next, edge.id);
      buildTree(next);
    });
  }

  nodes.forEach((node) => {
    if (visited.has(node)) return;
    roots.push(node);
    buildTree(node);
  });

  const forest = new Set();

  // A child subtree with odd parity needs its parent edge to make every non-root degree even.
  function subtreeParity(vertex) {
    let parity = degrees.get(vertex) % 2;
    children.get(vertex).forEach((child) => {
      const childParity = subtreeParity(child);
      if (childParity) forest.add(parentEdge.get(child));
      parity ^= childParity;
    });
    return parity;
  }

  roots.forEach((root) => subtreeParity(root));
  return forest;
}

function buildEulerianTour({ nodes, edges, startVertex }) {
  if (edges.length === 0) return { vertices: [startVertex], edges: [] };

  const adjacency = createAdjacencyMap({ nodes, edges });
  const cursor = new Map(nodes.map((node) => [node, 0]));
  const used = new Set();
  const vertexStack = [startVertex];
  const edgeStack = [];
  const tourVertices = [];
  const tourEdges = [];

  while (vertexStack.length) {
    const vertex = vertexStack[vertexStack.length - 1];
    const incident = adjacency.get(vertex);
    let index = cursor.get(vertex);
    while (index < incident.length && used.has(incident[index].id)) index += 1;
    cursor.set(vertex, index);

    if (index < incident.length) {
      const edge = incident[index];
      cursor.set(vertex, index + 1);
      if (used.has(edge.id)) continue;
      used.add(edge.id);
      vertexStack.push(otherEndpoint(edge, vertex));
      edgeStack.push(edge.id);
    } else {
      tourVertices.push(vertexStack.pop());
      if (edgeStack.length) tourEdges.push(edgeStack.pop());
    }
  }

  if (used.size !== edges.length) {
    throw new Error(
      `Eulerian traversal from vertex ${startVertex} used ${used.size} of ${edges.length} edges.`,
    );
  }

  return {
    vertices: tourVertices.reverse(),
    edges: tourEdges.reverse(),
  };
}

function selectEdgesByIds(edges, ids) {
  return edges.filter((edge) => ids.has(edge.id));
}

function countDistinctEndpointPairs(edges) {
  return new Set(edges.map((edge) => edge.pair)).size;
}

function compressedEdgeCount(edges) {
  const multiplicities = new Map();
  edges.forEach((edge) => {
    multiplicities.set(edge.pair, (multiplicities.get(edge.pair) ?? 0) + 1);
  });
  return [...multiplicities.values()].reduce(
    (total, multiplicity) => total + (multiplicity % 2 === 0 ? 2 : 1),
    0,
  );
}

function createMemoryItem({ id, symbol, name, count, kind, unit = "edges" }) {
  return { id, symbol, name, count, kind, unit };
}

function createVertexMemoryItem(graphAnalysis) {
  return createMemoryItem({
    id: "vertices",
    symbol: "n",
    name: "vertex state",
    count: graphAnalysis.graph.nodes.length,
    kind: "vertices",
    unit: "vertices",
  });
}

function createSkeletonOutputMemoryItems(graphAnalysis, outputEdgeCursor) {
  const remainingSegments = graphAnalysis.outputTour.segments.slice(outputEdgeCursor);
  const remainingSkeletonEdges = remainingSegments
    .filter((segment) => segment.type === "skeleton")
    .length;
  const memoryItems = [createVertexMemoryItem(graphAnalysis)];
  if (remainingSkeletonEdges) {
    memoryItems.push(createMemoryItem({
      id: "skeleton",
      symbol: "S",
      name: "skeleton remaining",
      count: remainingSkeletonEdges,
      kind: "skeleton",
    }));
  }
  return memoryItems;
}

function findOutputEdgeCursorAfterRank(outputSegments, lastRank) {
  let outputEdgeCursor = 0;
  while (
    outputEdgeCursor < outputSegments.length
    && outputSegments[outputEdgeCursor].rank <= lastRank
  ) {
    outputEdgeCursor += 1;
  }
  return outputEdgeCursor;
}

function countCompressedCircuitRecordsInOutputRange(
  graphAnalysis,
  { startOutputEdgeCursor, endOutputEdgeCursor },
) {
  const graphEdgesById = new Map(graphAnalysis.graph.edges.map((edge) => [edge.id, edge]));
  const remainingCircuitEdges = graphAnalysis.outputTour.segments
    .slice(startOutputEdgeCursor, endOutputEdgeCursor)
    .filter((segment) => segment.type === "circuit")
    .map((segment) => graphEdgesById.get(segment.edgeId));
  return compressedEdgeCount(remainingCircuitEdges);
}

function calculateMemoryScale(graphAnalysis) {
  const candidateMemoryRecordCounts = [
    graphAnalysis.graph.nodes.length,
    graphAnalysis.skeletonEdges.length,
  ];
  let batchOutputStartEdgeCursor = 0;

  graphAnalysis.batches.forEach((batch) => {
    candidateMemoryRecordCounts.push(
      batch.carryIn.length,
      batch.carryOut.length,
      compressedEdgeCount(batch.freshEdges),
      compressedEdgeCount([...batch.carryIn, ...batch.freshEdges]),
      compressedEdgeCount(batch.releasedEdges),
    );

    const batchOutputEndEdgeCursor = findOutputEdgeCursorAfterRank(
      graphAnalysis.outputTour.segments,
      batch.lastRank,
    );
    for (
      let outputEdgeCursor = batchOutputStartEdgeCursor;
      outputEdgeCursor <= batchOutputEndEdgeCursor;
      outputEdgeCursor += 1
    ) {
      candidateMemoryRecordCounts.push(countCompressedCircuitRecordsInOutputRange(graphAnalysis, {
        startOutputEdgeCursor: outputEdgeCursor,
        endOutputEdgeCursor: batchOutputEndEdgeCursor,
      }));
    }
    batchOutputStartEdgeCursor = batchOutputEndEdgeCursor;
  });
  return Math.max(...candidateMemoryRecordCounts, 1);
}

function decomposeReleasedEdgesIntoCircuits({
  nodes,
  edges,
  vertexRank,
  firstRank,
  lastRank,
}) {
  if (edges.length === 0) return [];

  const adjacency = createAdjacencyMap({ nodes, edges });
  const claimedEdges = new Set();
  const circuits = [];

  edges.forEach((seed) => {
    if (claimedEdges.has(seed.id)) return;

    const componentVertices = new Set();
    const componentEdgeIds = new Set();
    const stack = [seed.u];
    while (stack.length) {
      const vertex = stack.pop();
      if (componentVertices.has(vertex)) continue;
      componentVertices.add(vertex);
      adjacency.get(vertex).forEach((edge) => {
        componentEdgeIds.add(edge.id);
        const next = otherEndpoint(edge, vertex);
        if (!componentVertices.has(next)) stack.push(next);
      });
    }

    componentEdgeIds.forEach((id) => claimedEdges.add(id));
    const componentEdges = edges.filter((edge) => componentEdgeIds.has(edge.id));
    const roots = [...componentVertices]
      .filter((vertex) => (
        vertexRank.get(vertex) >= firstRank && vertexRank.get(vertex) <= lastRank
      ))
      .sort((firstVertex, secondVertex) => (
        vertexRank.get(firstVertex) - vertexRank.get(secondVertex)
      ));
    const root = roots[0];
    if (root === undefined) {
      throw new Error(
        `Released circuit has no root between ranks ${firstRank + 1} and ${lastRank + 1}.`,
      );
    }
    const tour = buildEulerianTour({
      nodes,
      edges: componentEdges,
      startVertex: root,
    });
    circuits.push({ root, ...tour });
  });

  return circuits;
}

function splitSkeletonTourIntoWalks(skeletonTour, firstAppearanceVertexOrder) {
  const firstPosition = new Map();
  skeletonTour.vertices.forEach((vertex, index) => {
    if (!firstPosition.has(vertex)) firstPosition.set(vertex, index);
  });

  return firstAppearanceVertexOrder.map((vertex, index) => {
    const start = firstPosition.get(vertex);
    const end = index + 1 < firstAppearanceVertexOrder.length
      ? firstPosition.get(firstAppearanceVertexOrder[index + 1])
      : skeletonTour.vertices.length - 1;
    return {
      root: vertex,
      vertices: skeletonTour.vertices.slice(start, end + 1),
      edges: skeletonTour.edges.slice(start, end),
    };
  });
}

function buildResidualEdgeBatches({ graph, residualEdges, vertexRank }) {
  const neighborhoods = graph.nodes.map(() => []);
  residualEdges.forEach((edge) => {
    const edgeRank = Math.min(vertexRank.get(edge.u), vertexRank.get(edge.v));
    neighborhoods[edgeRank].push(edge);
  });

  const batches = [];
  let carry = [];
  let firstRank = 0;

  while (firstRank < graph.nodes.length) {
    let lastRank = firstRank;
    let pairCount = 0;
    const freshEdges = [];

    while (lastRank < graph.nodes.length && pairCount < graph.nodes.length) {
      freshEdges.push(...neighborhoods[lastRank]);
      pairCount = countDistinctEndpointPairs(freshEdges);
      lastRank += 1;
    }

    const inputEdges = [...carry, ...freshEdges];
    const carryIds = findForestLemmaEdgeIds(graph.nodes, inputEdges);
    const nextCarry = selectEdgesByIds(inputEdges, carryIds);
    const releasedEdges = inputEdges.filter((edge) => !carryIds.has(edge.id));
    const batchIndex = batches.length;
    const circuits = decomposeReleasedEdgesIntoCircuits({
      nodes: graph.nodes,
      edges: releasedEdges,
      vertexRank,
      firstRank,
      lastRank: lastRank - 1,
    }).map((circuit) => ({ ...circuit, batchIndex }));

    if (inputEdges.length || batches.length) {
      batches.push({
        batchIndex,
        firstRank,
        lastRank: lastRank - 1,
        pairCount,
        carryIn: carry,
        freshEdges,
        carryOut: nextCarry,
        releasedEdges,
        circuits,
      });
    }

    carry = nextCarry;
    firstRank = lastRank;
  }

  return batches;
}

function buildOutputTour(graphAnalysis) {
  const vertices = [];
  const edges = [];
  const segments = [];
  const edgeById = new Map(graphAnalysis.graph.edges.map((edge) => [edge.id, edge]));
  const circuitsByRoot = new Map(
    graphAnalysis.firstAppearanceVertexOrder.map((vertex) => [vertex, []]),
  );

  graphAnalysis.batches.forEach((batch) => {
    batch.circuits.forEach((circuit) => circuitsByRoot.get(circuit.root).push(circuit));
  });

  function appendTourBlock(tourBlock, segmentMetadata) {
    if (tourBlock.vertices.length === 0) return;
    if (vertices.length === 0) {
      vertices.push(tourBlock.vertices[0]);
    } else if (vertices.at(-1) !== tourBlock.vertices[0]) {
      throw new Error(`Output is discontinuous at ${segmentMetadata.label}.`);
    }

    tourBlock.edges.forEach((edgeId, index) => {
      const from = tourBlock.vertices[index];
      const to = tourBlock.vertices[index + 1];
      const edge = edgeById.get(edgeId);
      const followsEdge = edge && (
        (edge.u === from && edge.v === to) ||
        (edge.u === to && edge.v === from)
      );
      if (!followsEdge) throw new Error(`Output uses ${edgeId} in the wrong direction.`);
      edges.push(edgeId);
      vertices.push(to);
      segments.push({ ...segmentMetadata, edgeId, from, to });
    });
  }

  graphAnalysis.firstAppearanceVertexOrder.forEach((root, rankIndex) => {
    circuitsByRoot.get(root).forEach((circuit) => {
      appendTourBlock(circuit, {
        type: "circuit",
        batchIndex: circuit.batchIndex,
        label: `C${rankIndex + 1}`,
        rank: rankIndex,
      });
    });
    appendTourBlock(graphAnalysis.skeletonWalks[rankIndex], {
      type: "skeleton",
      label: `W${rankIndex + 1}`,
      rank: rankIndex,
    });
  });

  if (edges.length !== graphAnalysis.graph.edges.length || new Set(edges).size !== edges.length) {
    throw new Error("The output does not contain every input edge exactly once.");
  }
  if (vertices[0] !== vertices.at(-1)) {
    throw new Error("The output is not closed.");
  }

  return { vertices, edges, segments };
}

function analyzeGraph(edgeListSource) {
  const graph = parseEdgeList(edgeListSource);
  validateEulerian(graph);
  const treeIds = findSpanningTreeEdgeIds(graph);
  const nonTreeEdges = graph.edges.filter((edge) => !treeIds.has(edge.id));
  const forestIds = findForestLemmaEdgeIds(graph.nodes, nonTreeEdges);
  const skeletonIds = new Set([...treeIds, ...forestIds]);
  const skeletonEdges = selectEdgesByIds(graph.edges, skeletonIds);
  const skeletonTour = buildEulerianTour({
    nodes: graph.nodes,
    edges: skeletonEdges,
    startVertex: graph.nodes[0],
  });
  const firstAppearanceVertexOrder = [];
  const seen = new Set();
  skeletonTour.vertices.forEach((vertex) => {
    if (seen.has(vertex)) return;
    seen.add(vertex);
    firstAppearanceVertexOrder.push(vertex);
  });
  const vertexRank = new Map(
    firstAppearanceVertexOrder.map((vertex, index) => [vertex, index]),
  );
  const skeletonWalks = splitSkeletonTourIntoWalks(
    skeletonTour,
    firstAppearanceVertexOrder,
  );
  const residualEdges = graph.edges.filter((edge) => !skeletonIds.has(edge.id));
  const batches = buildResidualEdgeBatches({ graph, residualEdges, vertexRank });
  const finalCarryEdgeCount = batches.at(-1)?.carryOut.length ?? 0;
  if (finalCarryEdgeCount > 0) {
    throw new Error(`The final carry forest still contains ${finalCarryEdgeCount} edges.`);
  }
  const graphAnalysisWithoutOutputTour = {
    graph,
    treeIds,
    forestIds,
    skeletonEdges,
    skeletonTour,
    firstAppearanceVertexOrder,
    skeletonWalks,
    batches,
  };
  const outputTour = buildOutputTour(graphAnalysisWithoutOutputTour);
  return {
    graph,
    treeIds,
    forestIds,
    skeletonEdges,
    skeletonTour,
    firstAppearanceVertexOrder,
    batches,
    outputTour,
  };
}
export {
  analyzeGraph,
  calculateMemoryScale,
  compressedEdgeCount,
  countCompressedCircuitRecordsInOutputRange,
  createMemoryItem,
  createSkeletonOutputMemoryItems,
  createVertexMemoryItem,
  findOutputEdgeCursorAfterRank,
  parseEdgeList,
  selectEdgesByIds,
};
