<?php
// Minimal shared-state endpoint so a control page (js/main.js) and a display
// page (js/display.js) can stay in sync even when they run in separate
// browser processes (an OBS Browser Source, or a phone/tablet on the same
// network reached via the QR code), where BroadcastChannel can't reach.
// State is scoped per "room" so multiple clients can each run their own
// independent timer at the same time without colliding.
//
// The payload carries enough for a display to run the timer on its own:
//   color         last colour the control page showed (grey/green/amber/red/flash)
//   running       is the stopwatch running
//   manual        is `color` a manual override rather than schedule-derived
//   thresholds    [green, amber, red, flash] seconds, or null in manual mode
//   baseElapsedMs elapsed ms at the moment this state was POSTed
//   ts            server time (float seconds) when this state was written
// A GET also returns `serverNow` (ms) so a display can work out how much
// time has passed since `ts` without trusting its own clock to agree with
// the control device's.

header('Content-Type: application/json');

$VALID_COLORS = array('grey', 'green', 'amber', 'red', 'flash');
$STALE_SECONDS = 86400; // 24h — lazily forget rooms nobody has touched in a day

$dataDir = __DIR__ . '/state-data';

if (!is_dir($dataDir)) {
  if (!mkdir($dataDir, 0755, true) && !is_dir($dataDir)) {
    http_response_code(500);
    echo json_encode(array('error' => 'could not create state-data directory'));
    exit;
  }
}

if (!is_writable($dataDir)) {
  http_response_code(500);
  echo json_encode(array('error' => 'state-data directory is not writable by PHP'));
  exit;
}

function room_file($dataDir, $room) {
  $room = preg_replace('/[^A-Za-z0-9_-]/', '', (string) $room);
  $room = substr($room, 0, 64);
  if ($room === '') {
    return null;
  }
  return $dataDir . '/' . $room . '.json';
}

function default_state() {
  return array(
    'color' => 'grey',
    'running' => false,
    'manual' => false,
    'thresholds' => null,
    'baseElapsedMs' => 0,
    'ts' => 0,
  );
}

// Fill in any keys a state file written by an older version is missing, so
// the response shape is stable regardless of when the room was last touched.
function normalise_state($state) {
  if (!is_array($state)) {
    return default_state();
  }
  return array_merge(default_state(), $state);
}

$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET') {
  $room = isset($_GET['room']) ? $_GET['room'] : null;
  $file = room_file($dataDir, $room);
  if ($file === null) {
    http_response_code(400);
    echo json_encode(array('error' => 'missing room'));
    exit;
  }

  $state = default_state();

  if (is_file($file)) {
    if (time() - filemtime($file) > $STALE_SECONDS) {
      unlink($file);
    } else {
      $raw = file_get_contents($file);
      $decoded = ($raw !== false && $raw !== '') ? json_decode($raw, true) : null;
      $state = normalise_state($decoded);
    }
  }

  $state['serverNow'] = round(microtime(true) * 1000);
  echo json_encode($state);
  exit;
}

if ($method === 'POST') {
  $input = file_get_contents('php://input');
  $body = json_decode($input, true);
  if (!is_array($body)) {
    http_response_code(400);
    echo json_encode(array('error' => 'invalid JSON body', 'received' => $input));
    exit;
  }

  $room = isset($body['room']) ? $body['room'] : null;
  $file = room_file($dataDir, $room);
  if ($file === null) {
    http_response_code(400);
    echo json_encode(array('error' => 'missing room'));
    exit;
  }

  $color = isset($body['color']) ? $body['color'] : 'grey';

  // thresholds: accept only a full set of four non-negative numbers.
  $thresholds = null;
  if (isset($body['thresholds']) && is_array($body['thresholds']) && count($body['thresholds']) === 4) {
    $t = array();
    foreach ($body['thresholds'] as $v) {
      if (!is_numeric($v)) { $t = null; break; }
      $t[] = max(0, (int) $v);
    }
    $thresholds = $t;
  }

  $baseElapsedMs = (isset($body['baseElapsedMs']) && is_numeric($body['baseElapsedMs']))
    ? max(0, (float) $body['baseElapsedMs'])
    : 0;

  $state = array(
    'color' => in_array($color, $VALID_COLORS, true) ? $color : 'grey',
    'running' => !empty($body['running']),
    'manual' => !empty($body['manual']),
    'thresholds' => $thresholds,
    'baseElapsedMs' => $baseElapsedMs,
    'ts' => microtime(true),
  );

  $written = file_put_contents($file, json_encode($state), LOCK_EX);
  if ($written === false) {
    http_response_code(500);
    echo json_encode(array('error' => 'failed to write state file', 'file' => basename($file)));
    exit;
  }

  echo json_encode(array('ok' => true));
  exit;
}

http_response_code(405);
echo json_encode(array('error' => 'method not allowed'));
