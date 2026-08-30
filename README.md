# Interactive MONIAC-style cash-flow waterfall

A deterministic cash-flow waterfall simulator for a project-finance SPV,
rendered as a hydraulic machine: cash is water, compartments are tanks that
fill and empty, and pipes carry the flow between them in a fixed order of
priority.

Everything is vanilla HTML/CSS/JS. No build step, no dependencies, no
framework.

## How to run it

Open `index.html`. That is all — the two source JSON files are wrapped as JS
globals precisely so the app works from `file://` with no server.

If you prefer to serve it:

```bash
python -m http.server 8123
```

then open <http://localhost:8123/index.html>.

**Run the engine's tests** (no Node on this machine, so the harness runs under
Windows Script Host):

```bash
cscript //nologo tests\run_tests.wsf
```

Or open `tests/tests.html` in a browser for the identical suite. Both run the
same `src/engine.js`.

Regenerate the JS data wrappers after editing either source JSON:

```bash
python tools\make_data_js.py
```

## File structure

```
index.html              the cascade
glossary.html           the explanations page
src/engine.js           pure calculation. no DOM. ES5-safe on purpose
css/app.css             paper/ink palette, tank + liquid + pipe language
js/layout.js            box geometry, per-node values, step-through staging
js/render.js            builds the SVG from the graph + engine output
js/params.js            the assumptions panel
js/labels.js            display names for the graph's nodes (see note below)
js/glossary.js          glossary content, shared by both pages
js/app.js               wiring: params -> engine -> cascade
tests/run_tests.wsf     CLI test entry point
tests/tests.html        browser test entry point
tests/harness.js        assert/report helpers
tests/test_units.js     per-function unit tests
tests/test_oracle.js    all 15 oracle scenarios, cell by cell
tests/test_graph.js     graph <-> engine consistency
tests/oracle_data.js    generated from oracle_scenarios.json (tests only)
data/graph_data.js      generated from cascade_graph.json (loaded by the app)
tools/make_data_js.py   regenerates the two files above
ENGINE_NOTES.md         what Feuil1 actually does, and where we deviate
ENGINE_TEST_REPORT.txt  full output of the last test run
```

`src/engine.js` is written in deliberately conservative ES5 (`var`, plain
loops, no `Array.prototype.map`, no `JSON`) so that the *same file* runs
unmodified under both `cscript //E:JScript` and any browser. The UI files use
modern JS freely; the engine does not.

Two conventions worth knowing:

- **No spreadsheet references in user-facing text.** The workbook exists only
  so the engine can be checked against it; it is not something a reader of the
  app needs to know about. Row-level traceability lives in `src/engine.js`
  comments and `ENGINE_NOTES.md`, where it is useful.
- **`js/labels.js` overrides the graph's node labels for display only.**
  `cascade_graph.json` is an input file and is never edited; its labels are
  inconsistently capitalised and a few carry `BoP`/`EoP` jargon, so the app
  renders its own sentence-case names instead.

## Engine status

```
assertions      : 308 passed / 0 failed
oracle scenarios: 15 / 15 reproduced (31,620 cells compared)
worst divergence: 1.192e-7   (tolerance 0.01 absolute)
branch coverage : 42 / 45
```

All 15 scenarios in `oracle_scenarios.json` reproduce the **corrected** Excel
across 68 rows × 31 periods. The worst divergence anywhere is ~1e-7 on euro
amounts of order 1e7 — floating-point noise plus the fixed-point convergence
residual from correction #3 (see `ENGINE_NOTES.md` §0). No cell needed a
tolerance concession.

Three branches are unexercised by the oracle (`payHM/negCash`,
`serviceDebt/principalStarved`, `distribute/negTreasury`); no scenario produces
them, so they are covered by unit tests only.

## Scope status

**Must — all done**

- Engine correct, proven against all 15 oracle scenarios, with a coverage
  report.
- Grouped sliders for every yellow parameter; changing one re-runs the model.
- Cascade rendered from `cascade_graph.json`; the three reserves and treasury
  hold a level period to period; cash flows down the pipes.
- **Run** (play the periods, with a speed control) and **Step-through**
  (one of the six waterfall stages at a time) both work; period navigation
  works.
- DEBT renders as three ordered sub-compartments: deferred interest →
  interest → principal.

**Should — all done**

- Draw and release pipes differ in colour, width, dash *and* arrowhead.
- Signals surfaced on the compartments: `UNPAID`, `HM UNPAID`, `LOCKED UP`,
  `CAPPED`, `INTEREST DEFERRED`.
- Glossary page with 16 entries, plus every compartment and every pipe
  clickable with an inline explanation and a link through to its entry.
- The two reserve accounts show their target formula **worked through with
  the numbers currently on screen**, updating as sliders and periods change.
- Per-period readout of the key figures (CFADS, debt service, DSCR, LLCR,
  debt outstanding, deferred interest, distribution, treasury).

**Could — not done**

- Nicer fluid animation, a synthesis chart over time, an assumptions page,
  scenario presets loaded from the oracle.
- The cascade is portrait (900 × 1300) in a scrollable pane, so on a wide
  screen you scroll to follow the cash rather than seeing it all at once.

## Determinism

`Random_Weight` is forced to 0 inside `normaliseParams`, so no caller can
reintroduce randomness. There is no random toggle. The same inputs always
give the same result, and a test asserts two runs are identical.

The model is deterministic but no longer a single forward pass: correction #3
(see `ENGINE_NOTES.md` §0) makes each period circular, so `runAll` solves the
whole grid with a bounded, damped fixed-point loop that converges to a residual
below 1e-9. `Run` is a bounded interval that stops itself at period 31, and
`tests/test_graph.js` proves the intra-period **flow** graph is acyclic once
each reservoir is split into its BoP and EoP roles — the iteration lives in the
reserve *targets*, not the flow.

NaN and Infinity are never swallowed: `checkFinite` walks the finished grid
and the app shows the offending Feuil1 row and period in a red bar, with the
affected tanks outlined.

## What is deliberately not in this repository

The reference financial model (`projet_vibe-coding.xlsx`) is a personal working file and is not published.
It is not needed: the engine is proven against `oracle_scenarios.json`, which
holds the recalculated results the engine must reproduce. If you have the
workbook, the row-level mapping in `ENGINE_NOTES.md` and the `[R###]` comments
throughout `src/engine.js` let you trace every line back to it.

## Licence

MIT — see `LICENSE`.

## Read this before trusting a number

`ENGINE_NOTES.md` documents the workbook behaviours its prose description does
not mention, plus the three deliberate model corrections (§0), with the formula
evidence — including the cash-basis debt sculpting (#3) and its fixed-point
iteration, the `HM_Peak_Cycle` deviation, the year-header rows that masquerade
as CPI, the treasury balance that is *not* floored at zero, and the one-ULP
floating-point knife edge in the DSCR lock-up gate.
