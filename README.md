# Space-Efficient Hierholzer for Undirected Graphs

A compact C++ implementation and interactive visualization of the algorithm
from [our paper](https://arxiv.org/abs/2608.19081).

**[Read the paper](https://arxiv.org/abs/2608.19081) · [View the C++ code](cpp/hierholzer.cpp)**

The algorithm outputs an Eulerian tour of a connected undirected multigraph in
`O(m)` time using `O(n)` words of working memory. Parallel edges and loops are
supported. After input, the adjacency lists are never modified, and the tour is
written directly to `cout`.

## C++ implementation

Compile [cpp/hierholzer.cpp](cpp/hierholzer.cpp) with C++17:

```sh
g++ -std=c++17 -O2 cpp/hierholzer.cpp -o hierholzer
```

Input is `n m`, followed by `m` undirected edges with 1-indexed vertices. The
graph is assumed to be connected and Eulerian.

```text
3 3
1 2
2 3
3 1
```

The output is the vertex sequence of an Eulerian tour:

```text
1 2 3 1
```

The implementation follows the paper directly:

1. Build a spanning Eulerian skeleton with fewer than `2n` edges.
2. Process the remaining edges in `O(n)`-sized batches.
3. Keep only a parity-correcting forest between batches.
4. Stream completed circuits into the skeleton tour.

## Interactive visualization

The browser visualization animates the skeleton, residual batches, carry
forest, and streamed tour. It has no build step:

```sh
python3 -m http.server 4173
```

Open <http://localhost:4173>, or run its regression suite with:

```sh
npm test
```
