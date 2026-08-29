/* =====================================================================
 * glossary.js -- the explanations layer.
 *
 * Shared by glossary.html (the dedicated page) and index.html (the inline
 * panel), so the two can never drift apart.
 *
 * Each entry answers three questions the brief asks for:
 *   plain  -- what it is, in plain language
 *   model  -- how it works in THIS model, with the actual arithmetic
 *   why    -- why it sits where it does in the order of priority
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
    aka: "order of priority",
    plain: "An order of priority. Each period the project's cash is poured " +
      "in at the top, every claim is paid in a fixed sequence, and whatever " +
      "survives to the bottom belongs to the shareholders.",
    model: [
      "Toll revenue less operating costs, plus any cash carried forward from " +
      "last period, gives the cash available this period. Then, in strict " +
      "order: heavy maintenance, debt service, reserve top-ups, and finally " +
      "a distribution — but only if the lock-up tests pass.",
      "Nothing about the sequence is negotiable. A claim higher up is paid in " +
      "full before anything below it receives a cent."
    ],
    why: "The order is the contract. It is why equity is last, and why equity " +
      "is the first thing to disappear in a bad year: everyone senior is " +
      "made whole first, and the shareholders take what is left, if anything.",
    see: ["cfads", "lockup", "distribution"]
  },
  {
    id: "cfads",
    term: "CFADS",
    aka: "Cash Flow Available for Debt Service",
    plain: "The cash the project throws off before paying its lenders: " +
      "revenue minus the cash costs of running the asset.",
    model: [
      "CFADS = toll revenue − operating costs − heavy maintenance, all in " +
      "nominal terms after inflation has been applied.",
      "A nuance worth getting straight, because it catches people out: CFADS " +
      "is a <em>reference measure</em>, not the cash that actually moves. It " +
      "sizes the debt, sculpts the principal and drives the LLCR — but the " +
      "real money movement starts from the cash in hand (toll − operating " +
      "costs + treasury carried forward) and pays heavy maintenance from cash " +
      "and the maintenance reserve separately.",
      "So CFADS subtracts heavy maintenance in a single stroke, while the " +
      "cascade pays it as an event that can draw on a reserve and can even go " +
      "unpaid. Two deliberately different views of the same period: one for " +
      "the ratios, one for the plumbing."
    ],
    why: "It is the numerator of every ratio a lender cares about, so it is " +
      "worked out first and independently of the cascade.",
    params: ["Traffic_Base", "Tariff_km", "CPI", "OPEX_Base", "HM_Base"],
    see: ["inflation", "dscr", "llcr", "debt-sizing"]
  },
  {
    id: "inflation",
    term: "Inflation",
    aka: "CPI and indexation",
    plain: "Prices rise over time. Toll revenue, operating costs and " +
      "maintenance bills all grow year after year, so a euro in the last " +
      "period of the model is not the same thing as a euro in the first.",
    model: [
      "Every amount in the model is quoted twice. In <b>real</b> terms it is " +
      "stated in today's money and stays flat. In <b>nominal</b> terms it is " +
      "multiplied by an index that starts at 1.00 in the first period and " +
      "grows by the inflation rate every period after — so period " +
      "<em>n</em> carries <code>(1 + CPI)</code> raised to the power " +
      "<code>n − 1</code>.",
      "A single rate is applied to all three: revenue, operating costs and " +
      "heavy maintenance. Because they inflate together, changing the rate " +
      "does not much alter the <em>shape</em> of the cash flows — but it " +
      "changes their size a great deal. Over thirty periods at 5% a year, " +
      "the last period's figures are more than four times the first's.",
      "The debt is the exception: it is a fixed amount at a fixed interest " +
      "rate, and it does not inflate. So inflation quietly works in the " +
      "lenders' favour and then the shareholders' — the cash grows while the " +
      "debt bill does not, cover ratios improve, and distributions start " +
      "earlier. Turn the rate to 0% and watch the effect disappear."
    ],
    why: "It is applied at the very top, before anything else happens, " +
      "because every figure further down the waterfall is a nominal one — " +
      "the actual euros paid or received in that year.",
    params: ["CPI"],
    see: ["cfads", "hm-priority", "debt-sizing"]
  },
  {
    id: "debt-sizing",
    term: "Debt sizing",
    aka: "the present-value method",
    plain: "How much a lender will advance: the present value of the cash the " +
      "project can spare for debt service over the life of the loan.",
    model: [
      "For every year inside the debt window, take that year's CFADS, divide " +
      "it by the target cover ratio to get the debt bill the lender would " +
      "allow, and discount it back at the interest rate. Add them up:",
      "<code>Σ (CFADS ÷ DSCR) ÷ (1 + rate)<sup>year</sup></code>",
      "In <b>auto</b> mode that total becomes the loan — the base case gives " +
      "about €31.2M. In <b>manual</b> mode you set the amount yourself and " +
      "the computed figure is shown alongside for comparison. That is how you " +
      "build a deliberately over-levered project and watch it struggle."
    ],
    why: "It is worked out from CFADS alone, before any cash starts moving, " +
      "so it never depends on the waterfall it is about to fund. That is what " +
      "keeps the whole model a single pass forward through time, with no " +
      "circular reasoning.",
    params: ["Sizing_Mode", "Debt_Nominal", "Interest_Rate", "Debt_Duration", "DSCR"],
    see: ["cfads", "sculpting"]
  },
  {
    id: "dscr",
    term: "DSCR",
    aka: "Debt Service Cover Ratio",
    plain: "How many times over the project's cash could cover this year's " +
      "debt bill. 1.20× means 20% more cash than the bill requires.",
    model: [
      "DSCR realised = CFADS ÷ the debt service actually paid. It is left " +
      "blank rather than infinite when no debt service was paid at all.",
      "The same ratio wears <b>two different hats</b> here, and they are " +
      "separate settings. As a <b>target</b> it decides how much principal " +
      "falls due each year. As a <b>lock-up threshold</b> it decides whether " +
      "shareholders may be paid.",
      "Both default to 1.20, which has a neat consequence: a year whose " +
      "principal was sculpted lands on a realised DSCR of exactly 1.20 — " +
      "precisely its own lock-up threshold. The project passes by a hair, by " +
      "construction. Raise the lock-up threshold a notch above the sculpting " +
      "target and distributions stop almost entirely until the debt shrinks."
    ],
    why: "It is the lenders' primary measure of headroom in any single year.",
    params: ["DSCR", "DSCR_Min"],
    see: ["sculpting", "llcr", "lockup"]
  },
  {
    id: "sculpting",
    term: "DSCR sculpting",
    aka: "shaping the repayment profile",
    plain: "Rather than a flat repayment schedule, the principal due each " +
      "year is set so that the total debt bill is always a fixed multiple of " +
      "that year's cash. Repayments follow the revenue curve.",
    model: [
      "The principal due is <code>CFADS ÷ DSCR − interest accrued</code>, " +
      "floored at zero and capped by the amount still outstanding. Three " +
      "cases:",
      "• beyond the debt duration, nothing is due;<br>" +
      "• <b>exactly at</b> the final year of the window, the entire remaining " +
      "balance falls due at once, whatever the sculpt would have said;<br>" +
      "• otherwise, sculpt to the target.",
      "One consequence is worth sitting with: in a year where interest alone " +
      "already exceeds CFADS ÷ DSCR, the sculpted principal is <b>zero</b>. " +
      "The loan does not amortise at all that year. Push the leverage high " +
      "enough and it never amortises — and then the whole balance falls due " +
      "at maturity and goes unpaid."
    ],
    why: "It makes the debt fit the project rather than forcing the project " +
      "to fit the debt. It also makes principal the shock absorber: it is the " +
      "third and last of the three debt buckets to be filled, so it is the " +
      "first thing to be starved when cash is short.",
    params: ["DSCR", "Debt_Duration"],
    see: ["dscr", "deferred-interest", "debt-sizing"]
  },
  {
    id: "hm-priority",
    term: "Heavy maintenance",
    aka: "and why it outranks the debt",
    plain: "Periodic major works — resurfacing, structures, equipment " +
      "renewal. A modest amount every year, with a large bill on a cycle.",
    model: [
      "The bill each period is the base amount plus, in a peak year, the peak " +
      "amount, with inflation applied. A peak lands every " +
      "<code>HM_Peak_Cycle</code> years.",
      "It is paid from the cash in hand first, and the maintenance reserve is " +
      "drawn for any shortfall. If cash and the reserve together still fall " +
      "short, the period is flagged <b>HM UNPAID</b> — the works could not be " +
      "funded, which is a breach of the concession rather than a financing " +
      "problem.",
      "Try it: raise the peak amount high enough and you will see the reserve " +
      "empty itself in the peak year and the flag appear."
    ],
    why: "This is the one claim <b>senior to the senior debt</b>. The " +
      "concession contract obliges the operator to maintain the asset, and " +
      "the lenders accept ranking behind it because an unmaintained road " +
      "eventually earns nothing at all. Every other ranking in the waterfall " +
      "is a matter of negotiation between creditors; this one is not.",
    params: ["HM_Base", "HM_Peak_Cycle", "HM_Peak_Amount", "CPI"],
    see: ["mra", "draw-vs-release", "waterfall"]
  },
  {
    id: "deferred-interest",
    term: "Deferred interest",
    aka: "arrears, and the order inside the debt compartment",
    plain: "Interest the project owed but could not pay. It drops into an " +
      "arrears bucket, and that bucket must be cleared before any new " +
      "interest is served.",
    model: [
      "Whatever part of the current interest bill cannot be paid is added to " +
      "the arrears balance and carried forward. The arrears are " +
      "<b>non-capitalising</b>: they do not themselves earn interest, so the " +
      "hole stops getting deeper on its own.",
      "Inside the debt compartment the order is absolute — <b>deferred " +
      "interest, then current interest, then principal</b>. Those are the " +
      "three stacked buckets in the cascade: each must fill completely " +
      "before a cent reaches the one below it. Watch them in Step-through " +
      "and the priority becomes obvious.",
      "If arrears or unpaid principal are still outstanding when the debt " +
      "window closes, the period is flagged <b>UNPAID</b>."
    ],
    why: "Arrears are the first of the three debt buckets. A lender owed " +
      "money from last year is owed it before this year's bill, and long " +
      "before any capital is returned.",
    params: ["Interest_Rate"],
    see: ["dsra", "sculpting", "dscr"]
  },
  {
    id: "mra",
    term: "MRA",
    aka: "Maintenance Reserve Account",
    plain: "A savings account for future maintenance bills, so that a peak " +
      "year does not sink an otherwise healthy project.",
    model: [
      "Its target is a weighted look-ahead at the maintenance still to " +
      "<em>come</em>: a share of next year's bill, a smaller share of the " +
      "year after, a smaller one again of the year after that. The current " +
      "year's own bill does not appear — it has already been paid, so " +
      "reserving against it would serve no purpose. Set all three shares to " +
      "zero and the reserve is switched off entirely.",
      "The practical effect is that the target <b>rises the period before a " +
      "maintenance peak</b>, not during it. The cash is trapped in the " +
      "reserve a year ahead of the bill, which is the whole point: when the " +
      "peak lands, the money is already there.",
      "It is drawn to cover a maintenance shortfall, topped back up from the " +
      "cash left after the lenders are served, and any balance above target " +
      "is released. The balance never goes below zero."
    ],
    why: "Funded <b>after</b> the lenders are served but <b>before</b> the " +
      "shareholders see anything. It is cash the project is not allowed to " +
      "distribute, because it is earmarked for an obligation everyone can " +
      "already see coming.",
    params: ["MRA_Coef_N", "MRA_Coef_N1", "MRA_Coef_N2"],
    see: ["reserve-target", "draw-vs-release", "hm-priority"]
  },
  {
    id: "dsra",
    term: "DSRA",
    aka: "Debt Service Reserve Account",
    plain: "A cushion holding roughly next period's debt bill, so that one " +
      "bad year does not become a default.",
    model: [
      "Its target is next period's <b>scheduled</b> debt service: the " +
      "interest that will accrue on the balance still outstanding, plus next " +
      "period's sculpted principal. \"Scheduled\" matters — it is worked out " +
      "without reference to next period's cash, which is what keeps the model " +
      "free of circular reasoning.",
      "The critical restriction: the DSRA may only top up <b>deferred " +
      "interest and current interest</b>. It may <b>never</b> pay principal — " +
      "that comes from cash alone. You can see this in the cascade: a full " +
      "DSRA sitting right next to a starved principal bucket, unable to help.",
      "In the final period the target drops to zero. There is no next period " +
      "to reserve against, so the whole balance is released."
    ],
    why: "A reserve exists to prevent a <em>default</em>, and a missed " +
      "interest payment is a default while a slower amortisation is not. " +
      "Letting it repay principal would spend a safety buffer on something " +
      "that was never urgent.",
    params: ["Interest_Rate", "DSCR", "Debt_Duration"],
    see: ["reserve-target", "deferred-interest", "draw-vs-release"]
  },
  {
    id: "reserve-target",
    term: "Reserve target and recharging",
    aka: "filling a reserve back up",
    plain: "The target is how full a reserve is supposed to be. Below it, " +
      "cash is trapped to fill it up. Above it, the excess is let go.",
    model: [
      "One single mechanism serves both reserves. After any draws:",
      "• <b>top up</b> by whichever is smaller — the cash available, or the " +
      "gap to the target;<br>" +
      "• <b>release</b> anything the balance now holds above the target;<br>" +
      "• the balance never falls below zero.",
      "The maintenance reserve is filled first, then the debt service " +
      "reserve, out of whatever cash survived the lenders. Note that the " +
      "release is measured <em>after</em> the top-up, so a reserve whose " +
      "target has just fallen releases the surplus even though nothing was " +
      "added to it."
    ],
    why: "Reserves sit between the lenders and the shareholders. Filling them " +
      "is not optional and it is not a distribution — it is cash the project " +
      "must hold before it is allowed to pay a dividend.",
    see: ["mra", "dsra", "draw-vs-release", "lockup"]
  },
  {
    id: "draw-vs-release",
    term: "Draw vs release",
    aka: "two opposite flows out of a reserve",
    plain: "A <b>draw</b> is money coming out of a reserve to pay a bill the " +
      "cash could not cover. A <b>release</b> is money leaving a reserve " +
      "because it holds more than it needs. Both empty the tank; they mean " +
      "opposite things.",
    model: [
      "<b>Draws</b> are triggered by a shortfall and capped by the balance " +
      "available: the maintenance reserve paying heavy maintenance, and the " +
      "debt service reserve topping up interest.",
      "<b>Releases</b> are triggered by the balance exceeding its target, and " +
      "the surplus becomes available to equity.",
      "A draw is a symptom of stress — the project could not meet an " +
      "obligation out of its own cash flow. A release is a sign of comfort — " +
      "the obligation the reserve was guarding has shrunk or gone away."
    ],
    why: "They are easy to confuse on a diagram, because both point away " +
      "from the tank. That is why they are drawn quite differently here: a " +
      "draw is a heavy amber dashed pipe with a double chevron, a release is " +
      "a thin green solid pipe with an open diamond.",
    see: ["mra", "dsra", "reserve-target"]
  },
  {
    id: "llcr",
    term: "LLCR",
    aka: "Loan Life Cover Ratio",
    plain: "DSCR asks whether this year works. LLCR asks whether the whole " +
      "remaining life of the loan works: how many times over could all the " +
      "cash still to come repay what is outstanding today?",
    model: [
      "Take the CFADS from this period to the end of the debt window, " +
      "discount it back at the interest rate, add the cash already sitting in " +
      "treasury, and divide by the debt still outstanding.",
      "It is left blank while there is no debt, and the lock-up test treats " +
      "that as a pass — otherwise a project that had repaid everything could " +
      "never distribute.",
      "Because the window shrinks as periods pass, the ratio changes shape " +
      "over the life of the loan even when nothing about the project itself " +
      "has changed."
    ],
    why: "It catches slow deterioration that a single-year DSCR would miss. " +
      "A project can cover this year comfortably and still be quite unable to " +
      "repay the balance at maturity.",
    params: ["LLCR_Min", "Interest_Rate", "Debt_Duration"],
    see: ["dscr", "lockup", "cfads"]
  },
  {
    id: "lockup",
    term: "Lock-up tests",
    aka: "the distribution gate",
    plain: "Four gates. All four must pass before the shareholders are " +
      "allowed anything at all. Fail one and the cash is trapped.",
    model: [
      "The four tests, shown as the four lamps on the gate:",
      "1. <b>DSCR</b> realised is at least the lock-up threshold<br>" +
      "2. <b>LLCR</b> is at least its threshold<br>" +
      "3. the <b>maintenance reserve</b> is filled to target<br>" +
      "4. the <b>debt service reserve</b> is filled to target",
      "There are two deliberate escapes: a period with no debt service passes " +
      "the DSCR test, and a period with no debt at all passes the LLCR test. " +
      "Without them, a project that had repaid everything could never pay a " +
      "dividend.",
      "Being locked up is <em>not</em> a default. The cash does not vanish — " +
      "it goes to treasury and comes back next period, when the tests are " +
      "tried again. This is why treasury can build up for years and then " +
      "release in one go."
    ],
    why: "The last thing before the distribution, because it is the lenders' " +
      "veto. The reserves must be full and the ratios sound before any value " +
      "leaves the structure for good.",
    params: ["DSCR_Min", "LLCR_Min"],
    see: ["distribution", "treasury", "dscr", "llcr"]
  },
  {
    id: "distribution",
    term: "Distribution to equity",
    aka: "the dividend",
    plain: "What actually reaches the shareholders: whatever is left once " +
      "everyone senior has been paid and all four gates have opened.",
    model: [
      "Even when the gates open, the payment is capped. The cap holds back a " +
      "buffer proportional to the debt bill — a post-distribution floor — so " +
      "the project never strips itself bare in a good year.",
      "If all four tests pass, the distribution is the smaller of the cash " +
      "available and that cap. If any test fails, it is zero.",
      "Whatever is not distributed becomes the treasury balance and returns " +
      "next period."
    ],
    why: "The bottom of the waterfall. Equity is the residual claimant: paid " +
      "last, capped even when it is paid, and the first thing to be switched " +
      "off when anything upstream goes wrong.",
    params: ["DSCR_Distrib"],
    see: ["lockup", "treasury", "waterfall"]
  },
  {
    id: "treasury",
    term: "Treasury",
    aka: "cash carried forward",
    plain: "The project's own bank account. Cash that was not distributed " +
      "stays here and is available again next period.",
    model: [
      "Treasury at the end of a period is the cash that reached the equity " +
      "gate less whatever was actually distributed. It becomes the opening " +
      "balance of the next period and feeds straight back into the cash " +
      "available.",
      "Unlike every reserve in this model, treasury is <b>not floored at " +
      "zero</b>. A deficit is carried forward as a negative balance rather " +
      "than written off — which is how a stressed project drags a hole from " +
      "one period into the next."
    ],
    why: "It closes the loop. Together with the two reserves and the two debt " +
      "balances, it is one of only five numbers that cross from one period " +
      "into the next; everything else is recomputed from scratch.",
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
