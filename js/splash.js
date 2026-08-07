// A phone/tablet gets a different landing message and goes to the cut-down
// mobile.html instead of timer.html. Width is a simple, reliable enough
// signal for "small personal device rehearsing alone" vs "PC running OBS".
const MOBILE_BREAKPOINT = 820;

// Tablets held in landscape (or larger iPads in portrait) can exceed the
// width breakpoint and land in the PC branch, so detect them separately.
function isLikelyTablet() {
  const ua = navigator.userAgent;
  // Since iPadOS 13, Safari on iPad reports itself as desktop Mac Safari by
  // default (no "iPad" in the UA) — but unlike an actual Mac, it still
  // reports real touch support, which is what we key off instead.
  const isIPad = /iPad/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  // Android tablets conventionally omit "Mobile" from their UA, unlike phones.
  const isAndroidTablet = /Android/.test(ua) && !/Mobile/.test(ua);
  return isIPad || isAndroidTablet;
}

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
} else if (isLikelyTablet()) {
  const tabletModeBtn = document.getElementById('tabletModeBtn');
  if (tabletModeBtn) tabletModeBtn.hidden = false;
}
