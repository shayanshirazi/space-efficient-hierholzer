export const DEFAULT_PRESET_ID = "looped-hexagon";

export const GRAPH_PRESETS = Object.freeze({
  "looped-hexagon": {
    name: "Looped hexagon",
    edges: `# skeleton cycle
1 2
2 3
3 4
4 5
5 6
6 1
# second cycle
1 3
3 5
5 2
2 6
6 4
4 1
# one loop at each vertex
1 1
2 2
3 3
4 4
5 5
6 6`,
  },
  paper: {
    name: "Paper multigraph",
    edges: `# u v copies
1 2 2
2 3 3
3 4 3
4 1 2
1 3 2
2 4 3`,
  },
  "parallel-triangle": {
    name: "Parallel triangle",
    edges: `1 2 2
2 3 2
3 1 2`,
  },
  "joined-cycles": {
    name: "Two joined cycles",
    edges: `1 2
2 3
3 1
1 4
4 5
5 1`,
  },
  "looped-square": {
    name: "Looped square",
    edges: `1 2
2 3
3 4
4 1
1 1
3 3`,
  },
  "three-petals": {
    name: "Three petals",
    edges: `1 2
2 3
3 1
1 4
4 5
5 1
1 6
6 7
7 1`,
  },
});
