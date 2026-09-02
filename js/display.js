// display.js — the standalone colour display.
//
// Used two ways:
//   • captured in OBS (a second window, or a Browser Source), and
//   • opened on a phone/tablet via the control page's QR code.
//
// It runs the timer on its own. The control page tells it the schedule
// (the four thresholds + how much time has elapsed), and from then on this
// page counts locally and works out the colour itself — so if it loses
// contact with the control page mid-speech it keeps showing the right
// colour and the clock keeps sweeping. Each state message it does receive
// just re-anchors it, correcting any drift and picking up Stop / Reset /
// manual colour changes.

const screenEl = document.getElementById('displayScreen');
const labelEl = document.getElementById('displayColorLabel');
const indicatorEl = document.getElementById('runningIndicator');
const handEl = document.getElementById('runningHand');
const statusEl = document.getElementById('displayStatus');

const roomId = getRoomIdFromUrl('default');

// Local model of the timer, re-anchored on every state message.
const model = {
  running: false,
  manual: false,
  color: 'grey',
  thresholds: null,       // [green, amber, red, flash] seconds, or null
  anchorElapsedMs: 0,     // elapsed at the anchor moment
  anchorLocalMs: Date.now(), // this device's clock at the anchor moment
};

let lastSyncLocalMs = 0;  // when we last heard anything (0 = never)
let renderedColor = null;

function currentElapsedMs() {
  if (!model.running) return model.anchorElapsedMs;
  return model.anchorElapsedMs + (Date.now() - model.anchorLocalMs);
}

function currentColorKey() {
  if (!model.running) return model.color || 'grey';
  if (model.manual || !model.thresholds) return model.color || 'grey';
  return colorKeyForElapsed(currentElapsedMs() / 1000, model.thresholds);
}

function applyColor(colorKey) {
  if (colorKey === renderedColor) return;
  renderedColor = colorKey;
  const color = COLOR_MAP[colorKey] || COLOR_MAP.grey;
  screenEl.style.backgroundColor = color.rgb;
  if (color.label) {
    labelEl.textContent = color.label;
    labelEl.style.display = 'block';
  } else {
    labelEl.style.display = 'none';
  }
}

// One render pass: colour, the running class, and the clock hand angle.
// Driving the hand angle ourselves (rather than a blind CSS animation)
// keeps it consistent with elapsed time even after the screen has been
// off, and means it points at the right place the instant contact drops.
function render() {
  applyColor(currentColorKey());

  indicatorEl.classList.toggle('running', model.running);
  if (handEl) {
    const revs = model.running ? currentElapsedMs() / 1000 : 0; // 1 rev / sec
    handEl.style.animation = 'none';
    handEl.style.transform =
      `translate(-50%, -100%) rotate(${(revs % 1) * 360}deg)`;
  }

  if (statusEl) {
    if (!lastSyncLocalMs) {
      statusEl.textContent = '';
    } else {
      const stale = Date.now() - lastSyncLocalMs > 6000;
      statusEl.textContent = stale ? 'running on its own' : '';
    }
  }
}

// Fold a received state into the model, re-anchoring the local clock.
// `fromServer` messages carry ts / serverNow so we can add on the time
// that passed server-side between the POST and this GET without trusting
// the two devices' clocks to agree. BroadcastChannel messages are
// same-browser and effectively instant, so they need no such correction.
function ingest(s, fromServer) {
  if (!s) return;
  model.running = !!s.running;
  model.manual = !!s.manual;
  model.color = s.color || 'grey';
  model.thresholds =
    Array.isArray(s.thresholds) && s.thresholds.length === 4 ? s.thresholds : null;

  let base = Number(s.baseElapsedMs) || 0;
  if (fromServer && model.running &&
      typeof s.ts === 'number' && typeof s.serverNow === 'number') {
    base += Math.max(0, s.serverNow - s.ts * 1000);
  }
  model.anchorElapsedMs = base;
  model.anchorLocalMs = Date.now();
  lastSyncLocalMs = Date.now();
  render();
}

// --- Same-browser instant sync (a second tab / OBS window capture) ------

const timerChannel = new BroadcastChannel('obs-timer-channel-' + roomId);
timerChannel.onmessage = (e) => {
  if (e.data?.type === 'state') ingest(e.data, false);
};
timerChannel.postMessage({ type: 'requestState' });

// --- Cross-process / cross-device sync (OBS Browser Source, or a phone) -
// Silently does nothing if there's no PHP backend to poll — but then a
// separate device can't sync at all, so this is the main path for the
// phone display.

let pollWarned = false;

async function pollState() {
  try {
    const res = await fetch(`state.php?room=${encodeURIComponent(roomId)}`, { cache: 'no-store' });
    if (res.ok) {
      ingest(await res.json(), true);
    } else if (!pollWarned) {
      pollWarned = true;
      console.warn('state.php GET failed:', res.status, await res.text());
    }
  } catch (err) {
    if (!pollWarned) {
      pollWarned = true;
      console.warn('state.php unreachable, running on the last known schedule:', err);
    }
  }
}

pollState();
setInterval(pollState, 1000);

// Local render loop — independent of the network. 10 fps is plenty for a
// colour panel and a once-per-second clock hand, and light on a phone.
setInterval(render, 100);
render();

// --- Keep the screen awake --------------------------------------------
// Works on Android Chrome/Edge and iOS Safari 16.4+. The OS drops the
// lock whenever the tab is hidden or the phone is locked, so re-acquire
// on every return to visibility. It can't defeat a manual lock or an
// older iOS auto-lock — that's what the autonomous clock above is for.

let wakeLock = null;

async function acquireWakeLock() {
  try {
    if ('wakeLock' in navigator && document.visibilityState === 'visible') {
      wakeLock = await navigator.wakeLock.request('screen');
    }
  } catch (err) {
    // Denied, not focused, or unsupported — nothing we can do here.
  }
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    acquireWakeLock();
    pollState();
  }
});

acquireWakeLock();

// Tapping the panel on a phone goes fullscreen — hides the browser chrome
// and, on some devices, further discourages the screen from dimming.
screenEl.addEventListener('click', () => {
  if (!document.fullscreenElement && screenEl.requestFullscreen) {
    screenEl.requestFullscreen().catch(() => {});
  }
});
