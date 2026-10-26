/* Sauvegarde locale (localStorage) versionnée, avec repli en mémoire si le stockage est indisponible.
   L'espace de noms peut être changé avec ?ns=nom dans l'URL (utilisé par les tests pour ne pas toucher aux vraies données). */
(function (g) {
  "use strict";
  var DCP = g.DCP = g.DCP || {};
  var Storage = DCP.Storage = {};
  var memory = {}, backend = null, warned = false, ns = "dcp";
  var VERSION = 2;

  function detectBackend() {
    try {
      var ls = g.localStorage;
      var probe = "__dcp_probe__";
      ls.setItem(probe, "1"); ls.removeItem(probe);
      return ls;
    } catch (e) { return null; }
  }
  Storage.setBackend = function (b) { backend = b; Storage.degraded = !b; };       // tests
  Storage.setNamespace = function (n) { ns = n || "dcp"; };
  Storage.onWarning = null;
  Storage.degraded = false;
  Storage.init = function () {
    try {
      var m = /[?&]ns=([A-Za-z0-9_-]+)/.exec((g.location && g.location.search) || "");
      if (m) ns = "dcp-" + m[1];
    } catch (e) { /* ignoré */ }
    backend = detectBackend();
    Storage.degraded = !backend;
    if (Storage.degraded) warn();
  };
  function warn() {
    if (warned) return; warned = true;
    if (typeof Storage.onWarning === "function") Storage.onWarning(
      "Le stockage local du navigateur est indisponible : la partie continue, mais elle ne sera pas conservée après fermeture ou actualisation.");
  }
  function k(name) { return ns + "." + name; }
  function rawGet(name) {
    if (backend) { try { var v = backend.getItem(k(name)); if (v !== null) return v; } catch (e) { warn(); } }
    return Object.prototype.hasOwnProperty.call(memory, k(name)) ? memory[k(name)] : null;
  }
  function rawSet(name, value) {
    memory[k(name)] = value;
    if (!backend) { warn(); return false; }
    try { backend.setItem(k(name), value); return true; } catch (e) { Storage.degraded = true; warn(); return false; }
  }
  function rawRemove(name) {
    delete memory[k(name)];
    if (backend) { try { backend.removeItem(k(name)); } catch (e) { warn(); } }
  }
  function readJSON(name) {
    var raw = rawGet(name);
    if (raw === null) return { value: null };
    try { return { value: JSON.parse(raw) }; } catch (e) { return { error: "corrupt", raw: raw }; }
  }

  /* Partie en cours */
  Storage.saveGame = function (game) { return rawSet("game", JSON.stringify(game)); };
  Storage.loadGame = function () {
    var r = readJSON("game");
    if (r.error) { rawSet("game.corrupt", r.raw); rawRemove("game"); return { error: "corrupt" }; }
    var v = r.value;
    if (v === null) return { game: null };
    var ok = v && typeof v === "object" && v.version === VERSION && typeof v.player === "string" &&
      /^(playing|paused|finished)$/.test(v.status) && v.letters && v.solved && v.hints && Array.isArray(v.events);
    if (!ok) { rawSet("game.corrupt", JSON.stringify(v)); rawRemove("game"); return { error: "version" }; }
    return { game: v };
  };
  Storage.clearGame = function () { rawRemove("game"); };

  /* Meilleurs scores locaux (par joueur) */
  Storage.playerKey = function (name) {
    return DCP.Engine.normalize(name).toLowerCase() || String(name).trim().toLowerCase();
  };
  Storage.loadBest = function () {
    var r = readJSON("best");
    return (r.value && typeof r.value === "object" && !Array.isArray(r.value)) ? r.value : {};
  };
  Storage.saveBest = function (map) { return rawSet("best", JSON.stringify(map)); };

  /* Réglages */
  Storage.loadSettings = function () {
    var r = readJSON("settings");
    var v = r.value && typeof r.value === "object" ? r.value : {};
    return { sound: v.sound !== false };
  };
  Storage.saveSettings = function (s) { return rawSet("settings", JSON.stringify(s)); };
})(typeof window !== "undefined" ? window : globalThis);
