/* Sons légers synthétisés (Web Audio). Aucun fichier audio, aucune musique, aucun son automatique. */
(function (g) {
  "use strict";
  var DCP = g.DCP = g.DCP || {};
  var Sound = DCP.Sound = { enabled: true };
  var ctx = null;
  function getCtx() {
    if (ctx) return ctx;
    var AC = g.AudioContext || g.webkitAudioContext;
    if (!AC) return null;
    try { ctx = new AC(); } catch (e) { ctx = null; }
    return ctx;
  }
  function tone(freq, start, dur, type, vol) {
    var c = getCtx(); if (!c) return;
    var o = c.createOscillator(), gn = c.createGain(), t0 = c.currentTime + start;
    o.type = type || "sine"; o.frequency.value = freq;
    gn.gain.setValueAtTime(0.0001, t0);
    gn.gain.exponentialRampToValueAtTime(vol || 0.07, t0 + 0.02);
    gn.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(gn); gn.connect(c.destination);
    o.start(t0); o.stop(t0 + dur + 0.05);
  }
  var patterns = {
    ok: function () { tone(660, 0, 0.12); tone(880, 0.1, 0.18); },
    bad: function () { tone(220, 0, 0.18, "triangle", 0.06); tone(180, 0.14, 0.22, "triangle", 0.06); },
    end: function () { tone(523, 0, 0.18); tone(659, 0.16, 0.18); tone(784, 0.32, 0.3); }
  };
  Sound.play = function (name) {
    if (!Sound.enabled || !patterns[name]) return false;
    try { var c = getCtx(); if (c && c.state === "suspended") c.resume(); patterns[name](); return true; } catch (e) { return false; }
  };
})(typeof window !== "undefined" ? window : globalThis);
