/* =====================================================================
 * harness.js -- minimal assert/report library.
 * ES5-safe; the same file runs under cscript //E:JScript and in a browser.
 * No dependencies, no test framework.
 * ===================================================================== */

var T = (function () {
  "use strict";

  var lines = [];
  var results = [];       /* {suite, name, ok, detail} */
  var currentSuite = "(none)";

  /* One output path for both hosts. cscript has WScript; browsers do not. */
  function emit(s) {
    lines.push(s);
    if (typeof WScript !== "undefined") {
      WScript.Echo(s);
    } else if (typeof console !== "undefined" && console.log) {
      console.log(s);
    }
  }

  function suite(name) {
    currentSuite = name;
    emit("");
    emit("--- " + name + " " + rep("-", Math.max(0, 66 - name.length)));
  }

  function rep(ch, n) {
    var s = "", i;
    for (i = 0; i < n; i++) { s += ch; }
    return s;
  }

  function record(name, ok, detail) {
    results.push({ suite: currentSuite, name: name, ok: !!ok, detail: detail || "" });
    if (ok) {
      emit("  PASS  " + name);
    } else {
      emit("  FAIL  " + name + (detail ? "  <<< " + detail : ""));
    }
    return !!ok;
  }

  /* Format a number for a readable failure message without hiding precision.
   * Small non-zero magnitudes MUST NOT be flattened to "0.000000" -- that
   * would report a real 1e-9 divergence as exact agreement. */
  function fmt(v) {
    if (typeof v !== "number") { return JSONish(v); }
    if (isNaN(v)) { return "NaN"; }
    if (!isFinite(v)) { return (v > 0 ? "+Inf" : "-Inf"); }
    if (v === 0) { return "0"; }
    if (v === Math.floor(v) && Math.abs(v) < 1e15) { return String(v); }
    if (Math.abs(v) < 1e-4) {
      return v.toExponential ? v.toExponential(3) : String(v);
    }
    return v.toFixed(6);
  }

  function JSONish(v) {
    if (v === null) { return "null"; }
    if (v === undefined) { return "undefined"; }
    if (typeof v === "string") { return '"' + v + '"'; }
    return String(v);
  }

  /* --- assertions ------------------------------------------------- */

  /* Numeric equality within an absolute tolerance. */
  function near(name, actual, expected, tol) {
    tol = (tol === undefined) ? 0.01 : tol;
    if (typeof actual !== "number" || isNaN(actual) || !isFinite(actual)) {
      return record(name, false, "actual is not a finite number: " + fmt(actual));
    }
    var d = Math.abs(actual - expected);
    return record(name, d <= tol,
      "expected " + fmt(expected) + ", got " + fmt(actual) + " (diff " + fmt(d) + ")");
  }

  /* Strict equality, for text signals and integer flags. */
  function eq(name, actual, expected) {
    return record(name, actual === expected,
      "expected " + JSONish(expected) + ", got " + JSONish(actual));
  }

  function isTrue(name, cond, detail) {
    return record(name, !!cond, detail);
  }

  /* Whole-vector comparison, reporting the first divergence only. */
  function nearVec(name, actual, expected, tol) {
    tol = (tol === undefined) ? 0.01 : tol;
    var i, d;
    if (!actual || actual.length !== expected.length) {
      return record(name, false, "length " +
        (actual ? actual.length : "n/a") + " != " + expected.length);
    }
    for (i = 0; i < expected.length; i++) {
      if (typeof actual[i] !== "number" || isNaN(actual[i]) || !isFinite(actual[i])) {
        return record(name, false, "index " + i + " not finite: " + fmt(actual[i]));
      }
      d = Math.abs(actual[i] - expected[i]);
      if (d > tol) {
        return record(name, false, "first divergence at index " + i +
          ": expected " + fmt(expected[i]) + ", got " + fmt(actual[i]) +
          " (diff " + fmt(d) + ")");
      }
    }
    return record(name, true);
  }

  /* --- reporting -------------------------------------------------- */

  function counts() {
    var pass = 0, fail = 0, i;
    for (i = 0; i < results.length; i++) {
      if (results[i].ok) { pass++; } else { fail++; }
    }
    return { pass: pass, fail: fail, total: results.length };
  }

  function failures() {
    var out = [], i;
    for (i = 0; i < results.length; i++) {
      if (!results[i].ok) { out.push(results[i]); }
    }
    return out;
  }

  function summary(title) {
    var c = counts(), f = failures(), i;
    emit("");
    emit(rep("=", 72));
    emit(title + ": " + c.pass + " passed, " + c.fail + " failed, " +
      c.total + " total");
    emit(rep("=", 72));
    if (c.fail > 0) {
      emit("");
      emit("FAILURES:");
      for (i = 0; i < f.length; i++) {
        emit("  [" + f[i].suite + "] " + f[i].name);
        if (f[i].detail) { emit("        " + f[i].detail); }
      }
    }
    return c;
  }

  function text() { return lines.join("\n"); }

  function reset() { lines = []; results = []; currentSuite = "(none)"; }

  return {
    emit: emit, suite: suite, near: near, eq: eq, isTrue: isTrue,
    nearVec: nearVec, record: record, summary: summary, counts: counts,
    failures: failures, text: text, reset: reset, fmt: fmt, rep: rep
  };
})();

if (typeof module !== "undefined" && module.exports) { module.exports = T; }
