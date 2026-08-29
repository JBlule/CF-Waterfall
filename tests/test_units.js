/* =====================================================================
 * test_units.js -- one suite per engine function.
 *
 * For each function: the ordinary case, the empty/zero case, the boundary
 * case, and the case the spec is silent on.
 *
 * EVERY expected number below is computed BY HAND from the Feuil1 formula,
 * written out in the comment above the assertion. None of them was read
 * back from the engine -- otherwise the test would only prove the code
 * agrees with itself.
 * ===================================================================== */

/* How many of the 31 periods carry a heavy-maintenance peak. */
function countPeaks(realHmVector) {
  var n = 0, i;
  for (i = 0; i < realHmVector.length; i++) {
    if (realHmVector[i] > 150000) { n++; }
  }
  return n;
}

function runUnitTests() {
  var P = WF.normaliseParams({});   /* base-case params */

  /* ============================================================== */
  T.suite("computeTraffic [R16] -- deterministic traffic");
  /* R16 = INT(Traffic_Base*((1-W)+W*(...))); W=0 => INT(Traffic_Base). */
  var tr = WF.computeTraffic(WF.normaliseParams({ Traffic_Base: 25000000 }));
  T.eq("31 periods produced", tr.length, 31);
  T.near("period 1 = 25,000,000", tr[0], 25000000);
  T.near("period 31 = 25,000,000 (flat, no randomness)", tr[30], 25000000);
  /* second, different input -- guards against a hardcoded return */
  T.near("a different base carries through",
    WF.computeTraffic(WF.normaliseParams({ Traffic_Base: 7777777 }))[0], 7777777);
  /* zero case */
  T.near("zero base gives zero traffic",
    WF.computeTraffic(WF.normaliseParams({ Traffic_Base: 0 }))[0], 0);
  /* spec-silent: non-integer base. Excel INT() truncates toward zero. */
  T.near("non-integer base is truncated by INT()",
    WF.computeTraffic(WF.normaliseParams({ Traffic_Base: 12345678.9 }))[0], 12345678);
  /* determinism guarantee: even if a caller asks for randomness */
  T.near("Random_Weight is forced to 0 even when passed 1",
    WF.computeTraffic(WF.normaliseParams({ Traffic_Base: 1000, Random_Weight: 1 }))[0],
    1000);

  /* ============================================================== */
  T.suite("indexVector [R24/R36/R55] -- CPI indexation");
  /* Period 1 = 1, then x(1+CPI). Period n carries (1+CPI)^(n-1). */
  var ix = WF.indexVector(0.015);
  T.near("period 1 coefficient is exactly 1", ix[0], 1, 1e-12);
  T.near("period 2 = 1.015", ix[1], 1.015, 1e-12);
  /* 1.015^2 = 1.030225; 1.030225^2 = 1.061363550625 */
  T.near("period 5 = 1.015^4", ix[4], 1.061363550625, 1e-12);
  /* 1.015^30 */
  T.near("period 31 = 1.015^30", ix[30], Math.pow(1.015, 30), 1e-12);
  /* zero case */
  T.near("CPI = 0 leaves every period at 1", WF.indexVector(0)[30], 1, 1e-12);
  /* spec-silent: deflation */
  T.near("negative CPI deflates", WF.indexVector(-0.02)[2],
    0.98 * 0.98, 1e-12);

  /* ============================================================== */
  T.suite("yearHeader [R23/R35/R54] -- the rows that LOOK like CPI");
  /* These rows are labelled "CPI" in Feuil1 column C and hold the CPI lever
   * in column L, but their period columns hold the YEAR. Getting this wrong
   * is exactly the trap the oracle caught. */
  var yh = WF.yearHeader(P);
  T.eq("period 1 = Year_Base", yh[0], 2026);
  T.eq("period 2 = Year_Base + 1", yh[1], 2027);
  T.eq("period 31 = Year_Base + 30", yh[30], 2056);
  T.eq("31 entries", yh.length, 31);
  /* boundary: the horizon is Year_Base + Num_Periods, so with the default 30
   * the last period (2056) is exactly ON the limit and stays visible */
  T.eq("the final period sits exactly on the horizon and is shown",
    yh[30], 2026 + 30);
  /* a shorter horizon blanks the tail */
  var yh10 = WF.yearHeader(WF.normaliseParams({ Num_Periods: 10 }));
  T.eq("Num_Periods 10: period 11 is the last visible year", yh10[10], 2036);
  T.eq("Num_Periods 10: period 12 is blank", yh10[11], "");
  T.eq("Num_Periods 10: period 31 is blank", yh10[30], "");
  /* period 1 is unconditional in the Excel (=$L$2, no IF) */
  T.eq("period 1 is shown even with a zero horizon",
    WF.yearHeader(WF.normaliseParams({ Num_Periods: 0 }))[0], 2026);
  /* Num_Periods must not touch any calculation row -- it is display only */
  var short10 = WF.runAll({ Num_Periods: 10 });
  var full30 = WF.runAll({ Num_Periods: 30 });
  var calcIdentical = 1, cp;
  for (cp = 0; cp < 31; cp++) {
    if (Math.abs(short10.grid[72][cp] - full30.grid[72][cp]) > 1e-9) { calcIdentical = 0; }
    if (Math.abs(short10.grid[142][cp] - full30.grid[142][cp]) > 1e-9) { calcIdentical = 0; }
    if (Math.abs(short10.grid[130][cp] - full30.grid[130][cp]) > 1e-9) { calcIdentical = 0; }
  }
  T.eq("Num_Periods changes no calculation row (display only, as in Feuil1)",
    calcIdentical, 1);

  /* ============================================================== */
  T.suite("computeToll [R20/R27] -- real and nominal revenue");
  /* 25,000,000 km x 0.15 EUR = 3,750,000 real; nominal = real x index. */
  var pre1 = WF.precompute(P);
  T.near("real toll = 25,000,000 x 0.15 = 3,750,000", pre1.toll.real[0], 3750000);
  T.near("nominal period 1 = real (index 1)", pre1.toll.nominal[0], 3750000);
  T.near("nominal period 2 = 3,750,000 x 1.015 = 3,806,250",
    pre1.toll.nominal[1], 3806250);
  /* zero case */
  T.near("zero tariff gives zero revenue",
    WF.precompute(WF.normaliseParams({ Tariff_km: 0 })).toll.nominal[5], 0);

  /* ============================================================== */
  T.suite("computeOpex [R32/R39] -- flat real, indexed nominal");
  T.near("real OPEX is flat at 750,000", pre1.opex.real[10], 750000);
  T.near("nominal period 1 = 750,000", pre1.opex.nominal[0], 750000);
  T.near("nominal period 2 = 750,000 x 1.015 = 761,250",
    pre1.opex.nominal[1], 761250);

  /* ============================================================== */
  T.suite("hmPeakCounter [R46] -- cycles on HM_Peak_Cycle");
  /* Feuil1!46 is =IF(prev=5,1,prev+1) with a HARDCODED 5. By deliberate
   * deviation (user request) the counter wraps on HM_Peak_Cycle instead, so
   * the parameter means "a peak every N years". At N=5 the two are identical,
   * which is what keeps the oracle valid -- asserted explicitly below. */
  var ctr = WF.hmPeakCounter(5);
  T.eq("counter starts at 1", ctr[0], 1);
  T.eq("period 5 counter = 5", ctr[4], 5);
  T.eq("period 6 counter wraps to 1", ctr[5], 1);
  T.eq("period 10 counter = 5", ctr[9], 5);
  /* boundary: last period. (31-1) mod 5 = 0 => 1 */
  T.eq("period 31 counter = 1", ctr[30], 1);
  T.eq("length is 31", ctr.length, 31);

  /* THE COMPATIBILITY GUARANTEE: at cycle 5 the generalised counter must
   * reproduce the workbook's hardcoded sequence period for period. If this
   * ever fails, the oracle proof is void. */
  var excelCtr = [], ec;
  for (ec = 0; ec < 31; ec++) { excelCtr.push((ec % 5) + 1); }
  T.nearVec("cycle 5 reproduces the workbook's hardcoded sequence exactly",
    WF.hmPeakCounter(5), excelCtr, 0);

  /* the generalisation the user asked for */
  var c15 = WF.hmPeakCounter(15);
  T.eq("cycle 15: period 15 is the top of the cycle", c15[14], 15);
  T.eq("cycle 15: period 16 wraps to 1", c15[15], 1);
  T.eq("cycle 15: period 30 is the top again", c15[29], 15);
  var c3 = WF.hmPeakCounter(3);
  T.eq("cycle 3: period 3 is the top", c3[2], 3);
  T.eq("cycle 3: period 4 wraps to 1", c3[3], 1);
  T.eq("cycle 3: period 6 is the top again", c3[5], 3);
  /* boundary: a cycle of 1 means every period is the top */
  T.eq("cycle 1: every period is the top of the cycle",
    WF.hmPeakCounter(1)[7], 1);
  /* boundary: a cycle longer than the model never wraps */
  T.eq("cycle 40 never wraps within 31 periods",
    WF.hmPeakCounter(40)[30], 31);
  /* spec-silent: nonsense input must still terminate and stay in range */
  T.eq("cycle 0 is clamped to 1 rather than failing to wrap",
    WF.hmPeakCounter(0)[9], 1);
  T.eq("negative cycle is clamped to 1", WF.hmPeakCounter(-3)[9], 1);

  /* ============================================================== */
  T.suite("computeHm [R44/R47/R51/R58] -- heavy maintenance");
  /* Base 150,000 + peak 1,000,000 when counter = HM_Peak_Cycle (5). */
  T.near("no peak in period 1: real = 150,000", pre1.hm.real[0], 150000);
  T.near("peak in period 5: real = 1,150,000", pre1.hm.real[4], 1150000);
  /* nominal period 5 = 1,150,000 x 1.015^4 = 1,220,568.08... */
  T.near("nominal period 5 = 1,150,000 x 1.015^4",
    pre1.hm.nominal[4], 1150000 * Math.pow(1.015, 4));
  T.near("peak recurs in period 10", pre1.hm.real[9], 1150000);
  /* zero case */
  T.near("zero peak amount leaves the flat base",
    WF.precompute(WF.normaliseParams({ HM_Peak_Amount: 0 })).hm.real[4], 150000);
  /* THE GENERALISATION (user request): the cycle is now the interval.
   * Under the workbook's hardcoded 5, cycle 3 would have peaked at 3, 8, 13
   * and cycle 15 would never have peaked at all. */
  var hm3 = WF.precompute(WF.normaliseParams({ HM_Peak_Cycle: 3 })).hm.real;
  T.near("cycle 3: peak in period 3", hm3[2], 1150000);
  T.near("cycle 3: peak in period 6, not period 8", hm3[5], 1150000);
  T.near("cycle 3: peak in period 9", hm3[8], 1150000);
  T.near("cycle 3: no peak in period 5", hm3[4], 150000);
  var peaks3 = countPeaks(hm3);
  T.eq("cycle 3: 10 peaks in 31 periods (3,6,...,30)", peaks3, 10);

  var hm15 = WF.precompute(WF.normaliseParams({ HM_Peak_Cycle: 15 })).hm.real;
  T.near("cycle 15: peak in period 15", hm15[14], 1150000);
  T.near("cycle 15: peak in period 30", hm15[29], 1150000);
  T.near("cycle 15: no peak in period 5 (was a peak under the old quirk)",
    hm15[4], 150000);
  T.eq("cycle 15: exactly 2 peaks in 31 periods", countPeaks(hm15), 2);

  /* boundary: a cycle longer than the model produces no peak, but now for
   * an honest reason rather than the hardcoded-5 artefact */
  T.eq("cycle 40: no peak inside a 31-period model",
    countPeaks(WF.precompute(WF.normaliseParams({ HM_Peak_Cycle: 40 })).hm.real), 0);
  /* boundary: cycle 1 means every year is a peak year */
  T.eq("cycle 1: every one of the 31 periods peaks",
    countPeaks(WF.precompute(WF.normaliseParams({ HM_Peak_Cycle: 1 })).hm.real), 31);
  /* the default must still be the oracle's behaviour */
  T.eq("cycle 5 (default): 6 peaks at periods 5,10,...,30",
    countPeaks(pre1.hm.real), 6);

  /* ============================================================== */
  T.suite("computeCfads [R72/R73] -- reference metric, not cash flow");
  /* 3,750,000 - 750,000 - 150,000 = 2,850,000 */
  T.near("CFADS period 1 = 2,850,000", pre1.cfads[0], 2850000);
  /* target = CFADS / DSCR = 2,850,000 / 1.2 = 2,375,000 */
  T.near("CFADS at DSCR target = 2,375,000", pre1.cfadsTarget[0], 2375000);
  /* peak year: 3,750,000x1.015^4 - 750,000x1.015^4 - 1,150,000x1.015^4 */
  T.near("period 5 CFADS = (3,750,000-750,000-1,150,000) x 1.015^4",
    pre1.cfads[4], 1850000 * Math.pow(1.015, 4));
  /* boundary: DSCR = 1 means target equals CFADS */
  T.near("DSCR 1.0 makes target = CFADS",
    WF.precompute(WF.normaliseParams({ DSCR: 1 })).cfadsTarget[0], 2850000);

  /* ============================================================== */
  T.suite("sizeDebt [R76/R77] -- PV debt sizing");
  /* Independently computed in Python from the oracle's own CFADS row:
   * sum_{k=1..20} (CFADS_k/1.2)/1.05^k = 31,223,341.4768 */
  T.near("auto-size PV matches the independent computation",
    pre1.principalMax, 31223341.4768, 0.01);
  T.near("auto mode uses the PV", pre1.principalUsed, 31223341.4768, 0.01);
  /* manual mode ignores the PV entirely */
  var man = WF.precompute(WF.normaliseParams({ Sizing_Mode: 0, Debt_Nominal: 40000000 }));
  T.near("manual mode uses Debt_Nominal", man.principalUsed, 40000000);
  T.near("manual mode still reports the PV for display",
    man.principalMax, 31223341.4768, 0.01);
  /* zero/boundary: no window means no debt capacity */
  T.near("Debt_Duration 0 gives zero capacity",
    WF.precompute(WF.normaliseParams({ Debt_Duration: 0 })).principalMax, 0);
  /* boundary: a 1-year window is just the first period discounted once */
  T.near("Debt_Duration 1 = (CFADS_1/1.2)/1.05",
    WF.precompute(WF.normaliseParams({ Debt_Duration: 1 })).principalMax,
    (2850000 / 1.2) / 1.05, 0.01);

  /* ============================================================== */
  T.suite("currentCash [R115]");
  T.near("Toll - OPEX + treasury", WF.currentCash(3750000, 750000, 0), 3000000);
  T.near("treasury brought forward is added",
    WF.currentCash(3750000, 750000, 500000), 3500000);
  /* spec-silent: costs exceed revenue and nothing was carried forward */
  T.near("can go negative", WF.currentCash(100000, 750000, 0), -650000);

  /* ============================================================== */
  T.suite("payHM [R116/R117/R118/R119] -- HM ranks above debt");
  /* ordinary: plenty of cash, MRA untouched */
  var h1 = WF.payHM(3000000, 150000, 0);
  T.near("ordinary: paid from cash", h1.hmFromCash, 150000);
  T.near("ordinary: MRA not drawn", h1.hmFromMra, 0);
  T.near("ordinary: cash after HM = 2,850,000", h1.cashAfterHm, 2850000);
  T.eq("ordinary: no signal", h1.hmSignal, "");
  /* MRA covers the shortfall exactly: 40,000 cash + 60,000 MRA = 100,000 */
  var h2 = WF.payHM(40000, 100000, 60000);
  T.near("shortfall: cash contributes 40,000", h2.hmFromCash, 40000);
  T.near("shortfall: MRA contributes exactly 60,000", h2.hmFromMra, 60000);
  T.near("shortfall: cash after HM = 0", h2.cashAfterHm, 0);
  T.eq("shortfall fully covered: no signal", h2.hmSignal, "");
  /* zero case: no cash, MRA too small -> the signal must fire */
  var h3 = WF.payHM(0, 100000, 60000);
  T.near("unpaid: MRA gives all it has", h3.hmFromMra, 60000);
  T.eq("unpaid: HM UNPAID signal fires", h3.hmSignal, "HM UNPAID");
  /* boundary: the 0.01 tolerance in R119 must NOT raise a false signal */
  var h4 = WF.payHM(99999.995, 100000, 0);
  T.eq("0.005 short is inside the 0.01 tolerance: no signal", h4.hmSignal, "");
  var h5 = WF.payHM(99999.98, 100000, 0);
  T.eq("0.02 short is outside the tolerance: signal", h5.hmSignal, "HM UNPAID");
  /* spec-silent: current cash already negative */
  var h6 = WF.payHM(-50000, 10000, 100000);
  T.near("negative cash contributes nothing", h6.hmFromCash, 0);
  T.near("negative cash: MRA pays the whole bill", h6.hmFromMra, 10000);
  T.near("negative cash is carried through unchanged", h6.cashAfterHm, -50000);
  T.eq("negative cash but MRA covered it: no signal", h6.hmSignal, "");
  /* zero HM due */
  var h7 = WF.payHM(1000000, 0, 500000);
  T.near("nothing due: nothing paid", h7.hmFromCash, 0);
  T.eq("nothing due: no signal", h7.hmSignal, "");

  /* ============================================================== */
  T.suite("principalTarget [R86] -- DSCR sculpting");
  /* ordinary sculpt: min(debtBoP, CFADS/DSCR - interest)
   * = min(30,000,000, 2,375,000 - 1,500,000) = 875,000 */
  T.near("ordinary: sculpted to the DSCR target",
    WF.principalTarget(5, 30000000, 2375000, 1500000, 20), 875000);
  /* boundary AT the window end: the whole residual falls due,
   * regardless of what the sculpt would have said */
  T.near("AT the final window period: full residual",
    WF.principalTarget(20, 5000000, 2375000, 250000, 20), 5000000);
  /* boundary just before */
  T.near("one period before the end: still sculpted",
    WF.principalTarget(19, 5000000, 2375000, 250000, 20), 2125000);
  /* past the window */
  T.near("past the window: nothing due",
    WF.principalTarget(21, 5000000, 2375000, 250000, 20), 0);
  /* zero case: interest already exceeds the DSCR-target CFADS */
  T.near("interest above target: no principal due",
    WF.principalTarget(5, 30000000, 1000000, 1500000, 20), 0);
  /* boundary: capped by the outstanding balance */
  T.near("capped by the outstanding balance",
    WF.principalTarget(5, 100, 2375000, 0, 20), 100);

  /* ============================================================== */
  T.suite("serviceDebt [R79-R91] -- deferred -> interest -> principal");

  /* CASE A -- ordinary, everything serviced, sculpt binds.
   * interest = 3,000,000 x 5% = 150,000; DSRA draw 0; deferred 0;
   * interest paid 150,000; target = min(3,000,000, 2,375,000-150,000)
   * = 2,225,000; principal paid = min(2,225,000, 3,000,000, 2,700,000)
   * = 2,225,000; debt EoP = 775,000; service = 2,375,000. */
  var A = WF.serviceDebt(1, 3000000, 0, 2850000, 0, 2375000, P);
  T.near("A interest accrued = 150,000", A.interestAccrued, 150000);
  T.near("A no DSRA draw needed", A.dsraDraw, 0);
  T.near("A interest paid in full", A.interestPaid, 150000);
  T.near("A principal target = 2,225,000", A.principalTarget, 2225000);
  T.near("A principal paid = 2,225,000", A.principalPaid, 2225000);
  T.near("A debt EoP = 775,000", A.debtEoP, 775000);
  T.near("A deferred stays empty", A.deferredEoP, 0);
  T.near("A debt service = 2,375,000", A.debtService, 2375000);

  /* CASE B -- DSRA draw exactly plugs the interest gap.
   * interest = 60,000,000 x 5% = 3,000,000; cash 2,850,000;
   * draw = min(500,000, 3,000,000-2,850,000) = 150,000;
   * pot 3,000,000 pays interest in full; sculpt target
   * = max(0, 2,375,000-3,000,000) = 0 so no principal. */
  var B = WF.serviceDebt(3, 60000000, 0, 2850000, 500000, 2375000, P);
  T.near("B interest accrued = 3,000,000", B.interestAccrued, 3000000);
  T.near("B DSRA draw = 150,000 (only the gap)", B.dsraDraw, 150000);
  T.near("B interest paid in full", B.interestPaid, 3000000);
  T.near("B sculpt yields no principal", B.principalTarget, 0);
  T.near("B nothing amortised", B.principalPaid, 0);
  T.near("B no deferred created", B.deferredEoP, 0);

  /* CASE C -- deferred is served FIRST and grows (non-capitalising).
   * pot = 1,000,000; deferred BoP 200,000 paid first, leaving 800,000
   * for interest of 3,000,000; addition = 3,000,000-800,000 = 2,200,000;
   * deferred EoP = 200,000-200,000+2,200,000 = 2,200,000. */
  var C = WF.serviceDebt(3, 60000000, 200000, 1000000, 0, 2375000, P);
  T.near("C deferred paid before interest", C.deferredPaid, 200000);
  T.near("C interest gets only what is left", C.interestPaid, 800000);
  T.near("C deferred addition = 2,200,000", C.deferredAddition, 2200000);
  T.near("C deferred EoP = 2,200,000", C.deferredEoP, 2200000);
  T.near("C debt principal untouched", C.debtEoP, 60000000);
  T.near("C debt service = cash actually paid", C.debtService, 1000000);

  /* CASE D -- THE PRIORITY TEST: the DSRA must never fund principal.
   * DSRA holds 5,000,000 and the principal target is the full 1,000,000,
   * but cash after HM is 0, so principal paid MUST be 0. */
  var D = WF.serviceDebt(5, 1000000, 0, 0, 5000000, 2375000, P);
  T.near("D DSRA draw covers the interest", D.dsraDraw, 50000);
  T.near("D interest paid from the DSRA", D.interestPaid, 50000);
  T.near("D principal target is the full balance", D.principalTarget, 1000000);
  T.near("D principal paid is ZERO: DSRA cannot amortise", D.principalPaid, 0);
  T.near("D debt untouched", D.debtEoP, 1000000);

  /* CASE E -- boundary: AT the window end the residual is forced out. */
  var E = WF.serviceDebt(20, 800000, 0, 5000000, 0, 2375000, P);
  T.near("E target is the full residual", E.principalTarget, 800000);
  T.near("E residual repaid", E.principalPaid, 800000);
  T.near("E debt fully extinguished", E.debtEoP, 0);
  T.near("E service = 40,000 interest + 800,000", E.debtService, 840000);

  /* CASE F -- zero case: no debt at all. */
  var F = WF.serviceDebt(5, 0, 0, 1000000, 0, 2375000, P);
  T.near("F no interest on no debt", F.interestAccrued, 0);
  T.near("F no service", F.debtService, 0);
  T.near("F no draw", F.dsraDraw, 0);

  /* CASE G -- spec-silent: cash after HM is negative. */
  var G = WF.serviceDebt(5, 1000000, 0, -200000, 0, 2375000, P);
  T.near("G negative cash pays no interest", G.interestPaid, 0);
  T.near("G negative cash pays no principal", G.principalPaid, 0);
  T.near("G the whole interest is deferred", G.deferredEoP, 50000);
  T.near("G no service recorded", G.debtService, 0);

  /* ============================================================== */
  T.suite("dscrRealised [R92]");
  T.near("2,850,000 / 2,375,000 = 1.2", WF.dscrRealised(2850000, 2375000), 1.2, 1e-9);
  /* zero case: Excel returns "" rather than dividing by zero */
  T.eq("no debt service returns blank, not Infinity",
    WF.dscrRealised(2850000, 0), "");
  T.near("zero CFADS over positive service = 0", WF.dscrRealised(0, 100), 0);
  /* spec-silent: negative CFADS */
  T.near("negative CFADS gives a negative DSCR",
    WF.dscrRealised(-100, 100), -1);

  /* ============================================================== */
  T.suite("debtSignal [R93]");
  T.eq("before the window end: silent",
    WF.debtSignal(19, 20, 5000000, 0), "");
  T.eq("AT the window end with residual debt: UNPAID",
    WF.debtSignal(20, 20, 5000000, 0), "UNPAID");
  T.eq("after the window with residual debt: UNPAID",
    WF.debtSignal(25, 20, 1000, 0), "UNPAID");
  /* deferred interest alone is enough to raise it */
  T.eq("deferred interest alone triggers UNPAID",
    WF.debtSignal(25, 20, 0, 0.6), "UNPAID");
  /* boundary: the 0.5 rounding guard */
  T.eq("residual under the 0.5 guard stays silent",
    WF.debtSignal(20, 20, 0.4, 0.4), "");
  T.eq("cleanly repaid: silent", WF.debtSignal(30, 20, 0, 0), "");

  /* ============================================================== */
  T.suite("mraTarget [R95] -- look-ahead at the HM still to COME");
  /* The reserve funds FUTURE maintenance: periods N+1, N+2, N+3. Including
   * the current period would mean saving for a bill already paid. */
  var hmv = [100, 200, 400, 800, 1600];
  /* 1x200 + 0.5x400 + 0.25x800 = 200+200+200 = 600 */
  T.near("ordinary: looks one, two and three years ahead",
    WF.mraTarget(hmv, 0, P), 600);
  /* the current period's own bill must NOT appear in the target */
  T.near("a huge bill in the CURRENT period does not raise the target",
    WF.mraTarget([9999999, 200, 400, 800, 1600], 0, P), 600);
  /* ordinary, one period on: 1x400 + 0.5x800 + 0.25x1600 = 1200 */
  T.near("period 2 looks at periods 3, 4 and 5",
    WF.mraTarget(hmv, 1, P), 1200);
  /* boundary: the last period has no future at all */
  T.near("last period has nothing left to save for",
    WF.mraTarget(hmv, 4, P), 0);
  /* boundary: only one future period remains */
  T.near("second-to-last sees only the final bill",
    WF.mraTarget(hmv, 3, P), 1600);
  /* boundary: two future periods remain */
  T.near("third-from-last sees two of the three",
    WF.mraTarget(hmv, 2, P), 800 + 0.5 * 1600);
  /* zero case: all coefficients 0 disables the MRA (scenario S09) */
  T.near("all coefficients zero disables the MRA",
    WF.mraTarget(hmv, 0, WF.normaliseParams(
      { MRA_Coef_N: 0, MRA_Coef_N1: 0, MRA_Coef_N2: 0 })), 0);
  /* over-funded (scenario S10): 2x200 + 1x400 + 0.5x800 = 1200 */
  T.near("over-funded coefficients raise the target",
    WF.mraTarget(hmv, 0, WF.normaliseParams(
      { MRA_Coef_N: 2, MRA_Coef_N1: 1, MRA_Coef_N2: 0.5 })), 1200);

  /* Cross-check against the oracle's own first cell, computed by hand from
   * the base case: 1 x 152,250 + 0.5 x 154,534.13 + 0.25 x 156,852.14
   * = 268,729.81 -- which is what the recalculated workbook stores. */
  T.near("period 1 target matches the workbook's 268,729.81",
    WF.mraTarget(pre1.hm.nominal, 0, P), 268729.814063, 0.01);

  /* The reserve must anticipate a peak: the target in the period BEFORE a
   * peak year has to carry that peak, not the period of the peak itself. */
  T.isTrue("the target spikes one period BEFORE the maintenance peak",
    WF.mraTarget(pre1.hm.nominal, 3, P) > WF.mraTarget(pre1.hm.nominal, 4, P));

  /* ============================================================== */
  T.suite("rechargeReserve -- ONE mechanism, used for MRA and DSRA");
  /* This is the function shared by [R99-R101] and [R107-R110], so it is
   * tested in both shapes: a hardcoded answer would pass one and fail
   * the other. */
  /* ordinary: fund straight to target */
  var r1 = WF.rechargeReserve(1000000, 0, 0, 300000);
  T.near("ordinary: recharged to target", r1.recharge, 300000);
  T.near("ordinary: nothing released", r1.release, 0);
  T.near("ordinary: balance at target", r1.eop, 300000);
  /* cash-limited */
  var r2 = WF.rechargeReserve(100000, 0, 0, 300000);
  T.near("cash-limited: only what is available", r2.recharge, 100000);
  T.near("cash-limited: still short of target", r2.eop, 100000);
  /* release with no recharge: the target fell below the balance */
  var r3 = WF.rechargeReserve(0, 500000, 0, 300000);
  T.near("over-target: nothing to recharge", r3.recharge, 0);
  T.near("over-target: surplus released", r3.release, 200000);
  T.near("over-target: balance falls back to target", r3.eop, 300000);
  /* after a draw: the reservoir must refill what it just paid out */
  var r4 = WF.rechargeReserve(50000, 200000, 200000, 300000);
  T.near("after a full draw: refills from cash", r4.recharge, 50000);
  T.near("after a full draw: balance is the refill", r4.eop, 50000);
  /* zero target (MRA switched off, scenario S09) */
  var r5 = WF.rechargeReserve(1000000, 0, 0, 0);
  T.near("zero target: no recharge even with cash available", r5.recharge, 0);
  T.near("zero target: balance stays empty", r5.eop, 0);
  /* zero target with an existing balance: release everything */
  var r6 = WF.rechargeReserve(0, 400000, 0, 0);
  T.near("zero target: existing balance fully released", r6.release, 400000);
  T.near("zero target: balance emptied", r6.eop, 0);
  /* spec-silent: negative cash available must not create a negative flow */
  var r7 = WF.rechargeReserve(-500000, 0, 0, 300000);
  T.near("negative cash available: no recharge", r7.recharge, 0);
  T.near("negative cash available: balance floored at 0", r7.eop, 0);
  /* DSRA shape: draw larger than the balance is still floored */
  var r8 = WF.rechargeReserve(0, 100000, 100000, 0);
  T.near("fully drawn and no target: balance is 0", r8.eop, 0);

  /* ============================================================== */
  T.suite("dsraTarget [R103] -- next period's SCHEDULED service");
  /* debtEoP 20,000,000: interest 1,000,000; next principal target
   * = min(20,000,000, 2,375,000-1,000,000) = 1,375,000;
   * target = 1,000,000 + 1,375,000 = 2,375,000 */
  var cft = [];
  for (var z = 0; z < 31; z++) { cft.push(2375000); }
  T.near("ordinary: interest + next sculpted principal",
    WF.dsraTarget(5, 20000000, cft, P), 2375000);
  /* boundary: next period is the window end, so the full residual is
   * scheduled -- 50,000 interest + 1,000,000 residual */
  T.near("next period is the window end: full residual scheduled",
    WF.dsraTarget(19, 1000000, cft, P), 1050000);
  /* boundary: next period is past the window */
  T.near("next period past the window: interest only",
    WF.dsraTarget(20, 1000000, cft, P), 50000);
  /* zero case: no debt left */
  T.near("no debt: zero target", WF.dsraTarget(10, 0, cft, P), 0);
  /* boundary: the very last period. Feuil1!AR103 is a hardcoded "=0" -- no
   * period 32 exists to reserve against, so the requirement is released. */
  T.near("last period: target is zero (AR103 is hardcoded 0)",
    WF.dsraTarget(31, 1000000, cft, P), 0);
  T.near("period 30 still schedules normally",
    WF.dsraTarget(30, 1000000, cft, P), 50000);

  /* ============================================================== */
  T.suite("llcr [R123]");
  /* zero-rate case makes the PV hand-checkable: two periods of 1,000
   * undiscounted over debt of 1,000 = 2.0 */
  var flat = [], zr = WF.normaliseParams({ Interest_Rate: 0, Debt_Duration: 2 });
  for (z = 0; z < 31; z++) { flat.push(1000); }
  T.near("zero rate, 2-period window: (1000+1000)/1000 = 2",
    WF.llcr(1, 0, 1000, flat, zr), 2, 1e-9);
  /* 10% rate: 1000/1.1 + 1000/1.21 = 1735.53719... */
  var r10 = WF.normaliseParams({ Interest_Rate: 0.1, Debt_Duration: 2 });
  T.near("10% rate: PV of two 1,000s over 1,000 of debt",
    WF.llcr(1, 0, 1000, flat, r10),
    (1000 / 1.1 + 1000 / 1.21) / 1000, 1e-9);
  /* treasury brought forward is added to the numerator */
  T.near("treasury brought forward counts toward coverage",
    WF.llcr(1, 500, 1000, flat, r10),
    (500 + 1000 / 1.1 + 1000 / 1.21) / 1000, 1e-9);
  /* window shrinks as periods advance: at period 2 only period 2 remains,
   * discounted once */
  T.near("period 2: only the last window period remains",
    WF.llcr(2, 0, 1000, flat, r10), (1000 / 1.1) / 1000, 1e-9);
  /* past the window there is no future CFADS at all */
  T.near("past the window: only treasury covers the debt",
    WF.llcr(3, 250, 1000, flat, r10), 0.25, 1e-9);
  /* zero/boundary: the 0.5 debt guard returns blank, not a division */
  T.eq("no debt returns blank", WF.llcr(1, 0, 0, flat, r10), "");
  T.eq("debt exactly at the 0.5 guard returns blank",
    WF.llcr(1, 0, 0.5, flat, r10), "");
  T.isTrue("debt just above the guard returns a number",
    typeof WF.llcr(1, 0, 0.6, flat, r10) === "number");

  /* ============================================================== */
  T.suite("lockupTests [R124-R128] -- all four gates");
  var okArgs = [100, 1.5, 1000, 1.5, 300, 300, 200, 200];
  function lock(ds, dscr, dbop, ll, me, mt, de, dt, prm) {
    return WF.lockupTests(ds, dscr, dbop, ll, me, mt, de, dt, prm || P);
  }
  var L1 = lock(100, 1.5, 1000, 1.5, 300, 300, 200, 200);
  T.eq("all four gates pass", L1.allowed, 1);
  /* each gate individually blocks */
  T.eq("DSCR below minimum blocks", lock(100, 1.1, 1000, 1.5, 300, 300, 200, 200).allowed, 0);
  T.eq("LLCR below minimum blocks", lock(100, 1.5, 1000, 1.05, 300, 300, 200, 200).allowed, 0);
  T.eq("underfilled MRA blocks", lock(100, 1.5, 1000, 1.5, 100, 300, 200, 200).allowed, 0);
  T.eq("underfilled DSRA blocks", lock(100, 1.5, 1000, 1.5, 300, 300, 100, 200).allowed, 0);
  /* boundary: exactly at the thresholds must PASS (>=, not >) */
  T.eq("DSCR exactly at the minimum passes",
    lock(100, 1.2, 1000, 1.5, 300, 300, 200, 200).dscrOk, 1);
  T.eq("LLCR exactly at the minimum passes",
    lock(100, 1.5, 1000, 1.1, 300, 300, 200, 200).llcrOk, 1);

  /* THE KNIFE-EDGE. A sculpted period is designed to land exactly on the
   * DSCR target, so the gate must not flip on floating-point dust. This is
   * the case that broke S06 p13 and S13 p10 against the oracle. */
  var dust = 1.2 - 2 * Math.pow(2, -52);   /* a couple of ULPs below 1.2 */
  T.isTrue("the dust value really is below 1.2 in IEEE754", dust < 1.2);
  T.eq("DSCR two ULPs below the minimum still passes (float dust absorbed)",
    lock(100, dust, 1000, 1.5, 300, 300, 200, 200).dscrOk, 1);
  T.eq("LLCR two ULPs below the minimum still passes",
    lock(100, 1.5, 1000, 1.1 - 2 * Math.pow(2, -52), 300, 300, 200, 200).llcrOk, 1);
  /* ...but a real shortfall must still block. 1e-6 is 1e-9 of a slider step
   * and already 1000x the epsilon, so the gate has not been blunted. */
  T.eq("DSCR short by 1e-6 still BLOCKS (epsilon has not blunted the gate)",
    lock(100, 1.2 - 1e-6, 1000, 1.5, 300, 300, 200, 200).dscrOk, 0);
  T.eq("LLCR short by 1e-6 still BLOCKS",
    lock(100, 1.5, 1000, 1.1 - 1e-6, 300, 300, 200, 200).llcrOk, 0);
  /* REGRESSION, on the engine's own numbers rather than a copied literal.
   * The division round-trip x/(x/1.2) is exact for some x and one ULP low
   * for others, so a hardcoded value is a brittle way to demonstrate it.
   * These are the two periods that actually broke against the oracle:
   * debt service equals the CFADS target, yet DSCR realised sits one ULP
   * under DSCR_Min. A bare >= must fail here and the real gate must not. */
  /* Do NOT pin this to a named scenario and period. Which periods land on
   * the knife edge depends on the cash flows, so any change to the model
   * moves them -- an earlier version of this test pointed at S06 p13 and
   * broke the moment the MRA rule was corrected, even though the underlying
   * behaviour was untouched.
   *
   * Instead, sweep every scenario and period for the situation itself:
   * a DSCR that sits within a whisker of DSCR_Min but strictly below it.
   * Bounded: 15 scenarios x 31 periods. */
  var knifeFound = 0, knifeOk = 0, knifeWhere = "", ks, kr, kp, ki, kj;
  for (ki = 0; ki < ORACLE_DATA.scenarios.length; ki++) {
    ks = ORACLE_DATA.scenarios[ki];
    kr = WF.runAll(ks.params);
    for (kj = 0; kj < kr.periods.length; kj++) {
      kp = kr.periods[kj];
      if (typeof kp.dscrRealised !== "number") { continue; }
      if (kp.dscrRealised >= kr.params.DSCR_Min) { continue; }
      if (Math.abs(kp.dscrRealised - kr.params.DSCR_Min) > 1e-12) { continue; }
      /* a bare >= would block this period purely on float dust */
      knifeFound++;
      if (kp.tests.dscrOk === 1) { knifeOk++; }
      if (!knifeWhere) { knifeWhere = ks.name + " p" + kp.period; }
    }
  }
  T.isTrue("the knife edge really occurs in the oracle set (" +
    knifeFound + " period(s), first at " + (knifeWhere || "none") + ")",
    knifeFound > 0);
  T.eq("every knife-edge period is allowed through, not blocked by dust",
    knifeOk, knifeFound);
  /* the two escapes: without them a repaid project could never distribute */
  T.eq("no debt service: DSCR gate passes on a blank DSCR",
    lock(0, "", 1000, 1.5, 300, 300, 200, 200).dscrOk, 1);
  T.eq("no debt: LLCR gate passes on a blank LLCR",
    lock(100, 1.5, 0, "", 300, 300, 200, 200).llcrOk, 1);
  /* boundary: the 0.5 fill tolerance */
  T.eq("MRA 0.4 short is inside the 0.5 tolerance",
    lock(100, 1.5, 1000, 1.5, 299.6, 300, 200, 200).mraOk, 1);
  T.eq("MRA 0.6 short is outside the tolerance",
    lock(100, 1.5, 1000, 1.5, 299.4, 300, 200, 200).mraOk, 0);
  T.eq("DSRA 0.4 short is inside the tolerance",
    lock(100, 1.5, 1000, 1.5, 300, 300, 199.6, 200).dsraOk, 1);
  /* zero targets are trivially filled */
  T.eq("zero reserve targets are considered filled",
    lock(0, "", 0, "", 0, 0, 0, 0).allowed, 1);

  /* ============================================================== */
  T.suite("distribute [R129/R130/R131]");
  /* cap = max(0, 1,000,000 - 0.05x2,375,000) = 1,000,000-118,750 = 881,250 */
  var d1 = WF.distribute(1000000, 1, 2375000, 1.05);
  T.near("cap leaves the post-distribution buffer", d1.maxPermissible, 881250);
  T.near("distribution is capped", d1.distribution, 881250);
  T.near("the buffer is trapped in treasury", d1.treasuryEoP, 118750);
  /* locked up: everything is trapped */
  var d2 = WF.distribute(1000000, 0, 2375000, 1.05);
  T.near("locked up: nothing distributed", d2.distribution, 0);
  T.near("locked up: all of it carried forward", d2.treasuryEoP, 1000000);
  /* boundary: no buffer required */
  var d3 = WF.distribute(1000000, 1, 2375000, 1.0);
  T.near("floor of 1.00 requires no buffer", d3.distribution, 1000000);
  T.near("floor of 1.00 leaves nothing behind", d3.treasuryEoP, 0);
  /* zero case */
  T.near("nothing available: nothing distributed",
    WF.distribute(0, 1, 0, 1.05).distribution, 0);
  /* spec-silent: negative cash to equity. Feuil1!131 has NO MAX(0,..),
   * so the deficit is carried forward as a negative treasury. */
  var d4 = WF.distribute(-500000, 1, 0, 1.05);
  T.near("negative cash: nothing distributed", d4.distribution, 0);
  T.near("negative cash IS carried forward (no floor in R131)",
    d4.treasuryEoP, -500000);
  /* boundary: the buffer exceeds the cash available */
  var d5 = WF.distribute(50000, 1, 2375000, 1.05);
  T.near("buffer larger than the cash: cap is 0", d5.maxPermissible, 0);
  T.near("buffer larger than the cash: nothing distributed", d5.distribution, 0);
  T.near("buffer larger than the cash: all trapped", d5.treasuryEoP, 50000);

  /* ============================================================== */
  T.suite("checkFinite -- fail loud, never silent");
  var badGrid = { 72: [1, NaN, 3], 91: [Infinity, 2], 115: [1, 2, 3] };
  var found = WF.checkFinite(badGrid);
  T.eq("both anomalies detected", found.length, 2);
  T.isTrue("a clean grid reports nothing",
    WF.checkFinite({ 72: [1, 2, 3] }).length === 0);
  /* the report must locate the anomaly, not just count it */
  var okRow = 0, okPeriod = 0, fi;
  for (fi = 0; fi < found.length; fi++) {
    if (found[fi].row === 72 && found[fi].period === 2) { okRow = 1; }
    if (found[fi].row === 91 && found[fi].period === 1) { okPeriod = 1; }
  }
  T.eq("NaN located at row 72 period 2", okRow, 1);
  T.eq("Infinity located at row 91 period 1", okPeriod, 1);

  /* ============================================================== */
  T.suite("runPeriod / runAll -- driver integrity");
  var run = WF.runAll({});
  T.eq("31 periods computed", run.periods.length, 31);
  T.eq("no NaN or Infinity anywhere in the base case", run.anomalies.length, 0);
  T.near("period 1 opens with no treasury", run.periods[0].treasuryBoP, 0);
  T.near("period 1 opens with an empty MRA", run.periods[0].mraBoP, 0);
  T.near("period 1 opens with an empty DSRA", run.periods[0].dsraBoP, 0);
  T.near("period 1 debt BoP = Principal_Used",
    run.periods[0].debt.debtBoP, run.pre.principalUsed, 1e-6);
  T.eq("period 1 year = Year_Base", run.periods[0].year, 2026);
  T.eq("period 31 year = Year_Base + 30", run.periods[30].year, 2056);

  /* State chaining: every balance handed forward must be the next period's
   * opening balance. This is checked independently of the oracle -- it
   * would catch a mis-wired carry even if the oracle happened to agree. */
  var chainOk = 1, ci, a, b;
  for (ci = 0; ci < 30; ci++) {
    a = run.periods[ci]; b = run.periods[ci + 1];
    if (Math.abs(a.next.treasury - b.treasuryBoP) > 1e-9) { chainOk = 0; }
    if (Math.abs(a.next.mra - b.mraBoP) > 1e-9) { chainOk = 0; }
    if (Math.abs(a.next.dsra - b.dsraBoP) > 1e-9) { chainOk = 0; }
    if (Math.abs(a.next.debt - b.debt.debtBoP) > 1e-9) { chainOk = 0; }
    if (Math.abs(a.next.deferred - b.debt.deferredBoP) > 1e-9) { chainOk = 0; }
  }
  T.eq("all five balances chain correctly across all 31 periods", chainOk, 1);

  /* Determinism: same inputs, byte-identical grid. */
  var run2 = WF.runAll({});
  var detOk = 1, rk, vi;
  for (rk in run.grid) {
    if (!run.grid.hasOwnProperty(rk)) { continue; }
    for (vi = 0; vi < run.grid[rk].length; vi++) {
      if (run.grid[rk][vi] !== run2.grid[rk][vi]) { detOk = 0; }
    }
  }
  T.eq("two runs with the same inputs are identical", detOk, 1);

  /* The caller's parameter object must not be mutated. */
  var mine = { Traffic_Base: 30000000 };
  WF.runAll(mine);
  T.eq("the caller's params object is left alone",
    WF.PARAM_NAMES.length > 0 && mine.CPI === undefined, true);

  /* Stage list drives the UI's Step-through; it must match the graph. */
  T.eq("six waterfall stages are exposed", WF.STAGES.length, 6);
}
