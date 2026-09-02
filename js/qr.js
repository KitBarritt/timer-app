/*
 * qr.js — a small, self-contained QR Code generator (byte mode, versions
 * 1–6, error-correction level M with an automatic drop to L for longer
 * text). Enough to encode a display URL and nothing more — no third-party
 * code, no network. Exposes:
 *
 *   QR.matrix(text)                -> boolean[][]  (true = dark module)
 *   QR.svg(text, { margin=4 })     -> string       (a crisp-edges <svg>)
 *
 * Throws if the text doesn't fit in a version-6 symbol (~134 bytes at
 * level L), which a URL never approaches.
 *
 * Algorithm follows ISO/IEC 18004. The structure mirrors the well-known
 * reference implementations: GF(256) Reed–Solomon, zig-zag data placement,
 * all eight data masks scored by the standard penalty rules.
 */
(function (global) {
  'use strict';

  // --- GF(256), primitive polynomial 0x11D ------------------------------
  var EXP = new Uint8Array(256);
  var LOG = new Uint8Array(256);
  (function () {
    var x = 1;
    for (var i = 0; i < 255; i++) {
      EXP[i] = x;
      LOG[x] = i;
      x <<= 1;
      if (x & 0x100) x ^= 0x11d;
    }
  })();

  function gmul(a, b) {
    if (a === 0 || b === 0) return 0;
    return EXP[(LOG[a] + LOG[b]) % 255];
  }

  function rsGeneratorPoly(degree) {
    var poly = [1];
    for (var d = 0; d < degree; d++) {
      var next = new Array(poly.length + 1).fill(0);
      for (var i = 0; i < poly.length; i++) {
        next[i] ^= poly[i];
        next[i + 1] ^= gmul(poly[i], EXP[d]);
      }
      poly = next;
    }
    return poly; // length degree + 1, leading coefficient 1
  }

  function rsRemainder(data, ecLen) {
    var gen = rsGeneratorPoly(ecLen);
    var res = new Array(ecLen).fill(0);
    for (var i = 0; i < data.length; i++) {
      var factor = data[i] ^ res[0];
      res.shift();
      res.push(0);
      for (var j = 0; j < ecLen; j++) {
        res[j] ^= gmul(gen[j + 1], factor);
      }
    }
    return res;
  }

  // --- Per-version tables (versions 1–6) --------------------------------
  // [ecPerBlock, blocksG1, dataPerBlockG1, blocksG2, dataPerBlockG2]
  var ECC = {
    L: { 1: [7, 1, 19, 0, 0], 2: [10, 1, 34, 0, 0], 3: [15, 1, 55, 0, 0],
         4: [20, 1, 80, 0, 0], 5: [26, 1, 108, 0, 0], 6: [18, 2, 68, 0, 0] },
    M: { 1: [10, 1, 16, 0, 0], 2: [16, 1, 28, 0, 0], 3: [26, 1, 44, 0, 0],
         4: [18, 2, 32, 0, 0], 5: [24, 2, 43, 0, 0], 6: [16, 4, 27, 0, 0] }
  };
  var ALIGN = { 1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30], 6: [6, 34] };
  var REMAINDER_BITS = { 1: 0, 2: 7, 3: 7, 4: 7, 5: 7, 6: 7 };
  var ECL_BITS = { L: 1, M: 0, Q: 3, H: 2 };

  function dataCodewords(ver, ecl) {
    var t = ECC[ecl][ver];
    return t[1] * t[2] + t[3] * t[4];
  }

  function getBit(x, i) { return (x >>> i) & 1; }

  // --- Encode text -> interleaved codewords for a chosen version -------
  function encode(text) {
    var bytes = utf8(text);
    var pick = null;
    ['M', 'L'].forEach(function (ecl) {
      if (pick) return;
      for (var ver = 1; ver <= 6; ver++) {
        var cap = dataCodewords(ver, ecl) * 8;
        var need = 4 + 8 /* count bits, v<10 */ + bytes.length * 8;
        if (need <= cap) { pick = { ver: ver, ecl: ecl }; break; }
      }
    });
    if (!pick) throw new Error('QR: text too long for a version-6 symbol');

    var ver = pick.ver, ecl = pick.ecl;
    var totalData = dataCodewords(ver, ecl);

    // Bit stream: mode (0100) + 8-bit count + data + terminator + pad.
    var bits = [];
    function put(val, len) { for (var i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1); }
    put(0x4, 4);
    put(bytes.length, 8);
    for (var i = 0; i < bytes.length; i++) put(bytes[i], 8);

    var capBits = totalData * 8;
    for (var t = 0; t < 4 && bits.length < capBits; t++) bits.push(0);
    while (bits.length % 8 !== 0) bits.push(0);

    var dataBytes = [];
    for (var b = 0; b < bits.length; b += 8) {
      var v = 0;
      for (var k = 0; k < 8; k++) v = (v << 1) | bits[b + k];
      dataBytes.push(v);
    }
    for (var pad = 0xec; dataBytes.length < totalData; pad ^= 0xec ^ 0x11) {
      dataBytes.push(pad);
    }

    // Split into blocks, compute EC, then interleave.
    var tbl = ECC[ecl][ver];
    var ecLen = tbl[0];
    var blocks = [];
    var pos = 0;
    for (var g = 0; g < 2; g++) {
      var count = g === 0 ? tbl[1] : tbl[3];
      var size = g === 0 ? tbl[2] : tbl[4];
      for (var n = 0; n < count; n++) {
        var d = dataBytes.slice(pos, pos + size);
        pos += size;
        blocks.push({ data: d, ec: rsRemainder(d, ecLen) });
      }
    }

    var out = [];
    var maxData = Math.max.apply(null, blocks.map(function (bl) { return bl.data.length; }));
    for (var c = 0; c < maxData; c++) {
      for (var bi = 0; bi < blocks.length; bi++) {
        if (c < blocks[bi].data.length) out.push(blocks[bi].data[c]);
      }
    }
    for (var e = 0; e < ecLen; e++) {
      for (var bj = 0; bj < blocks.length; bj++) out.push(blocks[bj].ec[e]);
    }

    return { codewords: out, ver: ver, ecl: ecl };
  }

  function utf8(str) {
    if (typeof TextEncoder !== 'undefined') return Array.from(new TextEncoder().encode(str));
    var out = [];
    for (var i = 0; i < str.length; i++) {
      var c = str.charCodeAt(i);
      if (c < 0x80) out.push(c);
      else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f));
      else out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
    }
    return out;
  }

  // --- Build the module matrix ---------------------------------------
  function build(text) {
    var enc = encode(text);
    var ver = enc.ver, ecl = enc.ecl;
    var size = ver * 4 + 17;

    var mod = [];
    var fn = [];
    for (var r = 0; r < size; r++) {
      mod.push(new Array(size).fill(0));
      fn.push(new Array(size).fill(false));
    }
    function set(row, col, dark) { mod[row][col] = dark ? 1 : 0; fn[row][col] = true; }

    // Finder patterns + separators (drawn as dist 0..4 around a centre).
    [[3, 3], [3, size - 4], [size - 4, 3]].forEach(function (c) {
      for (var dy = -4; dy <= 4; dy++) {
        for (var dx = -4; dx <= 4; dx++) {
          var yy = c[0] + dy, xx = c[1] + dx;
          if (yy < 0 || yy >= size || xx < 0 || xx >= size) continue;
          var dist = Math.max(Math.abs(dx), Math.abs(dy));
          set(yy, xx, dist !== 2 && dist !== 4);
        }
      }
    });

    // Timing patterns.
    for (var i = 0; i < size; i++) {
      if (!fn[6][i]) set(6, i, i % 2 === 0);
      if (!fn[i][6]) set(i, 6, i % 2 === 0);
    }

    // Alignment pattern(s) — one, for versions 2–6.
    var ac = ALIGN[ver];
    for (var a = 0; a < ac.length; a++) {
      for (var bb = 0; bb < ac.length; bb++) {
        var ay = ac[a], ax = ac[bb];
        if (fn[ay][ax]) continue; // overlaps a finder
        for (var yy2 = -2; yy2 <= 2; yy2++) {
          for (var xx2 = -2; xx2 <= 2; xx2++) {
            set(ay + yy2, ax + xx2, Math.max(Math.abs(xx2), Math.abs(yy2)) !== 1);
          }
        }
      }
    }

    // Dark module + reserve the format-info areas.
    set(size - 8, 8, true);
    for (var f = 0; f < 9; f++) {
      if (!fn[8][f]) set(8, f, false);
      if (!fn[f][8]) set(f, 8, false);
    }
    for (var g2 = 0; g2 < 8; g2++) {
      set(8, size - 1 - g2, false);
      set(size - 1 - g2, 8, false);
    }

    // Zig-zag data placement.
    var cw = enc.codewords;
    var bitLen = cw.length * 8 + REMAINDER_BITS[ver];
    var bit = 0;
    function nextBit() {
      if (bit >= cw.length * 8) { bit++; return 0; }
      var v = getBit(cw[bit >>> 3], 7 - (bit & 7));
      bit++;
      return v;
    }
    for (var right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (var vert = 0; vert < size; vert++) {
        for (var j = 0; j < 2; j++) {
          var col = right - j;
          var upward = ((right + 1) & 2) === 0;
          var row = upward ? size - 1 - vert : vert;
          if (!fn[row][col] && bit < bitLen) mod[row][col] = nextBit();
        }
      }
    }

    // Try all 8 masks, keep the lowest-penalty one.
    var best = null, bestScore = Infinity;
    for (var m = 0; m < 8; m++) {
      applyMask(mod, fn, m);
      drawFormat(mod, ecl, m, size);
      var s = penalty(mod, size);
      if (s < bestScore) { bestScore = s; best = m; }
      applyMask(mod, fn, m); // XOR again to undo
    }
    applyMask(mod, fn, best);
    drawFormat(mod, ecl, best, size);

    return mod.map(function (rowArr) { return rowArr.map(function (v) { return v === 1; }); });
  }

  function maskFn(m, row, col) {
    switch (m) {
      case 0: return (row + col) % 2 === 0;
      case 1: return row % 2 === 0;
      case 2: return col % 3 === 0;
      case 3: return (row + col) % 3 === 0;
      case 4: return (Math.floor(row / 2) + Math.floor(col / 3)) % 2 === 0;
      case 5: return ((row * col) % 2) + ((row * col) % 3) === 0;
      case 6: return (((row * col) % 2) + ((row * col) % 3)) % 2 === 0;
      case 7: return (((row + col) % 2) + ((row * col) % 3)) % 2 === 0;
    }
    return false;
  }

  function applyMask(mod, fn, m) {
    for (var row = 0; row < mod.length; row++) {
      for (var col = 0; col < mod.length; col++) {
        if (!fn[row][col] && maskFn(m, row, col)) mod[row][col] ^= 1;
      }
    }
  }

  function drawFormat(mod, ecl, mask, size) {
    var data = (ECL_BITS[ecl] << 3) | mask;
    var rem = data;
    for (var i = 0; i < 10; i++) rem = (rem << 1) ^ (((rem >>> 9) & 1) * 0x537);
    var bits = ((data << 10) | rem) ^ 0x5412; // 15 bits, bit 14 = MSB

    // First copy: down the left edge of the top-left finder (col 8), then
    // back along its bottom edge (row 8). Bit i (LSB first) as per the spec.
    for (var a = 0; a <= 5; a++) mod[a][8] = getBit(bits, a);
    mod[7][8] = getBit(bits, 6);
    mod[8][8] = getBit(bits, 7);
    mod[8][7] = getBit(bits, 8);
    for (var b = 9; b < 15; b++) mod[8][14 - b] = getBit(bits, b);

    // Second copy: along row 8 under the top-right finder, then up col 8
    // beside the bottom-left finder.
    for (var c = 0; c < 8; c++) mod[8][size - 1 - c] = getBit(bits, c);
    for (var d = 8; d < 15; d++) mod[size - 15 + d][8] = getBit(bits, d);
    mod[size - 8][8] = 1; // dark module
  }

  // --- Penalty scoring (N1=3, N2=3, N3=40, N4=10) --------------------
  function penalty(mod, size) {
    var score = 0;

    // Rule 1: runs of 5+ identical modules in a row or column.
    for (var row = 0; row < size; row++) {
      var runC = 1, runR = 1;
      for (var col = 1; col < size; col++) {
        if (mod[row][col] === mod[row][col - 1]) { runC++; if (runC === 5) score += 3; else if (runC > 5) score++; }
        else runC = 1;
        if (mod[col][row] === mod[col - 1][row]) { runR++; if (runR === 5) score += 3; else if (runR > 5) score++; }
        else runR = 1;
      }
    }

    // Rule 2: 2x2 blocks of one colour.
    for (var r2 = 0; r2 < size - 1; r2++) {
      for (var c2 = 0; c2 < size - 1; c2++) {
        var v = mod[r2][c2];
        if (v === mod[r2][c2 + 1] && v === mod[r2 + 1][c2] && v === mod[r2 + 1][c2 + 1]) score += 3;
      }
    }

    // Rule 3: 1:1:3:1:1 finder-like pattern with 4 light modules beside it.
    var p1 = [1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0];
    var p2 = [0, 0, 0, 0, 1, 0, 1, 1, 1, 0, 1];
    for (var r3 = 0; r3 < size; r3++) {
      for (var c3 = 0; c3 <= size - 11; c3++) {
        var okH1 = true, okH2 = true, okV1 = true, okV2 = true;
        for (var t = 0; t < 11; t++) {
          if (mod[r3][c3 + t] !== p1[t]) okH1 = false;
          if (mod[r3][c3 + t] !== p2[t]) okH2 = false;
          if (mod[c3 + t][r3] !== p1[t]) okV1 = false;
          if (mod[c3 + t][r3] !== p2[t]) okV2 = false;
        }
        if (okH1) score += 40;
        if (okH2) score += 40;
        if (okV1) score += 40;
        if (okV2) score += 40;
      }
    }

    // Rule 4: overall dark-module balance.
    var dark = 0;
    for (var r4 = 0; r4 < size; r4++) for (var c4 = 0; c4 < size; c4++) dark += mod[r4][c4];
    var pct = (dark * 100) / (size * size);
    score += Math.floor(Math.abs(pct - 50) / 5) * 10;

    return score;
  }

  // --- Public API ---------------------------------------------------
  function svg(text, opts) {
    opts = opts || {};
    var margin = opts.margin == null ? 4 : opts.margin;
    var m = build(text);
    var n = m.length;
    var dim = n + margin * 2;
    var path = '';
    for (var row = 0; row < n; row++) {
      for (var col = 0; col < n; col++) {
        if (m[row][col]) path += 'M' + (col + margin) + ' ' + (row + margin) + 'h1v1h-1z';
      }
    }
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + dim + ' ' + dim +
      '" shape-rendering="crispEdges" role="img" aria-label="QR code">' +
      '<rect width="' + dim + '" height="' + dim + '" fill="#ffffff"/>' +
      '<path d="' + path + '" fill="#000000"/></svg>';
  }

  global.QR = { matrix: build, svg: svg };
})(typeof window !== 'undefined' ? window : this);
