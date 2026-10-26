/* Les deux aides : « Révéler une lettre » (5 max) et « Révéler la moitié » (2 max).
   Tous les coûts viennent de DCP.Engine.CONFIG.AIDS ; les compteurs sont indépendants et ne sont
   réinitialisés que par une nouvelle partie (Engine.newGame). */
(function (g) {
  "use strict";
  var DCP = g.DCP = g.DCP || {};
  var Hints = DCP.Hints = {};
  var E = function () { return DCP.Engine; };
  var cfg = function (kind) { return E().CONFIG.AIDS[kind]; };

  Hints.used = function (game, kind) { return game.hints[kind] || 0; };
  Hints.left = function (game, kind) { return Math.max(0, cfg(kind).max - Hints.used(game, kind)); };
  Hints.exhausted = function (game, kind) { return Hints.left(game, kind) <= 0; };
  Hints.lettersLeft = function (game) { return Hints.left(game, "letter"); };
  /* Coût de la PROCHAINE utilisation : { points, seconds } ou null si épuisée. */
  Hints.nextCost = function (game, kind) {
    if (Hints.exhausted(game, kind)) return null;
    var c = cfg(kind).costs[Hints.used(game, kind)];
    return { points: c[0], seconds: c[1] };
  };

  function pick(list, rng) {
    var i = Math.floor((rng || Math.random)() * list.length);
    return list.splice(Math.min(i, list.length - 1), 1)[0];
  }

  /* Cases de l'entrée dont la lettre n'est pas encore la bonne (candidates à la révélation). */
  Hints.unknownCells = function (game, grid, entry) {
    return entry.cells.filter(function (p) {
      return E().getLetter(game, p.r, p.c) !== grid.cells[p.r][p.c].letter;
    });
  };

  function fail(reason) { return { ok: false, reason: reason, cells: [], solved: [], cost: null, timeUp: false }; }

  function precheck(game, grid, kind, entryId) {
    if (game.status !== "playing") return "inactive";
    if (Hints.exhausted(game, kind)) return "exhausted";
    var entry = entryId ? grid.byId[entryId] : null;
    if (!entry) return "no-selection";
    if (game.solved[entry.id]) return "solved";
    return null;
  }

  /* Applique une utilisation VALIDE : verrouille les lettres, compte l'utilisation, retire points et secondes,
     supprime le bonus de première tentative du mot concerné. */
  function apply(game, grid, kind, entry, cells, now) {
    var cost = Hints.nextCost(game, kind);
    game.noBonus[entry.id] = true;                       // avant l'évaluation : le mot perd son bonus
    cells.forEach(function (p) {
      var k = E().key(p.r, p.c);
      game.letters[k] = grid.cells[p.r][p.c].letter;
      game.revealed[k] = true;
    });
    game.hints[kind] = Hints.used(game, kind) + 1;
    game.events.push({ type: "aid", kind: kind, use: game.hints[kind], id: entry.id, points: cost.points, seconds: cost.seconds });
    var solved = [];
    cells.forEach(function (p) {
      E().evaluateAround(game, grid, p.r, p.c, false).correct.forEach(function (id) { if (solved.indexOf(id) < 0) solved.push(id); });
    });
    var timeUp = false;
    if (cost.seconds > 0) timeUp = DCP.Timer.applyPenalty(game, cost.seconds, now === undefined ? Date.now() : now);
    E().recomputePoints(game);
    return { ok: true, reason: "done", cells: cells, solved: solved, cost: cost, timeUp: timeUp };
  }

  /* Aide 1 : une lettre inconnue tirée au hasard. Utilisations 1 à 4 gratuites ; la 5e coûte 2 points et 3 s. */
  Hints.revealLetter = function (game, grid, entryId, rng, now) {
    var bad = precheck(game, grid, "letter", entryId);
    if (bad) return fail(bad);
    var entry = grid.byId[entryId], pool = Hints.unknownCells(game, grid, entry);
    if (!pool.length) return fail("nothing");           // rien à révéler : aucune utilisation consommée
    return apply(game, grid, "letter", entry, [pick(pool, rng)], now);
  };

  /* Aide 2 : environ la moitié des lettres encore inconnues (arrondi inférieur, au moins une).
     Chaque utilisation coûte 3 points et 15 s. */
  Hints.revealHalf = function (game, grid, entryId, rng, now) {
    var bad = precheck(game, grid, "half", entryId);
    if (bad) return fail(bad);
    var entry = grid.byId[entryId], pool = Hints.unknownCells(game, grid, entry);
    if (!pool.length) return fail("nothing");
    var n = Math.max(1, Math.floor(pool.length / 2)), chosen = [];
    for (var i = 0; i < n; i++) chosen.push(pick(pool, rng));
    return apply(game, grid, "half", entry, chosen, now);
  };
})(typeof window !== "undefined" ? window : globalThis);
