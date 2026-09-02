let stopwatchInterval, startTime, elapsed = 0;
let timingThresholds = [];
let running = false;

const display = document.getElementById('mobileDisplay');
const colorLabel = document.getElementById('mobileColorLabel');
const stopwatchEl = document.getElementById('mobileStopwatch');
const runningIndicator = document.getElementById('mobileRunningIndicator');
const presetSelect = document.getElementById('presetSelect');
const customGreen = document.getElementById('customGreen');
const customAmber = document.getElementById('customAmber');
const customRed = document.getElementById('customRed');
const hideStopwatchField = document.getElementById('hideStopwatchField');
const hideStopwatchCheckbox = document.getElementById('hideStopwatchCheckbox');

function updateDisplayColor(colorKey) {
  const color = COLOR_MAP[colorKey];
  display.style.backgroundColor = color.rgb;
  if (!color.label) {
    colorLabel.style.display = 'none';
  } else {
    colorLabel.style.display = 'block';
    colorLabel.textContent = color.label;
  }
}

function formatMMSS(totalSeconds) {
  const m = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
  const s = String(totalSeconds % 60).padStart(2, '0');
  return `${m}:${s}`;
}

function parseMMSS(str) {
  const match = /^(\d+):([0-5]?\d)$/.exec((str || '').trim());
  if (!match) return null;
  return parseInt(match[1], 10) * 60 + parseInt(match[2], 10);
}

// Turn a bare digit string (from the iOS numeric keypad, which has no colon)
// into "mm:ss". Right-to-left: the last two digits are seconds, the rest are
// minutes. "1" -> "01:00", "130" -> "01:30", "0130" -> "01:30", "1234" -> "12:34".
// Returns '' for empty input, or null if it can't be made sense of (e.g. seconds
// > 59) so the caller can leave the raw text in place for the user to fix.
function digitsToMMSS(raw) {
  const s = (raw || '').trim();
  if (s === '') return '';

  if (s.includes(':')) {
    const [m, sec = '0'] = s.split(':');
    const mm = parseInt(m || '0', 10), ss = parseInt(sec || '0', 10);
    if (isNaN(mm) || isNaN(ss) || ss > 59) return null;
    return `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
  }

  const d = s.replace(/\D/g, '');
  if (d === '') return null;

  let mm, ss;
  if (d.length <= 2) { mm = parseInt(d, 10); ss = 0; }
  else { ss = parseInt(d.slice(-2), 10); mm = parseInt(d.slice(0, -2), 10); }
  if (ss > 59) return null;

  return `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
}

function updateStopwatchVisibility() {
  const showDigits = !running || !hideStopwatchCheckbox.checked;
  stopwatchEl.style.display = showDigits ? 'block' : 'none';
  runningIndicator.style.display = (!showDigits && running) ? 'flex' : 'none';
}

function updateTime() {
  const seconds = Math.floor(elapsed / 1000);
  stopwatchEl.textContent = formatMMSS(seconds);
}

function updateColorFromTime() {
  const seconds = Math.floor(elapsed / 1000);
  if (timingThresholds.length !== 4) return;
  if (seconds >= timingThresholds[3]) {
    updateDisplayColor('flash');
  } else if (seconds >= timingThresholds[2]) {
    updateDisplayColor('red');
  } else if (seconds >= timingThresholds[1]) {
    updateDisplayColor('amber');
  } else if (seconds >= timingThresholds[0]) {
    updateDisplayColor('green');
  }
}

function startStopwatch() {
  if (stopwatchInterval) return;
  running = true;
  hideStopwatchField.style.display = 'none';
  updateStopwatchVisibility();
  startTime = Date.now() - elapsed;
  stopwatchInterval = setInterval(() => {
    elapsed = Date.now() - startTime;
    updateTime();
    updateColorFromTime();
  }, 500);
}

function stopStopwatch() {
  if (stopwatchInterval) {
    clearInterval(stopwatchInterval);
    stopwatchInterval = null;
  }
  running = false;
  updateTime();
  updateDisplayColor('grey');
  hideStopwatchField.style.display = '';
  updateStopwatchVisibility();
}

function resetStopwatch() {
  stopStopwatch();
  elapsed = 0;
  updateTime();
  updateDisplayColor('grey');
}

// --- Preset / custom time selection ---

function setFieldsReadonly(readonly) {
  [customGreen, customAmber, customRed].forEach(input => { input.readOnly = readonly; });
}

function fillFieldsFromThresholds(thresholds) {
  customGreen.value = thresholds.length === 4 ? formatMMSS(thresholds[0]) : '';
  customAmber.value = thresholds.length === 4 ? formatMMSS(thresholds[1]) : '';
  customRed.value = thresholds.length === 4 ? formatMMSS(thresholds[2]) : '';
}

presetSelect.addEventListener('change', () => {
  const option = presetSelect.selectedOptions[0];

  if (presetSelect.value === 'custom') {
    setFieldsReadonly(false);
    timingThresholds = [];
    fillFieldsFromThresholds([]);
    customGreen.focus();
    return;
  }

  setFieldsReadonly(true);

  const times = option?.dataset.times;
  timingThresholds = times ? times.split(',').map(t => parseInt(t, 10)) : [];
  fillFieldsFromThresholds(timingThresholds);
});

function applyCustomTimes() {
  const green = parseMMSS(customGreen.value);
  const amber = parseMMSS(customAmber.value);
  const red = parseMMSS(customRed.value);

  if (green === null || amber === null || red === null) return;
  if (!(green <= amber && amber <= red)) return;

  timingThresholds = [green, amber, red, red + 30];
}

// Normalise the field to mm:ss (so users can type "0130" on the colon-less
// iOS keypad), then apply. Fires on commit — tapping the next field or the
// keyboard's Done button both trigger it.
function normalizeAndApply(input) {
  const formatted = digitsToMMSS(input.value);
  if (formatted !== null) input.value = formatted;
  applyCustomTimes();
}

[customGreen, customAmber, customRed].forEach(input => {
  input.addEventListener('change', () => normalizeAndApply(input));
});

// --- Stopwatch visibility preference ---

hideStopwatchCheckbox.addEventListener('change', updateStopwatchVisibility);

// --- Controls ---

document.getElementById('mobileStartBtn').addEventListener('click', startStopwatch);
document.getElementById('mobileStopBtn').addEventListener('click', stopStopwatch);
document.getElementById('mobileResetBtn').addEventListener('click', resetStopwatch);

updateDisplayColor('grey');
updateStopwatchVisibility();
