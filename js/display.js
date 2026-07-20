const screenEl = document.getElementById('displayScreen');
const labelEl = document.getElementById('displayColorLabel');
const indicatorEl = document.getElementById('runningIndicator');

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

const timerChannel = new BroadcastChannel('obs-timer-channel');
timerChannel.onmessage = (e) => {
  if (e.data?.type === 'state') applyState(e.data.color, e.data.running);
};

applyState('grey', false);
timerChannel.postMessage({ type: 'requestState' });
