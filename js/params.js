/* =====================================================================
 * params.js -- the assumptions panel.
 *
 * Slider ranges follow the brief section 4, with the deviations noted
 * inline. Percentages are stored as fractions (1.5% = 0.015) and only
 * formatted as percentages for display.
 * ===================================================================== */

const PARAM_GROUPS = [
  {
    title: "Revenue and operating costs",
    open: true,
    params: [
      { id: "Traffic_Base", label: "Base traffic volume", unit: "km/yr",
        min: 5e6, max: 50e6, step: 1e6, fmt: "km" },
      { id: "Tariff_km", label: "Toll tariff per km", unit: "€/km",
        min: 0.05, max: 0.40, step: 0.01, fmt: "eur3" },
      { id: "CPI", label: "Indexation (CPI)", unit: "%/yr",
        min: 0, max: 0.06, step: 0.005, fmt: "pct" },
      { id: "OPEX_Base", label: "Operating costs (OPEX)", unit: "€/yr",
        min: 200000, max: 2000000, step: 50000, fmt: "eur" }
    ]
  },
  {
    title: "Heavy maintenance",
    open: true,
    params: [
      { id: "HM_Base", label: "Recurring annual charge", unit: "€/yr",
        min: 50000, max: 500000, step: 25000, fmt: "eur" },
      /* Brief says 3…10. Widened to 1…30 because the engine now treats this
       * as a genuine interval (see ENGINE_NOTES.md section 1), so "a peak
       * every 15 years" is a meaningful setting. */
      { id: "HM_Peak_Cycle", label: "Peak falls every", unit: "years",
        min: 1, max: 30, step: 1, fmt: "int" },
      { id: "HM_Peak_Amount", label: "Charge in a peak year", unit: "€",
        min: 0, max: 12000000, step: 250000, fmt: "eur" }
    ]
  },
  {
    title: "Senior debt",
    open: true,
    params: [
      /* "Auto (PV)" meant nothing to anyone who did not already know what a
       * present value was. Say what it actually does instead. */
      { id: "Sizing_Mode", label: "Debt sizing", kind: "toggle",
        off: "Size to the cash flow", on: "Set the amount manually", 
        note: "“Size to the cash flow” advances as much as the project's " +
          "future CFADS can service at the target cover ratio, and reports " +
          "the result below. Switch to “Set the amount manually” to fix any " +
          "principal you like — useful for constructing a deliberately " +
          "over-geared project and observing it fail." },
      { id: "Debt_Nominal", label: "Principal advanced", unit: "€",
        min: 0, max: 60000000, step: 500000, fmt: "eur",
        disabledWhen: (p) => p.Sizing_Mode === 1 },
      { id: "Interest_Rate", label: "Interest rate", unit: "%",
        min: 0.01, max: 0.12, step: 0.0025, fmt: "pct" },
      { id: "Debt_Duration", label: "Tenor", unit: "years",
        min: 5, max: 30, step: 1, fmt: "int" },
      { id: "DSCR", label: "DSCR sculpting target", unit: "×",
        min: 1.0, max: 2.0, step: 0.05, fmt: "x" }
    ]
  },
  {
    title: "Reserve accounts",
    open: true,
    /* The three coefficients weight periods N+1, N+2 and N+3 -- the years
     * still to come. The old labels ("this year", "next year", "year after")
     * were off by one against the engine, which never reserves against a
     * charge it has already settled. */
    params: [
      { id: "MRA_Coef_N", label: "MRA — cover of year N+1", unit: "%",
        min: 0, max: 2.0, step: 0.25, fmt: "pct0",
        note: "The maintenance reserve looks forward only. The current " +
          "year's charge has already been settled, so the target is sized " +
          "on the three years still to come." },
      { id: "MRA_Coef_N1", label: "MRA — cover of year N+2", unit: "%",
        min: 0, max: 1.0, step: 0.25, fmt: "pct0" },
      { id: "MRA_Coef_N2", label: "MRA — cover of year N+3", unit: "%",
        min: 0, max: 1.0, step: 0.25, fmt: "pct0" }
    ]
  },
  {
    title: "Distribution lock-up",
    open: false,
    advanced: true,
    params: [
      { id: "DSCR_Min", label: "DSCR lock-up threshold", unit: "×",
        min: 1.0, max: 1.5, step: 0.05, fmt: "x" },
      { id: "LLCR_Min", label: "LLCR lock-up threshold", unit: "×",
        min: 1.0, max: 1.5, step: 0.05, fmt: "x" },
      { id: "DSCR_Distrib", label: "Post-distribution cover floor", unit: "×",
        min: 1.0, max: 1.3, step: 0.05, fmt: "x" }
    ]
  },
  {
    title: "Model horizon",
    open: false,
    advanced: true,
    params: [
      { id: "Year_Base", label: "First year of operations", unit: "",
        min: 2020, max: 2040, step: 1, fmt: "year" },
      /* Honest label: in the workbook this drives only the year-header rows.
       * The model is always 31 periods wide. */
      { id: "Num_Periods", label: "Years labelled", unit: "yrs",
        min: 10, max: 30, step: 1, fmt: "int",
        note: "Labelling only — the model always computes 31 periods." }
    ]
  }
];

/* Human label for a parameter id, so user-facing text never has to show
 * an internal identifier like "Interest_Rate". */
function paramLabel(id) {
  for (const g of PARAM_GROUPS) {
    for (const p of g.params) {
      /* Keep the label's own casing: lowercasing would turn MRA, DSCR and
       * CPI into mra, dscr and cpi. */
      if (p.id === id) { return p.label; }
    }
  }
  return id;
}

/* Joined with a middot, not a comma: several labels contain commas of their
 * own, and "MRA cover, this year, MRA cover, next year" is unreadable. */
function paramLabels(ids) {
  return (ids || []).map(paramLabel).join(" · ");
}

function fmtParam(spec, v) {
  switch (spec.fmt) {
    case "km":   return (v / 1e6).toFixed(0) + "M";
    case "eur":  return v >= 1e6 ? "€" + (v / 1e6).toFixed(2) + "M"
                                 : "€" + Math.round(v / 1e3) + "k";
    case "eur3": return "€" + v.toFixed(2);
    case "pct":  return (v * 100).toFixed(2).replace(/\.?0+$/, "") + "%";
    case "pct0": return Math.round(v * 100) + "%";
    case "x":    return v.toFixed(2) + "×";
    case "int":  return String(Math.round(v));
    case "year": return String(Math.round(v));
    default:     return String(v);
  }
}

/* Build the panel. `onChange(params)` fires on every input. */
class ParamsPanel {
  constructor(mount, initial, onChange) {
    this.values = Object.assign({}, initial);
    this.onChange = onChange;
    this.rows = {};
    this.mount = mount;
    this._build();
    this.refresh();
  }

  _build() {
    for (const group of PARAM_GROUPS) {
      const det = document.createElement("details");
      det.className = "pgroup" + (group.advanced ? " is-advanced" : "");
      det.open = group.open;
      const sum = document.createElement("summary");
      sum.textContent = group.title;
      if (group.advanced) {
        const tag = document.createElement("span");
        tag.className = "pgroup-tag";
        tag.textContent = "advanced";
        sum.appendChild(tag);
      }
      det.appendChild(sum);

      for (const spec of group.params) {
        det.appendChild(this._row(spec));
      }
      this.mount.appendChild(det);
    }
  }

  _row(spec) {
    const row = document.createElement("div");
    row.className = "prow";
    row.dataset.param = spec.id;

    const head = document.createElement("div");
    head.className = "prow-head";
    const lab = document.createElement("label");
    lab.textContent = spec.label;
    lab.htmlFor = "p-" + spec.id;
    const val = document.createElement("span");
    val.className = "prow-value";
    head.appendChild(lab);
    head.appendChild(val);
    row.appendChild(head);

    let input;
    if (spec.kind === "toggle") {
      input = document.createElement("button");
      input.type = "button";
      input.className = "ptoggle";
      input.id = "p-" + spec.id;
      input.addEventListener("click", () => {
        this.values[spec.id] = this.values[spec.id] === 1 ? 0 : 1;
        this.refresh();
        this.onChange(this.get());
      });
    } else {
      input = document.createElement("input");
      input.type = "range";
      input.id = "p-" + spec.id;
      input.min = spec.min; input.max = spec.max; input.step = spec.step;
      input.addEventListener("input", () => {
        this.values[spec.id] = Number(input.value);
        this.refresh();
        this.onChange(this.get());
      });
    }
    row.appendChild(input);

    if (spec.note) {
      const n = document.createElement("p");
      n.className = "prow-note";
      n.textContent = spec.note;
      row.appendChild(n);
    }

    this.rows[spec.id] = { row, input, val, spec };
    return row;
  }

  /* Reflect current values into the controls, including the read-only
   * computed debt figure when auto-sizing is on. */
  refresh(computed) {
    for (const id in this.rows) {
      const r = this.rows[id];
      const v = this.values[id];
      if (r.spec.kind === "toggle") {
        const on = v === 1;
        r.input.textContent = on ? r.spec.on : r.spec.off;
        r.input.classList.toggle("is-on", on);
        r.val.textContent = "";
      } else {
        r.input.value = v;
        r.val.textContent = fmtParam(r.spec, v);
      }
      const dis = r.spec.disabledWhen ? r.spec.disabledWhen(this.values) : false;
      r.row.classList.toggle("is-disabled", dis);
      if (r.input.tagName === "INPUT") { r.input.disabled = dis; }
      if (id === "Debt_Nominal" && dis && computed !== undefined) {
        r.val.textContent = fmtParam(r.spec, computed) + " computed";
      }
    }
  }

  get() { return Object.assign({}, this.values); }

  set(next) {
    this.values = Object.assign({}, this.values, next);
    this.refresh();
    this.onChange(this.get());
  }

  /* Highlight the sliders that drive a given graph node. */
  highlight(paramIds) {
    const set = new Set(paramIds || []);
    for (const id in this.rows) {
      this.rows[id].row.classList.toggle("is-relevant", set.has(id));
    }
  }
}
