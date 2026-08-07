// A phone/tablet gets a different landing message and goes to the cut-down
// mobile.html instead of timer.html. Width is a simple, reliable enough
// signal for "small personal device rehearsing alone" vs "PC running OBS".
const MOBILE_BREAKPOINT = 820;

if (window.innerWidth <= MOBILE_BREAKPOINT) {
  const continueBtn = document.getElementById('continueBtn');
  const message = document.getElementById('splashMessage');

  if (continueBtn) continueBtn.href = 'mobile.html';

  if (message) {
    message.innerHTML = `
      Welcome to your speech timer.<br><br>
      Pick a preset (or set your own time), then Start — the colour tells you where you stand as you rehearse.<br><br>
      Click below to begin.
    `;
  }
}
