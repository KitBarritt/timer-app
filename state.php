<?php
// Minimal shared-state endpoint so a control page (js/main.js) and a display
// page (js/display.js) can stay in sync even when they run in separate
// browser processes (e.g. an OBS Browser Source), where BroadcastChannel
// can't reach. State is scoped per "room" so multiple clients can each run
// their own independent timer at the same time without colliding.

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
  return array('color' => 'grey', 'running' => false, 'ts' => 0);
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

  if (is_file($file)) {
    if (time() - filemtime($file) > $STALE_SECONDS) {
      unlink($file);
      echo json_encode(default_state());
      exit;
    }
    $raw = file_get_contents($file);
    echo ($raw !== false && $raw !== '') ? $raw : json_encode(default_state());
    exit;
  }

  echo json_encode(default_state());
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
  $state = array(
    'color' => in_array($color, $VALID_COLORS, true) ? $color : 'grey',
    'running' => !empty($body['running']),
    'ts' => time(),
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
