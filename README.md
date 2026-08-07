# Space-Efficient Hierholzer for Undirected Graphs

An interactive companion to *Space-Efficient Hierholzer for Undirected Graphs*.
The visual lab derives the skeleton and streamed Eulerian tour directly from an
undirected multigraph, using the algorithm described in the paper.

The visualization follows the paper's final computational model: read-only,
unsorted adjacency arrays without edge identifiers, an append-only output
stream, and O(n) words of working memory.

The browser keeps a separate drawing model so it can animate the graph. The
working-memory panel depicts the paper's algorithmic state; it is not a measure
of the JavaScript runtime's own allocation.

## Code map

- `graph-algorithm.js` parses and validates edge lists, builds the skeleton,
  batches the residual graph, and produces the Eulerian tour.
- `graph-presets.js` is the single registry for the built-in examples.
- `app.js` builds the walkthrough and controls rendering and playback.
- `visualization.css` styles the algorithm lab; `styles.css` owns the page shell,
  dialog, and responsive overrides.

Vertex labels are canonical positive integers. The input must be connected and
Eulerian. The model verifies that the output is closed and contains every edge
exactly once before it is rendered.

## Local preview

The site has no build step or external dependencies. Serve the repository root
with any static server, for example:

```sh
python3 -m http.server 4173
```

Then open <http://localhost:4173>.

## Tests

Run the graph-model regression suite with:

```sh
npm test
```

## Current visualizations

- construction of the DFS tree, parity-correcting forest, and skeleton tour;
- batching of residual edges and the carry forest between batches;
- circuit release and append-only output order;
- edge-by-edge transfer from the working graph to the completed output graph,
  with the full vertex tour written underneath;
- editable edge lists with parallel edges and loops.
