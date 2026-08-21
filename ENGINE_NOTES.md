# Engine notes — findings from Feuil1

Written while implementing `src/engine.js`. These are things the Excel does
that the brief's prose summary does not mention, or states differently. In
every case the **Excel is the source of truth** and the engine reproduces it;
where I chose not to reproduce something, it is called out explicitly.

The formulas were extracted from the workbook XML directly, not read off the
rendered sheet, so every claim below is checkable against `Feuil1`.

---

## 1. `HM_Peak_Cycle` — deliberate deviation from the workbook

**In the workbook it is not the cycle length.** `Feuil1!46` (the peak counter)
is:

```
=IF(N46=5,1,N46+1)
```

The **5 is hardcoded**. It is not `HM_Peak_Cycle` (`L46`). The counter always
runs 1,2,3,4,5,1,2,… on a fixed five-year cycle. `HM_Peak_Cycle` is then used
only in `Feuil1!47`:

```
=$L$47*(N46=$L$46)
```

so in the workbook it selects **which slot of that fixed 5-year cycle carries
the peak**, not how often a peak occurs:

| `HM_Peak_Cycle` | Workbook behaviour |
|---|---|
| 3 | peaks at 3, 8, 13, 18, 23, 28 (still every 5 years, offset) |
| 5 (default) | peaks at 5, 10, 15, 20, 25, 30 |
| 6 … 10 | **never — no peak at all, ever** |

**The engine deviates, at the user's explicit request:** the counter wraps on
`HM_Peak_Cycle` itself, so the parameter means "a heavy-maintenance peak every
N years". Cycle 15 gives peaks at 15 and 30; cycle 3 gives 3, 6, 9, …

### Why this does not weaken the oracle proof

At `HM_Peak_Cycle = 5` the generalised counter reproduces the workbook's
hardcoded sequence **period for period**, and the peak still lands on
5, 10, 15, … All 15 oracle scenarios use cycle 5, so all 15 still reproduce
the Excel exactly (worst divergence unchanged at 8.009e-8). The two
formulations differ only for cycle ≠ 5 — territory the oracle never
exercised, and where the workbook's behaviour was arguably a bug.

`test_units.js` asserts this compatibility guarantee directly
("cycle 5 reproduces the workbook's hardcoded sequence exactly"). **If that
assertion ever fails, the oracle proof is void.**

Edge cases handled: cycle 1 = every period peaks; cycle > 31 = no peak inside
the model; cycle ≤ 0 is clamped to 1 so the counter can never fail to wrap.
The clamped value is used for both the wrap and the comparison, so a
fractional cycle cannot wrap-but-never-match.

UI consequence: the brief's §4 slider range of 3…10 is now too narrow to be
interesting. Widened to 1…30 with the default still 5.

## 2. `Num_Periods` is display-only

`L4` feeds `L3 = L2 + L4`, and `L3` is referenced **only** by the year-header
rows (9, 15, 19, 23, 31, 35, 43, 50, 54). No calculation row references it.
The model is always 31 period columns (N…AR) wide.

The engine reproduces this: `Num_Periods` changes the year headers and
nothing else. There is a test that asserts rows 72, 130 and 142 are
bit-identical between `Num_Periods = 10` and `Num_Periods = 30`.

## 3. Rows 23, 35 and 54 are year headers, not CPI

These rows carry the label "CPI" in column C and the CPI lever in column L,
but their **period columns hold the year**:

```
N23: =$L$2                        O23: =IF(N23+1<=$L$3,N23+1,"")
```

Reading them as the CPI value is the single easiest mistake to make in this
model. The oracle caught it immediately (expected 2026, got 0.015).

*Deliberate divergence:* past the horizon Excel feeds a blank into `+1` and
cascades `#VALUE!` errors. The engine emits `""` instead. Propagating a
spreadsheet error is not useful behaviour, and the oracle never reaches this
case (all scenarios use `Num_Periods = 30`, so the horizon is never crossed).

## 4. `Feuil1!AR103` is a hardcoded `0`

The DSRA target formula is `=<DebtEoP>*Interest_Rate + <next period's
principal target>`, but in the **last** column it is literally `=0`. There is
no period 32 to reserve against, so the requirement is released entirely.
Not an edge case to infer — a different formula in one cell.

## 5. Treasury EoP is *not* floored at zero

The brief says "all reservoir balances are floored at 0". Every reserve row
does have a `MAX(0,…)`, but `Feuil1!131` is a bare subtraction:

```
=N122-N130
```

so a cash deficit is carried forward as a **negative treasury**. Four
scenarios (S04, S05, S06, S07) rely on this. The engine follows the Excel.

## 6. Rows 105 and 140 exist but were not exported

`Feuil1` puts their labels one row above the values (`R104` "BoP",
`R139` "Treasury BoP"), so the oracle export skipped them. But
`cascade_graph.json` references `Feuil1!105-110` (DSRA) and `Feuil1!140`
(TREAS_BOP), so the tanks need them. The engine emits both; they are simply
not oracle-compared.

## 7. The DSCR/LLCR lock-up gates need a comparison epsilon

In a sculpted period the debt service comes out equal to `CFADS/DSCR`, so
DSCR realised is `CFADS / (CFADS / DSCR)`. That division **round-trip is not
exact** in IEEE 754 — it lands one ULP low. `DSCR_Min` typically sits at
exactly that same value, so a bare `>=` makes the lock-up outcome hinge on a
single ULP.

Measured on S13 period 10: debt service equals the CFADS target *to the bit*,
and DSCR realised is still `1.2 - 2.220446e-16`. S06 period 13 shows the same
one-ULP gap. LibreOffice hides this by snapping near-clean arithmetic
results, which is why the oracle stores a clean `1.2` and reads the gate as
passed.

The engine compares against `threshold - 1e-9`. That is ~2e-8 of the smallest
`DSCR_Min` slider step (0.05), so it cannot mask any economically meaningful
shortfall, while sitting seven orders of magnitude above the dust it absorbs.
Tests assert both halves: one-ULP shortfalls pass, a 1e-6 shortfall still
blocks.

## 8. `cascade_graph.json` is cyclic as written — and that is fine

The raw node graph contains

```
MRA  -> HM_PAY -> CASH_AHM -> DEBT -> CASH_RES -> MRA_RECH  -> MRA
DSRA -> DEBT   -> CASH_RES -> DSRA_RECH -> DSRA
```

because it collapses each reservoir's two roles into one node: a reservoir is
**read** at BoP (to fund a draw) and **written** at EoP (recharge/release).

The invariant the engine depends on is that splitting each reservoir into
BoP (source) and EoP (sink) makes one period a DAG. `test_graph.js` asserts
exactly that, and also asserts the raw cycles are present, so the test records
the real structure of the file rather than papering over it. This is why the
model needs no fixed-point iteration and why one forward pass is valid.

The renderer will need the same BoP/EoP split when it draws the reservoirs.

---

## Environment

No Node.js on this machine (Python 3.14 only). `src/engine.js` is therefore
written in conservative ES5-safe style — `var`, plain `for` loops, no
`Array.prototype.map` / `Object.keys` / `JSON` — so the **same file** runs
unmodified under `cscript //E:JScript` (the CLI harness) and in any browser.
UI code added later is free to use modern JS; the engine is not.

`tools/make_data_js.py` wraps the two source JSON files as plain `.js`
globals, because the finished app must run from `file://` and `fetch()` of a
local JSON file is blocked by CORS, while `<script src>` is not. The cscript
harness needs the same wrappers since its JScript has no `JSON` object.
