#include <bits/stdc++.h>
using namespace std;
using Edge = pair<pair<int, int>, int>;

vector<int> parity_forest(int n, const vector<Edge>& edges) {
    vector<vector<pair<int, int>>> graph(n);
    vector<int> parity(n), parent(n, -1), parent_edge(n, -1), next(n), finish, forest;
    vector<char> seen(n);
    for (int id = 0; id < (int)edges.size(); id++) {
        auto [u, v] = edges[id].first;
        if (u == v) continue;
        graph[u].push_back({v, id});
        graph[v].push_back({u, id});
        parity[u] ^= 1;
        parity[v] ^= 1;
    }
    for (int root = 0; root < n; root++) {
        if (seen[root]) continue;
        vector<int> stack = {root};
        seen[root] = 1;
        while (!stack.empty()) {
            int v = stack.back();
            if (next[v] == (int)graph[v].size()) {
                finish.push_back(v);
                stack.pop_back();
                continue;
            }
            auto [u, id] = graph[v][next[v]++];
            if (seen[u]) continue;
            seen[u] = 1;
            parent[u] = v;
            parent_edge[u] = id;
            stack.push_back(u);
        }
    }
    for (int v : finish) {
        if (parent[v] == -1) continue;
        if (parity[v]) forest.push_back(parent_edge[v]);
        parity[parent[v]] ^= parity[v];
    }
    return forest;
}

vector<int> euler(int start, vector<vector<pair<int, int>>>& graph,
                  vector<int>& next, vector<char>& used) {
    vector<int> stack = {start}, entered = {-1}, circuit;
    while (!stack.empty()) {
        int v = stack.back();
        while (next[v] < (int)graph[v].size() && used[graph[v][next[v]].second]) next[v]++;
        if (next[v] == (int)graph[v].size()) {
            if (entered.back() != -1) circuit.push_back(entered.back());
            stack.pop_back();
            entered.pop_back();
            continue;
        }
        auto [u, id] = graph[v][next[v]++];
        if (used[id]) continue;
        used[id] = 1;
        stack.push_back(u);
        entered.push_back(id);
    }
    reverse(circuit.begin(), circuit.end());
    return circuit;
}

int main() {
    int n, m;
    cin >> n >> m;
    vector<vector<int>> graph(n);
    for (int i = 0, u, v; i < m; i++) {
        cin >> u >> v;
        u--, v--;
        graph[u].push_back(v);
        if (u != v) graph[v].push_back(u);
    }
    if (n == 1) {
        cout << 1;
        for (int i = 0; i < (int)graph[0].size(); i++) cout << ' ' << 1;
        cout << '\n';
    } else {
        vector<pair<int, int>> tree;
        vector<char> seen(n);
        vector<int> next(n);
        vector<int> stack = {0};
        seen[0] = 1;
        while (!stack.empty()) {
            int v = stack.back();
            if (next[v] == (int)graph[v].size()) {
                stack.pop_back();
                continue;
            }
            int u = graph[v][next[v]++];
            if (seen[u]) continue;
            seen[u] = 1;
            tree.push_back({v, u});
            stack.push_back(u);
        }
        vector<vector<int>> tree_cut(n);
        vector<int> count(n);
        {
            vector<vector<int>> incident(n);
            for (auto [u, v] : tree) {
                incident[u].push_back(v);
                incident[v].push_back(u);
            }
            for (int v = 0; v < n; v++) {
                for (int u : incident[v]) count[u]++;
                for (int p = 0; p < (int)graph[v].size(); p++) {
                    int u = graph[v][p];
                    if (!count[u]) continue;
                    count[u]--;
                    tree_cut[v].push_back(p);
                }
            }
        }
        vector<int> parity(n), skipped(n), parent(n, -1), finish;
        for (int v = 0; v < n; v++) {
            int cut = 0;
            for (int p = 0; p < (int)graph[v].size(); p++) {
                if (cut < (int)tree_cut[v].size() && tree_cut[v][cut] == p) {
                    cut++;
                    continue;
                }
                if (graph[v][p] != v) parity[v] ^= 1;
            }
        }
        fill(seen.begin(), seen.end(), 0);
        fill(next.begin(), next.end(), 0);
        for (int root = 0; root < n; root++) {
            if (seen[root]) continue;
            stack = {root};
            seen[root] = 1;
            while (!stack.empty()) {
                int v = stack.back();
                if (next[v] == (int)graph[v].size()) {
                    finish.push_back(v);
                    stack.pop_back();
                    continue;
                }
                int p = next[v]++;
                if (skipped[v] < (int)tree_cut[v].size() && tree_cut[v][skipped[v]] == p) {
                    skipped[v]++;
                    continue;
                }
                int u = graph[v][p];
                if (seen[u]) continue;
                seen[u] = 1;
                parent[u] = v;
                stack.push_back(u);
            }
        }
        // The tree plus this parity forest is the sparse skeleton.
        vector<Edge> skeleton;
        for (auto edge : tree) skeleton.push_back({edge, 1});
        for (int v : finish) {
            if (parent[v] == -1) continue;
            if (parity[v]) skeleton.push_back({{parent[v], v}, 1});
            parity[parent[v]] ^= parity[v];
        }
        vector<vector<pair<int, int>>> sparse_graph(n);
        for (int id = 0; id < (int)skeleton.size(); id++) {
            auto [u, v] = skeleton[id].first;
            sparse_graph[u].push_back({v, id});
            sparse_graph[v].push_back({u, id});
        }
        vector<int> at(n);
        vector<char> used(skeleton.size());
        vector<int> skeleton_edges = euler(0, sparse_graph, at, used);
        vector<int> skeleton_tour = {0};
        int current = 0;
        for (int id : skeleton_edges) {
            auto [u, v] = skeleton[id].first;
            current = current == u ? v : u;
            skeleton_tour.push_back(current);
        }
        vector<int> rank(n, -1), order, first;
        for (int p = 0; p + 1 < (int)skeleton_tour.size(); p++) {
            int v = skeleton_tour[p];
            if (rank[v] != -1) continue;
            rank[v] = order.size();
            order.push_back(v);
            first.push_back(p);
        }
        vector<vector<int>> removed(n);
        {
            vector<vector<int>> incident(n);
            for (auto edge : skeleton) {
                auto [u, v] = edge.first;
                incident[u].push_back(v);
                if (u != v) incident[v].push_back(u);
            }
            for (int v = 0; v < n; v++) {
                for (int u : incident[v]) count[u]++;
                for (int p = 0; p < (int)graph[v].size(); p++) {
                    int u = graph[v][p];
                    if (!count[u]) continue;
                    count[u]--;
                    removed[v].push_back(p);
                }
            }
        }
        // Keep only one forest between batches and stream every completed circuit.
        vector<Edge> carry;
        cout << order[0] + 1;
        for (int left = 0; left < n;) {
            int right = left - 1, distinct = 0;
            vector<Edge> edges = carry;
            while (right + 1 < n && distinct < n) {
                int v = order[++right], cut = 0;
                for (int p = 0; p < (int)graph[v].size(); p++) {
                    if (cut < (int)removed[v].size() && removed[v][cut] == p) {
                        cut++;
                        continue;
                    }
                    int u = graph[v][p];
                    if (rank[u] >= right) count[u]++;
                }
                cut = 0;
                for (int p = 0; p < (int)graph[v].size(); p++) {
                    if (cut < (int)removed[v].size() && removed[v][cut] == p) {
                        cut++;
                        continue;
                    }
                    int u = graph[v][p], copies = count[u];
                    if (rank[u] < right || !copies) continue;
                    count[u] = 0;
                    distinct++;
                    if (copies & 1) edges.push_back({{v, u}, copies});
                    else {
                        edges.push_back({{v, u}, 1});
                        edges.push_back({{v, u}, copies - 1});
                    }
                }
            }
            vector<int> forest = parity_forest(n, edges);
            vector<char> kept(edges.size());
            for (int id : forest) kept[id] = 1;
            vector<vector<pair<int, int>>> batch_graph(n);
            for (int id = 0; id < (int)edges.size(); id++) {
                if (kept[id]) continue;
                auto [u, v] = edges[id].first;
                batch_graph[u].push_back({v, id});
                if (u != v) batch_graph[v].push_back({u, id});
            }
            at.assign(n, 0);
            used.assign(edges.size(), 0);
            for (int k = left; k <= right; k++) {
                int root = order[k];
                while (true) {
                    while (at[root] < (int)batch_graph[root].size() && used[batch_graph[root][at[root]].second]) at[root]++;
                    if (at[root] == (int)batch_graph[root].size()) break;
                    vector<int> circuit = euler(root, batch_graph, at, used);
                    current = root;
                    for (int id : circuit) {
                        auto [u, v] = edges[id].first;
                        for (int copies = edges[id].second; copies; copies--) {
                            if (u != v) current = current == u ? v : u;
                            cout << ' ' << current + 1;
                        }
                    }
                }
                int end = k + 1 < n ? first[k + 1] : (int)skeleton_tour.size() - 1;
                for (int p = first[k] + 1; p <= end; p++) cout << ' ' << skeleton_tour[p] + 1;
            }
            carry.clear();
            for (int id : forest) carry.push_back(edges[id]);
            left = right + 1;
        }
        cout << '\n';
    }
}
