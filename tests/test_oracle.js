/* =====================================================================
 * test_oracle.js -- the million-dollar test.
 *
 * oracle_scenarios.json holds 15 scenarios, each with the yellow inputs
 * and the full 66-row x 31-period grid produced by recalculating the real
 * Excel. That grid is an EXTERNAL source of truth: it was not produced by
 * this engine, so agreeing with it is evidence, not circular reasoning.
 *
 * Comparison rules (from the oracle's own meta note):
 *   - numeric cells: tolerance 0.01 ABSOLUTE
 *   - text cells ("UNPAID", "HM UNPAID"): must match EXACTLY
 *   - oracle null == Excel blank == engine ""
 *   - a row absent from a scenario's grid means it is blank in every
 *     period; that is asserted, not skipped
 *
 * Branch coverage is measured by probing the engine's own output, not by
 * a hand-maintained table, so it cannot drift out of date.
 * ===================================================================== */

var TOL = 0.01;

/* Rows that carry text signals rather than numbers. */
var SIGNAL_ROWS = { 93: 1, 119: 1 };

/* --------------------------------------------------------------------
 * Branch coverage registry
 * ------------------------------------------------------------------ */

var COVER = {};        /* branch id -> { desc, scenarios: {name:1} } */
var COVER_ORDER = [];  /* keeps the report in a readable order */

function declareBranch(id, desc) {
  if (!COVER[id]) {
    COVER[id] = { desc: desc, scenarios: {}, count: 0 };
    COVER_ORDER.push(id);
  }
}

function hit(id, scenario) {
  if (COVER[id] && !COVER[id].scenarios[scenario]) {
    COVER[id].scenarios[scenario] = 1;
    COVER[id].count++;
  }
}

/* Declared up front so a branch NOTHING exercises still shows in the
 * report as uncovered -- that is exactly what we need to see. */
function declareAllBranches() {
  declareBranch("sizeDebt/auto", "sizeDebt: auto PV sizing mode");
  declareBranch("sizeDebt/manual", "sizeDebt: manual Debt_Nominal mode");
  declareBranch("computeHm/peak", "computeHm: a peak year occurs");
  declareBranch("computeHm/flat", "computeHm: a non-peak year occurs");

  declareBranch("payHM/fromCashOnly", "payHM: cash covers HM alone");
  declareBranch("payHM/mraDraw", "payHM: MRA drawn for the shortfall");
  declareBranch("payHM/signal", "payHM: HM UNPAID signal fires");
  declareBranch("payHM/negCash", "payHM: current cash is negative");

  declareBranch("principalTarget/sculpt", "principalTarget: sculpted to DSCR");
  declareBranch("principalTarget/atEnd", "principalTarget: forced residual AT window end");
  declareBranch("principalTarget/past", "principalTarget: past the window, zero");
  declareBranch("principalTarget/zero", "principalTarget: interest exceeds target, zero");
  declareBranch("principalTarget/capped", "principalTarget: capped by outstanding balance");

  declareBranch("serviceDebt/dsraDraw", "serviceDebt: DSRA drawn to top up");
  declareBranch("serviceDebt/deferredPaid", "serviceDebt: deferred interest repaid");
  declareBranch("serviceDebt/deferredBuilds", "serviceDebt: deferred interest accumulates");
  declareBranch("serviceDebt/interestShort", "serviceDebt: interest only partly paid");
  declareBranch("serviceDebt/principalStarved", "serviceDebt: target>0 but no cash for principal");
  declareBranch("serviceDebt/fullyRepaid", "serviceDebt: debt reaches zero");

  declareBranch("dscrRealised/blank", "dscrRealised: blank when no service paid");
  declareBranch("dscrRealised/number", "dscrRealised: numeric");
  declareBranch("debtSignal/unpaid", "debtSignal: UNPAID raised");
  declareBranch("debtSignal/clean", "debtSignal: silent");

  declareBranch("mraTarget/zero", "mraTarget: target is zero (MRA disabled)");
  declareBranch("mraTarget/positive", "mraTarget: positive target");
  declareBranch("reserve/mraRecharge", "rechargeReserve: MRA recharged");
  declareBranch("reserve/mraRelease", "rechargeReserve: MRA surplus released");
  declareBranch("reserve/mraDrawn", "rechargeReserve: MRA had been drawn");
  declareBranch("reserve/dsraRecharge", "rechargeReserve: DSRA recharged");
  declareBranch("reserve/dsraRelease", "rechargeReserve: DSRA surplus released");
  declareBranch("reserve/dsraDrawn", "rechargeReserve: DSRA had been drawn");

  declareBranch("dsraTarget/zero", "dsraTarget: zero (no debt left)");
  declareBranch("dsraTarget/positive", "dsraTarget: positive scheduled service");

  declareBranch("llcr/blank", "llcr: blank while there is no debt");
  declareBranch("llcr/number", "llcr: numeric");

  declareBranch("lockup/pass", "lockupTests: all four gates pass");
  declareBranch("lockup/dscrBlocks", "lockupTests: DSCR gate blocks");
  declareBranch("lockup/llcrBlocks", "lockupTests: LLCR gate blocks");
  declareBranch("lockup/mraBlocks", "lockupTests: MRA fill gate blocks");
  declareBranch("lockup/dsraBlocks", "lockupTests: DSRA fill gate blocks");

  declareBranch("distribute/paid", "distribute: a distribution is made");
  declareBranch("distribute/lockedOut", "distribute: blocked by lock-up");
  declareBranch("distribute/capBinds", "distribute: allowed but cap reduces it");
  declareBranch("distribute/negTreasury", "distribute: treasury carried forward negative");
  declareBranch("distribute/trapped", "distribute: cash trapped in treasury");
}

/* Walk one engine run and record which branches it actually exercised. */
function probeCoverage(name, run) {
  var params = run.params, i, p, d;

  hit(params.Sizing_Mode === 1 ? "sizeDebt/auto" : "sizeDebt/manual", name);

  for (i = 0; i < run.periods.length; i++) {
    p = run.periods[i];
    d = p.debt;

    if (run.pre.hm.peak[i] > 0) { hit("computeHm/peak", name); }
    else { hit("computeHm/flat", name); }

    /* payHM */
    if (p.hm.hmFromMra > 0.005) { hit("payHM/mraDraw", name); }
    else if (p.hm.hmDue > 0) { hit("payHM/fromCashOnly", name); }
    if (p.hm.hmSignal !== "") { hit("payHM/signal", name); }
    if (p.currentCash < 0) { hit("payHM/negCash", name); }

    /* principalTarget branches, reconstructed from the period's figures */
    if (p.period > params.Debt_Duration) {
      hit("principalTarget/past", name);
    } else if (p.period === params.Debt_Duration) {
      if (d.debtBoP > 0.5) { hit("principalTarget/atEnd", name); }
    } else if (d.principalTarget <= 0) {
      hit("principalTarget/zero", name);
    } else if (Math.abs(d.principalTarget - d.debtBoP) < 0.005 && d.debtBoP > 0.5) {
      hit("principalTarget/capped", name);
    } else if (d.principalTarget > 0) {
      hit("principalTarget/sculpt", name);
    }

    /* serviceDebt */
    if (d.dsraDraw > 0.005) { hit("serviceDebt/dsraDraw", name); }
    if (d.deferredPaid > 0.005) { hit("serviceDebt/deferredPaid", name); }
    if (d.deferredEoP > 0.5) { hit("serviceDebt/deferredBuilds", name); }
    if (d.interestPaid < d.interestAccrued - 0.005) { hit("serviceDebt/interestShort", name); }
    if (d.principalTarget > 0.005 && d.principalPaid < 0.005) {
      hit("serviceDebt/principalStarved", name);
    }
    if (d.debtBoP > 0.5 && d.debtEoP <= 0.5) { hit("serviceDebt/fullyRepaid", name); }

    if (p.dscrRealised === "") { hit("dscrRealised/blank", name); }
    else { hit("dscrRealised/number", name); }
    if (p.debtSignal !== "") { hit("debtSignal/unpaid", name); }
    else { hit("debtSignal/clean", name); }

    /* reserves */
    if (p.mraTarget <= 0.005) { hit("mraTarget/zero", name); }
    else { hit("mraTarget/positive", name); }
    if (p.mra.recharge > 0.005) { hit("reserve/mraRecharge", name); }
    if (p.mra.release > 0.005) { hit("reserve/mraRelease", name); }
    if (p.hm.hmFromMra > 0.005) { hit("reserve/mraDrawn", name); }
    if (p.dsra.recharge > 0.005) { hit("reserve/dsraRecharge", name); }
    if (p.dsra.release > 0.005) { hit("reserve/dsraRelease", name); }
    if (d.dsraDraw > 0.005) { hit("reserve/dsraDrawn", name); }
    if (p.dsraTarget <= 0.005) { hit("dsraTarget/zero", name); }
    else { hit("dsraTarget/positive", name); }

    if (p.llcr === "") { hit("llcr/blank", name); }
    else { hit("llcr/number", name); }

    /* lock-up */
    if (p.tests.allowed === 1) { hit("lockup/pass", name); }
    if (p.tests.dscrOk === 0) { hit("lockup/dscrBlocks", name); }
    if (p.tests.llcrOk === 0) { hit("lockup/llcrBlocks", name); }
    if (p.tests.mraOk === 0) { hit("lockup/mraBlocks", name); }
    if (p.tests.dsraOk === 0) { hit("lockup/dsraBlocks", name); }

    /* distribution */
    if (p.distribution.distribution > 0.005) { hit("distribute/paid", name); }
    if (p.tests.allowed === 0) { hit("distribute/lockedOut", name); }
    if (p.tests.allowed === 1 && p.cashEq > 0.005 &&
        p.distribution.distribution < p.cashEq - 0.005) {
      hit("distribute/capBinds", name);
    }
    if (p.distribution.treasuryEoP < -0.005) { hit("distribute/negTreasury", name); }
    if (p.distribution.treasuryEoP > 0.005) { hit("distribute/trapped", name); }
  }
}

/* --------------------------------------------------------------------
 * Cell comparison
 * ------------------------------------------------------------------ */

/* Turn the oracle's stored cell into the shape the engine emits.
 * Oracle null == Excel blank == engine "". */
function oracleCell(v) {
  return (v === null || v === undefined) ? "" : v;
}

/* Compare one row across 31 periods.
 * Returns { ok, diffs:[{period, expected, actual, diff}], worst }. */
function compareRow(rowNum, expectedValues, actualVec) {
  var diffs = [], worst = 0, i, ev, av, d, isSignal = !!SIGNAL_ROWS[rowNum];

  for (i = 0; i < 31; i++) {
    ev = oracleCell(expectedValues ? expectedValues[i] : null);
    av = (actualVec === undefined || actualVec === null) ? undefined : actualVec[i];

    if (av === undefined) {
      diffs.push({ period: i + 1, expected: ev, actual: "(missing row)", diff: null });
      continue;
    }

    if (typeof ev === "string") {
      /* blank or a text signal -- must match exactly */
      if (av !== ev) {
        /* A numeric 0 where Excel is blank is still a mismatch for signal
         * rows, but for numeric rows the oracle only stores blank where the
         * engine also returns "". Report it either way. */
        diffs.push({ period: i + 1, expected: ev, actual: av, diff: null });
      }
    } else if (isSignal) {
      diffs.push({ period: i + 1, expected: ev, actual: av, diff: null });
    } else {
      if (typeof av !== "number" || isNaN(av) || !isFinite(av)) {
        diffs.push({ period: i + 1, expected: ev, actual: av, diff: null });
      } else {
        d = Math.abs(av - ev);
        if (d > worst) { worst = d; }
        if (d > TOL) {
          diffs.push({ period: i + 1, expected: ev, actual: av, diff: d });
        }
      }
    }
  }
  return { ok: diffs.length === 0, diffs: diffs, worst: worst };
}

/* --------------------------------------------------------------------
 * The scenario sweep
 * ------------------------------------------------------------------ */

function runOracleTests() {
  declareAllBranches();

  var scenarios = ORACLE_DATA.scenarios;
  var s, si, run, grid, rowNum, res, cellsChecked = 0, worstOverall = 0;
  var scenarioReport = [];
  var unionRows = {}, ur;

  /* the union of rows any scenario stores -- absent rows must be blank */
  for (si = 0; si < scenarios.length; si++) {
    for (rowNum in scenarios[si].grid) {
      if (scenarios[si].grid.hasOwnProperty(rowNum)) { unionRows[rowNum] = 1; }
    }
  }

  T.emit("");
  T.emit(T.rep("=", 72));
  T.emit("ORACLE: " + scenarios.length + " scenarios, tolerance " + TOL +
    " absolute, text exact");
  T.emit(T.rep("=", 72));

  for (si = 0; si < scenarios.length; si++) {
    s = scenarios[si];
    T.suite("ORACLE " + s.name);
    T.emit("        " + s.description);
    T.emit("        exercises: " + s.exercises);

    run = WF.runAll(s.params);
    probeCoverage(s.name, run);
    grid = run.grid;

    /* fail loud before anything else */
    T.eq("no NaN/Infinity in the grid", run.anomalies.length, 0);

    var scenarioFails = 0, scenarioWorst = 0, rowsChecked = 0;
    var firstDivergence = null;

    for (ur in unionRows) {
      if (!unionRows.hasOwnProperty(ur)) { continue; }
      rowNum = Number(ur);
      var oracleRow = s.grid[ur];
      /* A row absent from THIS scenario means Excel left it blank in every
       * period. Assert that rather than skipping it. */
      var expectedValues = oracleRow ? oracleRow.values : null;
      res = compareRow(rowNum, expectedValues, grid[rowNum]);
      rowsChecked++;
      cellsChecked += 31;
      if (res.worst > scenarioWorst) { scenarioWorst = res.worst; }
      if (!res.ok) {
        scenarioFails += res.diffs.length;
        if (!firstDivergence) {
          firstDivergence = { row: rowNum, d: res.diffs[0],
            label: oracleRow ? oracleRow.label : "(blank row)" };
        }
      }
    }

    if (scenarioWorst > worstOverall) { worstOverall = scenarioWorst; }

    if (scenarioFails === 0) {
      T.record(s.name + ": all " + rowsChecked + " rows x 31 periods match",
        true);
      T.emit("        worst absolute divergence: " + T.fmt(scenarioWorst));
    } else {
      /* Report the exact diverging cell and by how much -- the guardrail
       * requires the location, not just a count. */
      T.record(s.name + ": " + scenarioFails + " diverging cells", false,
        "first at row " + firstDivergence.row + " (" + firstDivergence.label +
        ") period " + firstDivergence.d.period +
        ": expected " + T.fmt(firstDivergence.d.expected) +
        ", got " + T.fmt(firstDivergence.d.actual) +
        (firstDivergence.d.diff === null ? "" : " (diff " + T.fmt(firstDivergence.d.diff) + ")"));

      /* then a bounded dump of the worst offenders, per row */
      var shown = 0;
      for (ur in unionRows) {
        if (!unionRows.hasOwnProperty(ur) || shown >= 12) { continue; }
        rowNum = Number(ur);
        res = compareRow(rowNum, s.grid[ur] ? s.grid[ur].values : null, grid[rowNum]);
        if (!res.ok) {
          T.emit("        row " + rowNum + " (" +
            (s.grid[ur] ? s.grid[ur].label : "blank") + "): " +
            res.diffs.length + " cells, first at period " +
            res.diffs[0].period + " expected " + T.fmt(res.diffs[0].expected) +
            " got " + T.fmt(res.diffs[0].actual));
          shown++;
        }
      }
    }

    scenarioReport.push({
      name: s.name, fails: scenarioFails, worst: scenarioWorst,
      exercises: s.exercises
    });
  }

  T.emit("");
  T.emit(T.rep("=", 72));
  T.emit("ORACLE SUMMARY -- " + cellsChecked + " cells compared");
  T.emit(T.rep("=", 72));
  var passCount = 0;
  for (si = 0; si < scenarioReport.length; si++) {
    var sr = scenarioReport[si];
    if (sr.fails === 0) { passCount++; }
    T.emit("  " + (sr.fails === 0 ? "PASS" : "FAIL") + "  " +
      pad(sr.name, 26) + "  worst diff " + pad(T.fmt(sr.worst), 12) +
      (sr.fails === 0 ? "" : "  (" + sr.fails + " cells)"));
  }
  T.emit("");
  T.emit("  " + passCount + " / " + scenarioReport.length +
    " scenarios reproduce the Excel exactly within " + TOL);
  T.emit("  worst absolute divergence across every scenario: " +
    T.fmt(worstOverall));

  return { passCount: passCount, total: scenarioReport.length,
           cells: cellsChecked, worst: worstOverall };
}

function pad(s, n) {
  s = String(s);
  while (s.length < n) { s += " "; }
  return s;
}

/* --------------------------------------------------------------------
 * Coverage report
 * ------------------------------------------------------------------ */

function reportCoverage() {
  var i, id, c, covered = 0, uncovered = [];
  T.emit("");
  T.emit(T.rep("=", 72));
  T.emit("BRANCH COVERAGE (probed from engine output, not hand-maintained)");
  T.emit(T.rep("=", 72));
  for (i = 0; i < COVER_ORDER.length; i++) {
    id = COVER_ORDER[i];
    c = COVER[id];
    if (c.count > 0) {
      covered++;
      T.emit("  HIT  " + pad(id, 34) + " x" + pad(c.count, 4) +
        " " + firstFew(c.scenarios, 3));
    } else {
      uncovered.push(id);
    }
  }
  T.emit("");
  for (i = 0; i < uncovered.length; i++) {
    T.emit("  ---  " + pad(uncovered[i], 34) + " NOT covered by any oracle scenario");
  }
  T.emit("");
  T.emit("  " + covered + " / " + COVER_ORDER.length +
    " branches exercised by the 15 oracle scenarios");
  return { covered: covered, total: COVER_ORDER.length, uncovered: uncovered };
}

function firstFew(obj, n) {
  var out = [], k, i = 0;
  for (k in obj) {
    if (!obj.hasOwnProperty(k)) { continue; }
    if (i < n) { out.push(k.substring(0, 3)); }
    i++;
  }
  return out.join(",") + (i > n ? ",+" + (i - n) : "");
}
