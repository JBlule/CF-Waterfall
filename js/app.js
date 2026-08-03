/* ==========================================================================
   CF-Waterfall — page controller (index.html)
   Layer: UI wiring only. This file does NOT compute the cascade.
   The cascade engine (pure functions: input state -> output state) is a
   separate layer that will live in js/engine.js and is not built yet.
   For now the controls report that the engine is still in progress.
   ========================================================================== */

// -- Slider read-outs -------------------------------------------------------
// Each range input has a matching <output> whose id is the input id + "Out".
// We mirror the slider value into that output so the assumption is readable.
var sliders = document.querySelectorAll('input[type="range"]');
sliders.forEach(function (slider) {
  var out = document.getElementById(slider.id + 'Out');
  if (!out) { return; }

  function sync() {
    // The unit (%, ×, months, m€) is stored on the input as data-unit.
    var unit = slider.getAttribute('data-unit') || '';
    out.value = slider.value + unit;
  }

  slider.addEventListener('input', sync);
  sync(); // initialise on load
});

// -- Period navigation ------------------------------------------------------
// Purely a display counter for now; the engine will later drive it.
var period = 1;
var periodLabel = document.getElementById('periodLabel');
var prevBtn = document.getElementById('prevPeriod');
var nextBtn = document.getElementById('nextPeriod');

function renderPeriod() {
  periodLabel.textContent = 'Period ' + period;
  prevBtn.disabled = (period <= 1);
}
prevBtn.addEventListener('click', function () {
  if (period > 1) { period -= 1; renderPeriod(); }
});
nextBtn.addEventListener('click', function () {
  period += 1; renderPeriod();
});
renderPeriod();

// -- Cascade control buttons ------------------------------------------------
// Three actions from the spec: trigger the cascade, step through the cash
// movement, unroll the whole period. Until the engine exists, each one shows
// an "under construction" note so the flow is honest about its state.
var status = document.getElementById('status');
var overlay = document.getElementById('modalOverlay');
var closeBtn = document.getElementById('modalClose');

function announce(message) {
  status.textContent = message;
  status.classList.add('on');
}

function openModal() {
  overlay.classList.add('open');
  closeBtn.focus();
}
function closeModal() {
  overlay.classList.remove('open');
}

document.getElementById('runBtn').addEventListener('click', function () {
  announce('Cascade engine in progress — this will pour cash through the tanks.');
  openModal();
});
document.getElementById('stepBtn').addEventListener('click', function () {
  announce('Step-by-step playback in progress — will advance one payment at a time.');
});
document.getElementById('unrollBtn').addEventListener('click', function () {
  announce('Full-period playback in progress — will run every step of this period.');
});

closeBtn.addEventListener('click', closeModal);
overlay.addEventListener('click', function (e) {
  if (e.target === overlay) { closeModal(); }
});
document.addEventListener('keydown', function (e) {
  if (e.key === 'Escape' && overlay.classList.contains('open')) { closeModal(); }
});
