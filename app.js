"use strict";

import {
  analyzeGraph,
  calculateMemoryScale,
  compressedEdgeCount,
  countCompressedCircuitRecordsInOutputRange,
  createMemoryItem,
  createSkeletonOutputMemoryItems,
  createVertexMemoryItem,
  findOutputEdgeCursorAfterRank,
  selectEdgesByIds,
} from "./graph-algorithm.js";
import { DEFAULT_PRESET_ID, GRAPH_PRESETS } from "./graph-presets.js";

const PLAYBACK_RATES = [0.5, 1, 1.5, 2];
const BATCH_STYLE_NAMES = ["orange", "green", "purple"];
const CUSTOM_GRAPH_PRESET_ID = "custom-graph";
const OPEN_GRAPH_EDITOR_OPTION_ID = "open-graph-editor";
const MINIMUM_OUTPUT_FRAME_DELAY_MS = 260;
const MAXIMUM_OUTPUT_FRAME_DELAY_MS = 560;
const TARGET_OUTPUT_PLAYBACK_DURATION_MS = 8200;
const ALGORITHM_STAGE_DELAY_MS = 1800;

const dom = {
  lab: document.querySelector(".lab"),
  presetSelect: document.querySelector("#preset-select"),
  graphDialog: document.querySelector("#graph-dialog"),
  graphForm: document.querySelector("#graph-form"),
  edgeEditor: document.querySelector("#edge-editor"),
  editorError: document.querySelector("#editor-error"),
  cancelEditor: document.querySelector("#cancel-editor"),
  closeEditor: document.querySelector("#close-editor"),
  stageRail: document.querySelector(".stage-rail"),
  stageList: document.querySelector("#stage-list"),
  playbackStepCount: document.querySelector("#playback-step-count"),
  stepSlider: document.querySelector("#step-slider"),
  firstStep: document.querySelector("#first-step"),
  previousStep: document.querySelector("#previous-step"),
  nextStep: document.querySelector("#next-step"),
  lastStep: document.querySelector("#last-step"),
  playSteps: document.querySelector("#play-steps"),
  speedButton: document.querySelector("#speed-button"),
  speedValue: document.querySelector("#speed-value"),
  resetSteps: document.querySelector("#reset-steps"),
  canvasTitle: document.querySelector("#canvas-title"),
  graphStage: document.querySelector("#graph-stage"),
  edgeLayer: document.querySelector("#edge-layer"),
  nodeLayer: document.querySelector("#node-layer"),
  outputEdgeLayer: document.querySelector("#output-edge-layer"),
  outputNodeLayer: document.querySelector("#output-node-layer"),
  outputDescription: document.querySelector("#output-visual-description"),
  outputTourSequence: document.querySelector("#output-tour-sequence"),
  graphDescription: document.querySelector("#graph-visual-description"),
  detailCopy: document.querySelector("#detail-copy"),
  memoryRows: document.querySelector("#memory-rows"),
  visualizationStatus: document.querySelector("#visualization-status"),
};

Object.entries(dom).forEach(([elementName, element]) => {
  if (element === null) throw new Error(`Missing required page element: ${elementName}.`);
});

const state = {
  currentStageIndex: 0,
  playbackTimerId: null,
  edgeListSource: GRAPH_PRESETS[DEFAULT_PRESET_ID].edges,
  selectedPresetId: DEFAULT_PRESET_ID,
  editorInitialEdgeListSource: "",
  graphAnalysis: null,
  timelineStages: [],
  outputEdgeCursor: 0,
  playbackRate: 1,
  lastRenderedStageIndex: null,
  memoryScale: 1,
};

function batchStyleName(batchIndex) {
  return BATCH_STYLE_NAMES[batchIndex % BATCH_STYLE_NAMES.length];
}

function batchEdgeClass(batchIndex) {
  return `is-circuit is-batch-${batchStyleName(batchIndex)}`;
}

function formatVertexSequence(vertices, limit = 8) {
  if (!vertices?.length) return "∅";
  const labels = vertices.map((vertex) => `v${vertex}`);
  if (labels.length <= limit) return labels.join(" → ");
  return `${labels.slice(0, limit - 1).join(" → ")} → … → ${labels.at(-1)}`;
}

function createEdgeStateMap(graphAnalysis, initialClassName = "") {
  return new Map(
    graphAnalysis.graph.edges.map((edge) => [edge.id, { className: initialClassName }]),
  );
}

function setEdgeStateForEdges(edgeStateById, edges, { className }) {
  edges.forEach((edge) => edgeStateById.set(edge.id, { className }));
}

function createSkeletonStages(graphAnalysis) {
  const allEdges = graphAnalysis.graph.edges;
  const treeEdges = selectEdgesByIds(allEdges, graphAnalysis.treeIds);
  const forestEdges = selectEdgesByIds(allEdges, graphAnalysis.forestIds);
  const skeletonEdges = graphAnalysis.skeletonEdges;
  const vertices = createVertexMemoryItem(graphAnalysis);

  const inputEdgeStates = createEdgeStateMap(graphAnalysis);

  const treeEdgeStates = createEdgeStateMap(graphAnalysis, "is-muted");
  setEdgeStateForEdges(treeEdgeStates, treeEdges, { className: "is-tree" });

  const forestEdgeStates = createEdgeStateMap(graphAnalysis, "is-muted");
  setEdgeStateForEdges(forestEdgeStates, treeEdges, { className: "is-tree" });
  setEdgeStateForEdges(forestEdgeStates, forestEdges, { className: "is-forest" });

  const skeletonEdgeStates = createEdgeStateMap(graphAnalysis, "is-muted");
  setEdgeStateForEdges(skeletonEdgeStates, skeletonEdges, { className: "is-skeleton" });

  return [
    {
      label: "Input graph G",
      copy: `Let <code>G</code> be a connected undirected multigraph with <code>n = ${graphAnalysis.graph.nodes.length}</code> vertices, <code>m = ${graphAnalysis.graph.edges.length}</code> edges, and even degree at every vertex. Parallel edges and loops are allowed, with each loop counting twice toward its vertex degree. The unsorted adjacency arrays are read-only and have no edge identifiers; the tour is written sequentially to an append-only stream.`,
      canvasTitle: "The graph G",
      edgeStates: inputEdgeStates,
      description: "The complete input multigraph, with every edge shown in gray.",
      memory: [vertices],
    },
    {
      label: "Find a DFS tree",
      copy: "A vertex DFS stores a spanning tree <code>T</code> with <code>|T| = n − 1</code>. This guarantees connectivity using <code>O(n)</code> space, although the degrees in <code>T</code> need not be even.",
      canvasTitle: "Choose the spanning tree T",
      edgeStates: treeEdgeStates,
      description: "The DFS tree is highlighted in teal; all other input edges are faded.",
      memory: [
        vertices,
        createMemoryItem({
          id: "tree",
          symbol: "T",
          name: "DFS tree",
          count: treeEdges.length,
          kind: "tree",
        }),
      ],
    },
    {
      label: "Correct the parity",
      copy: "Apply the Forest Lemma to <code>G − T</code> and obtain a forest <code>F</code> such that <code>G − (T + F)</code> is even. Since <code>G</code> is even, <code>T + F</code> is even as well.",
      canvasTitle: "Select the correcting forest F",
      edgeStates: forestEdgeStates,
      description: "The DFS tree is teal and the parity-correcting forest is orange.",
      memory: [
        vertices,
        createMemoryItem({
          id: "tree",
          symbol: "T",
          name: "DFS tree",
          count: treeEdges.length,
          kind: "tree",
        }),
        createMemoryItem({
          id: "forest",
          symbol: "F",
          name: "parity forest",
          count: forestEdges.length,
          kind: "forest",
        }),
      ],
    },
    {
      label: "Build the skeleton",
      copy: `The graph <code>T + F</code> is connected and even, and because both <code>T</code> and <code>F</code> are forests, <code>|T + F| ≤ 2n − 2</code>. Run standard Hierholzer on <code>T + F</code> to obtain the skeleton tour <code>S</code>; its first-appearance order is ${graphAnalysis.firstAppearanceVertexOrder.map((vertex) => `<code>v${vertex}</code>`).join(", ")}.`,
      canvasTitle: "The skeleton tour S",
      edgeStates: skeletonEdgeStates,
      activeNodes: new Set(graphAnalysis.firstAppearanceVertexOrder),
      description: `The blue traversal follows ${formatVertexSequence(graphAnalysis.skeletonTour.vertices, 12)}.`,
      memory: [
        vertices,
        createMemoryItem({
          id: "skeleton",
          symbol: "S",
          name: "skeleton tour",
          count: graphAnalysis.skeletonTour.edges.length,
          kind: "skeleton",
        }),
      ],
    },
  ];
}

function createBatchOutputMemoryItems(
  graphAnalysis,
  { batch, outputEdgeCursor, batchOutputEndEdgeCursor },
) {
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

  const remainingCircuitRecordCount = countCompressedCircuitRecordsInOutputRange(graphAnalysis, {
    startOutputEdgeCursor: outputEdgeCursor,
    endOutputEdgeCursor: batchOutputEndEdgeCursor,
  });
  if (remainingCircuitRecordCount > 0) {
    memoryItems.push(createMemoryItem({
      id: "circuits",
      symbol: "C",
      name: "batch circuits",
      count: remainingCircuitRecordCount,
      kind: `batch-${batchStyleName(batch.batchIndex)}`,
    }));
  }

  if (batch.carryOut.length) {
    memoryItems.push(createMemoryItem({
      id: "carry",
      symbol: "Fⱼ",
      name: "next forest",
      count: batch.carryOut.length,
      kind: "carry",
    }));
  }
  return memoryItems;
}

function createTourStages(graphAnalysis) {
  const stages = [];
  const introEdgeStates = createEdgeStateMap(graphAnalysis);
  const vertices = createVertexMemoryItem(graphAnalysis);
  const skeletonMemory = createMemoryItem({
    id: "skeleton",
    symbol: "S",
    name: "skeleton tour",
    count: graphAnalysis.skeletonTour.edges.length,
    kind: "skeleton",
  });
  setEdgeStateForEdges(introEdgeStates, graphAnalysis.skeletonEdges, { className: "is-skeleton" });

  stages.push({
    outputMode: true,
    fixedOutputEdgeCursor: 0,
    label: "Walk through S",
    copy: `Relabel the vertices by first appearance on <code>S</code>: ${graphAnalysis.firstAppearanceVertexOrder.map((vertex, index) => `<code>${index + 1}:v${vertex}</code>`).join(" ")}. Split <code>S</code> into walks <code>W₁,…,Wₙ</code>; the final stream will have the form <code>C₁,W₁,…,Cₙ,Wₙ</code>. Let <code>Gᵢ</code> contain the residual edges <code>uv</code> with <code>min(u,v) ≤ i</code>, and let <code>Nᵢ = Gᵢ − Gᵢ₋₁</code>.`,
    canvasTitle: "Order vertices along S",
    edgeStates: introEdgeStates,
    activeNodes: new Set(graphAnalysis.firstAppearanceVertexOrder),
    description: "The blue skeleton fixes the output order. The remaining gray edges will be processed in batches.",
    memory: [vertices, skeletonMemory],
  });

  let committedCursor = 0;
  graphAnalysis.batches.forEach((batch, batchIndex) => {
    const range = batch.firstRank === batch.lastRank
      ? `${batch.firstRank + 1}`
      : `${batch.firstRank + 1}–${batch.lastRank + 1}`;
    const roots = graphAnalysis.firstAppearanceVertexOrder.slice(
      batch.firstRank,
      batch.lastRank + 1,
    );
    const outputStart = committedCursor;
    const batchOutputEndEdgeCursor = findOutputEdgeCursorAfterRank(
      graphAnalysis.outputTour.segments,
      batch.lastRank,
    );
    const isFinalBatch = batchIndex === graphAnalysis.batches.length - 1;

    const batchEdges = [...batch.carryIn, ...batch.freshEdges];
    const preparedEdgeStates = createEdgeStateMap(graphAnalysis, "is-muted");
    setEdgeStateForEdges(preparedEdgeStates, batch.releasedEdges, {
      className: batchEdgeClass(batch.batchIndex),
    });
    stages.push({
      outputMode: true,
      fixedOutputEdgeCursor: outputStart,
      label: `Batch ${batchIndex + 1} · prepare`,
      copy: `Choose <code>j</code> so <code>Nᵢ + ··· + Nⱼ</code> contains between <code>n</code> and <code>2n</code> distinct edges, or let <code>j = n</code> for the final batch; here it contains ${batch.pairCount}. Add the carry <code>Fᵢ₋₁</code>, use the Forest Lemma to retain <code>Fⱼ</code>, then decompose the even remainder into <code>Cᵢ,…,Cⱼ</code>. Each distinct edge produces at most two virtual edges, so the batch uses <code>O(n)</code> words.`,
      canvasTitle: `Prepare circuits for ranks ${range}`,
      edgeStates: preparedEdgeStates,
      activeNodes: new Set(batchEdges.flatMap((edge) => [edge.u, edge.v])),
      description: `The coloured edges are released in batch ${batchIndex + 1}; the gray carry forest remains for the next batch.`,
      memory: [
        vertices,
        skeletonMemory,
        createMemoryItem({
          id: "batch",
          symbol: "B",
          name: "current batch",
          count: compressedEdgeCount(batchEdges),
          kind: `batch-${batchStyleName(batch.batchIndex)}`,
        }),
      ],
    });

    const outputEdgeStates = createEdgeStateMap(graphAnalysis, "is-muted");
    setEdgeStateForEdges(outputEdgeStates, graphAnalysis.skeletonEdges, { className: "is-skeleton" });
    batch.circuits.forEach((circuit) => {
      const edges = selectEdgesByIds(graphAnalysis.graph.edges, new Set(circuit.edges));
      setEdgeStateForEdges(outputEdgeStates, edges, {
        className: batchEdgeClass(circuit.batchIndex),
      });
    });
    stages.push({
      kind: "output-stream",
      outputMode: true,
      outputStart,
      outputEnd: batchOutputEndEdgeCursor,
      label: `Batch ${batchIndex + 1} · output`,
      copy: `For each current rank <code>k</code>, write <code>Cₖ</code> and then <code>Wₖ</code>. Because <code>Cₖ</code> begins and ends where <code>Wₖ</code> begins, every written prefix is continuous and is never rearranged.${isFinalBatch ? " At the end, <code>Fₙ</code> is both a forest and even, so <code>Fₙ = ∅</code> and every edge has been written exactly once." : ""}`,
      canvasTitle: `Write batch ${batchIndex + 1} to the output`,
      edgeStates: outputEdgeStates,
      activeNodes: new Set(roots),
      description: "Edges leave the working graph one at a time and remain in order in the output graph.",
      memory: (outputEdgeCursor) => createBatchOutputMemoryItems(graphAnalysis, {
        batch,
        outputEdgeCursor,
        batchOutputEndEdgeCursor,
      }),
    });
    committedCursor = batchOutputEndEdgeCursor;
  });

  if (!graphAnalysis.batches.length) {
    const skeletonEdgeStates = createEdgeStateMap(graphAnalysis, "is-muted");
    setEdgeStateForEdges(skeletonEdgeStates, graphAnalysis.skeletonEdges, {
      className: "is-skeleton",
    });
    stages.push({
      kind: "output-stream",
      outputMode: true,
      outputStart: 0,
      outputEnd: graphAnalysis.graph.edges.length,
      label: "Write S to output",
      copy: "There are no residual circuits, so the skeleton <code>S</code> is already the full Eulerian tour. Write its edges from left to right; every prefix remains continuous.",
      canvasTitle: "Write S to the output",
      edgeStates: skeletonEdgeStates,
      activeNodes: new Set(graphAnalysis.graph.nodes),
      description: "Edges leave the working graph one at a time and remain in order in the output graph.",
      memory: (cursor) => createSkeletonOutputMemoryItems(graphAnalysis, cursor),
    });
    committedCursor = graphAnalysis.graph.edges.length;
  }

  if (committedCursor !== graphAnalysis.graph.edges.length) {
    throw new Error("The batch output ranges do not cover the full Eulerian tour.");
  }

  return stages;
}

function calculateNodePositions(nodes) {
  const nodePositionsByVertex = new Map();
  const center = { x: 410, y: 258 };
  const count = nodes.length;

  if (count === 1) {
    nodePositionsByVertex.set(nodes[0], center);
    return nodePositionsByVertex;
  }

  if (count === 2) {
    nodePositionsByVertex.set(nodes[0], { x: 280, y: 260 });
    nodePositionsByVertex.set(nodes[1], { x: 540, y: 260 });
    return nodePositionsByVertex;
  }

  if (count === 3) {
    nodePositionsByVertex.set(nodes[0], { x: 410, y: 115 });
    nodePositionsByVertex.set(nodes[1], { x: 565, y: 380 });
    nodePositionsByVertex.set(nodes[2], { x: 255, y: 380 });
    return nodePositionsByVertex;
  }

  if (count === 4) {
    nodePositionsByVertex.set(nodes[0], { x: 275, y: 135 });
    nodePositionsByVertex.set(nodes[1], { x: 545, y: 135 });
    nodePositionsByVertex.set(nodes[2], { x: 545, y: 385 });
    nodePositionsByVertex.set(nodes[3], { x: 275, y: 385 });
    return nodePositionsByVertex;
  }

  const radius = count > 9 ? 188 : 175;
  nodes.forEach((node, index) => {
    const angle = -Math.PI / 2 + (index * Math.PI * 2) / count;
    nodePositionsByVertex.set(node, {
      x: center.x + Math.cos(angle) * radius,
      y: center.y + Math.sin(angle) * radius,
    });
  });
  return nodePositionsByVertex;
}

function calculateEdgePaths(graph, nodePositionsByVertex) {
  const graphCenter = { x: 410, y: 258 };
  const groups = new Map();
  graph.edges.forEach((edge) => {
    if (!groups.has(edge.pair)) groups.set(edge.pair, []);
    groups.get(edge.pair).push(edge);
  });

  const edgePathsById = new Map();
  groups.forEach((edges) => {
    edges.forEach((edge, index) => {
      const from = nodePositionsByVertex.get(edge.u);
      const to = nodePositionsByVertex.get(edge.v);
      if (edge.u === edge.v) {
        const centerDx = from.x - graphCenter.x;
        const centerDy = from.y - graphCenter.y;
        const isCentered = centerDx === 0 && centerDy === 0;
        const centerDistance = Math.hypot(centerDx, centerDy) || 1;
        const outwardX = isCentered ? 0 : centerDx / centerDistance;
        const outwardY = isCentered ? -1 : centerDy / centerDistance;
        const sideX = -outwardY;
        const sideY = outwardX;
        const loopStep = Math.min(16, 24 / Math.max(1, edges.length - 1));
        const sideStep = Math.min(9, 16 / Math.max(1, edges.length - 1));
        const reach = 64 + index * loopStep;
        const width = 44 + index * sideStep;
        const anchorWidth = 13 + Math.min(index * 2, 7);
        const startX = from.x + outwardX * 18 - sideX * anchorWidth;
        const startY = from.y + outwardY * 18 - sideY * anchorWidth;
        const endX = from.x + outwardX * 18 + sideX * anchorWidth;
        const endY = from.y + outwardY * 18 + sideY * anchorWidth;
        const firstControlX = from.x + outwardX * reach - sideX * width;
        const firstControlY = from.y + outwardY * reach - sideY * width;
        const secondControlX = from.x + outwardX * reach + sideX * width;
        const secondControlY = from.y + outwardY * reach + sideY * width;
        edgePathsById.set(
          edge.id,
          `M ${startX} ${startY} C ${firstControlX} ${firstControlY} ${secondControlX} ${secondControlY} ${endX} ${endY}`,
        );
        return;
      }

      if (edges.length === 1) {
        edgePathsById.set(edge.id, `M ${from.x} ${from.y} L ${to.x} ${to.y}`);
        return;
      }

      const dx = to.x - from.x;
      const dy = to.y - from.y;
      const length = Math.hypot(dx, dy) || 1;
      const edgeSpacing = Math.min(52, 260 / Math.max(1, edges.length - 1));
      const offset = (index - (edges.length - 1) / 2) * edgeSpacing;
      const controlX = (from.x + to.x) / 2 + (-dy / length) * offset;
      const controlY = (from.y + to.y) / 2 + (dx / length) * offset;
      edgePathsById.set(edge.id, `M ${from.x} ${from.y} Q ${controlX} ${controlY} ${to.x} ${to.y}`);
    });
  });
  return edgePathsById;
}

function createSvgElement(name, attributes = {}) {
  const element = document.createElementNS("http://www.w3.org/2000/svg", name);
  Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, value));
  return element;
}

function getOutputEdgeCursorForStage(stage) {
  return stage.outputMode ? state.outputEdgeCursor : null;
}

function outputRangeForStage(stage) {
  return {
    start: stage.outputStart ?? 0,
    end: stage.outputEnd ?? stage.outputStart ?? 0,
  };
}

function initialOutputCursorForStage(stage, options = {}) {
  if (!stage.outputMode) return 0;
  if (stage.kind !== "output-stream") return stage.fixedOutputEdgeCursor ?? 0;

  const { start, end } = outputRangeForStage(stage);
  const requestedOutputEdgeCursor = options.outputEdgeCursor ?? (options.atEnd ? end : start);
  return Math.max(start, Math.min(requestedOutputEdgeCursor, end));
}

function stageIsFinished(stage) {
  if (stage.kind !== "output-stream") return true;
  return state.outputEdgeCursor >= outputRangeForStage(stage).end;
}

function outputSegmentClass(segment) {
  return segment.type === "skeleton"
    ? "is-skeleton"
    : batchEdgeClass(segment.batchIndex);
}

function renderOutputTourPath(graphAnalysis, outputEdgeCursor) {
  const visibleVertices = graphAnalysis.outputTour.vertices.slice(0, outputEdgeCursor + 1);
  const visibleSegments = graphAnalysis.outputTour.segments.slice(0, outputEdgeCursor);
  const tourPath = document.createDocumentFragment();

  visibleVertices.forEach((vertex, vertexIndex) => {
    const vertexMarker = document.createElement("span");
    vertexMarker.className = "tour-vertex";
    vertexMarker.textContent = `v${vertex}`;
    if (vertexIndex === visibleVertices.length - 1) {
      vertexMarker.classList.add("is-current");
      vertexMarker.setAttribute("aria-current", "step");
    }
    tourPath.append(vertexMarker);

    const outgoingSegment = visibleSegments[vertexIndex];
    if (outgoingSegment === undefined) return;
    const edgeConnector = document.createElement("span");
    edgeConnector.className = `tour-edge ${outputSegmentClass(outgoingSegment)}`;
    edgeConnector.title = outgoingSegment.label;
    edgeConnector.setAttribute("aria-hidden", "true");
    tourPath.append(edgeConnector);
  });

  dom.outputTourSequence.replaceChildren(tourPath);
  dom.outputTourSequence.scrollLeft = dom.outputTourSequence.scrollWidth;
}

function appendGraphNode(layer, { node, position, className = "" }) {
  const group = createSvgElement("g", {
    class: `graph-node ${className}`.trim(),
    transform: `translate(${position.x} ${position.y})`,
    "data-node": node,
  });
  group.append(createSvgElement("circle", { r: "23" }));
  const label = createSvgElement("text", { x: "0", y: "7" });
  label.textContent = `v${node}`;
  group.append(label);
  layer.append(group);
  return group;
}

function synchronizeGraphNodes(layer, { nodes, nodePositionsByVertex, classForNode }) {
  const existingNodesByVertex = new Map(
    [...layer.children].map((nodeElement) => [nodeElement.dataset.node, nodeElement]),
  );

  nodes.forEach((node) => {
    const position = nodePositionsByVertex.get(node);
    const className = classForNode(node);
    const group = existingNodesByVertex.get(node)
      ?? appendGraphNode(layer, { node, position, className });
    group.setAttribute("class", `graph-node ${className}`.trim());
    group.setAttribute("transform", `translate(${position.x} ${position.y})`);
    group.querySelector("text").textContent = `v${node}`;
    layer.append(group);
    existingNodesByVertex.delete(node);
  });

  existingNodesByVertex.forEach((element) => element.remove());
}

function synchronizeGraphEdges(layer, edgeRenderSpecifications) {
  const existingEdgesById = new Map(
    [...layer.children].map((edgeElement) => [edgeElement.dataset.edgeId, edgeElement]),
  );

  edgeRenderSpecifications.forEach((spec) => {
    const path = existingEdgesById.get(spec.edgeId) ?? createSvgElement("path");
    path.setAttribute("d", spec.d);
    path.setAttribute("pathLength", "1");
    path.setAttribute("class", `graph-edge ${spec.className}`.trim());
    path.dataset.edgeId = spec.edgeId;
    if (spec.outputIndex === undefined) delete path.dataset.outputIndex;
    else path.dataset.outputIndex = String(spec.outputIndex);

    let title = path.querySelector("title");
    if (!title) {
      title = createSvgElement("title");
      path.append(title);
    }
    title.textContent = spec.title;
    layer.append(path);
    existingEdgesById.delete(spec.edgeId);
  });

  existingEdgesById.forEach((element) => element.remove());
}

function renderOutputGraph({ nodePositionsByVertex, edgePathsById, outputEdgeCursor }) {
  const { graphAnalysis } = state;
  const edgeById = new Map(graphAnalysis.graph.edges.map((edge) => [edge.id, edge]));
  const visited = new Set(graphAnalysis.outputTour.vertices.slice(0, outputEdgeCursor + 1));
  const currentVertex = graphAnalysis.outputTour.vertices[outputEdgeCursor];

  const outputEdgeSpecs = graphAnalysis.outputTour.segments
    .slice(0, outputEdgeCursor)
    .map((segment, index) => {
      const edge = edgeById.get(segment.edgeId);
      const newestOutputEdgeClassName = index === outputEdgeCursor - 1
        ? "is-new-output"
        : "";
      return {
        edgeId: segment.edgeId,
        d: edgePathsById.get(segment.edgeId),
        className: `output-edge ${outputSegmentClass(segment)} ${newestOutputEdgeClassName}`.trim(),
        outputIndex: index,
        title: edge.u === edge.v
          ? `${segment.label}: loop at v${edge.u}`
          : `${segment.label}: v${segment.from}–v${segment.to}`,
      };
    });
  synchronizeGraphEdges(dom.outputEdgeLayer, outputEdgeSpecs);

  synchronizeGraphNodes(dom.outputNodeLayer, {
    nodes: graphAnalysis.graph.nodes,
    nodePositionsByVertex,
    classForNode: (node) => {
      const classes = ["is-output-node"];
      if (visited.has(node)) classes.push("is-output-seen");
      if (node === currentVertex) classes.push("is-output-current");
      return classes.join(" ");
    },
  });

  dom.outputDescription.textContent = outputEdgeCursor > 0
    ? `The output graph contains the first ${outputEdgeCursor} edges of the Eulerian tour and currently ends at v${currentVertex}.`
    : `The output graph has the same vertices as the input and no edges yet. The tour starts at v${currentVertex}.`;
  renderOutputTourPath(graphAnalysis, outputEdgeCursor);
}

function renderGraph(stage) {
  const { graphAnalysis } = state;
  const nodePositionsByVertex = calculateNodePositions(graphAnalysis.graph.nodes);
  const edgePathsById = calculateEdgePaths(graphAnalysis.graph, nodePositionsByVertex);
  const outputEdgeCursor = getOutputEdgeCursorForStage(stage);
  const isOutputting = outputEdgeCursor !== null;
  const outputIndexByEdgeId = new Map(
    graphAnalysis.outputTour.edges.map((edgeId, index) => [edgeId, index]),
  );
  const currentVertex = isOutputting
    ? graphAnalysis.outputTour.vertices[outputEdgeCursor]
    : null;

  dom.graphStage.classList.toggle("is-outputting", isOutputting);

  const priority = (edge) => {
    const className = stage.edgeStates.get(edge.id)?.className ?? "";
    if (className.includes("is-circuit")) return 5;
    if (className.includes("is-skeleton")) return 4;
    return 1;
  };

  const edgeSpecs = [...graphAnalysis.graph.edges]
    .sort((a, b) => priority(a) - priority(b))
    .map((edge) => {
      const edgeState = stage.edgeStates.get(edge.id) ?? { className: "" };
      let className = edgeState.className;
      if (isOutputting) {
        const outputIndex = outputIndexByEdgeId.get(edge.id);
        if (outputIndex < outputEdgeCursor) className += " is-output-written-source";
        else if (outputIndex === outputEdgeCursor) className += " is-output-next";
        else className += " is-output-pending";
      }
      return {
        edgeId: edge.id,
        d: edgePathsById.get(edge.id),
        className,
        title: edge.u === edge.v
          ? `Loop at v${edge.u}`
          : `Edge v${edge.u}–v${edge.v}`,
      };
    });
  synchronizeGraphEdges(dom.edgeLayer, edgeSpecs);

  synchronizeGraphNodes(dom.nodeLayer, {
    nodes: graphAnalysis.graph.nodes,
    nodePositionsByVertex,
    classForNode: (node) => {
      const classes = [];
      if (stage.activeNodes?.has(node)) classes.push("is-active");
      if (isOutputting && node === currentVertex) classes.push("is-output-current");
      return classes.join(" ");
    },
  });

  if (isOutputting) {
    renderOutputGraph({
      nodePositionsByVertex,
      edgePathsById,
      outputEdgeCursor,
    });
  } else {
    dom.outputEdgeLayer.replaceChildren();
    dom.outputNodeLayer.replaceChildren();
    dom.outputTourSequence.textContent = "";
  }
}

function renderStageList() {
  dom.stageList.replaceChildren();
  let currentPhase = null;
  state.timelineStages.forEach((stage, index) => {
    if (stage.phase !== currentPhase) {
      currentPhase = stage.phase;
      const heading = document.createElement("li");
      heading.className = "stage-group-title";
      heading.textContent = currentPhase === "skeleton"
        ? "Build the skeleton"
        : "Assemble the tour";
      dom.stageList.append(heading);
    }

    const item = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.className = `stage-button ${index === state.currentStageIndex ? "is-active" : ""}`.trim();
    if (index === state.currentStageIndex) button.setAttribute("aria-current", "step");
    button.dataset.step = String(index);
    button.innerHTML = `
      <span class="stage-number">${String(index + 1).padStart(2, "0")}</span>
      <span class="stage-name"></span>
    `;
    button.querySelector(".stage-name").textContent = stage.label;
    button.addEventListener("click", () => setTimelineStage(index));
    item.append(button);
    dom.stageList.append(item);
  });
}

function createMemoryRow(item) {
  const row = document.createElement("div");
  row.dataset.memoryId = item.id;

  const name = document.createElement("div");
  name.className = "memory-name";
  const symbol = document.createElement("i");
  const description = document.createElement("span");
  name.append(symbol, description);

  const track = document.createElement("div");
  track.className = "memory-track";
  const fill = document.createElement("span");
  fill.className = "memory-fill";
  track.append(fill);

  const count = document.createElement("strong");
  count.className = "memory-count";
  row.append(name, track, count);
  return row;
}

function renderMemory(stage) {
  const memoryItemsSource = typeof stage.memory === "function"
    ? stage.memory(state.outputEdgeCursor)
    : stage.memory;
  const visibleMemoryItems = (memoryItemsSource ?? []).filter((item) => item.count > 0);
  const memoryScale = state.memoryScale;
  const memoryRowsById = new Map(
    [...dom.memoryRows.querySelectorAll(".memory-row")]
      .map((row) => [row.dataset.memoryId, row]),
  );

  visibleMemoryItems.forEach((item) => {
    const row = memoryRowsById.get(item.id) ?? createMemoryRow(item);
    row.getAnimations().forEach((animation) => animation.cancel());
    delete row.dataset.removing;
    row.className = `memory-row memory-${item.kind}`;
    row.querySelector(".memory-name i").textContent = item.symbol;
    row.querySelector(".memory-name span").textContent = item.name;
    row.querySelector(".memory-count").textContent = String(item.count);
    row.setAttribute(
      "aria-label",
      `${item.name}: ${item.count} ${item.unit === "vertices" ? "vertex" : "edge"} records`,
    );
    dom.memoryRows.append(row);
    const track = row.querySelector(".memory-track");
    track.style.setProperty("--memory-slots", String(Math.min(memoryScale, 16)));
    const fill = row.querySelector(".memory-fill");
    const memoryFillWidth = `${Math.min(
      100,
      Math.max(4, (item.count / memoryScale) * 100),
    )}%`;
    if (!memoryRowsById.has(item.id)) {
      fill.style.width = "0";
      row.animate(
        [
          { opacity: 0, transform: "translateY(4px)" },
          { opacity: 1, transform: "translateY(0)" },
        ],
        { duration: 260, easing: "cubic-bezier(0.22, 0.7, 0.2, 1)" },
      );
      requestAnimationFrame(() => {
        fill.style.width = memoryFillWidth;
      });
    } else {
      fill.style.width = memoryFillWidth;
    }
    memoryRowsById.delete(item.id);
  });

  memoryRowsById.forEach((row) => {
    row.dataset.removing = "true";
    const animation = row.animate(
      [
        { opacity: 1, transform: "translateY(0)" },
        { opacity: 0, transform: "translateY(-3px)" },
      ],
      { duration: 160, easing: "ease", fill: "forwards" },
    );
    animation.addEventListener("finish", () => {
      if (row.dataset.removing === "true") row.remove();
    });
  });

  if (visibleMemoryItems.length === 0 && !dom.memoryRows.querySelector(".memory-empty")) {
    const empty = document.createElement("div");
    empty.className = "memory-empty";
    empty.textContent = "All working records have been released.";
    dom.memoryRows.append(empty);
  } else if (visibleMemoryItems.length > 0) {
    dom.memoryRows.querySelector(".memory-empty")?.remove();
  }
}

function animateStepChange() {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  [dom.canvasTitle, dom.detailCopy].forEach((element) => {
    element.getAnimations().forEach((animation) => animation.cancel());
    element.animate(
      [
        { opacity: 0.25, transform: "translateY(5px)" },
        { opacity: 1, transform: "translateY(0)" },
      ],
      { duration: 360, easing: "cubic-bezier(0.22, 0.7, 0.2, 1)" },
    );
  });

  dom.graphStage.getAnimations().forEach((animation) => animation.cancel());
  dom.graphStage.animate(
    [{ opacity: 0.82 }, { opacity: 1 }],
    { duration: 320, easing: "cubic-bezier(0.22, 0.7, 0.2, 1)" },
  );
}

function keepActiveStageVisible() {
  const active = dom.stageList.querySelector(".stage-button.is-active");
  if (active === null) return;

  const railBounds = dom.stageRail.getBoundingClientRect();
  const activeBounds = active.getBoundingClientRect();
  const topGap = activeBounds.top - railBounds.top;
  const bottomGap = activeBounds.bottom - railBounds.bottom;
  const leftGap = activeBounds.left - railBounds.left;
  const rightGap = activeBounds.right - railBounds.right;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const behavior = reducedMotion ? "auto" : "smooth";

  if (topGap < 16) {
    dom.stageRail.scrollBy({ top: topGap - 24, behavior });
  } else if (bottomGap > -16) {
    dom.stageRail.scrollBy({ top: bottomGap + 24, behavior });
  }

  if (leftGap < 16) {
    dom.stageRail.scrollBy({ left: leftGap - 24, behavior });
  } else if (rightGap > -16) {
    dom.stageRail.scrollBy({ left: rightGap + 24, behavior });
  }
}

function render() {
  const stage = state.timelineStages[state.currentStageIndex];
  if (stage === undefined) return;
  const totalStageCount = state.timelineStages.length;
  const currentStageNumber = state.currentStageIndex + 1;
  const outputEdgeCursor = getOutputEdgeCursorForStage(stage);
  const streamsOutput = stage.kind === "output-stream";
  const stageChanged = state.lastRenderedStageIndex !== state.currentStageIndex;

  dom.playbackStepCount.textContent = `${currentStageNumber} / ${totalStageCount}`;
  if (stageChanged) {
    dom.detailCopy.innerHTML = stage.copy;
    dom.canvasTitle.textContent = stage.canvasTitle;
  }
  dom.graphDescription.textContent = stage.description;

  const outputRange = outputRangeForStage(stage);
  const sliderMin = streamsOutput ? outputRange.start : 0;
  const sliderMax = streamsOutput ? outputRange.end : totalStageCount - 1;
  const sliderValue = streamsOutput ? outputEdgeCursor : state.currentStageIndex;
  dom.visualizationStatus.textContent = streamsOutput
    ? `${stage.label}. ${outputEdgeCursor} of ${outputRange.end} tour edges written.`
    : `${stage.label}. Step ${currentStageNumber} of ${totalStageCount}.`;
  dom.stepSlider.min = String(sliderMin);
  dom.stepSlider.max = String(sliderMax);
  dom.stepSlider.value = String(sliderValue);
  dom.stepSlider.setAttribute(
    "aria-label",
    streamsOutput ? "Eulerian tour output edge" : "Visualization step",
  );
  const sliderSpan = sliderMax - sliderMin;
  dom.stepSlider.style.setProperty(
    "--range-progress",
    `${sliderSpan === 0 ? 100 : ((sliderValue - sliderMin) / sliderSpan) * 100}%`,
  );
  const isFirstFrame = state.currentStageIndex === 0;
  const isLastFrame = state.currentStageIndex === totalStageCount - 1 && stageIsFinished(stage);
  dom.firstStep.disabled = isFirstFrame;
  dom.previousStep.disabled = isFirstFrame;
  dom.nextStep.disabled = isLastFrame;
  dom.lastStep.disabled = isLastFrame;

  renderGraph(stage);
  renderMemory(stage);

  [...dom.stageList.querySelectorAll(".stage-button")].forEach((button, index) => {
    const isCurrentStep = index === state.currentStageIndex;
    button.classList.toggle("is-active", isCurrentStep);
    if (isCurrentStep) button.setAttribute("aria-current", "step");
    else button.removeAttribute("aria-current");
  });

  if (stageChanged) {
    animateStepChange();
    window.requestAnimationFrame(keepActiveStageVisible);
  }
  state.lastRenderedStageIndex = state.currentStageIndex;
}

function stopPlayback() {
  if (state.playbackTimerId !== null) window.clearTimeout(state.playbackTimerId);
  state.playbackTimerId = null;
  dom.playSteps.classList.remove("is-playing");
  dom.playSteps.setAttribute("aria-label", "Play visualization");
  dom.playSteps.title = "Play";
}

function setTimelineStage(requestedStageIndex, options = {}) {
  state.currentStageIndex = Math.max(
    0,
    Math.min(requestedStageIndex, state.timelineStages.length - 1),
  );
  const stage = state.timelineStages[state.currentStageIndex];
  state.outputEdgeCursor = initialOutputCursorForStage(stage, options);
  if (!options.keepPlaying) stopPlayback();
  render();
}

function previousFrame() {
  stopPlayback();
  const stage = state.timelineStages[state.currentStageIndex];
  const { start } = outputRangeForStage(stage);
  if (stage.kind === "output-stream" && state.outputEdgeCursor > start) {
    state.outputEdgeCursor -= 1;
    render();
    return;
  }
  setTimelineStage(state.currentStageIndex - 1, { atEnd: true });
}

function nextFrame() {
  stopPlayback();
  const stage = state.timelineStages[state.currentStageIndex];
  const { end } = outputRangeForStage(stage);
  if (stage.kind === "output-stream" && state.outputEdgeCursor < end) {
    state.outputEdgeCursor += 1;
    render();
    return;
  }
  setTimelineStage(state.currentStageIndex + 1);
}

function playbackDelay() {
  const stage = state.timelineStages[state.currentStageIndex];
  let delay;
  if (stage.kind === "output-stream") {
    const delayForTargetDuration = Math.round(
      TARGET_OUTPUT_PLAYBACK_DURATION_MS / state.graphAnalysis.graph.edges.length,
    );
    delay = Math.max(
      MINIMUM_OUTPUT_FRAME_DELAY_MS,
      Math.min(MAXIMUM_OUTPUT_FRAME_DELAY_MS, delayForTargetDuration),
    );
  } else {
    delay = ALGORITHM_STAGE_DELAY_MS;
  }
  return Math.round(delay / state.playbackRate);
}

function formatPlaybackRate(rate) {
  return `${rate.toFixed(1).replace(/\.0$/, "")}×`;
}

function renderSpeedControl() {
  const currentIndex = PLAYBACK_RATES.indexOf(state.playbackRate);
  const nextIndex = (currentIndex + 1) % PLAYBACK_RATES.length;
  const nextRate = PLAYBACK_RATES[nextIndex];
  const progress = (state.playbackRate - PLAYBACK_RATES[0])
    / (PLAYBACK_RATES[PLAYBACK_RATES.length - 1] - PLAYBACK_RATES[0]);
  const angle = -55 + progress * 110;
  const currentLabel = formatPlaybackRate(state.playbackRate);
  const nextLabel = formatPlaybackRate(nextRate);

  dom.speedValue.textContent = currentLabel;
  dom.speedButton.style.setProperty("--speed-angle", `${angle}deg`);
  dom.speedButton.setAttribute(
    "aria-label",
    `Playback speed ${currentLabel}; click for ${nextLabel}`,
  );
  dom.speedButton.title = `Speed ${currentLabel} · click for ${nextLabel}`;
}

function advancePlaybackSpeed() {
  const wasPlaying = state.playbackTimerId !== null;
  if (state.playbackTimerId !== null) window.clearTimeout(state.playbackTimerId);

  const currentIndex = PLAYBACK_RATES.indexOf(state.playbackRate);
  state.playbackRate = PLAYBACK_RATES[(currentIndex + 1) % PLAYBACK_RATES.length];
  renderSpeedControl();

  state.playbackTimerId = wasPlaying
    ? window.setTimeout(playbackTick, playbackDelay())
    : null;
}

function playbackTick() {
  const stage = state.timelineStages[state.currentStageIndex];
  const { end } = outputRangeForStage(stage);
  if (stage.kind === "output-stream" && state.outputEdgeCursor < end) {
    state.outputEdgeCursor += 1;
  } else if (state.currentStageIndex < state.timelineStages.length - 1) {
    state.currentStageIndex += 1;
    const nextStage = state.timelineStages[state.currentStageIndex];
    state.outputEdgeCursor = initialOutputCursorForStage(nextStage);
  } else {
    stopPlayback();
    return;
  }

  render();
  const activeStage = state.timelineStages[state.currentStageIndex];
  if (state.currentStageIndex === state.timelineStages.length - 1 && stageIsFinished(activeStage)) {
    stopPlayback();
    return;
  }
  state.playbackTimerId = window.setTimeout(playbackTick, playbackDelay());
}

function startPlayback() {
  if (state.playbackTimerId !== null) {
    stopPlayback();
    return;
  }

  const stage = state.timelineStages[state.currentStageIndex];
  if (state.currentStageIndex === state.timelineStages.length - 1 && stageIsFinished(stage)) {
    state.currentStageIndex = 0;
    state.outputEdgeCursor = initialOutputCursorForStage(state.timelineStages[0]);
  }
  dom.playSteps.classList.add("is-playing");
  dom.playSteps.setAttribute("aria-label", "Pause visualization");
  dom.playSteps.title = "Pause";
  render();
  state.playbackTimerId = window.setTimeout(playbackTick, playbackDelay());
}

function buildTimeline() {
  if (state.graphAnalysis === null) return;
  stopPlayback();
  state.currentStageIndex = 0;
  state.outputEdgeCursor = 0;
  state.lastRenderedStageIndex = null;
  state.memoryScale = calculateMemoryScale(state.graphAnalysis);
  state.timelineStages = [
    ...createSkeletonStages(state.graphAnalysis).map((stage) => ({ ...stage, phase: "skeleton" })),
    ...createTourStages(state.graphAnalysis).map((stage) => ({ ...stage, phase: "tour" })),
  ];
  renderStageList();
  render();
}

function createGraphOption({ value, label, isSelected = false }) {
  const option = document.createElement("option");
  option.value = value;
  option.textContent = label;
  option.selected = isSelected;
  return option;
}

function renderPresetOptions() {
  const options = Object.entries(GRAPH_PRESETS).map(([presetId, preset]) => (
    createGraphOption({
      value: presetId,
      label: preset.name,
      isSelected: state.selectedPresetId === presetId,
    })
  ));

  if (state.selectedPresetId === CUSTOM_GRAPH_PRESET_ID) {
    options.push(createGraphOption({
      value: CUSTOM_GRAPH_PRESET_ID,
      label: "Custom graph",
      isSelected: true,
    }));
  }
  const editorLabel = state.selectedPresetId === CUSTOM_GRAPH_PRESET_ID
    ? "Edit custom graph…"
    : "Custom graph…";
  options.push(createGraphOption({
    value: OPEN_GRAPH_EDITOR_OPTION_ID,
    label: editorLabel,
  }));
  dom.presetSelect.replaceChildren(...options);
}

function loadGraph(edgeListSource, presetId = CUSTOM_GRAPH_PRESET_ID) {
  const graphAnalysis = analyzeGraph(edgeListSource);
  stopPlayback();
  state.edgeListSource = edgeListSource;
  state.selectedPresetId = presetId;
  state.graphAnalysis = graphAnalysis;
  renderPresetOptions();
  buildTimeline();
}

function openGraphEditor() {
  dom.edgeEditor.value = state.edgeListSource;
  state.editorInitialEdgeListSource = state.edgeListSource;
  dom.editorError.textContent = "";
  dom.edgeEditor.removeAttribute("aria-invalid");
  dom.graphDialog.showModal();
  requestAnimationFrame(() => dom.edgeEditor.focus());
}

function graphEditorHasUnsavedChanges() {
  return dom.edgeEditor.value !== state.editorInitialEdgeListSource;
}

function requestGraphEditorClose() {
  const shouldDiscardChanges = !graphEditorHasUnsavedChanges()
    || window.confirm("Discard changes to this graph?");
  if (shouldDiscardChanges) dom.graphDialog.close();
}

dom.previousStep.addEventListener("click", previousFrame);
dom.nextStep.addEventListener("click", nextFrame);
dom.firstStep.addEventListener("click", () => setTimelineStage(0));
dom.lastStep.addEventListener("click", () => {
  setTimelineStage(state.timelineStages.length - 1, { atEnd: true });
});
dom.resetSteps.addEventListener("click", () => setTimelineStage(0));
dom.playSteps.addEventListener("click", startPlayback);
dom.speedButton.addEventListener("click", advancePlaybackSpeed);
dom.stepSlider.addEventListener("input", (event) => {
  const requestedSliderPosition = Number(event.target.value);
  const stage = state.timelineStages[state.currentStageIndex];
  if (stage.kind === "output-stream") {
    stopPlayback();
    state.outputEdgeCursor = initialOutputCursorForStage(stage, {
      outputEdgeCursor: requestedSliderPosition,
    });
    render();
  } else {
    setTimelineStage(requestedSliderPosition);
  }
});

dom.presetSelect.addEventListener("change", (event) => {
  if (event.target.value === OPEN_GRAPH_EDITOR_OPTION_ID) {
    renderPresetOptions();
    openGraphEditor();
    return;
  }
  if (event.target.value === CUSTOM_GRAPH_PRESET_ID) return;
  const selectedGraphPreset = GRAPH_PRESETS[event.target.value];
  if (selectedGraphPreset !== undefined) {
    loadGraph(selectedGraphPreset.edges, event.target.value);
  }
});

dom.cancelEditor.addEventListener("click", requestGraphEditorClose);
dom.closeEditor.addEventListener("click", requestGraphEditorClose);
dom.graphDialog.addEventListener("cancel", (event) => {
  event.preventDefault();
  requestGraphEditorClose();
});
dom.graphForm.addEventListener("submit", (event) => {
  event.preventDefault();
  try {
    loadGraph(dom.edgeEditor.value, CUSTOM_GRAPH_PRESET_ID);
    state.editorInitialEdgeListSource = dom.edgeEditor.value;
    dom.edgeEditor.removeAttribute("aria-invalid");
    dom.graphDialog.close();
  } catch (error) {
    dom.edgeEditor.setAttribute("aria-invalid", "true");
    dom.editorError.textContent = error instanceof Error ? error.message : "Could not load this graph.";
  }
});

function eventTargetIsInteractive(target) {
  return target instanceof Element && Boolean(
    target.closest("button, a, input, textarea, select, [contenteditable='true']"),
  );
}

dom.lab.addEventListener("keydown", (event) => {
  if (dom.graphDialog.open || eventTargetIsInteractive(event.target)) return;

  const shortcutActions = {
    ArrowLeft: previousFrame,
    ArrowRight: nextFrame,
    Home: () => setTimelineStage(0),
    End: () => setTimelineStage(state.timelineStages.length - 1, { atEnd: true }),
    " ": startPlayback,
  };
  const action = shortcutActions[event.key];
  if (action !== undefined) {
    event.preventDefault();
    action();
  }
});

renderSpeedControl();

try {
  loadGraph(GRAPH_PRESETS[DEFAULT_PRESET_ID].edges, DEFAULT_PRESET_ID);
} catch (error) {
  dom.canvasTitle.textContent = "Could not load graph";
  dom.detailCopy.textContent = error instanceof Error ? error.message : "The graph could not be loaded.";
}
