/* =====================================================================
 * engine.js -- Project-finance SPV cash-flow waterfall.
 *
 * Pure calculation. No DOM, no globals beyond the single WF namespace.
 * Deterministic: Random_Weight is forced to 0, there is no randomness.
 *
 * SOURCE OF TRUTH: projet_vibe-coding.xlsx / Feuil1, formulas extracted
 * from the file (not from prose). Excel row numbers appear in comments as
 * [R###] so every line can be traced back. oracle_scenarios.json is the
 * external check that this reproduces the real model.
 *
 * There is NO fixed-point iteration in this model. Every period is a
 * direct forward computation from the previous period's balances, so no
 * function here contains an unbounded loop.
 *
 * STYLE: deliberately ES5-safe (var, plain for loops, no Array.prototype
 * .map/.forEach, no Object.keys). This exact file runs unmodified under
 * both cscript //E:JScript (the CLI test harness) and any browser.
 * ===================================================================== */

var WF = (function () {
  "use strict";

  /* Number of period columns in Feuil1 (N..AR). Fixed by the workbook. */
  var NP = 31;

  /* The Excel's HM peak counter, Feuil1!46, is =IF(prev=5,1,prev+1) -- the 5
   * is HARDCODED, and HM_Peak_Cycle is only compared against that counter in
   * Feuil1!47. In the workbook the parameter therefore selects which slot of
   * a fixed five-year cycle carries the peak, so a cycle of 15 gives no peak
   * at all rather than a peak every 15 years.
   *
   * DELIBERATE DEVIATION, requested by the user: the counter cycles on
   * HM_Peak_Cycle itself, so the parameter means what its name says -- a
   * heavy-maintenance peak every N years.
   *
   * This does not weaken the oracle. At HM_Peak_Cycle = 5 the counter
   * sequence is bit-identical to the workbook's (1,2,3,4,5,1,...) and the
   * peak still lands on periods 5,10,15,..., which is what all 15 oracle
   * scenarios use. The two only differ for cycle != 5, which the oracle
   * never exercises. See ENGINE_NOTES.md section 1. */
  var EXCEL_HM_COUNTER_PERIOD = 5;  /* kept for the compatibility test */

  /* ---------------------------------------------------------------
   * Defaults / parameter handling
   * --------------------------------------------------------------- */

  var DEFAULTS = {
    Year_Base: 2026,
    Num_Periods: 30,
    Traffic_Base: 25000000,
    Random_Weight: 0,      /* forced to 0 below; determinism is a requirement */
    Volatility_Range: 1.2, /* inert while Random_Weight is 0 */
    Tariff_km: 0.15,
    CPI: 0.015,
    OPEX_Base: 750000,
    HM_Base: 150000,
    HM_Peak_Cycle: 5,
    HM_Peak_Amount: 1000000,
    Debt_Nominal: 3000000,
    Interest_Rate: 0.05,
    Debt_Duration: 20,
    Sizing_Mode: 1,
    DSCR: 1.2,
    MRA_Coef_N: 1,
    MRA_Coef_N1: 0.5,
    MRA_Coef_N2: 0.25,
    LLCR_Min: 1.1,
    DSCR_Distrib: 1.05,
    DSCR_Min: 1.2
  };

  var PARAM_NAMES = [
    "Year_Base", "Num_Periods", "Traffic_Base", "Random_Weight",
    "Volatility_Range", "Tariff_km", "CPI", "OPEX_Base", "HM_Base",
    "HM_Peak_Cycle", "HM_Peak_Amount", "Debt_Nominal", "Interest_Rate",
    "Debt_Duration", "Sizing_Mode", "DSCR", "MRA_Coef_N", "MRA_Coef_N1",
    "MRA_Coef_N2", "LLCR_Min", "DSCR_Distrib", "DSCR_Min"
  ];

  /* Fill in any missing parameter from DEFAULTS and force determinism. */
  function normaliseParams(p) {
    var out = {}, i, k;
    p = p || {};
    for (i = 0; i < PARAM_NAMES.length; i++) {
      k = PARAM_NAMES[i];
      out[k] = (p[k] === undefined || p[k] === null) ? DEFAULTS[k] : Number(p[k]);
    }
    out.Random_Weight = 0; /* non-negotiable: no random toggle */
    return out;
  }

  /* ---------------------------------------------------------------
   * Small Excel-semantics helpers
   * --------------------------------------------------------------- */

  /* An out-of-range Excel cell reads as blank, i.e. 0 in arithmetic. */
  function cell(vec, idx) {
    return (idx < 0 || idx >= vec.length || vec[idx] === undefined) ? 0 : vec[idx];
  }

  function isBad(x) {
    return typeof x === "number" && (isNaN(x) || !isFinite(x));
  }

  function newVec(n, fill) {
    var v = [], i;
    for (i = 0; i < n; i++) { v.push(fill); }
    return v;
  }

  /* =================================================================
   * LAYER 1 -- precomputed vectors.
   * These depend only on the parameters, never on cascade state, so the
   * whole 31-period vector can be built before the waterfall runs.
   * ================================================================= */

  /* [R16] Calculated traffic. With Random_Weight = 0 the RAND() term is
   * multiplied out entirely and this is INT(Traffic_Base) every period. */
  function computeTraffic(params) {
    var v = [], i;
    for (i = 0; i < NP; i++) {
      v.push(Math.floor(params.Traffic_Base * (1 - params.Random_Weight)));
    }
    return v;
  }

  /* [R24,R36,R55] Indexation coefficient: 1 in period 1, then compounding.
   * Period n therefore carries (1+CPI)^(n-1). */
  function indexVector(cpi) {
    var v = [1], i;
    for (i = 1; i < NP; i++) { v.push(v[i - 1] * (1 + cpi)); }
    return v;
  }

  /* [R23,R35,R54] Year header rows.
   * CAREFUL: in Feuil1 these rows carry the label "CPI" in column C and the
   * CPI lever in column L, but their PERIOD columns hold the year:
   * =$L$2 then =IF(prev+1<=$L$3, prev+1, "") where L3 = Year_Base+Num_Periods.
   * They are display rows, and they are the ONLY place Num_Periods reaches
   * the grid -- no calculation row references it.
   *
   * Divergence deliberately NOT reproduced: past the horizon Excel feeds a
   * blank into +1 and cascades #VALUE! errors. Emitting "" is the useful
   * behaviour; propagating a spreadsheet error is not. Untested by the
   * oracle either way, since all 15 scenarios use Num_Periods = 30 and so
   * never reach the horizon. */
  function yearHeader(params) {
    var v = [], i, y;
    var last = params.Year_Base + params.Num_Periods;
    for (i = 0; i < NP; i++) {
      y = params.Year_Base + i;
      v.push(i === 0 ? y : (y <= last ? y : ""));
    }
    return v;
  }

  /* [R20] real toll, [R27] nominal toll. */
  function computeToll(params, traffic, index) {
    var real = [], nominal = [], i;
    for (i = 0; i < NP; i++) {
      real.push(traffic[i] * params.Tariff_km);
      nominal.push(real[i] * index[i]);
    }
    return { real: real, nominal: nominal };
  }

  /* [R32] real OPEX (flat), [R39] nominal OPEX. */
  function computeOpex(params, index) {
    var real = [], nominal = [], i;
    for (i = 0; i < NP; i++) {
      real.push(params.OPEX_Base);
      nominal.push(real[i] * index[i]);
    }
    return { real: real, nominal: nominal };
  }

  /* [R46] The peak counter: 1..cycle, wrapping. At cycle = 5 this is exactly
   * the workbook's hardcoded sequence; for any other cycle it generalises it
   * (see EXCEL_HM_COUNTER_PERIOD above).
   * A cycle below 1 is clamped, so the counter can never fail to wrap. */
  function hmPeakCounter(cycle) {
    var v = [1], i;
    cycle = (cycle >= 1) ? Math.floor(cycle) : 1;
    for (i = 1; i < NP; i++) {
      v.push(v[i - 1] >= cycle ? 1 : v[i - 1] + 1);
    }
    return v;
  }

  /* [R44] base, [R47] peak, [R51] real HM, [R58] nominal HM.
   * Feuil1!47 is =HM_Peak_Amount*(counter=HM_Peak_Cycle); in Excel the
   * comparison yields TRUE/FALSE which multiplies as 1/0. The peak therefore
   * lands on the last period of each cycle. */
  function computeHm(params, index) {
    /* clamp once, and compare against the SAME clamped value the counter
     * used -- otherwise a fractional cycle would wrap but never match */
    var cycle = (params.HM_Peak_Cycle >= 1)
      ? Math.floor(params.HM_Peak_Cycle) : 1;
    var counter = hmPeakCounter(cycle);
    var peak = [], real = [], nominal = [], i, isPeak;
    for (i = 0; i < NP; i++) {
      isPeak = (counter[i] === cycle) ? 1 : 0;
      peak.push(params.HM_Peak_Amount * isPeak);
      real.push(params.HM_Base + peak[i]);
      nominal.push(real[i] * index[i]);
    }
    return { counter: counter, peak: peak, real: real, nominal: nominal };
  }

  /* [R72] CFADS = Toll - OPEX - HM, all nominal. Reference metric: it sizes
   * and sculpts the debt and drives LLCR. It is NOT the operational cash
   * flow -- the real money movement is the cascade in Layer 2.
   * [R73] CFADS at DSCR target = CFADS / DSCR. */
  function computeCfads(tollNominal, opexNominal, hmNominal, dscr) {
    var cfads = [], target = [], i;
    for (i = 0; i < NP; i++) {
      cfads.push(tollNominal[i] - opexNominal[i] - hmNominal[i]);
      target.push(cfads[i] / dscr);
    }
    return { cfads: cfads, target: target };
  }

  /* [R76] Principal max = PV of the DSCR-target CFADS over the debt window,
   * discounted at the debt rate: SUMPRODUCT(R73 * (period<=Duration)
   * / (1+r)^period). Note the discount exponent is the period index itself,
   * so period 1 is already discounted one year.
   * [R77] Principal used = auto (R76) or the manual nominal.
   * Returns both so the UI can show the computed figure as read-only. */
  function sizeDebt(params, cfadsTarget) {
    var pv = 0, k;
    for (k = 1; k <= NP; k++) {
      if (k <= params.Debt_Duration) {
        pv += cfadsTarget[k - 1] / Math.pow(1 + params.Interest_Rate, k);
      }
    }
    return {
      principalMax: pv,
      principalUsed: (params.Sizing_Mode === 1) ? pv : params.Debt_Nominal
    };
  }

  /* Build every Layer 1 vector in one call. */
  function precompute(params) {
    var index = indexVector(params.CPI);
    var traffic = computeTraffic(params);
    var toll = computeToll(params, traffic, index);
    var opex = computeOpex(params, index);
    var hm = computeHm(params, index);
    var cf = computeCfads(toll.nominal, opex.nominal, hm.nominal, params.DSCR);
    var debt = sizeDebt(params, cf.target);
    return {
      years: yearHeader(params),
      index: index, traffic: traffic, toll: toll, opex: opex, hm: hm,
      cfads: cf.cfads, cfadsTarget: cf.target,
      principalMax: debt.principalMax, principalUsed: debt.principalUsed
    };
  }

  /* =================================================================
   * LAYER 2 -- within-period stages, in waterfall order.
   * Every function is pure: inputs in, plain object out. These are also
   * the units the UI's Step-through walks through.
   * ================================================================= */

  /* [R115] Current cash = Toll - OPEX + Treasury brought forward. */
  function currentCash(tollNominal, opexNominal, treasuryBoP) {
    return tollNominal - opexNominal + treasuryBoP;
  }

  /* [R116,R117,R118,R119] HM has contractual priority over debt.
   * Pay from current cash first, draw the shortfall from the MRA.
   * Signal fires when the two together still fall short of what is due.
   * Note cashAfterHm can be negative: R118 is R115-R117 with no floor. */
  function payHM(cash, hmDue, mraBoP) {
    var usable = Math.max(0, cash);
    var fromCash = Math.min(usable, hmDue);                        /* R117 */
    var fromMra = Math.min(mraBoP, Math.max(0, hmDue - usable));   /* R116 */
    return {
      hmDue: hmDue,
      hmFromCash: fromCash,
      hmFromMra: fromMra,
      cashAfterHm: cash - fromCash,                                /* R118 */
      /* R119 uses a 0.01 tolerance so float dust does not raise a signal. */
      hmSignal: (fromCash + fromMra < hmDue - 0.01) ? "HM UNPAID" : ""
    };
  }

  /* [R86] Principal target, sculpted to the DSCR target.
   * Three branches: past the window pay nothing; exactly AT the final
   * window period force the whole residual to fall due; otherwise sculpt
   * so that CFADS/DSCR covers interest + principal. */
  function principalTarget(period, debtBoP, cfadsTargetN, interestAccrued, duration) {
    if (period > duration) { return 0; }
    if (period === duration) { return debtBoP; }
    return Math.max(0, Math.min(debtBoP, cfadsTargetN - interestAccrued));
  }

  /* [R79-R91] Debt service, strict internal priority:
   *      deferred interest -> current interest -> principal.
   * The DSRA may only top up deferred + interest [R83]; principal is paid
   * from cash alone [R87]. Deferred interest is non-capitalising: unpaid
   * current interest moves to the deferred balance and does not itself
   * bear interest [R88,R89]. */
  function serviceDebt(period, debtBoP, deferredBoP, cashAfterHm, dsraBoP,
                       cfadsTargetN, params) {
    var rate = params.Interest_Rate;

    var interestAccrued = debtBoP * rate;                              /* R80 */

    /* R83: top up only what deferred+interest needs beyond available cash,
     * capped by the DSRA balance. */
    var dsraDraw = Math.max(0, Math.min(
      dsraBoP, (deferredBoP + interestAccrued) - cashAfterHm));        /* R83 */

    var pot = cashAfterHm + dsraDraw;

    var deferredPaid = Math.max(0, Math.min(deferredBoP, pot));        /* R84 */
    var interestPaid = Math.max(0, Math.min(
      interestAccrued, pot - deferredPaid));                          /* R85 */

    var target = principalTarget(period, debtBoP, cfadsTargetN,
      interestAccrued, params.Debt_Duration);                          /* R86 */

    /* R87: principal from cash only -- dsraDraw is deliberately absent. */
    var principalPaid = Math.max(0, Math.min(target, debtBoP,
      cashAfterHm - deferredPaid - interestPaid));                     /* R87 */

    var deferredAddition = interestAccrued - interestPaid;             /* R88 */
    var deferredEoP = deferredBoP - deferredPaid + deferredAddition;   /* R89 */
    var debtEoP = debtBoP - principalPaid;                             /* R90 */
    var debtService = deferredPaid + interestPaid + principalPaid;     /* R91 */

    return {
      debtBoP: debtBoP, deferredBoP: deferredBoP,
      cashForDebt: cashAfterHm,                                        /* R82 */
      interestAccrued: interestAccrued,
      dsraDraw: dsraDraw,
      deferredPaid: deferredPaid,
      interestPaid: interestPaid,
      principalTarget: target,
      principalPaid: principalPaid,
      deferredAddition: deferredAddition,
      deferredEoP: deferredEoP,
      debtEoP: debtEoP,
      debtService: debtService
    };
  }

  /* [R92] DSCR realised. Blank, not a division by zero, when nothing was
   * paid -- Excel returns "" and the lock-up test handles that case. */
  function dscrRealised(cfadsN, debtService) {
    return (debtService === 0) ? "" : cfadsN / debtService;
  }

  /* [R93] Debt signal. The 0.5 threshold is Excel's rounding guard against
   * a few cents of residual reading as unpaid debt. */
  function debtSignal(period, duration, debtEoP, deferredEoP) {
    if (period >= duration && (debtEoP > 0.5 || deferredEoP > 0.5)) {
      return "UNPAID";
    }
    return "";
  }

  /* [R95] MRA target: a weighted look-ahead at the next three HM bills.
   * Periods past the end of the model read as blank, i.e. 0. */
  function mraTarget(hmNominal, idx, params) {
    return params.MRA_Coef_N * cell(hmNominal, idx)
         + params.MRA_Coef_N1 * cell(hmNominal, idx + 1)
         + params.MRA_Coef_N2 * cell(hmNominal, idx + 2);
  }

  /* [R99,R100,R101] and [R107,R108,R110] -- ONE mechanism, used for both
   * the MRA and the DSRA. Recharge toward the target from available cash,
   * release anything above the target, floor the balance at 0.
   * `draw` is what the reservoir already paid out this period.
   * Note the release is computed on the post-recharge balance, so an
   * over-target reservoir releases even when nothing was recharged. */
  function rechargeReserve(cashAvailable, bop, draw, target) {
    var afterDraw = bop - draw;
    var recharge = Math.max(0, Math.min(
      Math.max(0, cashAvailable), target - afterDraw));
    var release = Math.max(0, (afterDraw + recharge) - target);
    var eop = Math.max(0, afterDraw + recharge - release);
    return { recharge: recharge, release: release, eop: eop };
  }

  /* [R103] DSRA target = next period's SCHEDULED debt service, i.e.
   *   Debt EoP * rate + Principal target(N+1).
   * "Scheduled" matters: it is computed without reference to next period's
   * treasury or cash, which is exactly what keeps the period acyclic and
   * lets this whole model run as a single forward pass.
   *
   * The final period is a special case: Feuil1!AR103 is a hardcoded "=0",
   * not the formula. There is no period 32 to reserve against, so the
   * reserve requirement is released entirely. */
  function dsraTarget(period, debtEoP, cfadsTarget, params) {
    var nextIdx = period; /* 0-based index of period+1 */
    var nextDebtBoP, nextInterest, nextPrincipalTarget;
    if (nextIdx >= NP) { return 0; }
    nextDebtBoP = debtEoP;
    nextInterest = nextDebtBoP * params.Interest_Rate;
    nextPrincipalTarget = principalTarget(period + 1, nextDebtBoP,
      cell(cfadsTarget, nextIdx), nextInterest, params.Debt_Duration);
    return debtEoP * params.Interest_Rate + nextPrincipalTarget;
  }

  /* [R123] LLCR = (treasury brought forward + PV of the CFADS still to come
   * inside the debt window) / debt outstanding. Blank while there is no
   * debt. Discount exponent is (k - period + 1), so the current period's
   * own CFADS is already discounted one year. */
  function llcr(period, treasuryBoP, debtBoP, cfads, params) {
    var pv = 0, k;
    if (debtBoP <= 0.5) { return ""; }
    for (k = period; k <= NP; k++) {
      if (k <= params.Debt_Duration) {
        pv += cfads[k - 1] / Math.pow(1 + params.Interest_Rate, k - period + 1);
      }
    }
    return (treasuryBoP + pv) / debtBoP;
  }

  /* Ratio-comparison epsilon for the DSCR/LLCR gates.
   *
   * WHY THIS EXISTS -- measured, not assumed. In a sculpted period the debt
   * service comes out equal to CFADS/DSCR, so DSCR realised is
   *      CFADS / (CFADS / DSCR)
   * and that division ROUND-TRIP is not exact in IEEE 754: it lands one ULP
   * low. Verified on scenario S13 period 10, where debt service equals the
   * CFADS target to the bit and DSCR realised is still 1.2 - 2.220446e-16.
   * DSCR_Min sits at exactly that same 1.2, so a bare >= makes the lock-up
   * outcome hinge on a single ULP: the same economic period passes or fails
   * on float dust. (LibreOffice hides this by snapping near-clean arithmetic
   * results, which is why the oracle stores a clean 1.2 and reads the gate
   * as passed. S06 period 13 shows the same one-ULP gap.)
   *
   * 1e-9 is ~2e-8 of the smallest DSCR_Min slider step (0.05), so it cannot
   * mask any economically meaningful shortfall, while sitting seven orders of
   * magnitude above the dust it exists to absorb. */
  var RATIO_EPS = 1e-9;

  /* [R124-R128] The four lock-up gates. All four must pass to distribute.
   * Two deliberate escapes from the Excel: a period with no debt service
   * passes the DSCR test, and a period with no debt passes the LLCR test --
   * otherwise a fully repaid project could never distribute.
   * The 0.5 slack on the fill tests is Excel's own, and absorbs rounding
   * on the reserve balances. */
  function lockupTests(debtService, dscrReal, debtBoP, llcrVal,
                       mraEoP, mraTargetVal, dsraEoP, dsraTargetVal, params) {
    var dscrOk = (debtService === 0)
      ? 1 : (dscrReal >= params.DSCR_Min - RATIO_EPS ? 1 : 0);
    var llcrOk = (debtBoP <= 0.5)
      ? 1 : (llcrVal >= params.LLCR_Min - RATIO_EPS ? 1 : 0);
    var mraOk = (mraEoP >= mraTargetVal - 0.5) ? 1 : 0;
    var dsraOk = (dsraEoP >= dsraTargetVal - 0.5) ? 1 : 0;
    return {
      dscrOk: dscrOk, llcrOk: llcrOk, mraOk: mraOk, dsraOk: dsraOk,
      allowed: (dscrOk && llcrOk && mraOk && dsraOk) ? 1 : 0
    };
  }

  /* [R129,R130,R131] Distribution.
   * The cap leaves a post-distribution buffer of (DSCR_Distrib-1) x debt
   * service behind. Whatever is not distributed is trapped in treasury and
   * comes back next period.
   * Treasury EoP is NOT floored at 0 -- Feuil1!131 is a bare subtraction,
   * unlike every reserve row. A negative treasury is the model's way of
   * carrying a cash deficit forward. */
  function distribute(cashEq, allowed, debtService, dscrDistrib) {
    var maxPermissible = Math.max(0, cashEq - (dscrDistrib - 1) * debtService);
    var distribution = allowed === 1
      ? Math.min(Math.max(0, cashEq), maxPermissible)
      : 0;
    return {
      maxPermissible: maxPermissible,
      distribution: distribution,
      treasuryEoP: cashEq - distribution
    };
  }

  /* =================================================================
   * LAYER 3 -- drivers
   * ================================================================= */

  /* The Step-through stage list, matching cascade_graph.json's
   * evaluation_order. The UI walks these in order within one period. */
  var STAGES = [
    { id: "carry",   label: "Bring forward treasury" },
    { id: "hm",      label: "Pay heavy maintenance" },
    { id: "debt",    label: "Service debt" },
    { id: "resid",   label: "Cash available for reserves" },
    { id: "reserve", label: "Recharge reserves, release surplus" },
    { id: "distrib", label: "Lock-up tests and distribution" }
  ];

  /* One period. `state` is the only thing carried across periods:
   * four balances, nothing else. Returns the period's figures plus a
   * `stages` map the UI consumes for Step-through. */
  function runPeriod(period, state, pre, params) {
    var idx = period - 1;

    /* -- stage 1: carry forward ------------------------------------- */
    var treasuryBoP = state.treasury;                                /* R140 */
    var cash = currentCash(pre.toll.nominal[idx], pre.opex.nominal[idx],
      treasuryBoP);                                                  /* R115 */

    /* -- stage 2: heavy maintenance -------------------------------- */
    var mraBoP = state.mra;                                          /* R96 */
    var hm = payHM(cash, pre.hm.nominal[idx], mraBoP);        /* R116-R119 */

    /* -- stage 3: debt service ------------------------------------- */
    var dsraBoP = state.dsra;                                        /* R105 */
    var debt = serviceDebt(period, state.debt, state.deferred,
      hm.cashAfterHm, dsraBoP, pre.cfadsTarget[idx], params);   /* R79-R91 */
    var dscrReal = dscrRealised(pre.cfads[idx], debt.debtService);    /* R92 */
    var dSignal = debtSignal(period, params.Debt_Duration,
      debt.debtEoP, debt.deferredEoP);                               /* R93 */

    /* -- stage 4: residual cash ------------------------------------ */
    var cashForReserves = hm.cashAfterHm - debt.debtService;          /* R120 */

    /* -- stage 5: reserves ----------------------------------------- */
    var mraTgt = mraTarget(pre.hm.nominal, idx, params);              /* R95 */
    var mra = rechargeReserve(cashForReserves, mraBoP, hm.hmFromMra,
      mraTgt);                                                 /* R99-R101 */

    var cashForDsra = cashForReserves - mra.recharge;                 /* R121 */
    var dsraTgt = dsraTarget(period, debt.debtEoP, pre.cfadsTarget,
      params);                                                       /* R103 */
    var dsra = rechargeReserve(cashForDsra, dsraBoP, debt.dsraDraw,
      dsraTgt);                                              /* R107-R110 */

    /* R122: residual after recharges, plus both surplus releases. */
    var cashEq = cashForDsra - dsra.recharge + mra.release + dsra.release;

    /* -- stage 6: tests and distribution --------------------------- */
    var llcrVal = llcr(period, treasuryBoP, state.debt, pre.cfads, params);
    var tests = lockupTests(debt.debtService, dscrReal, state.debt, llcrVal,
      mra.eop, mraTgt, dsra.eop, dsraTgt, params);            /* R124-R128 */
    var dist = distribute(cashEq, tests.allowed, debt.debtService,
      params.DSCR_Distrib);                                   /* R129-R131 */

    return {
      period: period,
      year: params.Year_Base + period - 1,
      /* every figure, keyed the way the UI wants to read it */
      treasuryBoP: treasuryBoP,
      currentCash: cash,
      hm: hm,
      debt: debt,
      dscrRealised: dscrReal,
      debtSignal: dSignal,
      cashForReserves: cashForReserves,
      mraBoP: mraBoP, mraTarget: mraTgt, mra: mra,
      cashForDsra: cashForDsra,
      dsraBoP: dsraBoP, dsraTarget: dsraTgt, dsra: dsra,
      cashEq: cashEq,
      llcr: llcrVal,
      tests: tests,
      distribution: dist,
      /* state handed to period+1 -- the entire inter-period memory */
      next: {
        treasury: dist.treasuryEoP,   /* R142 -> R140 */
        mra: mra.eop,                 /* R101 -> R96  */
        dsra: dsra.eop,               /* R110 -> R105 */
        debt: debt.debtEoP,           /* R90  -> R79  */
        deferred: debt.deferredEoP    /* R89  -> R81  */
      }
    };
  }

  /* Assemble the Excel-row-keyed grid so the oracle can be compared cell by
   * cell, and so the UI can address figures by the row numbers the brief
   * and the graph file both use. */
  function buildGrid(periods, pre, params) {
    var g = {}, i, r, rows;

    function put(row, val) {
      if (!g[row]) { g[row] = newVec(NP, 0); }
      g[row][i] = val;
    }

    for (i = 0; i < NP; i++) {
      r = periods[i];
      put(16, pre.traffic[i]);
      put(20, pre.toll.real[i]);
      put(23, pre.years[i]);   /* year header, NOT the CPI -- see yearHeader */
      put(24, pre.index[i]);
      put(27, pre.toll.nominal[i]);
      put(32, pre.opex.real[i]);
      put(35, pre.years[i]);   /* year header */
      put(36, pre.index[i]);
      put(39, pre.opex.nominal[i]);
      put(44, params.HM_Base);
      put(46, pre.hm.counter[i]);
      put(51, pre.hm.real[i]);
      put(54, pre.years[i]);   /* year header */
      put(55, pre.index[i]);
      put(58, pre.hm.nominal[i]);
      put(72, pre.cfads[i]);
      put(73, pre.cfadsTarget[i]);

      put(79, r.debt.debtBoP);
      put(80, r.debt.interestAccrued);
      put(81, r.debt.deferredBoP);
      put(82, r.debt.cashForDebt);
      put(83, r.debt.dsraDraw);
      put(84, r.debt.deferredPaid);
      put(85, r.debt.interestPaid);
      put(86, r.debt.principalTarget);
      put(87, r.debt.principalPaid);
      put(88, r.debt.deferredAddition);
      put(89, r.debt.deferredEoP);
      put(90, r.debt.debtEoP);
      put(91, r.debt.debtService);
      put(92, r.dscrRealised);
      put(93, r.debtSignal);

      put(95, r.mraTarget);
      put(96, r.mraBoP);
      put(98, r.hm.hmFromMra);
      put(99, r.mra.recharge);
      put(100, r.mra.release);
      put(101, r.mra.eop);

      put(103, r.dsraTarget);
      /* R105 DSRA BoP. Absent from the oracle export because Feuil1 carries
       * its label one row up on R104, but cascade_graph.json references it,
       * so the tank has something to read. Same story for R140 below. */
      put(105, r.dsraBoP);
      put(106, r.debt.dsraDraw);
      put(107, r.dsra.recharge);
      put(108, r.dsra.release);
      put(110, r.dsra.eop);

      put(115, r.currentCash);
      put(116, r.hm.hmFromMra);
      put(117, r.hm.hmFromCash);
      put(118, r.hm.cashAfterHm);
      put(119, r.hm.hmSignal);
      put(120, r.cashForReserves);
      put(121, r.cashForDsra);
      put(122, r.cashEq);
      put(123, r.llcr);
      put(124, r.tests.dscrOk);
      put(125, r.tests.llcrOk);
      put(126, r.tests.mraOk);
      put(127, r.tests.dsraOk);
      put(128, r.tests.allowed);
      put(129, r.distribution.maxPermissible);
      put(130, r.distribution.distribution);
      put(131, r.distribution.treasuryEoP);

      /* Section VIII -- the MONIAC reservoir mirrors. */
      put(133, r.mraBoP);
      put(134, -r.hm.hmFromMra + r.mra.recharge - r.mra.release);
      put(135, r.mra.eop);
      put(136, r.dsraBoP);
      put(137, -r.debt.dsraDraw + r.dsra.recharge - r.dsra.release);
      put(138, r.dsra.eop);
      put(140, r.treasuryBoP);  /* label sits on R139; see R105 note */
      put(141, r.distribution.treasuryEoP - r.treasuryBoP);
      put(142, r.distribution.treasuryEoP);
    }
    return g;
  }

  /* Fail loud, never silent: walk the finished grid and report every
   * NaN/Infinity with its row and period so the UI can badge it. */
  function checkFinite(grid) {
    var bad = [], row, vec, i;
    for (row in grid) {
      if (!grid.hasOwnProperty(row)) { continue; }
      vec = grid[row];
      for (i = 0; i < vec.length; i++) {
        if (isBad(vec[i])) {
          bad.push({ row: Number(row), period: i + 1, value: String(vec[i]) });
        }
      }
    }
    return bad;
  }

  /* Run the whole model. Exactly NP forward periods -- no convergence loop,
   * no early exit, no iteration to a fixed point. */
  function runAll(rawParams) {
    var params = normaliseParams(rawParams);
    var pre = precompute(params);
    var state = {
      treasury: 0,   /* R140 period 1 */
      mra: 0,        /* R96  period 1 */
      dsra: 0,       /* R105 period 1 */
      debt: pre.principalUsed, /* R79 period 1 = Principal_Used */
      deferred: 0    /* R81  period 1 */
    };
    var periods = [], p, i;

    for (i = 1; i <= NP; i++) {
      p = runPeriod(i, state, pre, params);
      periods.push(p);
      state = p.next;
    }

    var grid = buildGrid(periods, pre, params);
    return {
      params: params,
      pre: pre,
      periods: periods,
      grid: grid,
      numPeriods: NP,
      /* Non-empty means something went wrong and the UI must show it. */
      anomalies: checkFinite(grid)
    };
  }

  /* ---------------------------------------------------------------
   * Public surface
   * --------------------------------------------------------------- */
  return {
    NP: NP,
    DEFAULTS: DEFAULTS,
    PARAM_NAMES: PARAM_NAMES,
    STAGES: STAGES,
    normaliseParams: normaliseParams,
    /* layer 1 */
    computeTraffic: computeTraffic,
    indexVector: indexVector,
    yearHeader: yearHeader,
    computeToll: computeToll,
    computeOpex: computeOpex,
    hmPeakCounter: hmPeakCounter,
    computeHm: computeHm,
    computeCfads: computeCfads,
    sizeDebt: sizeDebt,
    precompute: precompute,
    /* layer 2 */
    currentCash: currentCash,
    payHM: payHM,
    principalTarget: principalTarget,
    serviceDebt: serviceDebt,
    dscrRealised: dscrRealised,
    debtSignal: debtSignal,
    mraTarget: mraTarget,
    rechargeReserve: rechargeReserve,
    dsraTarget: dsraTarget,
    llcr: llcr,
    lockupTests: lockupTests,
    distribute: distribute,
    /* layer 3 */
    runPeriod: runPeriod,
    buildGrid: buildGrid,
    checkFinite: checkFinite,
    runAll: runAll,
    /* helpers exposed for tests */
    _cell: cell,
    _isBad: isBad
  };
})();

/* Make the namespace reachable from cscript, browsers, and CommonJS alike
 * without assuming any of them exists. */
if (typeof module !== "undefined" && module.exports) { module.exports = WF; }
