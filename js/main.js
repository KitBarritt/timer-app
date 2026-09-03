let stopwatchInterval, startTime, elapsed = 0;
let timingThresholds = [];
let currentColorKey = 'grey';

// True when the colour on screen was set by the Green/Amber/Red/Clear
// buttons rather than derived from the running clock. A display mirroring
// this room needs to know, so it shows the override verbatim instead of
// computing its own colour from the schedule.
let manualOverride = false;

const TABLE_TOPICS_PRESET = [60, 90, 120, 150];

// Mini player mode persists across navigation (e.g. going to the Speaker
// List and back), the same way the room ID does.
const MINI_MODE_KEY = 'timerMiniMode';

function setMiniMode(enabled) {
  document.documentElement.classList.toggle('mini-mode', enabled);
  localStorage.setItem(MINI_MODE_KEY, enabled ? '1' : '0');
}

if (localStorage.getItem(MINI_MODE_KEY) === '1') {
  document.documentElement.classList.add('mini-mode');
}

// --- Persist the control page's own timer state ----------------------
// The schedule, the elapsed clock and the running flag live only in
// memory here, so any full-page navigation (most easily the Speaker List
// link and back) used to reset the timer mid-speech. Mirror the state
// into localStorage on every change and restore it on load, folding in
// the wall-clock time that passed while away — the same re-anchoring the
// display page does when it briefly loses contact.
const TIMER_STATE_KEY = 'timerControlState';
// Older than this, a saved "running" clock is treated as abandoned rather
// than resumed. The snapshot is refreshed every ~2s while the tab is open
// and again on pagehide, so a gap this large means it was genuinely shut
// for that long.
const TIMER_STATE_MAX_AGE_MS = 15 * 60 * 1000;

// Set while restoreState() is repopulating the page, so the helpers it
// calls don't write half-restored state back over the snapshot.
let restoringState = false;

function persistState() {
  if (restoringState) return;
  try {
    localStorage.setItem(TIMER_STATE_KEY, JSON.stringify({
      savedAt: Date.now(),
      running: !!stopwatchInterval,
      elapsedMs: elapsed,
      thresholds: timingThresholds.length === 4 ? timingThresholds : [],
      color: currentColorKey,
      manualOverride: manualOverride,
      speaker: document.getElementById('speakerDropdown')?.value || '',
    }));
  } catch (e) {
    /* storage full or unavailable — nothing useful to do */
  }
}

function restoreState() {
  let saved;
  try {
    saved = JSON.parse(localStorage.getItem(TIMER_STATE_KEY) || 'null');
  } catch (e) {
    saved = null;
  }
  if (!saved) return;

  const age = Date.now() - (Number(saved.savedAt) || 0);
  const stale = !(age >= 0 && age <= TIMER_STATE_MAX_AGE_MS);

  restoringState = true;

  // The schedule always comes back — only the abandoned clock is dropped.
  if (Array.isArray(saved.thresholds) && saved.thresholds.length === 4) {
    timingThresholds = saved.thresholds.slice();
    setThresholdLabels(timingThresholds);
  }

  const dropdown = document.getElementById('speakerDropdown');
  if (dropdown && saved.speaker) dropdown.value = saved.speaker;

  if (saved.running && !stale) {
    // Resume: add on the wall-clock time that passed while we were away.
    elapsed = (Number(saved.elapsedMs) || 0) + age;
    manualOverride = false;
    startTime = Date.now() - elapsed;
    updateTime();
    beginTicking();
    if (window.Cube) Cube.start();
    // Pick the colour up now rather than waiting for the first tick; with
    // no schedule set, honour the manual colour that was showing.
    if (timingThresholds.length === 4) {
      updateColorFromTime();
    } else if (saved.color && saved.color !== 'grey') {
      manualOverride = !!saved.manualOverride;
      updateDisplayColor(saved.color);
    }
  } else {
    elapsed = stale ? 0 : (Number(saved.elapsedMs) || 0);
    updateTime();
    if (!stale && saved.color && saved.color !== 'grey') {
      manualOverride = !!saved.manualOverride;
      updateDisplayColor(saved.color);
    }
  }

  restoringState = false;
  broadcastState();
}

const roomId = getOrCreateRoomId();

const timerChannel = new BroadcastChannel('obs-timer-channel-' + roomId);
timerChannel.onmessage = (e) => {
  if (e.data?.type === 'requestState') broadcastState();
};

function broadcastState() {
  const payload = {
    room: roomId,
    color: currentColorKey,
    running: !!stopwatchInterval,
    manual: manualOverride,
    thresholds: timingThresholds.length === 4 ? timingThresholds : null,
    baseElapsedMs: elapsed,
  };

  timerChannel.postMessage({ type: 'state', ...payload });

  // Also push to the server so a display page running in a separate process
  // (e.g. an OBS Browser Source) can pick it up via polling. Degrades to
  // BroadcastChannel-only (with a console warning) when there's no PHP
  // backend around, e.g. testing over a plain static server.
  fetch('state.php', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  }).then(res => {
    if (!res.ok) res.text().then(t => console.warn('state.php POST failed:', res.status, t));
  }).catch(err => console.warn('state.php unreachable:', err));

  persistState();
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

  if (colorKey !== currentColorKey && window.Cube) Cube.setColour(colorKey);

  currentColorKey = colorKey;
  broadcastState();
}

function setColor(colorKey) {
  manualOverride = true;
  updateDisplayColor(colorKey);
}

// Start the 500ms tick loop. Assumes startTime is already anchored so
// that `elapsed = Date.now() - startTime`. Shared by startStopwatch() and
// restoreState() when it resumes a running timer after a navigation.
function beginTicking() {
  let tick = 0;
  stopwatchInterval = setInterval(() => {
    elapsed = Date.now() - startTime;
    updateTime();
    updateColorFromTime();
    // Re-anchor any mirroring display roughly every 2s even while the
    // colour isn't changing, so a late-joining or drifting display
    // (or one that briefly lost contact) catches back up.
    if (++tick % 4 === 0) broadcastState();
  }, 500);
}

function startStopwatch() {
  if (!stopwatchInterval) {
    startTime = Date.now() - elapsed;
    manualOverride = false;
    beginTicking();
    if (window.Cube) Cube.start();
    broadcastState();
  }
}

function stopStopwatch() {
  if (stopwatchInterval) {
    clearInterval(stopwatchInterval);
    stopwatchInterval = null;
  }

  if (window.Cube) Cube.stop();

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
  if (window.Cube) Cube.reset();
  elapsed = 0;
  updateTime();
  updateDisplayColor('grey');
}

function updateTime() {
  const stopwatch = document.getElementById("stopwatch");
  if (stopwatch) stopwatch.textContent = formatMMSS(elapsed / 1000);
}

function updateColorFromTime() {
  const seconds = Math.floor(elapsed / 1000);
  const key = colorKeyForElapsed(seconds, timingThresholds);
  // Only the coloured phase (green onward) is driven automatically; the
  // grey lead-in leaves any manual colour untouched, as before.
  if (timingThresholds.length === 4 && key !== 'grey') {
    manualOverride = false;
    updateDisplayColor(key);
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

  // Remember a bare schedule change (preset / speaker / Manual) too, not
  // just changes that go through broadcastState().
  persistState();
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
  persistState();
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

// Open OBS display window / copy the display link
const displayUrl = new URL('display.html', location.href);
displayUrl.searchParams.set('room', roomId);

document.getElementById('openDisplayBtn')?.addEventListener('click', () => {
  window.open(displayUrl.href, 'obsTimerDisplay', 'width=1920,height=1080,resizable=yes');
});

async function copyDisplayLink() {
  try {
    await navigator.clipboard.writeText(displayUrl.href);
  } catch {
    window.prompt('Copy this link:', displayUrl.href);
  }
}

document.getElementById('copyDisplayLinkBtn')?.addEventListener('click', copyDisplayLink);

// QR code for opening the display on a phone / tablet on the same network.
const qrModal = document.getElementById('qrModal');

function openQrModal() {
  if (!qrModal) return;

  document.getElementById('qrUrl').textContent = displayUrl.href;

  const codeEl = document.getElementById('qrCode');
  try {
    codeEl.innerHTML = QR.svg(displayUrl.href, { margin: 2 });
  } catch {
    codeEl.textContent = 'This link is too long to fit in a QR code — use Copy link instead.';
  }

  // A QR pointing at localhost / a loopback address is no use to another
  // device; warn when that's what the control page is being served from.
  const host = location.hostname;
  const unreachable = location.protocol === 'file:' ||
    /^(localhost|127\.|0\.0\.0\.0$|\[?::1\]?$)/.test(host);
  document.getElementById('qrHost').textContent = host || location.protocol;
  document.getElementById('qrWarn').hidden = !unreachable;

  qrModal.hidden = false;
}

function closeQrModal() {
  if (qrModal) qrModal.hidden = true;
}

document.getElementById('showQrBtn')?.addEventListener('click', openQrModal);
document.getElementById('qrCloseBtn')?.addEventListener('click', closeQrModal);
document.getElementById('qrCopyBtn')?.addEventListener('click', copyDisplayLink);
qrModal?.addEventListener('click', (e) => {
  if (e.target === qrModal) closeQrModal();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && qrModal && !qrModal.hidden) closeQrModal();
});

// Mini player: compact layout toggle for the control window itself
document.getElementById('miniPlayerBtn')?.addEventListener('click', () => setMiniMode(true));
document.getElementById('fullViewBtn')?.addEventListener('click', () => setMiniMode(false));

// Hide/unhide the stopwatch readout (the Configuration menu itself opens on
// hover via CSS, so there's nothing to wire up for that beyond this action)
const hideStopwatchBtn = document.getElementById('hideStopwatchToggle');
hideStopwatchBtn?.addEventListener('click', () => {
  const hidden = document.documentElement.classList.toggle('stopwatch-hidden');
  hideStopwatchBtn.textContent = hidden ? 'Show Stopwatch' : 'Hide Stopwatch';
});

// Tooltips: shown via the native title attribute (so they need no styling
// of their own), toggle-able and remembered per browser like mini-player mode.
const TOOLTIPS_KEY = 'timerTooltipsEnabled';
const tooltipsToggleBtn = document.getElementById('tooltipsToggle');

function tooltipsEnabled() {
  return localStorage.getItem(TOOLTIPS_KEY) !== '0';
}

function applyTooltips(enabled) {
  document.querySelectorAll('[data-tooltip]').forEach(el => {
    if (enabled) {
      el.title = el.dataset.tooltip;
    } else {
      el.removeAttribute('title');
    }
  });
  if (tooltipsToggleBtn) {
    tooltipsToggleBtn.textContent = enabled ? 'Disable Tooltips' : 'Enable Tooltips';
  }
}

applyTooltips(tooltipsEnabled());

tooltipsToggleBtn?.addEventListener('click', () => {
  const next = !tooltipsEnabled();
  localStorage.setItem(TOOLTIPS_KEY, next ? '1' : '0');
  applyTooltips(next);
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

// --- Physical cube bridge (optional; Chromium desktop only) ---
// The menu items stay hidden on browsers without Web Bluetooth / Web Serial,
// and the whole feature no-ops if cube.js failed to load.
if (window.Cube) {
  const cubeBleBtn = document.getElementById('cubeBleBtn');
  const cubeUsbBtn = document.getElementById('cubeUsbBtn');
  const cubeDisconnectBtn = document.getElementById('cubeDisconnectBtn');
  const cubeSupport = Cube.supported();

  if (cubeSupport.ble) cubeBleBtn?.removeAttribute('hidden');
  if (cubeSupport.usb) cubeUsbBtn?.removeAttribute('hidden');

  cubeBleBtn?.addEventListener('click', () => Cube.connect('ble').catch(() => {}));
  cubeUsbBtn?.addEventListener('click', () => Cube.connect('usb').catch(() => {}));
  cubeDisconnectBtn?.addEventListener('click', () => Cube.disconnect());

  Cube.onStatus((state, detail) => {
    const isConnected = state === 'connected';
    const isConnecting = state === 'connecting';

    cubeBleBtn?.toggleAttribute('hidden', isConnected || isConnecting || !cubeSupport.ble);
    cubeUsbBtn?.toggleAttribute('hidden', isConnected || isConnecting || !cubeSupport.usb);
    cubeDisconnectBtn?.toggleAttribute('hidden', !isConnected);

    if (isConnecting) {
      const btn = detail === 'usb' ? cubeUsbBtn : cubeBleBtn;
      if (btn) { btn.removeAttribute('hidden'); btn.textContent = 'Connecting cube...'; }
    } else {
      if (cubeBleBtn) cubeBleBtn.textContent = 'Connect Cube (Bluetooth)';
      if (cubeUsbBtn) cubeUsbBtn.textContent = 'Connect Cube (USB)';
    }

    if (isConnected) {
      // Bring a freshly connected cube in line with what's on screen.
      if (stopwatchInterval) Cube.start();
      Cube.setColour(currentColorKey);
    }

    if (state === 'error') {
      console.warn('Cube connection error:', detail);
      window.alert('Could not connect to the cube: ' + detail);
    }
  });
}

// --- Survive a full-page navigation (e.g. the Speaker List and back) ---
// Take a last, fresh snapshot right before we unload, then restore on the
// way back in. pagehide covers navigation, tab close and bfcache.
window.addEventListener('pagehide', persistState);
restoreState();
