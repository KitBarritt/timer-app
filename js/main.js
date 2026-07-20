let stopwatchInterval, startTime, elapsed = 0;
let timingThresholds = [];
let currentColorKey = 'grey';

const TABLE_TOPICS_PRESET = [60, 90, 120, 150];

const timerChannel = new BroadcastChannel('obs-timer-channel');
timerChannel.onmessage = (e) => {
  if (e.data?.type === 'requestState') broadcastState();
};

function broadcastState() {
  timerChannel.postMessage({
    type: 'state',
    color: currentColorKey,
    running: !!stopwatchInterval
  });
}

function updateDisplayColor(colorKey) {
  const display = document.getElementById("display");
  const label = document.getElementById("colorLabel");
  const color = COLOR_MAP[colorKey];

  display.style.backgroundColor = color.rgb;

  if (!color.label) {
    label.style.display = 'none';
  } else {
    label.style.display = 'block';
    label.textContent = color.label;
  }

  currentColorKey = colorKey;
  broadcastState();
}

function setColor(colorKey) {
  updateDisplayColor(colorKey);
}

function startStopwatch() {
  if (!stopwatchInterval) {
    startTime = Date.now() - elapsed;
    stopwatchInterval = setInterval(() => {
      elapsed = Date.now() - startTime;
      updateTime();
      updateColorFromTime();
    }, 500);
    broadcastState();
  }
}

function stopStopwatch() {
  if (stopwatchInterval) {
    clearInterval(stopwatchInterval);
    stopwatchInterval = null;
  }

  const seconds = Math.floor(elapsed / 1000);
  updateTime();
  updateDisplayColor('grey');

  const name = document.getElementById("speakerDropdown")?.value;
  if (name) {
    const speakerData = JSON.parse(localStorage.getItem("speakerData") || "[]");
    const speaker = speakerData.find(s => s.name === name);
    if (speaker) {
      speaker.actual = seconds;
      localStorage.setItem("speakerData", JSON.stringify(speakerData));
    }
  }
}

function resetStopwatch() {
  stopStopwatch();
  elapsed = 0;
  updateTime();
  updateDisplayColor('grey');
}

function updateTime() {
  const seconds = Math.floor(elapsed / 1000);
  const min = String(Math.floor(seconds / 60)).padStart(2, '0');
  const sec = String(seconds % 60).padStart(2, '0');
  const stopwatch = document.getElementById("stopwatch");
  if (stopwatch) stopwatch.textContent = `${min}:${sec}`;
}

function updateColorFromTime() {
  const seconds = Math.floor(elapsed / 1000);
  if (timingThresholds.length === 4) {
    if (seconds >= timingThresholds[3]) {
      updateDisplayColor("flash");
    } else if (seconds >= timingThresholds[2]) {
      updateDisplayColor("red");
    } else if (seconds >= timingThresholds[1]) {
      updateDisplayColor("amber");
    } else if (seconds >= timingThresholds[0]) {
      updateDisplayColor("green");
    }
  }
}

function setThresholdLabels(times) {
  const formatted = times.slice(0, 3).map(t => {
    const m = String(Math.floor(t / 60)).padStart(2, '0');
    const s = String(t % 60).padStart(2, '0');
    return `${m}:${s}`;
  });

  document.getElementById("time-green").textContent = formatted[0] || "--:--";
  document.getElementById("time-amber").textContent = formatted[1] || "--:--";
  document.getElementById("time-red").textContent = formatted[2] || "--:--";
}

// --- Speaker data (from localStorage) ---

const speakerData = JSON.parse(localStorage.getItem("speakerData") || "[]");
const speakerTimings = {};
const speakerDropdown = document.getElementById("speakerDropdown");

function rebuildSpeakerTimings() {
  Object.keys(speakerTimings).forEach(k => delete speakerTimings[k]);
  speakerData.forEach(s => {
    if (s.name && Array.isArray(s.preset)) {
      speakerTimings[s.name] = s.preset;
    }
  });
}

function addDropdownOption(name) {
  const opt = document.createElement("option");
  opt.value = name;
  opt.textContent = name;
  speakerDropdown.appendChild(opt);
}

speakerData.forEach(s => {
  if (s.name) addDropdownOption(s.name);
});
rebuildSpeakerTimings();

function applySpeakerPreset(name) {
  const times = speakerTimings[name];
  if (Array.isArray(times)) {
    timingThresholds = times;
    setThresholdLabels(times);
  }
}

function addOrUpdateSpeaker(name, preset) {
  const existing = speakerData.find(s => s.name === name);
  if (existing) {
    existing.preset = preset;
  } else {
    speakerData.push({ name, preset, actual: null });
    addDropdownOption(name);
  }
  localStorage.setItem("speakerData", JSON.stringify(speakerData));
  rebuildSpeakerTimings();
}

speakerDropdown.addEventListener('change', (e) => {
  applySpeakerPreset(e.target.value);
});

// Button presets
document.querySelectorAll('.preset').forEach(button => {
  button.addEventListener('click', () => {
    const times = button.dataset.times.split(',').map(t => parseInt(t));
    timingThresholds = times;
    setThresholdLabels(times);
  });
});

// Manual mode: no fixed thresholds, stopwatch just runs
document.getElementById('manualBtn')?.addEventListener('click', () => {
  timingThresholds = [];
  speakerDropdown.value = "";
  setThresholdLabels([]);
});

// Add Table Topic: prompt for a name, add/select with Table Topics preset
document.getElementById('addTableTopicBtn')?.addEventListener('click', () => {
  const name = window.prompt('Speaker name:')?.trim();
  if (!name) return;

  addOrUpdateSpeaker(name, TABLE_TOPICS_PRESET.slice());
  speakerDropdown.value = name;
  applySpeakerPreset(name);
});

// Open OBS display window
document.getElementById('openDisplayBtn')?.addEventListener('click', () => {
  window.open('display.html', 'obsTimerDisplay', 'width=128,height=720,resizable=yes');
});

// Stopwatch controls
document.getElementById('startBtn')?.addEventListener('click', startStopwatch);
document.getElementById('stopBtn')?.addEventListener('click', stopStopwatch);
document.getElementById('resetBtn')?.addEventListener('click', resetStopwatch);

// Manual color buttons
document.getElementById('greenBtn')?.addEventListener('click', () => setColor('green'));
document.getElementById('amberBtn')?.addEventListener('click', () => setColor('amber'));
document.getElementById('redBtn')?.addEventListener('click', () => setColor('red'));
document.getElementById('clearBtn')?.addEventListener('click', () => setColor('grey'));
