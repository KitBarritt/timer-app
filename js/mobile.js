let stopwatchInterval, startTime, elapsed = 0;
let timingThresholds = [];
let running = false;

const display = document.getElementById('mobileDisplay');
const colorLabel = document.getElementById('mobileColorLabel');
const stopwatchEl = document.getElementById('mobileStopwatch');
const presetSelect = document.getElementById('presetSelect');
const customTimeRow = document.getElementById('customTimeRow');
const customGreen = document.getElementById('customGreen');
const customAmber = document.getElementById('customAmber');
const customRed = document.getElementById('customRed');
const thresholdSummary = document.getElementById('thresholdSummary');
const showStopwatchRow = document.getElementById('showStopwatchRow');
const showStopwatchCheckbox = document.getElementById('showStopwatchCheckbox');

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

function updateThresholdSummary() {
  if (timingThresholds.length === 4) {
    const [g, a, r] = timingThresholds;
    thresholdSummary.textContent = `Green ${formatMMSS(g)} · Amber ${formatMMSS(a)} · Red ${formatMMSS(r)}`;
  } else {
    thresholdSummary.innerHTML = '&nbsp;';
  }
}

function updateStopwatchVisibility() {
  const visible = !running || showStopwatchCheckbox.checked;
  stopwatchEl.style.display = visible ? 'block' : 'none';
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
  showStopwatchRow.style.display = 'none';
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
  showStopwatchRow.style.display = '';
  updateStopwatchVisibility();
}

function resetStopwatch() {
  stopStopwatch();
  elapsed = 0;
  updateTime();
  updateDisplayColor('grey');
}

// --- Preset / custom time selection ---

presetSelect.addEventListener('change', () => {
  const option = presetSelect.selectedOptions[0];

  if (presetSelect.value === 'custom') {
    customTimeRow.hidden = false;
    timingThresholds = [];
    updateThresholdSummary();
    return;
  }

  customTimeRow.hidden = true;

  const times = option?.dataset.times;
  if (times) {
    timingThresholds = times.split(',').map(t => parseInt(t, 10));
    updateThresholdSummary();
  } else {
    timingThresholds = [];
    updateThresholdSummary();
  }
});

function applyCustomTimes() {
  const green = parseMMSS(customGreen.value);
  const amber = parseMMSS(customAmber.value);
  const red = parseMMSS(customRed.value);

  if (green === null || amber === null || red === null) return;
  if (!(green <= amber && amber <= red)) return;

  timingThresholds = [green, amber, red, red + 30];
  updateThresholdSummary();
}

[customGreen, customAmber, customRed].forEach(input => {
  input.addEventListener('change', applyCustomTimes);
});

// --- Stopwatch visibility preference ---

showStopwatchCheckbox.addEventListener('change', updateStopwatchVisibility);

// --- Controls ---

document.getElementById('mobileStartBtn').addEventListener('click', startStopwatch);
document.getElementById('mobileStopBtn').addEventListener('click', stopStopwatch);
document.getElementById('mobileResetBtn').addEventListener('click', resetStopwatch);

updateDisplayColor('grey');
updateStopwatchVisibility();
