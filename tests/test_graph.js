/* =====================================================================
 * test_graph.js -- consistency between cascade_graph.json and the engine.
 *
 * The topology (step c) will be built from the graph file, so the graph's
 * promises are checked here, while there is still no UI to hide a mismatch:
 * every row a node claims must actually exist in the engine's grid, the
 * graph must be acyclic within a period, and the DEBT sub-compartment
 * ordering the brief requires must be the one the graph declares.
 * ===================================================================== */

function runGraphTests() {
  var G = CASCADE_GRAPH;
  var run = WF.runAll({});
  var grid = run.grid;
  var i, j, n, e;

  T.suite("cascade_graph.json -- structure");
  T.isTrue("nodes present", G.nodes && G.nodes.length > 0);
  T.isTrue("edges present", G.edges && G.edges.length > 0);
  T.eq("17 nodes in the adjacency order", G.adjacency.order.length, 17);
  T.eq("adjacency matrix is square", G.adjacency.matrix.length,
    G.adjacency.order.length);
  var square = 1;
  for (i = 0; i < G.adjacency.matrix.length; i++) {
    if (G.adjacency.matrix[i].length !== G.adjacency.order.length) { square = 0; }
  }
  T.eq("every matrix row has the right width", square, 1);

  /* ---------------------------------------------------------------- */
  T.suite("cascade_graph.json -- node rows exist in the engine grid");
  /* Each node names the Feuil1 rows it represents. If the engine does not
   * produce one of them, the tank would have nothing to show. */
  var missing = [], nodeRows, k, r;
  for (i = 0; i < G.nodes.length; i++) {
    n = G.nodes[i];
    nodeRows = parseRows(n.rows);
    for (k = 0; k < nodeRows.length; k++) {
      r = nodeRows[k];
      if (grid[r] === undefined) { missing.push(n.id + " -> row " + r); }
    }
  }
  T.eq("every row claimed by a node is produced by the engine",
    missing.length + (missing.length ? " missing: " + missing.join(", ") : ""),
    0 + "");

  /* ---------------------------------------------------------------- */
  T.suite("cascade_graph.json -- edges");
  var KNOWN_TYPES = { cash: 1, draw: 1, fund: 1, release: 1, carry: 1,
                      test: 1, priority: 1 };
  var nodeIds = {}, badType = [], badRef = [];
  for (i = 0; i < G.nodes.length; i++) { nodeIds[G.nodes[i].id] = 1; }
  for (i = 0; i < G.edges.length; i++) {
    e = G.edges[i];
    if (!KNOWN_TYPES[e.type]) { badType.push(e.from + "->" + e.to + ":" + e.type); }
    if (!nodeIds[e.from]) { badRef.push("unknown from: " + e.from); }
    if (!nodeIds[e.to]) { badRef.push("unknown to: " + e.to); }
  }
  T.eq("every edge type is one the renderer will handle",
    badType.length ? badType.join(",") : "0", "0");
  T.eq("every edge references a declared node",
    badRef.length ? badRef.join(",") : "0", "0");

  /* The brief requires draw and release pipes to look different, so both
   * must actually exist in the graph. */
  var haveDraw = 0, haveRelease = 0, haveFund = 0, havePriority = 0;
  for (i = 0; i < G.edges.length; i++) {
    if (G.edges[i].type === "draw") { haveDraw++; }
    if (G.edges[i].type === "release") { haveRelease++; }
    if (G.edges[i].type === "fund") { haveFund++; }
    if (G.edges[i].type === "priority") { havePriority++; }
  }
  T.eq("two draw pipes (MRA->HM, DSRA->debt)", haveDraw, 2);
  T.eq("two release pipes (MRA and DSRA surplus to equity)", haveRelease, 2);
  T.isTrue("fund pipes exist", haveFund >= 2);
  T.isTrue("priority pipes inside the debt node exist", havePriority >= 2);

  /* ---------------------------------------------------------------- */
  T.suite("cascade_graph.json -- DEBT compound node");
  /* The brief makes the three ordered sub-compartments non-negotiable. */
  var debtNode = findNode(G, "DEBT");
  T.isTrue("DEBT exists and is compound",
    debtNode && debtNode.kind === "compound");
  var def = findNode(G, "DEBT_DEF"), int_ = findNode(G, "DEBT_INT"),
      prin = findNode(G, "DEBT_PRIN");
  T.isTrue("deferred interest sub-compartment exists",
    def && def.kind === "subcompartment");
  T.isTrue("interest sub-compartment exists",
    int_ && int_.kind === "subcompartment");
  T.isTrue("principal sub-compartment exists",
    prin && prin.kind === "subcompartment");
  /* the priority edges must run deferred -> interest -> principal */
  T.isTrue("priority runs deferred -> interest",
    hasEdge(G, "DEBT_DEF", "DEBT_INT", "priority"));
  T.isTrue("priority runs interest -> principal",
    hasEdge(G, "DEBT_INT", "DEBT_PRIN", "priority"));
  T.isTrue("no edge short-circuits deferred straight to principal",
    !hasEdge(G, "DEBT_DEF", "DEBT_PRIN", "priority"));

  /* ---------------------------------------------------------------- */
  T.suite("cascade_graph.json -- reservoirs hold a level between periods");
  var reservoirs = [], expectReservoir = { MRA: 1, DSRA: 1,
    TREAS_BOP: 1, TREAS_EOP: 1 };
  for (i = 0; i < G.nodes.length; i++) {
    if (G.nodes[i].kind === "reservoir") { reservoirs.push(G.nodes[i].id); }
  }
  var allFound = 1, key;
  for (key in expectReservoir) {
    if (!expectReservoir.hasOwnProperty(key)) { continue; }
    var f = 0;
    for (i = 0; i < reservoirs.length; i++) {
      if (reservoirs[i] === key) { f = 1; }
    }
    if (!f) { allFound = 0; }
  }
  T.eq("MRA, DSRA and both treasury nodes are reservoirs", allFound, 1);

  /* And the engine must actually carry a level in them: with the base case,
   * at least one period must show a non-zero balance in each, or the tanks
   * would render permanently empty. */
  var mraSeen = 0, dsraSeen = 0, treasSeen = 0;
  for (i = 0; i < run.periods.length; i++) {
    if (run.periods[i].mra.eop > 0.5) { mraSeen = 1; }
    if (run.periods[i].dsra.eop > 0.5) { dsraSeen = 1; }
    if (Math.abs(run.periods[i].distribution.treasuryEoP) > 0.5) { treasSeen = 1; }
  }
  T.eq("the MRA holds a level in the base case", mraSeen, 1);
  T.eq("the DSRA holds a level in the base case", dsraSeen, 1);
  T.eq("treasury holds a level in the base case", treasSeen, 1);

  /* ---------------------------------------------------------------- */
  T.suite("cascade_graph.json -- acyclic once reservoirs are role-split");
  /* The engine is a single forward pass with no fixed-point iteration, so
   * the computation must be acyclic. The RAW node graph is NOT: it contains
   *   MRA -> HM_PAY -> CASH_AHM -> DEBT -> CASH_RES -> MRA_RECH -> MRA
   *   DSRA -> DEBT -> CASH_RES -> DSRA_RECH -> DSRA
   * because the graph collapses each reservoir's two roles into one node: it
   * is READ at BoP (to fund a draw) and WRITTEN at EoP (recharge/release).
   *
   * The invariant the engine actually depends on is that splitting each
   * reservoir into BoP (source) and EoP (sink) makes the period a DAG. That
   * is asserted here. The raw cycles are asserted too, so this test records
   * the real structure of the file rather than papering over it. */
  var order = G.adjacency.order, m = G.adjacency.matrix;
  var iTreasEoP = indexOfId(order, "TREAS_EOP"),
      iTreasBoP = indexOfId(order, "TREAS_BOP");

  /* --- first, prove the raw cycles are really there --------------- */
  T.isTrue("raw graph: MRA -> HM_PAY edge exists (the read role)",
    hasEdge(G, "MRA", "HM_PAY", "draw"));
  T.isTrue("raw graph: MRA_RECH -> MRA edge exists (the write role)",
    hasEdge(G, "MRA_RECH", "MRA", "fund"));
  T.isTrue("raw graph: DSRA -> DEBT edge exists (the read role)",
    hasEdge(G, "DSRA", "DEBT", "draw"));
  T.isTrue("raw graph: DSRA_RECH -> DSRA edge exists (the write role)",
    hasEdge(G, "DSRA_RECH", "DSRA", "fund"));
  T.eq("raw graph therefore has cycles, as expected",
    countReachableFrom(order, m, "MRA", "MRA") > 0 ? 1 : 0, 1);

  /* --- now the invariant that matters ----------------------------- */
  /* Split MRA and DSRA: edges LEAVING the reservoir come from its BoP role,
   * edges ENTERING it go to its EoP role. Drop the inter-period treasury
   * carry, which is by definition a back-edge across periods. */
  var SPLIT = { MRA: 1, DSRA: 1 };
  var nodesS = [], idxS = {}, k2;
  for (i = 0; i < order.length; i++) {
    if (SPLIT[order[i]]) {
      idxS[order[i] + "#bop"] = nodesS.length; nodesS.push(order[i] + "#bop");
      idxS[order[i] + "#eop"] = nodesS.length; nodesS.push(order[i] + "#eop");
    } else {
      idxS[order[i]] = nodesS.length; nodesS.push(order[i]);
    }
  }
  function srcOf(id) { return SPLIT[id] ? idxS[id + "#bop"] : idxS[id]; }
  function dstOf(id) { return SPLIT[id] ? idxS[id + "#eop"] : idxS[id]; }

  var adjS = [];
  for (i = 0; i < nodesS.length; i++) { adjS.push([]); }
  for (i = 0; i < order.length; i++) {
    for (j = 0; j < order.length; j++) {
      if (m[i][j] !== 1) { continue; }
      if (i === iTreasEoP && j === iTreasBoP) { continue; } /* period carry */
      adjS[srcOf(order[i])].push(dstOf(order[j]));
    }
  }

  /* Kahn's algorithm. Bounded: each node dequeued at most once, each edge
   * relaxed at most once. No convergence loop anywhere. */
  var indeg = [], queue = [], seen = 0;
  for (i = 0; i < nodesS.length; i++) { indeg.push(0); }
  for (i = 0; i < nodesS.length; i++) {
    for (j = 0; j < adjS[i].length; j++) { indeg[adjS[i][j]]++; }
  }
  for (i = 0; i < nodesS.length; i++) { if (indeg[i] === 0) { queue.push(i); } }
  while (queue.length > 0) {
    var cur = queue.shift();
    seen++;
    for (j = 0; j < adjS[cur].length; j++) {
      indeg[adjS[cur][j]]--;
      if (indeg[adjS[cur][j]] === 0) { queue.push(adjS[cur][j]); }
    }
  }
  T.eq("role-split intra-period graph IS a DAG (every node ordered)",
    seen, nodesS.length);
  T.isTrue("the only inter-period back-edge is the treasury carry",
    m[iTreasEoP][iTreasBoP] === 1);
  /* And the engine's own inter-period memory is exactly those balances. */
  var st = run.periods[0].next, stKeys = 0, sk;
  for (sk in st) { if (st.hasOwnProperty(sk)) { stKeys++; } }
  T.eq("the engine carries exactly 5 balances between periods", stKeys, 5);

  /* ---------------------------------------------------------------- */
  T.suite("cascade_graph.json -- evaluation order matches the engine");
  T.eq("the graph declares 13 evaluation steps",
    G.meta.evaluation_order.length, 13);
  /* The engine collapses those 13 graph steps into 6 user-facing stages;
   * the brief's step list in section 5 has exactly 6. */
  T.eq("the engine exposes the brief's 6 step-through stages",
    WF.STAGES.length, 6);
  /* Order sanity: HM must be evaluated before debt in both. */
  var eo = G.meta.evaluation_order;
  T.isTrue("graph evaluates HM payment before debt service",
    posContaining(eo, "HM_PAY") < posContaining(eo, "DEBT"));
  T.isTrue("graph evaluates debt service before reserve recharges",
    posContaining(eo, "DEBT") < posContaining(eo, "MRA_RECH"));
  T.isTrue("graph recharges the MRA before the DSRA",
    posContaining(eo, "MRA_RECH") < posContaining(eo, "DSRA_RECH"));
  T.isTrue("graph applies lock-up before distribution",
    posContaining(eo, "LOCKUP") < posContaining(eo, "DISTRIB"));
  var stageIds = [];
  for (i = 0; i < WF.STAGES.length; i++) { stageIds.push(WF.STAGES[i].id); }
  T.eq("engine stage order is carry,hm,debt,resid,reserve,distrib",
    stageIds.join(","), "carry,hm,debt,resid,reserve,distrib");

  /* ---------------------------------------------------------------- */
  T.suite("cascade_graph.json -- parameter references");
  /* The assumptions panel highlights sliders when a tank is clicked, so
   * every parameter a node names must be a real engine parameter. */
  var known = {}, unknown = [];
  for (i = 0; i < WF.PARAM_NAMES.length; i++) { known[WF.PARAM_NAMES[i]] = 1; }
  for (i = 0; i < G.nodes.length; i++) {
    n = G.nodes[i];
    if (!n.params) { continue; }
    for (j = 0; j < n.params.length; j++) {
      if (!known[n.params[j]]) { unknown.push(n.id + ":" + n.params[j]); }
    }
  }
  T.eq("every parameter named by a node is a real engine parameter",
    unknown.length ? unknown.join(",") : "0", "0");

  /* Every node must carry doc text -- the glossary layer is seeded from it. */
  var noDoc = [];
  for (i = 0; i < G.nodes.length; i++) {
    if (!G.nodes[i].doc || G.nodes[i].doc.length < 10) {
      noDoc.push(G.nodes[i].id);
    }
  }
  T.eq("every node has glossary seed text",
    noDoc.length ? noDoc.join(",") : "0", "0");
  var noFlow = [];
  for (i = 0; i < G.edges.length; i++) {
    if (!G.edges[i].flow) { noFlow.push(G.edges[i].from + "->" + G.edges[i].to); }
  }
  T.eq("every edge has a flow label for its click-through",
    noFlow.length ? noFlow.join(",") : "0", "0");
}

/* "Feuil1!116,117" / "Feuil1!79-91" / "Feuil1!27" -> [116,117] / [79..91] */
function parseRows(spec) {
  var out = [], i, part, parts, a, b, k;
  if (!spec) { return out; }
  spec = String(spec).replace(/^[^!]*!/, "");
  parts = spec.split(",");
  for (i = 0; i < parts.length; i++) {
    part = parts[i];
    if (part.indexOf("-") >= 0) {
      a = Number(part.split("-")[0]);
      b = Number(part.split("-")[1]);
      /* A range in the graph is a section heading, not a promise that every
       * row inside it exists (Feuil1 has blank spacer rows). Take the
       * endpoints only. */
      out.push(a);
      out.push(b);
    } else {
      k = Number(part);
      if (!isNaN(k)) { out.push(k); }
    }
  }
  return out;
}

function findNode(G, id) {
  var i;
  for (i = 0; i < G.nodes.length; i++) {
    if (G.nodes[i].id === id) { return G.nodes[i]; }
  }
  return null;
}

function hasEdge(G, from, to, type) {
  var i, e;
  for (i = 0; i < G.edges.length; i++) {
    e = G.edges[i];
    if (e.from === from && e.to === to && (!type || e.type === type)) {
      return true;
    }
  }
  return false;
}

/* Breadth-first walk: how many paths of length >= 1 lead from `from` back to
 * `to`. Used only to demonstrate the reservoir cycles exist. Bounded by a
 * visited set, so it terminates even on a cyclic graph. */
function countReachableFrom(order, m, from, to) {
  var start = indexOfId(order, from), goal = indexOfId(order, to);
  var visited = {}, queue = [start], found = 0, cur, j, steps = 0;
  var MAX_STEPS = order.length * order.length + 1; /* hard bound */
  while (queue.length > 0 && steps < MAX_STEPS) {
    steps++;
    cur = queue.shift();
    for (j = 0; j < order.length; j++) {
      if (m[cur][j] !== 1) { continue; }
      if (j === goal) { found++; }
      if (!visited[j]) { visited[j] = 1; queue.push(j); }
    }
  }
  return found;
}

function indexOfId(arr, id) {
  var i;
  for (i = 0; i < arr.length; i++) { if (arr[i] === id) { return i; } }
  return -1;
}

/* evaluation_order entries are descriptive strings like
 * "CURCASH(Toll-OPEX+TreasBoP)", so match on containment. */
function posContaining(arr, needle) {
  var i;
  for (i = 0; i < arr.length; i++) {
    if (String(arr[i]).indexOf(needle) >= 0) { return i; }
  }
  return -1;
}
