/* =====================================================================
 * glossary.js -- the explanations layer.
 *
 * Shared by glossary.html (the dedicated page) and index.html (the inline
 * panel), so the two can never drift apart.
 *
 * Each entry answers three questions the brief asks for:
 *   plain  -- what the mechanism is
 *   model  -- how it operates in THIS model, with the actual arithmetic
 *   why    -- where it ranks in the order of priority, and why
 *
 * REGISTER. This is written the way a project-finance practitioner would
 * present the material to a class: standard market vocabulary, defined once
 * and then used. "Distribution to shareholders", not "distribution to
 * equity"; "cash carried forward", not "treasury carried forward"; tenor,
 * gearing, arrears, replenishment, event of default. Precise rather than
 * simplified — the reader is assumed to be a student of the subject, not a
 * stranger to it.
 *
 * NOTE FOR MAINTAINERS: deliberately no spreadsheet row references in any
 * user-facing text. The Excel workbook exists only so the JS engine can be
 * checked against it; it is not something a reader of this app needs to know
 * about. Row-level traceability lives in src/engine.js comments and
 * ENGINE_NOTES.md, where it is useful.
 * ===================================================================== */

const GLOSSARY_ENTRIES = [
  {
    id: "waterfall",
    term: "The cash-flow waterfall",
    aka: "the order of priority",
    plain: "The contractual order in which the project company applies its " +
      "cash. Each period the available cash enters at the top, every claim " +
      "is settled in rank, and only what survives to the bottom is " +
      "available to the shareholders.",
    model: [
      "Toll revenue less operating costs, plus the cash carried forward " +
      "from the previous period, gives the cash in hand. That cash is then " +
      "applied in strict rank: heavy maintenance, senior debt service, " +
      "replenishment of the two reserve accounts, and finally a " +
      "distribution — the last of these permitted only where the lock-up " +
      "tests are satisfied.",
      "The ranking is not discretionary. A claim is settled in full before " +
      "any cash reaches the claim beneath it, and management has no " +
      "latitude to reorder it."
    ],
    why: "The order of priority is the substance of the financing " +
      "agreements. It is why equity ranks last, and why equity absorbs the " +
      "first loss in a weak year: every senior claim is made whole before " +
      "the shareholders receive anything at all.",
    see: ["cfads", "lockup", "distribution"]
  },
  {
    id: "cfads",
    term: "CFADS",
    aka: "Cash Flow Available for Debt Service",
    plain: "The cash the project generates from operations, measured before " +
      "any payment to the lenders: revenue less the cash costs of running " +
      "the asset.",
    model: [
      "CFADS = toll revenue − operating costs − heavy maintenance, all in " +
      "nominal terms, after indexation.",
      "One distinction repays close attention, because it is where the " +
      "subject most often goes wrong. CFADS is a <em>measurement " +
      "convention</em>, not a movement of cash. It sizes the debt, sculpts " +
      "the amortisation profile and drives the LLCR — whereas the waterfall " +
      "itself begins from the cash in hand (toll revenue − operating costs " +
      "+ cash brought forward) and settles heavy maintenance out of that " +
      "cash and out of the maintenance reserve.",
      "So CFADS deducts heavy maintenance in a single line, while the " +
      "waterfall treats it as an event that may draw on a reserve and may " +
      "go unmet altogether. Two deliberately different views of the same " +
      "period: one for the cover ratios, one for the cash."
    ],
    why: "It is the numerator of every cover ratio the lenders test, so it " +
      "is established first and independently of the waterfall it will " +
      "later fund.",
    params: ["Traffic_Base", "Tariff_km", "CPI", "OPEX_Base", "HM_Base"],
    see: ["inflation", "dscr", "llcr", "debt-sizing"]
  },
  {
    id: "inflation",
    term: "Indexation",
    aka: "CPI, and the real/nominal distinction",
    plain: "Prices rise across the concession term. Toll revenue, operating " +
      "costs and maintenance charges are all indexed, so a euro of the " +
      "final period is not comparable with a euro of the first.",
    model: [
      "Every amount is stated twice. In <b>real</b> terms it is expressed " +
      "in first-period money and stays flat. In <b>nominal</b> terms it is " +
      "multiplied by an index that begins at 1.00 in the first period and " +
      "compounds at the inflation rate thereafter — period <em>n</em> " +
      "therefore carries <code>(1 + CPI)</code> raised to the power " +
      "<code>n − 1</code>.",
      "A single rate indexes all three lines: revenue, operating costs and " +
      "heavy maintenance. Because they are indexed together, the rate does " +
      "little to the <em>shape</em> of the cash-flow profile but a great " +
      "deal to its magnitude. Over thirty periods at 5% a year, the final " +
      "period's figures exceed the first's by a factor of more than four.",
      "The debt is the exception: a fixed principal at a fixed rate, and it " +
      "does not index. Indexation therefore works quietly in favour of the " +
      "lenders and then of the shareholders — the cash grows while the debt " +
      "service does not, cover ratios improve, and distributions begin " +
      "earlier. Set the rate to 0% and the effect disappears."
    ],
    why: "It is applied before anything else, because every figure further " +
      "down the waterfall is a nominal one: the euros actually received or " +
      "paid in that year.",
    params: ["CPI"],
    see: ["cfads", "hm-priority", "debt-sizing"]
  },
  {
    id: "debt-sizing",
    term: "Debt sizing",
    aka: "the present-value method",
    plain: "How much the lenders will advance: the present value of the " +
      "cash the project can commit to debt service over the tenor of the " +
      "loan.",
    model: [
      "For each year within the tenor, take that year's CFADS, divide it by " +
      "the target cover ratio to obtain the debt service the lenders would " +
      "permit, and discount it at the interest rate. Summing gives the " +
      "sizing:",
      "<code>Σ (CFADS ÷ DSCR) ÷ (1 + rate)<sup>year</sup></code>",
      "Under <b>cash-flow sizing</b> that sum becomes the principal " +
      "advanced — some €31.2M on the base case. Fix the principal manually " +
      "instead and the sized figure is still reported alongside, for " +
      "comparison. That is how you construct a deliberately over-geared " +
      "project and watch it fail."
    ],
    why: "It is derived from CFADS alone, before any cash moves, so it " +
      "never depends on the waterfall it is about to fund. That is what " +
      "keeps the model a single forward pass through time, free of " +
      "circularity.",
    params: ["Sizing_Mode", "Debt_Nominal", "Interest_Rate", "Debt_Duration", "DSCR"],
    see: ["cfads", "sculpting"]
  },
  {
    id: "dscr",
    term: "DSCR",
    aka: "Debt Service Cover Ratio",
    plain: "The number of times the period's CFADS covers the period's debt " +
      "service. 1.20× denotes a 20% margin over the amount falling due.",
    model: [
      "DSCR realised = CFADS ÷ the debt service actually paid. Where no " +
      "debt service was paid the ratio is left undefined rather than " +
      "reported as infinite.",
      "The same ratio discharges <b>two distinct functions</b> here, and " +
      "they are set independently. As a <b>sculpting target</b> it " +
      "determines how much principal falls due each year. As a <b>lock-up " +
      "threshold</b> it determines whether the shareholders may be paid at " +
      "all.",
      "Both default to 1.20, with a consequence worth noticing: a year " +
      "whose principal has been sculpted lands on a realised DSCR of " +
      "exactly 1.20 — precisely its own lock-up threshold. The test is " +
      "passed by construction, with no margin whatever. Raise the lock-up " +
      "threshold one notch above the sculpting target and distributions " +
      "cease almost entirely until the debt has amortised."
    ],
    why: "It is the lenders' primary measure of headroom within any single " +
      "year.",
    params: ["DSCR", "DSCR_Min"],
    see: ["sculpting", "llcr", "lockup"]
  },
  {
    id: "sculpting",
    term: "DSCR sculpting",
    aka: "shaping the amortisation profile",
    plain: "Rather than a level repayment schedule, the principal falling " +
      "due each year is set so that total debt service is a constant " +
      "multiple of that year's cash flow. The amortisation profile follows " +
      "the revenue profile.",
    model: [
      "Principal due = <code>CFADS ÷ DSCR − interest accrued</code>, " +
      "floored at zero and capped at the balance outstanding. Three cases:",
      "• beyond the tenor, nothing falls due;<br>" +
      "• <b>in</b> the final year of the tenor, the entire balance " +
      "outstanding falls due at once, whatever the sculpt would otherwise " +
      "indicate;<br>" +
      "• otherwise, sculpt to the target.",
      "One consequence deserves to be sat with. In any year where interest " +
      "alone already exceeds CFADS ÷ DSCR, the sculpted principal is " +
      "<b>zero</b> and the loan does not amortise at all. Gear the project " +
      "highly enough and it never amortises — at which point the whole " +
      "balance falls due at maturity and goes unpaid."
    ],
    why: "Sculpting fits the debt to the project rather than the project to " +
      "the debt. It also makes principal the shock absorber: it is the " +
      "third and last of the three debt buckets to be served, and therefore " +
      "the first to be starved when cash is short.",
    params: ["DSCR", "Debt_Duration"],
    see: ["dscr", "deferred-interest", "debt-sizing"]
  },
  {
    id: "hm-priority",
    term: "Heavy maintenance",
    aka: "also called major maintenance, and why it outranks the debt",
    plain: "Periodic renewal of the asset — resurfacing, structures, " +
      "equipment replacement. A modest recurring charge each year, with a " +
      "substantial one whenever the maintenance cycle peaks. The market " +
      "also calls it major maintenance or lifecycle expenditure.",
    model: [
      "The charge each period is the recurring amount plus, in a peak year, " +
      "the peak amount, indexed. A peak falls every " +
      "<code>HM_Peak_Cycle</code> years.",
      "It is settled out of the cash in hand first, and the maintenance " +
      "reserve is drawn against any shortfall. Where cash and reserve " +
      "together are still insufficient, the period is flagged <b>HM " +
      "UNPAID</b>: the works could not be funded, which is a breach of the " +
      "concession agreement rather than a financing failure.",
      "Raise the peak charge far enough and you will see the reserve " +
      "exhaust itself in the peak year and the flag appear."
    ],
    why: "This is the one claim ranking <b>ahead of the senior debt</b>. " +
      "The concession agreement obliges the operator to maintain the asset, " +
      "and the lenders accept subordination to it because an unmaintained " +
      "road eventually generates nothing at all. Every other ranking in the " +
      "waterfall is negotiated between creditors; this one is not.",
    params: ["HM_Base", "HM_Peak_Cycle", "HM_Peak_Amount", "CPI"],
    see: ["mra", "draw-vs-release", "waterfall"]
  },
  {
    id: "deferred-interest",
    term: "Deferred interest",
    aka: "arrears, and the ranking within the debt compartment",
    plain: "Interest that fell due and could not be paid. It is recorded as " +
      "arrears, and the arrears must be cleared before any current interest " +
      "is served.",
    model: [
      "Whatever part of the current interest charge cannot be met is added " +
      "to the arrears balance and carried forward. The arrears are " +
      "<b>non-capitalising</b>: they do not themselves bear interest, so " +
      "the deficit does not compound of its own accord.",
      "Within the debt compartment the ranking is absolute — <b>deferred " +
      "interest, then current interest, then principal</b>. Those are the " +
      "three stacked buckets in the waterfall: each must be filled " +
      "completely before any cash reaches the one beneath it. Step through " +
      "a period and the ranking becomes plain.",
      "If arrears or unpaid principal remain outstanding once the tenor has " +
      "expired, the period is flagged <b>UNPAID</b>."
    ],
    why: "Arrears rank first of the three debt buckets. A lender owed money " +
      "from an earlier period is owed it before the current period's " +
      "charge, and long before any capital is returned.",
    params: ["Interest_Rate"],
    see: ["dsra", "sculpting", "dscr"]
  },
  {
    id: "mra",
    term: "MRA",
    aka: "Maintenance Reserve Account",
    plain: "A dedicated reserve funded ahead of the maintenance programme, " +
      "so that a peak year does not by itself sink an otherwise sound " +
      "project.",
    model: [
      "Its target is a weighted look-ahead at the maintenance still to " +
      "<em>come</em>: a proportion of next year's charge, a smaller " +
      "proportion of the year after, a smaller one again of the third year " +
      "out. The current year's own charge does not enter the calculation — " +
      "it has already been settled, and reserving against it would serve no " +
      "purpose. Set all three proportions to zero and the reserve is " +
      "disabled.",
      "The practical effect is that the target <b>rises in the period " +
      "before a maintenance peak</b>, not during it. The cash is trapped in " +
      "the reserve a year ahead of the charge, which is precisely the " +
      "intention: when the peak arrives, the funds are already in place.",
      "It is drawn to cover a maintenance shortfall, replenished out of the " +
      "cash remaining once the lenders have been served, and any balance " +
      "above target is released. The balance never falls below zero."
    ],
    why: "It is funded <b>after</b> the lenders are served but <b>before</b> " +
      "the shareholders receive anything. It is cash the project is not " +
      "permitted to distribute, because it is earmarked against an " +
      "obligation already in plain sight.",
    params: ["MRA_Coef_N", "MRA_Coef_N1", "MRA_Coef_N2"],
    see: ["reserve-target", "draw-vs-release", "hm-priority"]
  },
  {
    id: "dsra",
    term: "DSRA",
    aka: "Debt Service Reserve Account",
    plain: "A liquidity buffer holding approximately the next period's debt " +
      "service, so that a single weak year does not become an event of " +
      "default.",
    model: [
      "Its target is next period's <b>scheduled</b> debt service: the " +
      "interest that will accrue on the balance then outstanding, plus next " +
      "period's sculpted principal. \"Scheduled\" is the operative word — " +
      "it is computed without reference to next period's cash, which is " +
      "what keeps the model free of circularity.",
      "The critical restriction: the DSRA may be applied only to " +
      "<b>deferred interest and current interest</b>. It may <b>never</b> " +
      "repay principal — that must come out of cash. You can observe this " +
      "in the waterfall: a fully funded DSRA sitting immediately beside a " +
      "starved principal bucket, and unable to assist it.",
      "In the final period the target falls to zero. There is no subsequent " +
      "period to reserve against, so the entire balance is released."
    ],
    why: "A reserve exists to avert an <em>event of default</em>, and a " +
      "missed interest payment is one while a slower amortisation is not. " +
      "Permitting it to repay principal would spend a safety buffer on " +
      "something that was never urgent.",
    params: ["Interest_Rate", "DSCR", "Debt_Duration"],
    see: ["reserve-target", "deferred-interest", "draw-vs-release"]
  },
  {
    id: "reserve-target",
    term: "Reserve targets and replenishment",
    aka: "sizing a reserve, and filling it back up",
    plain: "The target is the balance a reserve is required to hold. Below " +
      "it, cash is trapped until the target is restored. Above it, the " +
      "surplus is released.",
    model: [
      "A single mechanism serves both reserve accounts. After any draws:",
      "• <b>replenish</b> by the lesser of the cash available and the " +
      "shortfall against target;<br>" +
      "• <b>release</b> whatever the balance then holds above target;<br>" +
      "• the balance never falls below zero.",
      "The maintenance reserve is replenished first, then the debt service " +
      "reserve, out of whatever cash survived the lenders. Note that the " +
      "release is measured <em>after</em> the replenishment, so a reserve " +
      "whose target has just fallen releases the surplus even though " +
      "nothing was contributed to it."
    ],
    why: "The reserve accounts rank between the lenders and the " +
      "shareholders. Funding them is not discretionary and it is not a " +
      "distribution — it is cash the project must hold before it is " +
      "permitted to pay a dividend.",
    see: ["mra", "dsra", "draw-vs-release", "lockup"]
  },
  {
    id: "draw-vs-release",
    term: "Draw and release",
    aka: "two opposite movements out of a reserve",
    plain: "A <b>draw</b> is cash leaving a reserve to meet an obligation " +
      "the operating cash could not cover. A <b>release</b> is cash leaving " +
      "a reserve because it holds more than its target requires. Both " +
      "reduce the balance; they signify opposite things.",
    model: [
      "<b>Draws</b> are triggered by a shortfall and limited by the balance " +
      "available: the maintenance reserve settling heavy maintenance, and " +
      "the debt service reserve meeting interest.",
      "<b>Releases</b> are triggered by the balance exceeding its target, " +
      "and the surplus becomes available for distribution.",
      "A draw is a symptom of stress — the project could not meet an " +
      "obligation out of its own cash flow. A release is a sign of comfort " +
      "— the obligation the reserve was held against has diminished or " +
      "fallen away."
    ],
    why: "The two are easily confused on a diagram, since both point away " +
      "from the tank. They are therefore drawn quite differently here: a " +
      "draw is a heavy amber dashed pipe with a double chevron, a release a " +
      "thin green solid pipe with an open diamond.",
    see: ["mra", "dsra", "reserve-target"]
  },
  {
    id: "llcr",
    term: "LLCR",
    aka: "Loan Life Cover Ratio",
    plain: "The DSCR asks whether a single year covers. The LLCR asks " +
      "whether the whole remaining life of the loan covers: how many times " +
      "over could the cash still to come repay the balance outstanding " +
      "today?",
    model: [
      "Take CFADS from the current period to the end of the tenor, discount " +
      "it at the interest rate, add the cash already held by the project " +
      "company, and divide by the debt still outstanding.",
      "It is left undefined while there is no debt, and the lock-up test " +
      "treats that as satisfied — otherwise a project that had repaid in " +
      "full could never distribute.",
      "Because the remaining tenor shortens as periods elapse, the ratio " +
      "changes shape over the life of the loan even where nothing about the " +
      "project itself has changed."
    ],
    why: "It captures slow deterioration that a single-year DSCR would " +
      "miss. A project may cover the current year comfortably and still be " +
      "quite unable to repay the balance at maturity.",
    params: ["LLCR_Min", "Interest_Rate", "Debt_Duration"],
    see: ["dscr", "lockup", "cfads"]
  },
  {
    id: "lockup",
    term: "Lock-up tests",
    aka: "the distribution gate",
    plain: "Four conditions. All four must be satisfied before any cash may " +
      "be distributed to the shareholders. Fail one and the cash is locked " +
      "up.",
    model: [
      "The four tests, shown as the four lamps on the gate:",
      "1. <b>DSCR</b> realised is at least the lock-up threshold<br>" +
      "2. <b>LLCR</b> is at least its threshold<br>" +
      "3. the <b>maintenance reserve</b> is funded to target<br>" +
      "4. the <b>debt service reserve</b> is funded to target",
      "There are two deliberate carve-outs: a period with no debt service " +
      "satisfies the DSCR test, and a period with no debt outstanding " +
      "satisfies the LLCR test. Without them, a project that had repaid in " +
      "full could never pay a dividend.",
      "A lock-up is <em>not</em> an event of default. The cash is not lost " +
      "— it is retained in the project company and returns next period, " +
      "when the tests are applied again. This is why the retained balance " +
      "can build for years and then release in a single distribution."
    ],
    why: "It is the last step before the distribution, because it is the " +
      "lenders' veto. The reserve accounts must be funded and the cover " +
      "ratios sound before any value leaves the structure for good.",
    params: ["DSCR_Min", "LLCR_Min"],
    see: ["distribution", "treasury", "dscr", "llcr"]
  },
  {
    id: "distribution",
    term: "Distribution to shareholders",
    aka: "the dividend",
    plain: "What actually reaches the shareholders: the residual, once " +
      "every senior claim has been settled and all four lock-up tests have " +
      "been satisfied.",
    model: [
      "Even where the tests are satisfied, the payment is capped. The cap " +
      "retains a buffer proportional to the debt service — a " +
      "post-distribution cover floor — so that the project does not strip " +
      "itself bare in a strong year.",
      "If all four tests pass, the distribution is the lesser of the cash " +
      "available and that cap. If any test fails, it is nil.",
      "Whatever is not distributed is retained by the project company and " +
      "carried forward into the next period."
    ],
    why: "This is the foot of the waterfall. Equity is the residual " +
      "claimant: paid last, capped even when it is paid, and the first " +
      "thing suspended when anything upstream goes wrong.",
    params: ["DSCR_Distrib"],
    see: ["lockup", "treasury", "waterfall"]
  },
  {
    id: "treasury",
    term: "Cash carried forward",
    aka: "the project company's own account",
    plain: "The account the project company holds in its own name. Cash " +
      "that was not distributed remains here and is available again in the " +
      "following period.",
    model: [
      "The closing balance is the cash that reached the lock-up gate, less " +
      "whatever was actually distributed. It becomes the opening balance of " +
      "the next period and feeds straight back into the cash in hand.",
      "Unlike every reserve account in this model, this balance is <b>not " +
      "floored at zero</b>. A deficit is carried forward as a negative " +
      "balance rather than written off — which is how a stressed project " +
      "carries a hole from one period into the next."
    ],
    why: "It closes the loop. Together with the two reserve balances and " +
      "the two debt balances, it is one of only five figures that cross " +
      "from one period into the next; everything else is recomputed from " +
      "first principles.",
    see: ["lockup", "distribution", "waterfall"]
  }
];

/* Which glossary entry explains a given graph node. */
const GLOSSARY_FOR_NODE = {
  TOLL: "cfads", OPEX: "cfads", HM: "hm-priority",
  TREAS_BOP: "treasury", TREAS_EOP: "treasury",
  CURCASH: "waterfall", HM_PAY: "hm-priority", CASH_AHM: "hm-priority",
  MRA: "mra", DSRA: "dsra",
  DEBT: "dscr", DEBT_DEF: "deferred-interest", DEBT_INT: "deferred-interest",
  DEBT_PRIN: "sculpting",
  CASH_RES: "reserve-target", MRA_RECH: "reserve-target",
  DSRA_RECH: "reserve-target",
  CASH_EQ: "distribution", LOCKUP: "lockup", DISTRIB: "distribution"
};

/* Which glossary entry explains a given pipe type. */
const GLOSSARY_FOR_EDGE = {
  cash: "waterfall", draw: "draw-vs-release", release: "draw-vs-release",
  fund: "reserve-target", carry: "treasury", test: "lockup",
  priority: "deferred-interest"
};

function glossaryEntry(id) {
  for (const e of GLOSSARY_ENTRIES) { if (e.id === id) { return e; } }
  return null;
}
