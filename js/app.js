/* =====================================================================
 * app.js -- wiring: params -> engine -> cascade.
 *
 * Step (c): topology rendered from the graph and driven by the proven
 * engine, plus period navigation and the assumptions panel.
 * Run / Step-through animation is step (d).
 * ===================================================================== */

(function () {
  "use strict";

  const graph = CASCADE_GRAPH;

  /* ---------------------------------------------------------------
   * Fail loud: the layout and the graph must agree in BOTH directions.
   * A graph node with no box would silently vanish from the cascade; a
   * box with no graph node would be a tank the model knows nothing about.
   * --------------------------------------------------------------- */
  function checkLayout() {
    const problems = [];
    const graphIds = new Set(graph.nodes.map((n) => n.id));
    const subIds = new Set(DEBT_SUBS.map((s) => s.id));

    for (const n of graph.nodes) {
      if (n.kind === "subcompartment") {
        if (!subIds.has(n.id)) {
          problems.push("graph sub-compartment " + n.id + " has no layout slot");
        }
        continue;
      }
      if (!BOXES[n.id]) {
        problems.push("graph node " + n.id + " has no box in the layout");
      }
    }
    for (const id in BOXES) {
      if (!graphIds.has(id)) {
        problems.push("layout box " + id + " is not a node in the graph");
      }
    }
    for (const e of graph.edges) {
      if (e.type === "priority") { continue; }
      if (!BOXES[e.from] || !BOXES[e.to]) {
        problems.push("edge " + e.from + "->" + e.to + " references a box-less node");
      }
    }
    return problems;
  }

  /* --------------------------------------------------------------- */

  const els = {
    sliders:  document.getElementById("sliders"),
    canvas:   document.getElementById("canvas"),
    inspector: document.getElementById("inspector"),
    figures:  document.getElementById("figures"),
    anomaly:  document.getElementById("anomaly"),
    readout:  document.getElementById("periodReadout"),
    prev:     document.getElementById("btnPrev"),
    next:     document.getElementById("btnNext"),
    first:    document.getElementById("btnFirst"),
    last:     document.getElementById("btnLast"),
    scrub:    document.getElementById("scrub"),
    run:      document.getElementById("btnRun"),
    step:     document.getElementById("btnStep"),
    reset:    document.getElementById("btnReset"),
    speed:    document.getElementById("speed"),
    stagebar: document.getElementById("stagebar"),
    narration: document.getElementById("narration")
  };

  let run = null;
  let periodIndex = 0;
  let selection = null;
  /* null = show the finished period; 0..5 = part-way through it */
  let stage = null;
  let timer = null;

  const cascade = new Cascade(els.canvas, graph);
  cascade.onSelect = (sel) => { selection = sel; renderInspector(); cascade.setSelection(sel); };
  els.canvas.addEventListener("click", () => {
    selection = null; renderInspector(); cascade.setSelection(null);
  });

  const panel = new ParamsPanel(els.sliders, WF.DEFAULTS, (params) => {
    recompute(params);
  });

  /* ---------------------------------------------------------------
   * recompute + render
   * --------------------------------------------------------------- */

  function recompute(params) {
    run = WF.runAll(params);
    panel.refresh(run.pre.principalUsed);

    /* Never hide a NaN: surface it with the exact row and period. */
    if (run.anomalies.length) {
      const a = run.anomalies[0];
      els.anomaly.textContent =
        "Non-finite value produced: " + run.anomalies.length +
        " cell(s). First at Feuil1 row " + a.row + ", period " + a.period +
        " = " + a.value + ". The affected tanks are outlined in red.";
    } else {
      els.anomaly.textContent = "";
    }
    draw();
  }

  function draw() {
    cascade.update(run, periodIndex, stage);
    renderFigures();
    renderReadout();
    renderStagebar();
    renderNarration();
    renderInspector();
    els.scrub.value = periodIndex;
  }

  function renderReadout() {
    const p = run.periods[periodIndex];
    els.readout.textContent = "Period " + p.period + " · " + p.year;
    const atFirst = periodIndex === 0;
    const atLast = periodIndex === run.periods.length - 1;
    els.prev.disabled = atFirst;
    els.first.disabled = atFirst;
    els.next.disabled = atLast;
    els.last.disabled = atLast;
    els.step.disabled = atLast && stage === WF.STAGES.length - 1;
  }

  /* ---------------------------------------------------------------
   * the six-stage strip
   * --------------------------------------------------------------- */

  function renderStagebar() {
    els.stagebar.classList.toggle("is-hidden", stage === null);
    if (stage === null) { els.stagebar.textContent = ""; return; }
    els.stagebar.textContent = "";
    WF.STAGES.forEach((s, i) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "stage-chip" +
        (i === stage ? " is-current" : (i < stage ? " is-done" : ""));
      const n = document.createElement("span");
      n.className = "n";
      n.textContent = "STAGE " + (i + 1);
      b.appendChild(n);
      b.appendChild(document.createTextNode(s.label));
      b.addEventListener("click", () => { pause(); stage = i; draw(); });
      els.stagebar.appendChild(b);
    });
  }

  /* ---------------------------------------------------------------
   * narration: the euro amounts moving at this stage, in words
   * --------------------------------------------------------------- */

  function renderNarration() {
    const p = run.periods[periodIndex];
    if (stage === null) {
      els.narration.textContent = "";
      return;
    }
    const M = money;
    const parts = [];
    const flag = (t, ok) => `<span class="flag${ok ? " ok" : ""}">${t}</span>`;

    switch (WF.STAGES[stage].id) {
      case "carry":
        parts.push(`Toll revenue <b>${M(run.pre.toll.nominal[periodIndex])}</b>` +
          ` less operating costs <b>${M(run.pre.opex.nominal[periodIndex])}</b>` +
          ` plus <b>${M(p.treasuryBoP)}</b> carried forward from last period` +
          ` gives current cash of <b>${M(p.currentCash)}</b>.`);
        break;
      case "hm":
        parts.push(`Heavy maintenance of <b>${M(p.hm.hmDue)}</b> is due, and it` +
          ` ranks ahead of the debt. <b>${M(p.hm.hmFromCash)}</b> comes from` +
          ` cash` + (p.hm.hmFromMra > 0.5
            ? `, and the MRA is drawn for the <b>${M(p.hm.hmFromMra)}</b> shortfall`
            : ` and the MRA is not touched`) +
          `. That leaves <b>${M(p.hm.cashAfterHm)}</b> for the lenders.`);
        if (p.hm.hmSignal) { parts.push(flag(p.hm.hmSignal)); }
        break;
      case "debt": {
        const d = p.debt;
        const bits = [];
        if (d.deferredBoP > 0.5) {
          bits.push(`arrears of <b>${M(d.deferredBoP)}</b> take priority and` +
            ` <b>${M(d.deferredPaid)}</b> is repaid`);
        }
        bits.push(`interest of <b>${M(d.interestAccrued)}</b> accrues and` +
          ` <b>${M(d.interestPaid)}</b> is paid`);
        if (d.dsraDraw > 0.5) {
          bits.push(`the DSRA is drawn for <b>${M(d.dsraDraw)}</b> to top that up`);
        }
        bits.push(`principal sculpted to <b>${M(d.principalTarget)}</b>, of which` +
          ` <b>${M(d.principalPaid)}</b> is actually repaid`);
        parts.push(`In strict order — deferred, then interest, then principal: ` +
          bits.join("; ") + `. Debt service <b>${M(d.debtService)}</b>` +
          (d.debtService > 0 ? `, DSCR <b>${ratio(p.dscrRealised)}</b>` : "") + `.`);
        if (d.deferredAddition > 0.5) {
          parts.push(flag("INTEREST DEFERRED " + M(d.deferredAddition)));
        }
        if (p.debtSignal) { parts.push(flag(p.debtSignal)); }
        break;
      }
      case "resid":
        parts.push(`After the lenders are served, <b>${M(p.cashForReserves)}</b>` +
          ` is available for the reserve accounts.`);
        break;
      case "reserve":
        parts.push(`The MRA is topped up by <b>${M(p.mra.recharge)}</b> toward its` +
          ` target of <b>${M(p.mraTarget)}</b>, then the DSRA by` +
          ` <b>${M(p.dsra.recharge)}</b> toward <b>${M(p.dsraTarget)}</b>.` +
          ((p.mra.release + p.dsra.release) > 0.5
            ? ` Surplus above target is released: <b>${M(p.mra.release + p.dsra.release)}</b>` +
              ` flows out to equity.`
            : ` Neither reserve is above its target, so nothing is released.`) +
          ` <b>${M(p.cashEq)}</b> reaches the equity gate.`);
        break;
      case "distrib": {
        const t = p.tests;
        const names = [["DSCR", t.dscrOk], ["LLCR", t.llcrOk],
                       ["MRA filled", t.mraOk], ["DSRA filled", t.dsraOk]];
        const failed = names.filter(([, v]) => v !== 1).map(([k]) => k);
        if (t.allowed === 1) {
          parts.push(`All four lock-up tests pass, so a distribution is allowed.` +
            ` Capped at <b>${M(p.distribution.maxPermissible)}</b> to leave a` +
            ` buffer behind, <b>${M(p.distribution.distribution)}</b> goes to` +
            ` shareholders and <b>${M(p.distribution.treasuryEoP)}</b> is carried` +
            ` into the next period.`);
          parts.push(flag("DISTRIBUTION ALLOWED", true));
        } else {
          parts.push(`Distribution is blocked: ${failed.join(", ")}` +
            ` ${failed.length === 1 ? "fails" : "fail"}. All of` +
            ` <b>${M(p.cashEq)}</b> is trapped in treasury and comes back next` +
            ` period.`);
          parts.push(flag("LOCKED UP"));
        }
        break;
      }
    }
    els.narration.innerHTML = parts.join(" ");
  }

  /* `stage` is the earliest step-through stage at which the figure is known.
   * While stepping, later figures read "—" rather than leaking the period's
   * outcome before the cascade has got there. */
  const FIGURES = [
    { label: "CFADS", stage: 0,
      get: (p, r) => money(r.pre.cfads[p.period - 1]) },
    { label: "Debt service", stage: 2, get: (p) => money(p.debt.debtService) },
    { label: "DSCR realised", stage: 2, get: (p) => ratio(p.dscrRealised),
      cls: (p, r) => p.debt.debtService === 0 ? ""
        : (p.tests.dscrOk ? "is-ok" : "is-alert") },
    { label: "LLCR", stage: 2, get: (p) => ratio(p.llcr),
      cls: (p) => p.tests.llcrOk ? "is-ok" : "is-alert" },
    { label: "Debt outstanding", stage: 2, get: (p) => money(p.debt.debtEoP) },
    { label: "Deferred interest", stage: 2, get: (p) => money(p.debt.deferredEoP),
      cls: (p) => p.debt.deferredEoP > 0.5 ? "is-alert" : "" },
    { label: "Distribution", stage: 5,
      get: (p) => money(p.distribution.distribution),
      cls: (p) => p.distribution.distribution > 0.5 ? "is-ok" : "" },
    { label: "Treasury", stage: 5,
      get: (p) => money(p.distribution.treasuryEoP) }
  ];

  function renderFigures() {
    const p = run.periods[periodIndex];
    els.figures.textContent = "";
    for (const f of FIGURES) {
      const known = (stage === null) || stage >= f.stage;
      const d = document.createElement("div");
      d.className = "figure " +
        (known && f.cls ? (f.cls(p, run) || "") : "") +
        (known ? "" : " is-pending");
      const dt = document.createElement("dt"); dt.textContent = f.label;
      const dd = document.createElement("dd");
      dd.textContent = known ? f.get(p, run) : "—";
      d.appendChild(dt); d.appendChild(dd);
      els.figures.appendChild(d);
    }
  }

  /* ---------------------------------------------------------------
   * inspector: explains whatever is selected, seeded from the graph
   * --------------------------------------------------------------- */

  function renderInspector() {
    const box = els.inspector;
    box.textContent = "";
    if (!run) { return; }
    const p = run.periods[periodIndex];

    if (!selection) {
      panel.highlight([]);
      const h = document.createElement("p");
      h.className = "insp-empty";
      h.textContent = "Click any tank or any pipe to see what it is, " +
        "what it holds this period, and why it sits where it does in the " +
        "order of priority.";
      box.appendChild(h);
      return;
    }

    if (selection.kind === "node") {
      const n = selection.node;
      panel.highlight(n.params || []);
      add(box, "div", "insp-kicker", kindWord(n.kind));
      add(box, "h2", "insp-title", displayLabel(n));
      const b = add(box, "div", "insp-body");
      add(b, "p", null, n.doc);

      const figs = document.createElement("dl");
      figs.className = "insp-figs";
      for (const [k, v] of nodeFigures(n.id, p, run)) {
        const row = document.createElement("div");
        const dt = document.createElement("dt"); dt.textContent = k;
        const dd = document.createElement("dd"); dd.textContent = v;
        row.appendChild(dt); row.appendChild(dd);
        figs.appendChild(row);
      }
      box.appendChild(figs);

      /* the formula worked through with the numbers currently on screen */
      const dyn = dynamicNote(n.id, p, run);
      if (dyn) {
        const d = add(box, "div", "insp-dyn");
        d.innerHTML = dyn;
      }

      /* the plain-language mechanism, plus a way through to the full entry */
      addGlossary(box, GLOSSARY_FOR_NODE[n.id]);

      /* No spreadsheet row references in user-facing text: the workbook
       * exists to validate the engine, not to be read by whoever is using
       * the app. Traceability lives in the engine's comments instead. */
      if (n.params && n.params.length) {
        add(box, "div", "insp-meta", "driven by " + paramLabels(n.params));
      }
      return;
    }

    /* an edge */
    const e = selection.edge;
    panel.highlight([]);
    add(box, "div", "insp-kicker", "pipe");
    add(box, "h2", "insp-title", e.flow);
    const tag = add(box, "span", "insp-flowtype ft-" + e.type, e.type);
    const b2 = add(box, "div", "insp-body");
    b2.style.marginTop = ".7rem";
    add(b2, "p", null, PIPE_DOC[e.type] || "");
    add(b2, "p", null, "From " + displayLabelById(e.from, graph) +
      " to " + displayLabelById(e.to, graph) + ".");
    const amt = cascade._edgeAmount(e, p, run);
    if (amt !== null) {
      const figs = document.createElement("dl");
      figs.className = "insp-figs";
      const row = document.createElement("div");
      const dt = document.createElement("dt");
      dt.textContent = "Flowing in period " + p.period;
      const dd = document.createElement("dd"); dd.textContent = money(amt);
      row.appendChild(dt); row.appendChild(dd);
      figs.appendChild(row);
      box.appendChild(figs);
    }
    addGlossary(box, GLOSSARY_FOR_EDGE[e.type]);
  }

  /* ---------------------------------------------------------------
   * Live worked example for the reserve accounts.
   *
   * The reserve targets are the two figures people most often take on
   * trust, so rather than describe the formula in the abstract we show it
   * evaluated with the current sliders, for the period on screen. Move a
   * slider or change period and these numbers move with it.
   * --------------------------------------------------------------- */

  function pct(v) {
    return (v * 100).toFixed(2).replace(/\.?0+$/, "") + "%";
  }

  function dynamicNote(id, p, run) {
    const M = money;
    const i = p.period - 1;
    const prm = run.params;

    if (id === "MRA" || id === "MRA_RECH") {
      /* The target looks FORWARD only: N+1, N+2, N+3. The current period's
       * own bill has already been paid, so saving for it would be pointless. */
      const hm = run.pre.hm.nominal;
      const h1 = i + 1 < WF.NP ? hm[i + 1] : 0;
      const h2 = i + 2 < WF.NP ? hm[i + 2] : 0;
      const h3 = i + 3 < WF.NP ? hm[i + 3] : 0;
      const bits = [
        pct(prm.MRA_Coef_N) + " of next year's maintenance bill (<b>" +
          M(h1) + "</b>)",
        pct(prm.MRA_Coef_N1) + " of the year after (<b>" + M(h2) + "</b>)",
        pct(prm.MRA_Coef_N2) + " of the year after that (<b>" + M(h3) + "</b>)"
      ];
      let s = "<em>Period " + p.period + ":</em> the reserve funds the " +
        "maintenance still to come, so the target is " +
        bits.join(" + ") + " = <b>" + M(p.mraTarget) + "</b>.";
      if (i + 1 < WF.NP && h1 > run.pre.hm.nominal[i] * 1.5) {
        s += " Next year carries a maintenance peak, which is why the target " +
          "jumps this period — the cash has to be set aside <em>before</em> " +
          "the bill arrives.";
      }
      if (i + 3 >= WF.NP) {
        s += " Periods beyond the end of the model count as zero, which is " +
          "why the target falls away here.";
      }
      s += " The reserve holds <b>" + M(p.mra.eop) + "</b> at the end of " +
        "the period" +
        (p.mra.eop < p.mraTarget - 0.5
          ? ", so it is <b>short of target</b> and the lock-up test fails."
          : ", so it is <b>at target</b> and the lock-up test passes.");
      return s;
    }

    if (id === "DSRA" || id === "DSRA_RECH") {
      if (p.period >= WF.NP) {
        return "<em>Period " + p.period + ":</em> this is the last period of " +
          "the model, so there is no next period to reserve against. The " +
          "target drops to <b>€0</b> and the whole balance is released.";
      }
      const nextDebt = p.debt.debtEoP;
      const nextInterest = nextDebt * prm.Interest_Rate;
      /* the same treasury-free calculation the engine uses for the target */
      const nextPrincipal = WF.principalTarget(
        p.period + 1, nextDebt, run.pre.cfadsTarget[p.period],
        nextInterest, prm.Debt_Duration);
      let s = "<em>Period " + p.period + ":</em> the target is what the " +
        "lenders are scheduled to be paid <em>next</em> period — interest of " +
        "<b>" + M(nextInterest) + "</b> (" + pct(prm.Interest_Rate) +
        " on the <b>" + M(nextDebt) + "</b> still outstanding) plus the " +
        "sculpted principal of <b>" + M(nextPrincipal) + "</b>, giving <b>" +
        M(p.dsraTarget) + "</b>.";
      if (nextPrincipal <= 0.5 && p.period < prm.Debt_Duration) {
        s += " No principal is scheduled next period, because interest " +
          "alone already absorbs the cash the cover ratio allows.";
      }
      s += " The reserve holds <b>" + M(p.dsra.eop) + "</b>" +
        (p.dsra.eop < p.dsraTarget - 0.5
          ? ", <b>short of target</b> — so distributions are blocked."
          : ", <b>at target</b>.");
      return s;
    }
    return null;
  }

  /* The mechanism in plain language, and a link to the full glossary entry.
   * Same source text as the glossary page, so the two cannot disagree. */
  function addGlossary(box, entryId) {
    if (!entryId) { return; }
    const g = glossaryEntry(entryId);
    if (!g) { return; }
    const wrap = add(box, "div", "insp-body");
    wrap.style.marginTop = ".8rem";
    const k = add(wrap, "div", "insp-kicker",
      "the mechanism — " + g.term);
    const p = document.createElement("p");
    p.innerHTML = g.plain;
    wrap.appendChild(p);
    const a = document.createElement("a");
    a.className = "insp-more";
    a.href = "glossary.html#" + g.id;
    a.textContent = "Full entry in the glossary →";
    wrap.appendChild(a);
  }

  const PIPE_DOC = {
    cash: "A normal cash movement down the waterfall. Each stage keeps what " +
      "it is entitled to and passes the remainder on.",
    draw: "A DRAW: the reservoir pays a shortfall the operating cash could " +
      "not cover. Money leaves the reserve to meet an obligation. Drawn " +
      "heavy and amber so it never reads like a release.",
    release: "A RELEASE: the reserve is holding more than its target " +
      "requires, so the surplus is let go and becomes available to equity. " +
      "The opposite direction of value from a draw.",
    fund: "Cash topping the reserve back up toward its target, after debt " +
      "has been served. The reserve has first call on this cash, before " +
      "shareholders.",
    carry: "An inter-period link: this is how a balance survives from one " +
      "period into the next.",
    test: "A gate rather than a flow. Cash only passes if the lock-up tests " +
      "all pass.",
    priority: "An ordering inside the debt compartment: the bucket above " +
      "must be filled before anything reaches the one below."
  };

  function kindWord(kind) {
    return ({ source: "inflow", reservoir: "reservoir — holds a level",
      compute: "within-period stage", compound: "compound compartment",
      subcompartment: "debt sub-compartment", test: "gate",
      sink: "outflow" })[kind] || kind;
  }

  /* Per-node figures for the inspector. */
  function nodeFigures(id, p, r) {
    const M = money, R = ratio;
    const t = {
      TOLL: [["Nominal toll revenue", M(r.pre.toll.nominal[p.period - 1])],
             ["Real (unindexed)", M(r.pre.toll.real[p.period - 1])],
             ["Traffic", (r.pre.traffic[p.period - 1] / 1e6).toFixed(2) + "M km"]],
      OPEX: [["Nominal OPEX", M(r.pre.opex.nominal[p.period - 1])],
             ["Real (unindexed)", M(r.pre.opex.real[p.period - 1])]],
      HM:   [["Due this period", M(p.hm.hmDue)],
             ["Peak year?", r.pre.hm.peak[p.period - 1] > 0 ? "yes" : "no"],
             ["Cycle position", r.pre.hm.counter[p.period - 1] + " of " +
               r.params.HM_Peak_Cycle]],
      TREAS_BOP: [["Brought forward", M(p.treasuryBoP)]],
      CURCASH: [["Toll revenue", M(r.pre.toll.nominal[p.period - 1])],
                ["Less operating costs", M(-r.pre.opex.nominal[p.period - 1])],
                ["Plus treasury brought forward", M(p.treasuryBoP)],
                ["Current cash", M(p.currentCash)]],
      HM_PAY: [["HM due", M(p.hm.hmDue)],
               ["Paid from cash", M(p.hm.hmFromCash)],
               ["Drawn from MRA", M(p.hm.hmFromMra)],
               ["Signal", p.hm.hmSignal || "none"]],
      CASH_AHM: [["Cash after HM", M(p.hm.cashAfterHm)]],
      MRA: [["Opening balance", M(p.mraBoP)], ["Target", M(p.mraTarget)],
            ["Drawn for HM", M(p.hm.hmFromMra)],
            ["Recharged", M(p.mra.recharge)], ["Released", M(p.mra.release)],
            ["Closing balance", M(p.mra.eop)]],
      DSRA: [["Opening balance", M(p.dsraBoP)], ["Target", M(p.dsraTarget)],
             ["Drawn for debt", M(p.debt.dsraDraw)],
             ["Recharged", M(p.dsra.recharge)], ["Released", M(p.dsra.release)],
             ["Closing balance", M(p.dsra.eop)]],
      DEBT: [["Opening debt", M(p.debt.debtBoP)],
             ["Interest accrued", M(p.debt.interestAccrued)],
             ["Debt service paid", M(p.debt.debtService)],
             ["DSCR realised", R(p.dscrRealised)],
             ["Closing debt", M(p.debt.debtEoP)],
             ["Deferred interest", M(p.debt.deferredEoP)],
             ["Signal", p.debtSignal || "none"]],
      DEBT_DEF: [["Arrears brought in", M(p.debt.deferredBoP)],
                 ["Repaid", M(p.debt.deferredPaid)],
                 ["Added (unpaid interest)", M(p.debt.deferredAddition)],
                 ["Carried out", M(p.debt.deferredEoP)]],
      DEBT_INT: [["Interest accrued", M(p.debt.interestAccrued)],
                 ["Interest paid", M(p.debt.interestPaid)],
                 ["DSRA top-up used", M(p.debt.dsraDraw)]],
      DEBT_PRIN: [["Sculpted target", M(p.debt.principalTarget)],
                  ["Actually repaid", M(p.debt.principalPaid)],
                  ["Debt remaining", M(p.debt.debtEoP)]],
      CASH_RES: [["Cash for reserves", M(p.cashForReserves)]],
      MRA_RECH: [["Contribution", M(p.mra.recharge)],
                 ["Gap to target", M(Math.max(0, p.mraTarget - p.mra.eop))]],
      DSRA_RECH: [["Contribution", M(p.dsra.recharge)],
                  ["Gap to target", M(Math.max(0, p.dsraTarget - p.dsra.eop))]],
      CASH_EQ: [["Available to equity", M(p.cashEq)],
                ["Of which MRA release", M(p.mra.release)],
                ["Of which DSRA release", M(p.dsra.release)]],
      LOCKUP: [["DSCR test", gate(p.tests.dscrOk) + "  (" + R(p.dscrRealised) +
                 " vs " + r.params.DSCR_Min.toFixed(2) + "×)"],
               ["LLCR test", gate(p.tests.llcrOk) + "  (" + R(p.llcr) +
                 " vs " + r.params.LLCR_Min.toFixed(2) + "×)"],
               ["MRA filled", gate(p.tests.mraOk)],
               ["DSRA filled", gate(p.tests.dsraOk)],
               ["Distribution allowed", gate(p.tests.allowed)]],
      DISTRIB: [["Cash available", M(p.cashEq)],
                ["Maximum permissible", M(p.distribution.maxPermissible)],
                ["Distributed", M(p.distribution.distribution)]],
      TREAS_EOP: [["Carried to next period", M(p.distribution.treasuryEoP)]]
    };
    return t[id] || [];
  }

  /* "Pass"/"Fail", not "pass"/"FAIL": the lamp colour already carries the
   * alarm, so the two words should at least be capitalised alike. */
  function gate(v) { return v === 1 ? "Pass" : "Fail"; }

  function add(parent, tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) { n.className = cls; }
    if (text !== undefined) { n.textContent = text; }
    parent.appendChild(n);
    return n;
  }

  /* --------------------------------------------------------------- */

  /* ---------------------------------------------------------------
   * navigation, Run and Step
   * --------------------------------------------------------------- */

  /* Jump to a whole period (leaves stage mode). */
  function goTo(i) {
    periodIndex = Math.max(0, Math.min(run.periods.length - 1, i));
    stage = null;
    draw();
  }

  /* --- Run: play the periods in sequence ------------------------- */

  function speedMs() { return Number(els.speed.value); }

  function play() {
    if (timer) { return; }
    stage = null;
    cascade.setRunning(true);
    cascade.setFillSpeed(Math.round(speedMs() * 0.55));
    els.run.innerHTML = "&#10073;&#10073; Pause";
    els.run.classList.remove("is-primary");
    /* If we are sitting on the last period, start over rather than stall. */
    if (periodIndex >= run.periods.length - 1) { periodIndex = 0; }
    draw();
    /* setInterval, not a loop: bounded by the period count and cleared at
     * the end. There is no convergence iteration anywhere in this app. */
    timer = setInterval(() => {
      if (periodIndex >= run.periods.length - 1) { pause(); return; }
      periodIndex++;
      draw();
    }, speedMs());
  }

  function pause() {
    if (timer) { clearInterval(timer); timer = null; }
    cascade.setRunning(false);
    cascade.setFillSpeed(500);
    els.run.innerHTML = "&#9654; Run the cascade";
    els.run.classList.add("is-primary");
  }

  function toggleRun() { timer ? pause() : play(); }

  /* --- Step: one waterfall stage at a time ---------------------- */

  function stepOnce() {
    pause();
    if (stage === null) {
      stage = 0;                                   /* enter stage mode */
    } else if (stage < WF.STAGES.length - 1) {
      stage++;                                     /* next stage, same period */
    } else if (periodIndex < run.periods.length - 1) {
      periodIndex++; stage = 0;                    /* roll into the next period */
    } else {
      return;                                      /* end of the model */
    }
    draw();
  }

  function stepBack() {
    pause();
    if (stage === null) { stage = WF.STAGES.length - 1; }
    else if (stage > 0) { stage--; }
    else if (periodIndex > 0) {
      periodIndex--; stage = WF.STAGES.length - 1;
    }
    draw();
  }

  els.run.addEventListener("click", toggleRun);
  els.step.addEventListener("click", stepOnce);
  els.reset.addEventListener("click", () => { pause(); goTo(0); });
  els.speed.addEventListener("change", () => {
    if (timer) { pause(); play(); }               /* restart at the new rate */
  });

  els.prev.addEventListener("click", () => { pause(); goTo(periodIndex - 1); });
  els.next.addEventListener("click", () => { pause(); goTo(periodIndex + 1); });
  els.first.addEventListener("click", () => { pause(); goTo(0); });
  els.last.addEventListener("click", () => { pause(); goTo(run.periods.length - 1); });
  els.scrub.addEventListener("input", () => { pause(); goTo(Number(els.scrub.value)); });

  document.addEventListener("keydown", (ev) => {
    const t = ev.target.tagName;
    if (t === "INPUT" || t === "SELECT" || t === "BUTTON") { return; }
    if (ev.key === "ArrowRight") { pause(); goTo(periodIndex + 1); }
    if (ev.key === "ArrowLeft") { pause(); goTo(periodIndex - 1); }
    if (ev.key === "." || ev.key === "]") { stepOnce(); }
    if (ev.key === "," || ev.key === "[") { stepBack(); }
    if (ev.key === " ") { ev.preventDefault(); toggleRun(); }
  });

  /* --------------------------------------------------------------- boot */

  const problems = checkLayout();
  if (problems.length) {
    els.anomaly.textContent = "Layout/graph mismatch: " + problems.join("; ");
  }
  els.scrub.max = WF.NP - 1;
  recompute(panel.get());

  /* exposed for manual poking in the console */
  window.__wf = { get run() { return run; }, cascade, panel,
                  goTo, stepOnce, stepBack, play, pause, toggleRun,
                  get periodIndex() { return periodIndex; },
                  get stage() { return stage; },
                  get running() { return timer !== null; } };
})();
