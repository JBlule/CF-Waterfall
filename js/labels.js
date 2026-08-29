/* =====================================================================
 * labels.js -- the presentational layer over cascade_graph.json.
 *
 * cascade_graph.json is an input file and stays untouched. Three things in
 * it reach the screen and none of them is written for a reader:
 *   - `label`, inconsistently capitalised, with BoP/EoP jargon;
 *   - `doc`,   terse working notes with abbreviations mid-sentence;
 *   - `flow`,  the caption on each pipe.
 * All three are overridden here, for DISPLAY ONLY.
 *
 * REGISTER. The vocabulary throughout is the one a project-finance
 * practitioner uses in front of a class: "distribution to shareholders",
 * not "distribution to equity"; "cash carried forward", not "treasury
 * carried forward"; "tenor", "arrears", "replenishment", "at target".
 * Acronyms are expanded where the compartment has room to expand them and
 * used freely thereafter.
 * ===================================================================== */

const DISPLAY_LABEL = {
  /* title case -> sentence case */
  TOLL:       "Toll revenue",
  HM:         "Heavy maintenance due",

  /* BoP/EoP is jargon, and this balance is the project company's cash, not
   * a treasury function */
  TREAS_BOP:  "Cash brought forward",
  TREAS_EOP:  "Cash carried forward",

  /* name the accounts properly: the bare acronym teaches nobody anything */
  MRA:        "MRA — maintenance reserve",
  DSRA:       "DSRA — debt service reserve",

  /* spell out the abbreviations the graph uses mid-label */
  CURCASH:    "Cash in hand",
  HM_PAY:     "Heavy maintenance settled",
  CASH_AHM:   "Cash after heavy maintenance",
  CASH_RES:   "Cash available for the reserve accounts",

  /* "recharge" is a borrowing; a reserve is replenished */
  MRA_RECH:   "MRA replenishment",
  DSRA_RECH:  "DSRA replenishment",

  /* "cash available for distribution" is the standard term; "pre-test" was
   * opaque, and the recipients are shareholders, not "equity" */
  CASH_EQ:    "Cash available for distribution",
  DISTRIB:    "Distribution to shareholders"
};

/* The paragraph shown under the title in the inspector. */
const DISPLAY_DOC = {
  TOLL:
    "Revenue from tolled traffic: the tariff per kilometre applied to the " +
    "traffic volume, indexed to inflation.",
  OPEX:
    "The recurring cost of operating the asset. It ranks ahead of debt " +
    "service, and is deducted in arriving at CFADS.",
  HM:
    "The major-maintenance obligation falling due this period — " +
    "resurfacing, structures, equipment renewal. A modest recurring charge, " +
    "plus a substantial one whenever the maintenance cycle peaks.",
  TREAS_BOP:
    "The closing cash balance of the previous period, brought forward into " +
    "this one.",
  CURCASH:
    "Toll revenue less operating costs, plus the cash brought forward. This " +
    "is the cash genuinely in hand before any obligation is met.",
  HM_PAY:
    "Settlement of the maintenance obligation: cash in hand is applied " +
    "first, and the maintenance reserve is drawn for any shortfall.",
  CASH_AHM:
    "The cash remaining once heavy maintenance has been settled. This is " +
    "what the lenders are served from.",
  MRA:
    "Maintenance Reserve Account. Funded ahead of the maintenance " +
    "programme and drawn when the cash in hand cannot meet the charge.",
  DEBT:
    "Senior debt service, applied in a strict internal ranking: deferred " +
    "interest, then current interest, then principal.",
  DEBT_DEF:
    "Interest that fell due in an earlier period and could not be paid. It " +
    "ranks first within the debt compartment and does not itself bear " +
    "interest.",
  DEBT_INT:
    "Interest accruing on the balance outstanding this period. Ranks " +
    "second within the debt compartment, behind arrears.",
  DEBT_PRIN:
    "Repayment of principal, sculpted to the target cover ratio. Ranks " +
    "last within the debt compartment, which makes it the shock absorber " +
    "when cash is short.",
  DSRA:
    "Debt Service Reserve Account. A liquidity buffer sized on next " +
    "period's scheduled debt service, and applied only to interest — never " +
    "to principal.",
  CASH_RES:
    "The cash remaining once the lenders have been served. It funds the " +
    "replenishment of the two reserve accounts.",
  MRA_RECH:
    "The contribution paid into the maintenance reserve this period, to " +
    "restore it to its target balance.",
  DSRA_RECH:
    "The contribution paid into the debt service reserve this period, to " +
    "restore it to its target balance.",
  CASH_EQ:
    "Residual cash, plus any surplus released by the reserve accounts. " +
    "This is the amount presented to the lock-up tests.",
  LOCKUP:
    "The distribution lock-up. Four conditions — DSCR, LLCR, and both " +
    "reserve accounts at target — must be satisfied before any cash may " +
    "leave the structure.",
  DISTRIB:
    "The dividend actually paid to the shareholders: permitted only where " +
    "the lock-up tests are satisfied, and capped so that the project " +
    "retains a buffer.",
  TREAS_EOP:
    "Cash retained in the project company at the close of the period. It " +
    "becomes the opening balance of the next one."
};

/* The caption on a pipe, keyed "FROM->TO". */
const DISPLAY_FLOW = {
  "TOLL->CURCASH":        "toll revenue collected",
  "OPEX->CURCASH":        "operating costs paid",
  "TREAS_BOP->CURCASH":   "cash brought forward from the previous period",
  "CURCASH->HM_PAY":      "heavy maintenance settled, ahead of the lenders",
  "HM->HM_PAY":           "the maintenance charge falling due",
  "MRA->HM_PAY":          "reserve drawn against the maintenance shortfall",
  "HM_PAY->CASH_AHM":     "cash net of heavy maintenance",
  "CURCASH->CASH_AHM":    "cash remaining",
  "CASH_AHM->DEBT":       "senior debt service paid",
  "DSRA->DEBT":           "reserve drawn to meet interest and arrears",
  "DEBT_DEF->DEBT_INT":   "once the arrears are cleared",
  "DEBT_INT->DEBT_PRIN":  "once current interest is paid",
  "DEBT->CASH_RES":       "cash remaining after debt service",
  "CASH_RES->MRA_RECH":   "replenish the maintenance reserve to target",
  "MRA_RECH->MRA":        "contribution to the maintenance reserve",
  "CASH_RES->DSRA_RECH":  "replenish the debt service reserve to target",
  "DSRA_RECH->DSRA":      "contribution to the debt service reserve",
  "MRA->CASH_EQ":         "maintenance reserve surplus released",
  "DSRA->CASH_EQ":        "debt service reserve surplus released",
  "CASH_RES->CASH_EQ":    "cash remaining after replenishment",
  "CASH_EQ->LOCKUP":      "all remaining cash is presented to the tests",
  "LOCKUP->DISTRIB":      "tests satisfied: the permitted distribution",
  "LOCKUP->TREAS_EOP":    "everything not distributed is retained",
  "TREAS_EOP->TREAS_BOP": "carried into the following period"
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

function displayDoc(node) {
  if (!node) { return ""; }
  return DISPLAY_DOC[node.id] || node.doc;
}

function displayFlow(edge) {
  if (!edge) { return ""; }
  return DISPLAY_FLOW[edge.from + "->" + edge.to] || edge.flow;
}
