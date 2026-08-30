/* =====================================================================
 * render.js -- builds the SVG cascade from the graph + engine output.
 *
 * Tanks are glass boxes with a liquid level; pipes are stroked paths whose
 * appearance is driven by the edge `type` in cascade_graph.json. Draw pipes
 * (a reservoir paying a shortfall) and release pipes (surplus going out to
 * equity) are deliberately different in colour, dash, width AND arrowhead,
 * because the brief requires them not to read as one flow.
 * ===================================================================== */

const SVGNS = "http://www.w3.org/2000/svg";

function el(name, attrs, parent) {
  const n = document.createElementNS(SVGNS, name);
  if (attrs) {
    for (const k in attrs) {
      if (attrs[k] !== null && attrs[k] !== undefined) {
        n.setAttribute(k, attrs[k]);
      }
    }
  }
  if (parent) { parent.appendChild(n); }
  return n;
}

/* --- number formatting -------------------------------------------- */

function money(v) {
  if (v === "" || v === null || v === undefined) { return "—"; }
  if (typeof v !== "number" || isNaN(v) || !isFinite(v)) { return String(v); }
  const s = v < 0 ? "−" : "";
  const a = Math.abs(v);
  if (a >= 1e6) { return s + "€" + (a / 1e6).toFixed(2) + "M"; }
  if (a >= 1e3) { return s + "€" + Math.round(a / 1e3) + "k"; }
  return s + "€" + a.toFixed(0);
}

function ratio(v) {
  if (v === "" || v === null || v === undefined) { return "—"; }
  if (typeof v !== "number" || isNaN(v) || !isFinite(v)) { return String(v); }
  return v.toFixed(2) + "×";
}

/* --- geometry helpers --------------------------------------------- */

const box = (id) => BOXES[id];
const cx = (b) => b.x + b.w / 2;
const cy = (b) => b.y + b.h / 2;

/* Anchor on a box edge. */
function anchor(b, side) {
  switch (side) {
    case "top":    return { x: cx(b), y: b.y };
    case "bottom": return { x: cx(b), y: b.y + b.h };
    case "left":   return { x: b.x, y: cy(b) };
    case "right":  return { x: b.x + b.w, y: cy(b) };
  }
}

/* Choose sides and build a path. Generic rules, with the awkward upward
 * flows handled by EDGE_ROUTES. */
function pipePath(from, to, key) {
  const a = box(from), b = box(to);
  const override = EDGE_ROUTES[key];

  if (override && override.style === "fork") {
    /* out of the bottom, down to a shared lane, across, then down in */
    const p0 = anchor(a, "bottom"), p1 = anchor(b, "top");
    const lane = p0.y + (p1.y - p0.y) * 0.45;
    return `M ${p0.x} ${p0.y} L ${p0.x} ${lane} L ${p1.x} ${lane} ` +
           `L ${p1.x} ${p1.y}`;
  }

  if (override && override.style === "rightMargin") {
    /* out of the right edge, up (or down) the margin lane, back in the right */
    const lane = override.lane;
    const p0 = anchor(a, "right"), p1 = anchor(b, "right");
    return `M ${p0.x} ${p0.y} L ${lane} ${p0.y} L ${lane} ${p1.y} L ${p1.x} ${p1.y}`;
  }

  const dy = cy(b) - cy(a);
  const dx = cx(b) - cx(a);
  const xOverlap = (a.x < b.x + b.w) && (b.x < a.x + a.w);

  /* straight down the spine */
  if (dy > 0 && xOverlap && Math.abs(dy) > Math.abs(dx)) {
    const p0 = anchor(a, "bottom"), p1 = anchor(b, "top");
    const m = (p0.y + p1.y) / 2;
    return `M ${p0.x} ${p0.y} C ${p0.x} ${m} ${p1.x} ${m} ${p1.x} ${p1.y}`;
  }

  /* sideways (includes reservoir draws and releases) */
  const outSide = dx >= 0 ? "right" : "left";
  const inSide = dx >= 0 ? "left" : "right";
  const p0 = anchor(a, outSide), p1 = anchor(b, inSide);
  const bend = Math.max(30, Math.abs(p1.x - p0.x) * 0.45);
  const c1x = p0.x + (outSide === "right" ? bend : -bend);
  const c2x = p1.x + (inSide === "left" ? -bend : bend);
  return `M ${p0.x} ${p0.y} C ${c1x} ${p0.y} ${c2x} ${p1.y} ${p1.x} ${p1.y}`;
}

/* --- arrowhead marker definitions --------------------------------- */

/* One marker per edge type so draw / release / fund never share a head. */
const MARKERS = {
  cash:     { shape: "solid",  color: "var(--liquid)" },
  carry:    { shape: "open",   color: "var(--ink-3)" },
  draw:     { shape: "chevron", color: "var(--draw)" },
  fund:     { shape: "solid",  color: "var(--fund)" },
  release:  { shape: "diamond", color: "var(--release)" },
  test:     { shape: "open",   color: "var(--ink-3)" },
  priority: { shape: "solid",  color: "var(--ink-3)" }
};

function buildDefs(svg) {
  const defs = el("defs", null, svg);
  for (const type in MARKERS) {
    const m = MARKERS[type];
    const mk = el("marker", {
      id: "mk-" + type, viewBox: "0 0 12 12",
      refX: 9, refY: 6, markerWidth: 8, markerHeight: 8,
      orient: "auto-start-reverse"
    }, defs);
    if (m.shape === "solid") {
      el("path", { d: "M 1 1 L 11 6 L 1 11 z", fill: m.color }, mk);
    } else if (m.shape === "open") {
      el("path", { d: "M 2 2 L 10 6 L 2 10", fill: "none",
        stroke: m.color, "stroke-width": 1.8,
        "stroke-linecap": "round", "stroke-linejoin": "round" }, mk);
    } else if (m.shape === "chevron") {
      /* a double chevron: cash being pulled OUT of a reservoir */
      el("path", { d: "M 1 2 L 6 6 L 1 10 M 6 2 L 11 6 L 6 10", fill: "none",
        stroke: m.color, "stroke-width": 2,
        "stroke-linecap": "round", "stroke-linejoin": "round" }, mk);
    } else if (m.shape === "diamond") {
      el("path", { d: "M 6 1 L 11 6 L 6 11 L 1 6 z", fill: "none",
        stroke: m.color, "stroke-width": 1.8 }, mk);
    }
  }

  /* soft shadow for the glass tanks */
  const f = el("filter", { id: "tankShadow", x: "-20%", y: "-20%",
    width: "150%", height: "150%" }, defs);
  el("feDropShadow", { dx: 0, dy: 1.5, stdDeviation: 1.6,
    "flood-color": "#5a5044", "flood-opacity": 0.22 }, f);
  return defs;
}

/* =================================================================
 * The renderer
 * ================================================================= */

class Cascade {
  constructor(mountEl, graph) {
    this.graph = graph;
    this.svg = el("svg", {
      viewBox: `0 0 ${CANVAS.w} ${CANVAS.h}`,
      preserveAspectRatio: "xMidYMin meet",
      class: "cascade-svg"
    });
    mountEl.appendChild(this.svg);
    buildDefs(this.svg);

    this.pipeLayer = el("g", { class: "layer-pipes" }, this.svg);
    this.nodeLayer = el("g", { class: "layer-nodes" }, this.svg);

    this.pipes = {};   /* "FROM->TO" -> {path, hit, edge} */
    this.nodes = {};   /* id -> {group, liquid, valueText, ...} */
    this.onSelect = null;

    this._buildPipes();
    this._buildNodes();
  }

  /* ---------------- pipes, from the graph's edges ---------------- */
  _buildPipes() {
    for (const edge of this.graph.edges) {
      /* priority edges live inside the DEBT box and are drawn with it */
      if (edge.type === "priority") { continue; }
      if (!BOXES[edge.from] || !BOXES[edge.to]) { continue; }

      const key = edge.from + "->" + edge.to;
      const d = pipePath(edge.from, edge.to, key);
      const g = el("g", { class: "pipe pipe-" + edge.type,
        "data-edge": key }, this.pipeLayer);

      /* a fat invisible path underneath makes thin pipes clickable */
      const hit = el("path", { d, class: "pipe-hit" }, g);
      const casing = el("path", { d, class: "pipe-casing" }, g);
      const line = el("path", { d, class: "pipe-line",
        "marker-end": "url(#mk-" + edge.type + ")" }, g);
      const flow = el("path", { d, class: "pipe-flow" }, g);

      const label = el("text", { class: "pipe-amount" }, g);

      g.addEventListener("click", (ev) => {
        ev.stopPropagation();
        if (this.onSelect) { this.onSelect({ kind: "edge", edge, key }); }
      });

      this.pipes[key] = { g, line, casing, flow, hit, label, edge, d };
    }
  }

  /* ---------------- tanks, from the graph's nodes ---------------- */
  _buildNodes() {
    for (const node of this.graph.nodes) {
      if (node.kind === "subcompartment") { continue; } /* drawn inside DEBT */
      const b = BOXES[node.id];
      if (!b) { continue; }

      const g = el("g", { class: "node node-" + b.kind,
        "data-node": node.id }, this.nodeLayer);

      el("rect", { x: b.x, y: b.y, width: b.w, height: b.h, rx: 7,
        class: "tank-body", filter: "url(#tankShadow)" }, g);

      /* the liquid: a clipped rect grown from the bottom */
      const clipId = "clip-" + node.id;
      const cp = el("clipPath", { id: clipId }, g);
      el("rect", { x: b.x, y: b.y, width: b.w, height: b.h, rx: 7 }, cp);
      const liquidWrap = el("g", { "clip-path": "url(#" + clipId + ")" }, g);
      const liquid = el("rect", { x: b.x, y: b.y + b.h,
        width: b.w, height: 0, class: "tank-liquid" }, liquidWrap);
      const surface = el("rect", { x: b.x, y: b.y + b.h,
        width: b.w, height: 2.5, class: "tank-surface" }, liquidWrap);

      /* dashed reference line for reserve targets */
      const targetLine = el("line", { x1: b.x, x2: b.x + b.w,
        y1: b.y + b.h, y2: b.y + b.h, class: "tank-target",
        visibility: "hidden" }, g);

      el("rect", { x: b.x, y: b.y, width: b.w, height: b.h, rx: 7,
        class: "tank-glass" }, g);

      el("text", { x: b.x + 10, y: b.y + 17, class: "tank-label" }, g)
        .textContent = displayLabel(node);

      /* The gate stacks four things vertically, so its verdict and ratio
       * line go in their own bands at the top instead of the usual footer,
       * where they would sit on top of the lamp labels. */
      const isGate = (b.kind === "gate");
      const valueText = el("text", {
        x: b.x + b.w - 10, y: isGate ? b.y + 17 : b.y + b.h - 9,
        class: "tank-value", "text-anchor": "end" }, g);

      const subText = el("text", {
        x: b.x + 10, y: isGate ? b.y + 36 : b.y + b.h - 9,
        class: "tank-sub" }, g);

      const badge = el("g", { class: "tank-badges" }, g);

      g.addEventListener("click", (ev) => {
        ev.stopPropagation();
        if (this.onSelect) { this.onSelect({ kind: "node", node }); }
      });

      this.nodes[node.id] = { g, liquid, surface, valueText, subText,
        badge, targetLine, box: b, node };

      if (node.id === "DEBT") { this._buildDebtSubs(g); }
      if (node.id === "LOCKUP") { this._buildLockupLamps(g, b); }
    }
  }

  /* The three ordered sub-compartments. Each is a bucket that must fill
   * before the next one gets anything. */
  _buildDebtSubs(parent) {
    this.subs = {};
    const gm = DEBT_SUB_GEOM;
    DEBT_SUBS.forEach((sub, i) => {
      const node = this.graph.nodes.find((n) => n.id === sub.id);
      const g = el("g", { class: "sub", "data-node": sub.id }, parent);

      el("rect", { x: gm.x, y: sub.y, width: gm.w, height: gm.h, rx: 5,
        class: "sub-body" }, g);

      const clipId = "clip-" + sub.id;
      const cp = el("clipPath", { id: clipId }, g);
      el("rect", { x: gm.x, y: sub.y, width: gm.w, height: gm.h, rx: 5 }, cp);
      const wrap = el("g", { "clip-path": "url(#" + clipId + ")" }, g);
      const liquid = el("rect", { x: gm.x, y: sub.y + gm.h,
        width: gm.w, height: 0, class: "sub-liquid" }, wrap);

      el("rect", { x: gm.x, y: sub.y, width: gm.w, height: gm.h, rx: 5,
        class: "sub-glass" }, g);

      el("text", { x: gm.x + 9, y: sub.y + 17, class: "sub-label" }, g)
        .textContent = sub.label;
      const paidText = el("text", { x: gm.x + gm.w - 9, y: sub.y + 17,
        class: "sub-value", "text-anchor": "end" }, g);
      const dueText = el("text", { x: gm.x + 9, y: sub.y + gm.h - 8,
        class: "sub-sub" }, g);

      /* the priority arrow down to the next bucket */
      if (i < DEBT_SUBS.length - 1) {
        const yA = sub.y + gm.h, yB = DEBT_SUBS[i + 1].y;
        el("path", { d: `M ${gm.x + gm.w / 2} ${yA} L ${gm.x + gm.w / 2} ${yB}`,
          class: "sub-priority",
          "marker-end": "url(#mk-priority)" }, parent);
      }

      g.addEventListener("click", (ev) => {
        ev.stopPropagation();
        if (this.onSelect && node) { this.onSelect({ kind: "node", node }); }
      });

      this.subs[sub.id] = { g, liquid, paidText, dueText, y: sub.y, h: gm.h };
    });
  }

  /* Four lamps in their own band at the bottom of the gate, below the
   * verdict and the ratio line. */
  _buildLockupLamps(parent, b) {
    this.lamps = {};
    const names = [["dscrOk", "DSCR"], ["llcrOk", "LLCR"],
                   ["mraOk", "MRA"], ["dsraOk", "DSRA"]];
    const w = b.w / 4;
    names.forEach(([key, label], i) => {
      const x = b.x + i * w;
      const g = el("g", { class: "lamp" }, parent);
      const dot = el("circle", { cx: x + w / 2, cy: b.y + b.h - 30, r: 5.5,
        class: "lamp-dot" }, g);
      el("text", { x: x + w / 2, y: b.y + b.h - 11, class: "lamp-label",
        "text-anchor": "middle" }, g).textContent = label;
      this.lamps[key] = dot;
    });
  }

  /* =================================================================
   * update: push one period's figures into the SVG
   * ================================================================= */
  update(run, periodIndex, stage) {
    const p = run.periods[periodIndex];
    const cap = run._caps || (run._caps = computeCapacities(run));
    const stepping = (stage !== null && stage !== undefined);

    /* --- tanks --------------------------------------------------- */
    for (const id in this.nodes) {
      const n = this.nodes[id];
      const b = n.box;
      const raw = stagedValue(id, p, run, stage);
      const bad = typeof raw === "number" && (isNaN(raw) || !isFinite(raw));
      /* The compound DEBT box is a frame around its three buckets, not a
       * tank in its own right -- giving it a liquid too would fight with
       * them and muddy the one thing this compartment has to teach. */
      const isContainer = (b.kind === "compound" || b.kind === "gate");
      const frac = (bad || isContainer) ? 0
        : Math.max(0, Math.min(1, Math.abs(raw) / cap[id]));
      const hpx = frac * b.h;

      n.liquid.setAttribute("y", b.y + b.h - hpx);
      n.liquid.setAttribute("height", hpx);
      n.surface.setAttribute("y", b.y + b.h - hpx - 1.2);
      n.surface.setAttribute("visibility", hpx > 1 ? "visible" : "hidden");

      n.g.classList.toggle("is-negative", typeof raw === "number" && raw < -0.01);
      n.g.classList.toggle("is-empty", frac < 0.005);
      n.g.classList.toggle("is-bad", bad);

      /* value readout */
      if (id === "LOCKUP") {
        const reachedGate = !stepping || stage >= NODE_STAGE.LOCKUP;
        /* Same two words the narration uses, so the gate and the prose
         * beneath it cannot appear to disagree. */
        n.valueText.textContent = !reachedGate ? ""
          : (p.tests.allowed === 1 ? "PERMITTED" : "LOCKED UP");
        n.g.classList.toggle("is-blocked",
          reachedGate && p.tests.allowed !== 1);
        n.g.classList.toggle("is-passed",
          reachedGate && p.tests.allowed === 1);
      } else {
        n.valueText.textContent = bad ? String(raw) : money(raw);
      }

      /* secondary line + target reference */
      let sub = "";
      if (NODE_TARGET[id]) {
        const t = NODE_TARGET[id](p);
        sub = "target " + money(t);
        const tf = Math.max(0, Math.min(1, Math.abs(t) / cap[id]));
        const ty = b.y + b.h - tf * b.h;
        n.targetLine.setAttribute("y1", ty);
        n.targetLine.setAttribute("y2", ty);
        n.targetLine.setAttribute("visibility", "visible");
        n.g.classList.toggle("is-underfilled", raw < t - 0.5);
      } else if (id === "DEBT") {
        sub = "outstanding " + money(p.debt.debtEoP);
      } else if (id === "TOLL") {
        sub = "traffic " + (run.pre.traffic[p.period - 1] / 1e6).toFixed(1) + "M km";
      } else if (id === "LOCKUP") {
        sub = "DSCR " + ratio(p.dscrRealised) + " · LLCR " + ratio(p.llcr);
      }
      n.subText.textContent = sub;

      /* signal badges -- suppressed until the stage that produces them, so
       * stepping through does not reveal the verdict early */
      const reached = !stepping || stage >= (NODE_STAGE[id] === undefined
        ? 0 : NODE_STAGE[id]);
      const sigs = reached ? nodeSignals(id, p, run) : [];
      n.badge.textContent = "";
      sigs.forEach((s, i) => {
        const bw = s.length * 6.4 + 14;
        const bx = b.x + b.w - bw - 6, by = b.y + 24 + i * 20;
        el("rect", { x: bx, y: by, width: bw, height: 16, rx: 3,
          class: "badge-box" }, n.badge);
        el("text", { x: bx + bw / 2, y: by + 12, class: "badge-text",
          "text-anchor": "middle" }, n.badge).textContent = s;
      });
    }

    /* --- debt sub-compartments ----------------------------------- */
    /* Deferred interest is a BALANCE that persists across periods, so its
     * tank is scaled against the largest arrears the run ever holds: it
     * fills in the year interest is deferred and drains when the arrears are
     * repaid. Interest and principal are per-period flows, filled paid/due. */
    const capDef = run._capDef || (run._capDef = (function () {
      var m = 1, q, i;
      for (i = 0; i < run.periods.length; i++) {
        q = run.periods[i];
        if (q.debt.deferredBoP > m) { m = q.debt.deferredBoP; }
        if (q.debt.deferredEoP > m) { m = q.debt.deferredEoP; }
      }
      return m;
    })());

    for (const id in this.subs) {
      const s = this.subs[id];
      const { paid, due } = stagedSub(id, p, stage);
      const subReached = !stepping || stage >= NODE_STAGE[id];

      /* Interest and principal are per-period OBLIGATIONS, so their headline
       * figure is what was paid. Deferred interest is the only one of the
       * three that carries a BALANCE across periods: its headline AND its
       * liquid level are that balance, so the number and the tank agree --
       * both rise in the peak year and both fall when the arrears clear.
       * Before the debt stage (while stepping) it holds the opening arrears;
       * from the debt stage on, the closing balance. */
      const arrears = (id === "DEBT_DEF" && subReached) ? p.debt.deferredEoP : 0;
      const defBalance = (id === "DEBT_DEF")
        ? (subReached ? p.debt.deferredEoP : p.debt.deferredBoP) : 0;
      const headline = (id === "DEBT_DEF") ? defBalance : paid;

      const frac = (id === "DEBT_DEF")
        ? Math.max(0, Math.min(1, defBalance / capDef))
        : (due > 0.005 ? Math.max(0, Math.min(1, paid / due)) : 0);
      const hpx = frac * s.h;
      s.liquid.setAttribute("y", s.y + s.h - hpx);
      s.liquid.setAttribute("height", hpx);
      s.paidText.textContent = money(headline);

      let sub;
      if (id === "DEBT_DEF") {
        /* describe the MOVEMENT here; the balance is already the headline */
        const bits = [];
        if (due > 0.005) {
          bits.push(money(paid) + " of " + money(due) + " repaid");
        }
        if (subReached && p.debt.deferredAddition > 0.5) {
          bits.push("+" + money(p.debt.deferredAddition) + " NEWLY DEFERRED");
        }
        sub = bits.length ? bits.join("  ·  ") : "no arrears";
      } else {
        /* SHORT and SERVED are both status stamps, so both are capitalised. */
        sub = due > 0.005
          ? "due " + money(due) + (paid < due - 0.5 ? "  ·  SHORT" : "  ·  SERVED")
          : "nothing due";
        if (subReached && id === "DEBT_INT" && p.debt.deferredAddition > 0.5) {
          sub += "  →  " + money(p.debt.deferredAddition) + " DEFERRED";
        }
      }
      s.dueText.textContent = sub;

      const accruing =
        (id === "DEBT_INT" && subReached && p.debt.deferredAddition > 0.5) ||
        (id === "DEBT_DEF" && arrears > 0.5);
      s.g.classList.toggle("is-accruing", accruing);
      s.g.classList.toggle("is-short", due > 0.5 && paid < due - 0.5);
      /* holding arrears is not "idle", even when nothing fell due this period */
      s.g.classList.toggle("is-idle", due <= 0.005 && arrears <= 0.5);
      s.g.classList.toggle("is-served", due > 0.005 && paid >= due - 0.5);
    }

    /* --- lock-up lamps ------------------------------------------- */
    if (this.lamps) {
      const lampsReached = !stepping || stage >= NODE_STAGE.LOCKUP;
      for (const key in this.lamps) {
        const on = lampsReached && p.tests[key] === 1;
        const off = lampsReached && p.tests[key] !== 1;
        this.lamps[key].classList.toggle("is-on", on);
        this.lamps[key].classList.toggle("is-off", off);
      }
    }

    /* --- pipes: amount labels, activity, flow animation ---------- */
    for (const key in this.pipes) {
      const pipe = this.pipes[key];
      const amt = this._edgeAmount(pipe.edge, p, run);
      const es = edgeStage(pipe.edge);
      const carrying = amt !== null && Math.abs(amt) > 0.5;
      /* reached: this stage has happened. flowing: it is happening NOW. */
      const reached = !stepping || stage >= es;
      const active = carrying && reached;
      const flowing = carrying && (!stepping ? false : stage === es);

      pipe.g.classList.toggle("is-active", active);
      pipe.g.classList.toggle("is-idle", !active);
      pipe.g.classList.toggle("is-flowing", flowing);

      if (active) {
        const mid = this._midpoint(pipe);
        pipe.label.setAttribute("x", mid.x);
        pipe.label.setAttribute("y", mid.y - 5);
        pipe.label.setAttribute("text-anchor", "middle");
        pipe.label.textContent = money(amt);
      } else {
        pipe.label.textContent = "";
      }
    }

    /* dim everything not in the current stage */
    this.highlightStage(stepping ? WF.STAGES[stage].id : null);
  }

  /* The euro amount travelling down a given pipe this period. Null means
   * "this pipe carries no single figure" (structural edges). */
  _edgeAmount(edge, p, run) {
    const k = edge.from + "->" + edge.to;
    const map = {
      "TOLL->CURCASH":        run.pre.toll.nominal[p.period - 1],
      "OPEX->CURCASH":        -run.pre.opex.nominal[p.period - 1],
      "TREAS_BOP->CURCASH":   p.treasuryBoP,
      "CURCASH->HM_PAY":      p.hm.hmFromCash,
      "HM->HM_PAY":           p.hm.hmDue,
      "MRA->HM_PAY":          p.hm.hmFromMra,
      "HM_PAY->CASH_AHM":     p.hm.cashAfterHm,
      "CURCASH->CASH_AHM":    p.hm.cashAfterHm,
      "CASH_AHM->DEBT":       p.debt.debtService,
      "DSRA->DEBT":           p.debt.dsraDraw,
      "DEBT->CASH_RES":       p.cashForReserves,
      "CASH_RES->MRA_RECH":   p.mra.recharge,
      "MRA_RECH->MRA":        p.mra.recharge,
      "CASH_RES->DSRA_RECH":  p.dsra.recharge,
      "DSRA_RECH->DSRA":      p.dsra.recharge,
      "MRA->CASH_AHM":        p.mra.release,
      "DSRA->CASH_AHM":       p.dsra.release,
      "CASH_RES->CASH_EQ":    p.cashForDsra - p.dsra.recharge,
      /* The gate is a set of points, not a tank: all the cash arrives at it,
       * and it is switched either to the shareholders or into treasury.
       * These three amounts must therefore add up: in = out. */
      "CASH_EQ->LOCKUP":      p.cashEq,
      "LOCKUP->DISTRIB":      p.distribution.distribution,
      "LOCKUP->TREAS_EOP":    p.distribution.treasuryEoP,
      "TREAS_EOP->TREAS_BOP": p.distribution.treasuryEoP
    };
    return (k in map) ? map[k] : null;
  }

  _midpoint(pipe) {
    try {
      const L = pipe.line.getTotalLength();
      return pipe.line.getPointAtLength(L * 0.5);
    } catch (e) {
      const a = box(pipe.edge.from), b = box(pipe.edge.to);
      return { x: (cx(a) + cx(b)) / 2, y: (cy(a) + cy(b)) / 2 };
    }
  }

  /* Which nodes/pipes belong to each Step-through stage. Used by step (d);
   * passing null clears all highlighting. */
  highlightStage(stage) {
    const STAGE_NODES = {
      carry:   ["TREAS_BOP", "TOLL", "OPEX", "CURCASH"],
      /* both reserves release their surplus into cash-after-HM at this stage,
       * so both light up here (as well as at the stages where they are drawn) */
      hm:      ["HM", "HM_PAY", "MRA", "DSRA", "CASH_AHM"],
      debt:    ["DEBT", "DEBT_DEF", "DEBT_INT", "DEBT_PRIN", "DSRA"],
      resid:   ["CASH_RES"],
      reserve: ["MRA_RECH", "DSRA_RECH", "MRA", "DSRA", "CASH_EQ"],
      distrib: ["LOCKUP", "DISTRIB", "TREAS_EOP", "CASH_EQ"]
    };
    const set = stage ? new Set(STAGE_NODES[stage] || []) : null;
    this.svg.classList.toggle("stage-mode", !!stage);
    for (const id in this.nodes) {
      this.nodes[id].g.classList.toggle("in-stage", !!set && set.has(id));
    }
    if (this.subs) {
      for (const id in this.subs) {
        this.subs[id].g.classList.toggle("in-stage", !!set && set.has(id));
      }
    }
    for (const key in this.pipes) {
      const e = this.pipes[key].edge;
      const inStage = !!set && set.has(e.from) && set.has(e.to);
      this.pipes[key].g.classList.toggle("in-stage", inStage);
    }
  }

  /* During Run, every carrying pipe animates; in Step mode only the pipes
   * belonging to the current stage do. */
  setRunning(on) { this.svg.classList.toggle("is-running", !!on); }

  /* How fast tank levels ease to their new value, matched to Run speed so
   * the liquid is not still moving when the next period arrives. */
  setFillSpeed(ms) { this.svg.style.setProperty("--fill-ms", ms + "ms"); }

  /* Ring the selected element. */
  setSelection(sel) {
    for (const id in this.nodes) {
      this.nodes[id].g.classList.toggle("is-selected",
        !!sel && sel.kind === "node" && sel.node.id === id);
    }
    if (this.subs) {
      for (const id in this.subs) {
        this.subs[id].g.classList.toggle("is-selected",
          !!sel && sel.kind === "node" && sel.node.id === id);
      }
    }
    for (const key in this.pipes) {
      this.pipes[key].g.classList.toggle("is-selected",
        !!sel && sel.kind === "edge" && sel.key === key);
    }
  }
}
