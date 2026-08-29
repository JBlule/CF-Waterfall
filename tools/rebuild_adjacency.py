"""Rebuild cascade_graph.json's adjacency matrix from its edge list.

The matrix is redundant with `edges` and must never disagree with it, so it
is derived rather than hand-maintained. Sub-compartment nodes and the
`priority` edges between them are excluded: the matrix describes the
compartment-level graph, which is what `adjacency.order` lists.
"""
import json, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
P = os.path.join(ROOT, "cascade_graph.json")

with open(P, encoding="utf-8") as fh:
    g = json.load(fh)

order = g["adjacency"]["order"]
idx = {n: i for i, n in enumerate(order)}
n = len(order)

m = [[0] * n for _ in range(n)]
skipped = []
for e in g["edges"]:
    if e["type"] == "priority":
        continue
    if e["from"] not in idx or e["to"] not in idx:
        skipped.append("%s->%s" % (e["from"], e["to"]))
        continue
    m[idx[e["from"]]][idx[e["to"]]] = 1

old = g["adjacency"]["matrix"]
diff = [(order[i], order[j]) for i in range(n) for j in range(n)
        if old[i][j] != m[i][j]]

g["adjacency"]["matrix"] = m
with open(P, "w", encoding="utf-8", newline="\n") as fh:
    json.dump(g, fh, indent=1, ensure_ascii=False)
    fh.write("\n")

print("nodes: %d, edges: %d" % (n, len(g["edges"])))
print("edges skipped (not compartment-level): %s" % (skipped or "none"))
print("matrix cells changed: %d" % len(diff))
for a, b in diff:
    print("   %-12s -> %-12s" % (a, b))
