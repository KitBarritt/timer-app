/*
 * cube.js — optional bridge to a physical TimerCube / Toast Timer device.
 *
 * When the timer runs in a Chromium browser (Chrome / Edge, desktop) the
 * page can drive the cube's LED matrix over Bluetooth (Web Bluetooth) or
 * USB (Web Serial) in addition to colouring the on-screen panel.
 *
 * The transport is lifted almost verbatim from the TimerCube repo's
 * standalone web/ble.html and web/index.html pages, with their UI removed.
 * Protocol: newline-delimited JSON, identical in both modes.
 *
 * "Dumb display" model: we only ever PUSH to the cube — set_colour on every
 * colour transition, plus start / stop / reset to mirror the stopwatch. We
 * never send thresholds, so the app stays the single source of truth and
 * the cube's own timing engine is bypassed (set_colour sets a manual
 * override on the device; reset clears it). Inbound messages are drained
 * and ignored, except USB's READY_OK handshake.
 *
 * Public surface (window.Cube):
 *   Cube.supported()            -> { ble: bool, usb: bool }
 *   Cube.connect('ble'|'usb')   -> Promise (resolves once connected)
 *   Cube.disconnect()           -> Promise
 *   Cube.isConnected()          -> bool
 *   Cube.mode()                 -> 'ble' | 'usb' | null
 *   Cube.onStatus(fn)           -> register a (state, detail) listener
 *                                  state: 'connecting'|'connected'|'disconnected'|'error'
 *   Cube.setColour('grey'|'green'|'amber'|'red'|'flash')
 *   Cube.start() / Cube.stop() / Cube.reset()
 */
(function (global) {
  'use strict';

  // Nordic UART Service (must match ble_server.py on the device)
  var NUS_SVC = '6e400001-b5a3-f393-e0a9-e50e24dcca9e';
  var NUS_TX  = '6e400003-b5a3-f393-e0a9-e50e24dcca9e'; // device -> browser (notify)
  var NUS_RX  = '6e400002-b5a3-f393-e0a9-e50e24dcca9e'; // browser -> device (write)

  // The app's colour keys -> the device's set_colour vocabulary.
  var COLOUR_TO_CUBE = {
    grey:  'off',
    green: 'green',
    amber: 'amber',
    red:   'red',
    flash: 'flash'
  };

  var mode = null;            // 'ble' | 'usb' | null
  var connected = false;
  var statusListeners = [];

  // BLE handles
  var bleDevice = null, txChar = null, rxChar = null;
  // Serial handles
  var port = null, writer = null, reader = null;

  var rxBuf = '';

  function emit(state, detail) {
    statusListeners.forEach(function (fn) {
      try { fn(state, detail || ''); } catch (e) { /* ignore listener errors */ }
    });
  }

  function supported() {
    return {
      ble: typeof navigator !== 'undefined' && 'bluetooth' in navigator,
      usb: typeof navigator !== 'undefined' && 'serial' in navigator
    };
  }

  // ---- outbound -----------------------------------------------------------

  // Send one JSON object to the device (fire-and-forget).
  function sendObj(obj) {
    if (!connected) return;
    var line = JSON.stringify(obj) + '\n';
    if (mode === 'ble') {
      if (!rxChar) return;
      var data = new TextEncoder().encode(line);
      (async function () {
        try {
          // BLE writes must be chunked under the ATT MTU; 20 bytes is safe.
          for (var i = 0; i < data.length; i += 20) {
            await rxChar.writeValueWithoutResponse(data.slice(i, i + 20));
          }
        } catch (e) { /* dropped write — next state push will recover */ }
      })();
    } else if (mode === 'usb') {
      if (!writer) return;
      writer.write(new TextEncoder().encode(line)).catch(function () {});
    }
  }

  function setColour(colorKey) {
    var c = COLOUR_TO_CUBE[colorKey];
    if (!c) return;
    sendObj({ type: 'set_colour', colour: c });
  }
  function start() { sendObj({ type: 'start' }); }
  function stop()  { sendObj({ type: 'stop' }); }
  function reset() { sendObj({ type: 'reset' }); }

  // ---- inbound (drained, mostly ignored) --------------------------------

  function handleLine(line) {
    if (mode === 'usb' && line === 'READY_OK') {
      finishConnect();
      return;
    }
    // State / speakers / config messages from the device are not needed for
    // a one-way "also light the cube" feature — swallow them.
  }

  function feed(chunk) {
    rxBuf += chunk;
    var nl;
    while ((nl = rxBuf.indexOf('\n')) !== -1) {
      var line = rxBuf.slice(0, nl).trim();
      rxBuf = rxBuf.slice(nl + 1);
      if (line) handleLine(line);
    }
    if (rxBuf.length > 512) rxBuf = rxBuf.slice(-256);
  }

  // ---- BLE --------------------------------------------------------------

  async function connectBle() {
    if (!supported().ble) throw new Error('Web Bluetooth not supported in this browser');
    mode = 'ble';
    emit('connecting', 'bluetooth');
    bleDevice = await navigator.bluetooth.requestDevice({
      filters: [{ name: 'TimerCube' }, { name: 'Toast Timer' }],
      optionalServices: [NUS_SVC]
    });
    bleDevice.addEventListener('gattserverdisconnected', onDrop);
    var server  = await bleDevice.gatt.connect();
    var service = await server.getPrimaryService(NUS_SVC);
    txChar = await service.getCharacteristic(NUS_TX);
    rxChar = await service.getCharacteristic(NUS_RX);
    rxBuf = '';
    await txChar.startNotifications();
    txChar.addEventListener('characteristicvaluechanged', function (event) {
      feed(new TextDecoder().decode(event.target.value));
    });
    finishConnect(); // BLE has no handshake — connected once GATT is up
  }

  // ---- USB / Web Serial ------------------------------------------------

  async function connectUsb() {
    if (!supported().usb) throw new Error('Web Serial not supported in this browser');
    mode = 'usb';
    emit('connecting', 'usb');
    var p = await navigator.serial.requestPort();
    await p.open({ baudRate: 115200 });
    port = p;
    writer = port.writable.getWriter();
    startSerialReadLoop();
    // HELLO -> device replies READY_OK (fresh boot or reconnect alike).
    await writer.write(new TextEncoder().encode('HELLO\n'));
    // finishConnect() is called from handleLine() on READY_OK.
  }

  function startSerialReadLoop() {
    rxBuf = '';
    (async function () {
      var dec = new TextDecoder();
      reader = port.readable.getReader();
      try {
        while (true) {
          var res = await reader.read();
          if (res.done) break;
          feed(dec.decode(res.value, { stream: true }));
        }
      } catch (e) {
        /* reader cancelled or device unplugged */
      } finally {
        try { reader.releaseLock(); } catch (e) {}
        reader = null;
        onDrop();
      }
    })();
  }

  // ---- lifecycle ------------------------------------------------------

  function finishConnect() {
    connected = true;
    emit('connected', mode);
  }

  function onDrop() {
    if (!mode) return;
    var wasMode = mode;
    connected = false;
    txChar = null; rxChar = null;
    if (writer) { try { writer.releaseLock(); } catch (e) {} writer = null; }
    if (port)   { try { port.close(); } catch (e) {} port = null; }
    bleDevice = null;
    mode = null;
    emit('disconnected', wasMode);
  }

  async function connect(which) {
    if (connected) await disconnect();
    try {
      if (which === 'usb') await connectUsb();
      else await connectBle();
    } catch (e) {
      var abort = e && (e.name === 'NotFoundError'); // user dismissed the picker
      mode = null;
      connected = false;
      emit(abort ? 'disconnected' : 'error', abort ? '' : (e && e.message) || String(e));
      if (!abort) throw e;
    }
  }

  async function disconnect() {
    if (mode === 'usb') {
      if (reader) { try { await reader.cancel(); } catch (e) {} }
      onDrop();
    } else if (mode === 'ble') {
      if (bleDevice && bleDevice.gatt && bleDevice.gatt.connected) {
        bleDevice.gatt.disconnect(); // triggers gattserverdisconnected -> onDrop
      } else {
        onDrop();
      }
    }
  }

  // React to a USB device being physically unplugged.
  if (typeof navigator !== 'undefined' && navigator.serial) {
    navigator.serial.addEventListener('disconnect', function (e) {
      if (e.target === port) onDrop();
    });
  }

  global.Cube = {
    supported: supported,
    connect: connect,
    disconnect: disconnect,
    isConnected: function () { return connected; },
    mode: function () { return mode; },
    onStatus: function (fn) { if (typeof fn === 'function') statusListeners.push(fn); },
    setColour: setColour,
    start: start,
    stop: stop,
    reset: reset
  };
})(window);
