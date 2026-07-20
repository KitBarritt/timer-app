let stopwatchInterval, startTime, elapsed = 0;
let timingThresholds = [];

const COLOR_MAP = {
  grey: { rgb: 'grey', label: '' },
  green: { rgb: 'green', label: 'Green' },
  amber: { rgb: 'orange', label: 'Amber' },
  red: { rgb: 'red', label: 'Red' },
  flash: { rgb: 'darkred', label: 'Red' }
};

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
}

console.log("loading");

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
  }
}

function stopStopwatch() {
  clearInterval(stopwatchInterval);
  stopwatchInterval = null;

  const seconds = Math.floor(elapsed / 1000);
  updateTime();
  updateDisplayColor('grey');

  // ⬇️ Add this block to save actual time to localStorage
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


console.log("loading");

// Button presets
document.querySelectorAll('.preset').forEach(button => {
  button.addEventListener('click', () => {
    const times = button.dataset.times.split(',').map(t => parseInt(t));
    timingThresholds = times;
    const formatted = times.slice(0, 3).map(t => {
      const m = String(Math.floor(t / 60)).padStart(2, '0');
      const s = String(t % 60).padStart(2, '0');
      return `${m}:${s}`;
    });

  document.getElementById("time-green").textContent = formatted[0] || "--:--";
  document.getElementById("time-amber").textContent = formatted[1] || "--:--";
  document.getElementById("time-red").textContent = formatted[2] || "--:--";

  });
});

// Speaker dropdown
speakerDropdown.addEventListener('change', (e) => {
  const name = e.target.value;
  const times = speakerTimings[name];
  console.log("Speaker selected:", name, times);

  if (Array.isArray(times)) {
    timingThresholds = times;
    const formatted = times.slice(0, 3).map(t => {
      const m = String(Math.floor(t / 60)).padStart(2, '0');
      const s = String(t % 60).padStart(2, '0');
      return `${m}:${s}`;
    });

    document.getElementById("time-green").textContent = formatted[0] || "--:--";
    document.getElementById("time-amber").textContent = formatted[1] || "--:--";
    document.getElementById("time-red").textContent = formatted[2] || "--:--";
  }
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

console.log("main.js loaded");

// Extend stopStopwatch to store actual time locally
const origStop = stopStopwatch;
stopStopwatch = function () {
  if (stopwatchInterval) {
    clearInterval(stopwatchInterval);
    stopwatchInterval = null;

    const name = document.getElementById("speakerDropdown")?.value;
    const seconds = Math.floor(elapsed / 1000);
    if (name) {
      const speakerData = JSON.parse(localStorage.getItem("speakerData") || "[]");
      const speaker = speakerData.find(s => s.name === name);
      if (speaker) {
        speaker.actual = seconds;
        localStorage.setItem("speakerData", JSON.stringify(speakerData));
      }
    }
  }
};