/* =====================================================================
 * labels.js -- presentational names for the graph's nodes.
 *
 * cascade_graph.json is an input file and stays untouched. Its labels are
 * inconsistently capitalised ("Toll Revenues" and "Heavy Maintenance" in
 * title case, sitting beside "Current cash" and "Debt service" in sentence
 * case) and a few carry BoP/EoP jargon that a newcomer will not know.
 *
 * Overridden here for DISPLAY ONLY, in sentence case throughout, with
 * acronyms left in capitals where they are genuinely acronyms.
 * ===================================================================== */

const DISPLAY_LABEL = {
  /* title case -> sentence case */
  TOLL:       "Toll revenues",
  HM:         "Heavy maintenance",

  /* BoP/EoP is jargon; the parenthetical was doing the real work anyway */
  TREAS_BOP:  "Treasury brought forward",
  TREAS_EOP:  "Treasury carried forward",

  /* spell the reserves out: the acronym alone teaches nobody anything */
  MRA:        "MRA — maintenance reserve",
  DSRA:       "DSRA — debt service reserve",

  /* "Equity" was capitalised mid-sentence; "pre-test" was opaque */
  CASH_EQ:    "Cash available to equity (before tests)",
  DISTRIB:    "Distribution to equity"
};

function displayLabel(node) {
  if (!node) { return ""; }
  return DISPLAY_LABEL[node.id] || node.label;
}

function displayLabelById(id, graph) {
  if (DISPLAY_LABEL[id]) { return DISPLAY_LABEL[id]; }
  const n = graph ? graph.nodes.find((x) => x.id === id) : null;
  return n ? n.label : id;
}
