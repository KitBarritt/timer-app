function generateRoomId() {
  if (window.crypto?.randomUUID) return crypto.randomUUID().replace(/-/g, '').slice(0, 10);
  return Math.random().toString(36).slice(2, 12);
}

// Control page: reuse the room from the URL if present, otherwise fall back
// to the browser's last-used room, otherwise mint a new one and remember it.
function getOrCreateRoomId() {
  const params = new URLSearchParams(location.search);
  let room = params.get('room');

  if (room) {
    localStorage.setItem('timerRoomId', room);
    return room;
  }

  room = localStorage.getItem('timerRoomId');
  if (!room) {
    room = generateRoomId();
    localStorage.setItem('timerRoomId', room);
  }

  params.set('room', room);
  history.replaceState(null, '', `${location.pathname}?${params.toString()}`);
  return room;
}

// Display page: only ever trust the URL — it has no session of its own.
function getRoomIdFromUrl(fallback) {
  const params = new URLSearchParams(location.search);
  return params.get('room') || fallback;
}
