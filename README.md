# Toastmaster Timer

A browser-based speech timer for Toastmasters-style meetings, designed to be used as a colour-coded background/overlay in OBS during online meetings. It's a fully static site (HTML/CSS/JS, no build step, no server-side framework) plus one small optional PHP endpoint for cross-window syncing.

## Features

- **Colour-coded timer** — a full-screen panel that transitions grey → green → amber → red → flashing red as a speech runs long, driven by a simple stopwatch.
- **Timing presets** — One Minute, Table Topics, Evaluations, Icebreaker, Speech, 10 Minutes, 15 Minutes, 20 Minutes — plus a **Manual** mode (stopwatch only, no automatic colour changes).
- **Speaker list** — maintain a list of speakers with their own preset/custom thresholds and record their actual speaking time, stored in the browser's `localStorage`.
- **Add Table Topic** — quickly add an impromptu speaker with the Table Topics preset already applied.
- **OBS display window** — a separate, minimal 1920×1080 window (`display.html`) showing just the colour panel and a running indicator, meant to be captured as an OBS source. It stays in sync with the control page live via `BroadcastChannel` (same browser) and via polling `state.php` (works even across an OBS Browser Source, and across multiple concurrent users/rooms).
- **Mini Player mode** — a compact layout for the control page itself, for when you want it to take up less desktop space.

## File structure

```
index.html        Splash/landing page
timer.html         Main control page
speakers.html       Speaker list editor
display.html        OBS display window (colour panel only)
css/style.css        All styling
js/colors.js         Shared colour → RGB/label map
js/room.js            Room ID generation/persistence
js/main.js            Timer page logic
js/speakers.js         Speaker list page logic
js/display.js           Display window logic
state.php               Optional: shared state endpoint for cross-process sync
state-data/               Per-room state files written by state.php (auto-created)
```

## Hosting

This is a static site — upload everything to any web host. `state.php` requires PHP support (used only for syncing the display window when it's loaded as a separate process, e.g. an OBS Browser Source, rather than a second browser tab); without PHP, the app still works fully, just without that specific sync path.

## Local testing

Don't open the HTML files directly via `file://` — several features (room syncing, `BroadcastChannel`) require a real HTTP origin. Serve the folder with any static server, e.g.:

```
python -m http.server 8000
```

then browse to `http://localhost:8000/timer.html`. (`state.php` won't run under a plain static server — you'd need a PHP-capable server to test that part locally.)

## Usage

1. Open `timer.html`.
2. Pick a preset (or select a speaker from the list), then **Start**.
3. Use the **☰** menu (top-right) to open the OBS display window, copy its link (for an OBS Browser Source), switch to Mini Player, or hide the stopwatch readout.
4. In OBS, either window-capture the popped-out display window, or add it as a Browser Source using the copied link.
