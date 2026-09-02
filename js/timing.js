// timing.js — shared timing helpers.
//
// Both the control page (js/main.js) and the display page (js/display.js)
// turn "seconds elapsed" into a colour the same way, so the logic lives
// here rather than being duplicated. This is what lets the display keep
// showing the right colour on its own if it loses contact with the
// control page mid-speech.

// Given whole seconds elapsed and a [green, amber, red, flash] array of
// threshold seconds, return the colour key that applies:
//   'grey'  before the first threshold (or with no full threshold set)
//   'green' / 'amber' / 'red' at their thresholds
//   'flash' at/after the last threshold
// Mirrors the ladder in main.js's updateColorFromTime().
function colorKeyForElapsed(seconds, thresholds) {
  if (!Array.isArray(thresholds) || thresholds.length !== 4) return 'grey';
  if (seconds >= thresholds[3]) return 'flash';
  if (seconds >= thresholds[2]) return 'red';
  if (seconds >= thresholds[1]) return 'amber';
  if (seconds >= thresholds[0]) return 'green';
  return 'grey';
}

// Whole seconds -> "mm:ss" (clamped at zero, minutes not padded past 2).
function formatMMSS(seconds) {
  seconds = Math.max(0, Math.floor(seconds));
  const m = String(Math.floor(seconds / 60)).padStart(2, '0');
  const s = String(seconds % 60).padStart(2, '0');
  return `${m}:${s}`;
}
