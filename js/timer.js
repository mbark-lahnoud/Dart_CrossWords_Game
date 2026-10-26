/* Chronomètre basé sur des timestamps (jamais sur un simple compteur décrémenté).
   Toutes les fonctions reçoivent « now » (ms) : l'horloge est donc injectable dans les tests. */
(function (g) {
  "use strict";
  var DCP = g.DCP = g.DCP || {};
  var Timer = DCP.Timer = {};
  var DURATION = function () { return DCP.Engine.CONFIG.DURATION_MS; };

  /* Temps réellement joué (hors pénalités), sans plafond. */
  Timer.playedMs = function (game, now) {
    var e = game.elapsedMs || 0;
    if (game.status === "playing" && game.runStart !== null && game.runStart !== undefined) e += Math.max(0, now - game.runStart);
    return e;
  };
  /* Temps consommé = temps joué + pénalités des aides (appliquées immédiatement), plafonné à la durée. */
  Timer.elapsedMs = function (game, now) {
    return Math.min(Timer.playedMs(game, now) + (game.penaltyMs || 0), DURATION());
  };
  Timer.remainingMs = function (game, now) { return Math.max(0, DURATION() - Timer.elapsedMs(game, now)); };
  Timer.isExpired = function (game, now) { return game.status === "playing" && Timer.remainingMs(game, now) <= 0; };

  Timer.pause = function (game, now) {
    if (game.status !== "playing") return false;
    game.elapsedMs = Timer.playedMs(game, now);
    game.runStart = null;
    game.status = "paused";
    return true;
  };
  Timer.resume = function (game, now) {
    if (game.status !== "paused") return false;
    game.runStart = now;
    game.status = "playing";
    return true;
  };

  /* Retire des secondes au chrono immédiatement ; retourne true si le temps est épuisé. */
  Timer.applyPenalty = function (game, seconds, now) {
    game.penaltyMs = (game.penaltyMs || 0) + Math.max(0, seconds) * 1000;
    return Timer.remainingMs(game, now) <= 0;
  };

  /* Format MM:SS, arrondi à la seconde supérieure pour ne pas afficher 00:00 avant la fin. */
  Timer.format = function (ms) {
    var s = Math.max(0, Math.ceil(ms / 1000)), m = Math.floor(s / 60);
    return (m < 10 ? "0" : "") + m + ":" + (s % 60 < 10 ? "0" : "") + (s % 60);
  };

  /* Ticker : appelle onTick(restant) régulièrement et onExpire() une seule fois. */
  Timer.createTicker = function (opts) {
    var id = null, fired = false;
    var getNow = opts.getNow || Date.now, every = opts.intervalMs || 200;
    function tick() {
      var game = opts.getGame();
      if (!game) return;
      if (game.status === "playing" && Timer.isExpired(game, getNow())) {
        if (!fired) { fired = true; opts.onExpire(); }
        return;
      }
      opts.onTick(Timer.remainingMs(game, getNow()), game);
    }
    return {
      tick: tick,
      start: function () { if (id === null) { fired = false; id = setInterval(tick, every); } },
      stop: function () { if (id !== null) { clearInterval(id); id = null; } },
      reset: function () { fired = false; }
    };
  };
})(typeof window !== "undefined" ? window : globalThis);
