const screenEl = document.getElementById('displayScreen');
const labelEl = document.getElementById('displayColorLabel');
const indicatorEl = document.getElementById('runningIndicator');

const roomId = getRoomIdFromUrl('default');

function applyState(colorKey, running) {
  const color = COLOR_MAP[colorKey] || COLOR_MAP.grey;
  screenEl.style.backgroundColor = color.rgb;

  if (color.label) {
    labelEl.textContent = color.label;
    labelEl.style.display = 'block';
  } else {
    labelEl.style.display = 'none';
  }

  indicatorEl.classList.toggle('running', !!running);
}

// Same-browser instant sync (e.g. a second tab window-captured in OBS)
const timerChannel = new BroadcastChannel('obs-timer-channel-' + roomId);
timerChannel.onmessage = (e) => {
  if (e.data?.type === 'state') applyState(e.data.color, e.data.running);
};

applyState('grey', false);
timerChannel.postMessage({ type: 'requestState' });

// Cross-process fallback (e.g. an OBS Browser Source, which can't see
// BroadcastChannel messages from the control page's real browser tab).
// Silently does nothing if there's no PHP backend to poll.
let pollWarned = false;

async function pollState() {
  try {
    const res = await fetch(`state.php?room=${encodeURIComponent(roomId)}`, { cache: 'no-store' });
    if (res.ok) {
      const data = await res.json();
      applyState(data.color, data.running);
    } else if (!pollWarned) {
      pollWarned = true;
      console.warn('state.php GET failed:', res.status, await res.text());
    }
  } catch (err) {
    if (!pollWarned) {
      pollWarned = true;
      console.warn('state.php unreachable, relying on BroadcastChannel only:', err);
    }
  }
}

pollState();
setInterval(pollState, 350);
