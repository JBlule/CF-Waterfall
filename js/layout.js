/* =====================================================================
 * layout.js -- where each compartment sits, and what it holds.
 *
 * The TOPOLOGY (which tanks exist, which pipes join them, each pipe's type,
 * each node's doc text and Excel rows) is read from cascade_graph.json.
 * The only thing that file cannot provide is geometry, so the coordinates
 * below are keyed by the graph's own node ids. app.js asserts the two agree
 * in both directions: a graph node with no box, or a box with no graph node,
 * is surfaced as an error rather than silently dropped.
 * ===================================================================== */

const CANVAS = { w: 900, h: 1360 };

/* Box geometry per graph node id. */
const BOXES = {
  /* --- sources, across the top ---------------------------------- */
  /* Squared onto the spine: same x, width and height as CURCASH below it,
   * top-aligned with the other top-row box. That matters for more than
   * tidiness -- off to the left, the router took the toll pipe into the LEFT
   * edge of the cash box, the very anchor the operating-costs pipe leaves
   * from, and the two arrowheads landed on each other. Directly above, the
   * pipe drops straight down into the rim: revenue over the top, costs out
   * the side. Move this box off the spine and that collision comes back. */
  TOLL:       { x: 180, y:  30, w: 280, h:  80, kind: "source" },
  TREAS_BOP:  { x: 640, y:  30, w: 200, h:  76, kind: "reservoir" },

  /* --- the spine ------------------------------------------------ */
  CURCASH:    { x: 180, y: 140, w: 280, h:  80, kind: "flow" },
  HM_PAY:     { x: 180, y: 250, w: 280, h:  80, kind: "flow" },

  /* --- consumed outflows, parked left of the stage that pays them -
   * Cash flows INTO these and stops: it is spent and never rejoins the
   * waterfall. Each is vertically centred on its paying stage so the pipe
   * runs dead level, which leaves the clearest gap for the amount.       */
  OPEX:       { x:  20, y: 150, w: 124, h:  60, kind: "spent" },
  HM:         { x:  20, y: 262, w: 124, h:  56, kind: "spent" },
  CASH_AHM:   { x: 180, y: 360, w: 280, h:  80, kind: "flow" },
  /* Tall enough that the third sub-compartment clears the box's own
   * "outstanding ..." footer line. The buckets end at y=716; the footer
   * text sits at y=753. */
  DEBT:       { x: 150, y: 470, w: 340, h: 292, kind: "compound" },
  CASH_RES:   { x: 180, y: 800, w: 280, h:  80, kind: "flow" },
  CASH_EQ:    { x: 180, y: 990, w: 280, h:  80, kind: "flow" },
  /* Taller than a plain tank: it carries a label, a verdict, a ratio line
   * AND a row of four lamps, which need separate bands. */
  LOCKUP:     { x: 180, y: 1100, w: 280, h: 104, kind: "gate" },
  DISTRIB:    { x:  40, y: 1238, w: 200, h:  76, kind: "sink" },
  TREAS_EOP:  { x: 640, y: 1238, w: 200, h:  76, kind: "reservoir" },

  /* --- reservoirs and their recharges, right-hand column -------- */
  MRA:        { x: 640, y: 232, w: 200, h: 116, kind: "reservoir" },
  DSRA:       { x: 640, y: 520, w: 200, h: 116, kind: "reservoir" },
  MRA_RECH:   { x: 512, y: 828, w: 138, h:  52, kind: "flow" },
  DSRA_RECH:  { x: 512, y: 896, w: 138, h:  52, kind: "flow" }
};

/* The three debt sub-compartments, in priority order. Laid out inside the
 * DEBT box; the brief makes this ordering non-negotiable. */
const DEBT_SUBS = [
  { id: "DEBT_DEF",  y: 512, label: "1. Deferred interest" },
  { id: "DEBT_INT",  y: 582, label: "2. Interest" },
  { id: "DEBT_PRIN", y: 652, label: "3. Principal" }
];
const DEBT_SUB_GEOM = { x: 162, w: 316, h: 64 };

/* Edges that the generic router cannot draw sensibly, because they flow
 * UPWARDS: cash recharging a reservoir drawn higher up the page, and the
 * inter-period treasury carry. Routed around the right margin. */
const EDGE_ROUTES = {
  "MRA_RECH->MRA":      { style: "rightMargin", lane: 872 },
  "DSRA_RECH->DSRA":    { style: "rightMargin", lane: 890 },
  "TREAS_EOP->TREAS_BOP": { style: "rightMargin", lane: 878 },

  /* The two outputs of the gate. Drawn as a fork -- straight down out of
   * the gate, then across, then down into the target -- so the split reads
   * as a switch throwing cash one way or the other. The generic router sent
   * these sideways, straight underneath the neighbouring compartments,
   * which is what made the flow impossible to follow. */
  "LOCKUP->DISTRIB":   { style: "fork" },
  "LOCKUP->TREAS_EOP": { style: "fork" }
};

/* ------------------------------------------------------------------
 * Two edges are DRAWN the other way round from the way the graph declares
 * them. cascade_graph.json is an input file and is never edited; it models
 * OPEX and heavy maintenance the way a spreadsheet does, as negative
 * inflows into the stage (`-OPEX`, `HM due`).
 *
 * On a hydraulic diagram a negative inflow is meaningless -- water does not
 * run backwards up a pipe -- so the cascade instead shows cash LEAVING the
 * stage that settles the bill and coming to rest in a spent compartment.
 * Same arithmetic, opposite arrow: the stage keeps what survives, and the
 * euros in OPEX and Heavy maintenance are visibly out of the waterfall.
 * ---------------------------------------------------------------- */
const REVERSED_EDGES = new Set(["OPEX->CURCASH", "HM->HM_PAY"]);

/* The graph also carries CURCASH->CASH_AHM ("remaining"), a direct bypass
 * of the maintenance stage. That was coherent while only the HM payment
 * itself passed through HM_PAY. Now that the whole balance flows through
 * the stage, the bypass is a second parallel path carrying the very same
 * euros, and the cascade would count them twice. Not drawn.
 *
 * It is still a real edge in the graph, so test_graph.js is unaffected. */
const HIDDEN_EDGES = new Set(["CURCASH->CASH_AHM"]);

/* ------------------------------------------------------------------
 * What each compartment holds in a given period.
 *
 * `value`    the euro figure shown and used for the liquid level
 * `capacity` the denominator for the level, recomputed per run so a tank
 *            reads consistently across all 31 periods
 * `target`   optional reference line (reserve targets)
 * ---------------------------------------------------------------- */

/* value accessor per node: (period, run) -> number */
const NODE_VALUE = {
  TOLL:      (p, r) => r.pre.toll.nominal[p.period - 1],
  OPEX:      (p, r) => r.pre.opex.nominal[p.period - 1],
  HM:        (p) => p.hm.hmDue,
  TREAS_BOP: (p) => p.treasuryBoP,
  CURCASH:   (p) => p.currentCash,
  /* The whole balance now passes THROUGH this stage: it takes in the cash
   * in hand plus any MRA draw, pays the maintenance charge out to the left,
   * and holds what survives. (It used to hold the charge that was paid,
   * which left the stage receiving 150k and emitting 2.85M.) */
  HM_PAY:    (p) => p.hm.cashAfterHm,
  CASH_AHM:  (p) => p.cashAvailForDebt,   /* cash after HM + both reserve releases */
  DEBT:      (p) => p.debt.debtService,
  MRA:       (p) => p.mra.eop,
  DSRA:      (p) => p.dsra.eop,
  CASH_RES:  (p) => p.cashForReserves,
  MRA_RECH:  (p) => p.mra.recharge,
  DSRA_RECH: (p) => p.dsra.recharge,
  CASH_EQ:   (p) => p.cashEq,
  LOCKUP:    (p) => p.tests.allowed,
  DISTRIB:   (p) => p.distribution.distribution,
  TREAS_EOP: (p) => p.distribution.treasuryEoP
};

/* Reserve targets, drawn as a dashed reference line on the tank. */
const NODE_TARGET = {
  MRA:  (p) => p.mraTarget,
  DSRA: (p) => p.dsraTarget
};

/* The debt sub-compartments are "buckets that must fill in order": the
 * level is what was PAID against what was DUE. Deferred fills before
 * interest, interest before principal -- the core teaching goal, made
 * visible as three buckets filling in sequence. A bucket that is due
 * something and not full is a shortfall. */
const SUB_VALUE = {
  DEBT_DEF:  (p) => ({ paid: p.debt.deferredPaid,  due: p.debt.deferredBoP }),
  DEBT_INT:  (p) => ({ paid: p.debt.interestPaid,  due: p.debt.interestAccrued }),
  DEBT_PRIN: (p) => ({ paid: p.debt.principalPaid, due: p.debt.principalTarget })
};

/* Two compartments BORROW their scale instead of using their own.
 *
 * Every other tank is scaled to its own 31-period maximum, which keeps its
 * movement from period to period as legible as it can be. That rule reads
 * badly for the spent compartments, because each one's own range is narrow:
 * operating costs at €750k and the cash box at €3.00M were both drawn 64%
 * full, so the eye saw OPEX swallowing the whole period's cash when it takes
 * barely a sixth of it.
 *
 * Scaled against the stage that pays them, the level reads as the BITE the
 * obligation takes out of the cash reaching it -- small, and growing slowly,
 * since operating costs are indexed while the debt service is not. A charge
 * larger than everything available simply fills the tank, which is the
 * honest reading of a maintenance peak that cannot be funded. */
const CAPACITY_SHARED_WITH = {
  OPEX: "CURCASH",
  HM:   "HM_PAY"
};

/* Scale every tank off the largest absolute figure it ever holds, so levels
 * are comparable across periods instead of rescaling every step. */
function computeCapacities(run) {
  const cap = {};
  for (const id in NODE_VALUE) {
    let m = 0;
    for (const p of run.periods) {
      const v = Math.abs(NODE_VALUE[id](p, run));
      if (isFinite(v) && v > m) { m = v; }
      const t = NODE_TARGET[id] ? Math.abs(NODE_TARGET[id](p)) : 0;
      if (isFinite(t) && t > m) { m = t; }
    }
    cap[id] = m > 0 ? m : 1;
  }
  /* applied afterwards, once every own-maximum is known. The guard leaves a
   * borrower on its own scale if the payer never holds anything. */
  for (const id in CAPACITY_SHARED_WITH) {
    const src = CAPACITY_SHARED_WITH[id];
    if (cap[src] > 0) { cap[id] = cap[src]; }
  }
  return cap;
}

/* ------------------------------------------------------------------
 * Step-through staging.
 *
 * Which of the six waterfall stages each compartment belongs to. Index
 * matches WF.STAGES: 0 carry, 1 HM, 2 debt, 3 residual, 4 reserves,
 * 5 lock-up/distribution.
 * ---------------------------------------------------------------- */
const NODE_STAGE = {
  TOLL: 0, OPEX: 0, TREAS_BOP: 0, CURCASH: 0,
  HM: 1, HM_PAY: 1, CASH_AHM: 1, MRA: 1,   /* MRA is first touched by the HM draw */
  DEBT: 2, DEBT_DEF: 2, DEBT_INT: 2, DEBT_PRIN: 2, DSRA: 2,
  CASH_RES: 3,
  MRA_RECH: 4, DSRA_RECH: 4, CASH_EQ: 4,
  LOCKUP: 5, DISTRIB: 5, TREAS_EOP: 5
};

/* Pipes normally belong to the stage of the node they feed. These three
 * would otherwise be mis-staged: two are recharges flowing back UP into a
 * reservoir that was already touched earlier, and one is the period carry. */
const EDGE_STAGE = {
  "MRA_RECH->MRA": 4,
  "DSRA_RECH->DSRA": 4,
  "TREAS_EOP->TREAS_BOP": 5
};

function edgeStage(edge) {
  const k = edge.from + "->" + edge.to;
  if (k in EDGE_STAGE) { return EDGE_STAGE[k]; }
  const s = NODE_STAGE[edge.to];
  return s === undefined ? 0 : s;
}

/* The level a compartment shows PART-WAY through a period.
 *
 * `stage` null means "the finished period" (Run mode and period navigation).
 * Otherwise a compartment that this stage has not reached yet reads empty,
 * and the two reserves show their genuine intermediate balances: the MRA
 * drops when it pays heavy maintenance and only refills at the recharge
 * stage; the DSRA does the same for debt. Watching that happen is the whole
 * point of stepping through.
 */
function stagedValue(id, p, run, stage) {
  if (stage === null || stage === undefined) {
    return NODE_VALUE[id] ? NODE_VALUE[id](p, run) : 0;
  }
  if (id === "MRA") {
    if (stage < 1) { return p.mraBoP; }
    /* at the HM stage the MRA is both drawn for HM and releases its surplus */
    if (stage < 4) { return Math.max(0, p.mraBoP - p.hm.hmFromMra - p.mra.release); }
    return p.mra.eop;
  }
  if (id === "DSRA") {
    if (stage < 1) { return p.dsraBoP; }
    /* the surplus release feeds cash-after-HM at the HM stage; the draw for
     * debt comes later, at the debt stage (the two never coincide) */
    if (stage < 2) { return Math.max(0, p.dsraBoP - p.dsra.release); }
    if (stage < 4) {
      return Math.max(0, p.dsraBoP - p.dsra.release - p.debt.dsraDraw);
    }
    return p.dsra.eop;
  }
  /* the opening treasury is there from the start of the period */
  if (id === "TREAS_BOP") { return p.treasuryBoP; }

  const st = NODE_STAGE[id];
  if (st !== undefined && stage < st) { return 0; }
  return NODE_VALUE[id] ? NODE_VALUE[id](p, run) : 0;
}

/* Same idea for the three debt buckets: nothing is served until the debt
 * stage is reached. */
function stagedSub(id, p, stage) {
  if (stage !== null && stage !== undefined && stage < NODE_STAGE[id]) {
    return { paid: 0, due: SUB_VALUE[id](p).due };
  }
  return SUB_VALUE[id](p);
}

/* Extra per-node signals the renderer badges. */
function nodeSignals(id, p, run) {
  const out = [];
  if (id === "HM_PAY" && p.hm.hmSignal) { out.push(p.hm.hmSignal); }
  if (id === "DEBT" && p.debtSignal) { out.push(p.debtSignal); }
  /* No badge on the gate: its verdict line already reads PASS or BLOCKED in
   * red, and a badge on top of a box that also holds a ratio line and four
   * lamps just collides with them. */
  if (id === "DISTRIB" && p.tests.allowed === 1 &&
      p.distribution.distribution < p.cashEq - 0.01) { out.push("CAPPED"); }
  return out;
}
