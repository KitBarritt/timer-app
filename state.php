<?php
// Minimal shared-state endpoint so a control page (js/main.js) and a display
// page (js/display.js) can stay in sync even when they run in separate
// browser processes (e.g. an OBS Browser Source), where BroadcastChannel
// can't reach. State is scoped per "room" so multiple clients can each run
// their own independent timer at the same time without colliding.

header('Content-Type: application/json');

const VALID_COLORS = ['grey', 'green', 'amber', 'red', 'flash'];
const STALE_SECONDS = 86400; // 24h — lazily forget rooms nobody has touched in a day

$dataDir = __DIR__ . '/state-data';
if (!is_dir($dataDir)) {
  mkdir($dataDir, 0700, true);
}

function room_file(string $dataDir, ?string $room): ?string {
  $room = preg_replace('/[^A-Za-z0-9_-]/', '', (string) $room);
  $room = substr($room, 0, 64);
  if ($room === '') {
    return null;
  }
  return $dataDir . '/' . $room . '.json';
}

function default_state(): array {
  return ['color' => 'grey', 'running' => false, 'ts' => 0];
}

$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET') {
  $file = room_file($dataDir, $_GET['room'] ?? null);
  if ($file === null) {
    http_response_code(400);
    echo json_encode(['error' => 'missing room']);
    exit;
  }

  if (is_file($file)) {
    if (time() - filemtime($file) > STALE_SECONDS) {
      unlink($file);
      echo json_encode(default_state());
      exit;
    }
    $raw = file_get_contents($file);
    echo $raw !== false && $raw !== '' ? $raw : json_encode(default_state());
    exit;
  }

  echo json_encode(default_state());
  exit;
}

if ($method === 'POST') {
  $body = json_decode(file_get_contents('php://input'), true) ?? [];
  $file = room_file($dataDir, $body['room'] ?? null);
  if ($file === null) {
    http_response_code(400);
    echo json_encode(['error' => 'missing room']);
    exit;
  }

  $color = $body['color'] ?? 'grey';
  $state = [
    'color' => in_array($color, VALID_COLORS, true) ? $color : 'grey',
    'running' => !empty($body['running']),
    'ts' => time(),
  ];

  file_put_contents($file, json_encode($state), LOCK_EX);
  echo json_encode(['ok' => true]);
  exit;
}

http_response_code(405);
echo json_encode(['error' => 'method not allowed']);
