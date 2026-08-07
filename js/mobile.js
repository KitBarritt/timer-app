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

[customGreen, customAmber, customRed].forEach(input => {
  input.addEventListener('change', applyCustomTimes);
});

// --- Stopwatch visibility preference ---

hideStopwatchCheckbox.addEventListener('change', updateStopwatchVisibility);

// --- Controls ---

document.getElementById('mobileStartBtn').addEventListener('click', startStopwatch);
document.getElementById('mobileStopBtn').addEventListener('click', stopStopwatch);
document.getElementById('mobileResetBtn').addEventListener('click', resetStopwatch);

updateDisplayColor('grey');
updateStopwatchVisibility();
