/* Tests de la logique (moteur, aides, score, chrono, sauvegarde, résultats). Sans DOM. */
(function (g) {
  "use strict";
  var DCP = g.DCP, T = g.DCPTest, E = DCP.Engine, Tm = DCP.Timer, H = DCP.Hints, S = DCP.Storage, R = DCP.Results;
  var test = T.test, assert = T.assert, eq = T.eq;
  var grid = E.buildGrid(DCP.PUZZLE);
  var t0 = 1000;

  function G(name) { return E.newGame(name || "Test", t0); }
  function byAnswer(a) { return grid.entries.filter(function (e) { return e.answer === a; })[0]; }
  function typeWord(game, e, word) {
    (word || e.answer).split("").forEach(function (ch, i) { E.setLetterAt(game, grid, e.cells[i].r, e.cells[i].c, ch, true); });
  }
  function fakeStore() {
    var d = {};
    return { getItem: function (k) { return k in d ? d[k] : null; }, setItem: function (k, v) { d[k] = String(v); }, removeItem: function (k) { delete d[k]; } };
  }
  function solveAll(game) { grid.entries.forEach(function (e) { typeWord(game, e); }); }
  function wrongOf(e) { return (e.answer[0] === "Q" ? "W" : "Q") + e.answer.slice(1); }
  function aidEvents(game) { return game.events.filter(function (x) { return x.type === "aid"; }); }
  var UNM = byAnswer("UNMODIFIABLE"), FOR = byAnswer("FOR"), SPLIT = byAnswer("SPLIT"), MAPW = byAnswer("MAP");

  /* ---- Données et grille ---- */
  test("1. Exactement 25 questions", function () { eq(DCP.PUZZLE.entries.length, 25); });
  test("2. 15 faciles et 10 moyennes (aucune difficile)", function () {
    var c = { easy: 0, medium: 0, other: 0 };
    DCP.PUZZLE.entries.forEach(function (e) { if (e.difficulty in c) c[e.difficulty]++; else c.other++; });
    eq(c, { easy: 15, medium: 10, other: 0 });
  });
  test("3. Exactement 10 questions sur les collections (6 faciles + 4 moyennes), 15 sur les fondamentaux", function () {
    var c = DCP.PUZZLE.entries.filter(function (e) { return e.topic === "collections"; });
    eq(c.length, 10);
    eq(c.filter(function (e) { return e.difficulty === "easy"; }).length, 6);
    eq(c.filter(function (e) { return e.difficulty === "medium"; }).length, 4);
    eq(DCP.PUZZLE.entries.filter(function (e) { return e.topic === "fondamentaux"; }).length, 15);
  });
  test("4. Définitions et réponses cohérentes, grille vérifiée (croisements, numéros, séquences)", function () {
    var v = E.verifyPuzzle(DCP.PUZZLE); assert(v.ok, v.errors.join("; "));
    DCP.PUZZLE.entries.forEach(function (e) {
      assert(/^[A-Z]+$/.test(e.answer) && e.clue.length >= 15, e.id);
      assert(!new RegExp("\\b" + e.answer + "\\b", "i").test(e.clue), e.id + " révèle sa réponse");
    });
    ["id", "answer", "clue"].forEach(function (k) { var seen = {}; DCP.PUZZLE.entries.forEach(function (e) { assert(!seen[e[k]], "doublon " + e[k]); seen[e[k]] = 1; }); });
  });
  test("5. Le contrôle détecte collisions, entrées orphelines et mauvais thèmes", function () {
    var bad = JSON.parse(JSON.stringify(DCP.PUZZLE)), cx = null;
    grid.entries.forEach(function (e) { e.cells.forEach(function (p, i) { var c = grid.cells[p.r][p.c]; if (!cx && c.across && c.down && e.direction === "H") cx = { id: e.id, i: i }; }); });
    bad.entries.forEach(function (e) { if (e.id === cx.id) e.answer = e.answer.slice(0, cx.i) + "Z" + e.answer.slice(cx.i + 1); });
    assert(!E.verifyPuzzle(bad).ok);
    var b2 = JSON.parse(JSON.stringify(DCP.PUZZLE)); b2.entries.pop(); assert(!E.verifyPuzzle(b2).ok);
    var b3 = JSON.parse(JSON.stringify(DCP.PUZZLE)); b3.entries[0].topic = b3.entries[0].topic === "collections" ? "fondamentaux" : "collections"; assert(!E.verifyPuzzle(b3).ok);
  });
  test("6. Numérotation classique et croisements cohérents", function () {
    var n = 0, expected = {}, crossings = 0;
    for (var r = 0; r < grid.rows; r++) for (var c = 0; c < grid.cols; c++) {
      var cell = grid.cells[r][c]; if (!cell.letter) continue;
      assert(!cell.conflict); if (cell.across && cell.down) crossings++;
      var a = (c === 0 || !grid.cells[r][c - 1].letter) && c + 1 < grid.cols && grid.cells[r][c + 1].letter;
      var v = (r === 0 || !grid.cells[r - 1][c].letter) && r + 1 < grid.rows && grid.cells[r + 1][c].letter;
      if (a || v) expected[r + "," + c] = ++n;
    }
    DCP.PUZZLE.entries.forEach(function (e) { eq(e.number, expected[e.row + "," + e.col], e.id); });
    assert(crossings >= 24);
  });
  test("7. Normalisation des réponses", function () {
    eq(E.normalize(" fu-Tu re_ "), "FUTURE"); eq(E.normalize("Éa.s"), "EAS"); eq(E.normalize(null), "");
  });

  /* ---- Chronomètre ---- */
  test("8. Chronomètre initial : exactement 300 secondes", function () {
    eq(E.CONFIG.DURATION_MS, 300000); var g1 = G();
    eq(Tm.remainingMs(g1, t0), 300000); eq(Tm.format(Tm.remainingMs(g1, t0)), "05:00");
    eq(Tm.format(Tm.remainingMs(g1, t0 + 30000)), "04:30");
  });
  test("9. Pause réelle, reprise, expiration à 300 s", function () {
    var g1 = G();
    Tm.pause(g1, t0 + 30000); eq(Tm.elapsedMs(g1, t0 + 900000), 30000); Tm.resume(g1, t0 + 900000); eq(Tm.elapsedMs(g1, t0 + 910000), 40000);
    var g2 = G(); assert(!Tm.isExpired(g2, t0 + 299999)); assert(Tm.isExpired(g2, t0 + 300000));
    var n = 0, tk = Tm.createTicker({ getGame: function () { return g2; }, getNow: function () { return t0 + 400000; }, onTick: function () {}, onExpire: function () { n++; } });
    tk.tick(); tk.tick(); eq(n, 1);
    assert(R.finishGame(g2, grid, "timeout", t0 + 400000)); eq(g2.result.elapsedMs, 300000); eq(g2.result.score.timeBonus, 0); assert(!g2.result.success);
  });

  /* ---- Score ---- */
  test("10. Points par difficulté + bonus de première tentative de +10", function () {
    var g1 = G(); typeWord(g1, FOR); eq(g1.points, 20, "facile 10 + 10");
    assert(g1.events[0].firstTry);
    var g2 = G(); typeWord(g2, SPLIT); eq(g2.points, 25, "moyenne 15 + 10");
  });
  test("11. Tentative incorrecte : −3, plus −5 de validation, une seule fois", function () {
    var g1 = G(); typeWord(g1, FOR); eq(g1.points, 20);
    typeWord(g1, UNM, wrongOf(UNM)); eq(g1.errors, 1); eq(g1.points, 12, "−3 et −5");
    typeWord(g1, UNM, wrongOf(UNM)); eq(g1.errors, 1, "même tentative non recomptée"); eq(g1.points, 12);
    var sc = E.computeScore(g1.events, 0, false); eq([sc.errorPenalty, sc.validationPenalty, sc.wrong], [3, 5, 1]);
    typeWord(g1, UNM, "W" + UNM.answer.slice(1)); eq(g1.errors, 2); eq(g1.points, 4);
  });
  test("12. Bonus de première tentative : perdu après une erreur, perdu après une aide, une seule fois", function () {
    var g1 = G(); typeWord(g1, SPLIT, wrongOf(SPLIT)); typeWord(g1, SPLIT);
    var ev = g1.events.filter(function (x) { return x.type === "correct"; })[0]; assert(ev && !ev.firstTry, "erreur puis réussite");
    var g2 = G(); H.revealLetter(g2, grid, FOR.id, function () { return 0; }, t0); typeWord(g2, FOR);
    assert(!g2.events.filter(function (x) { return x.type === "correct"; })[0].firstTry, "aide utilisée"); eq(g2.points, 10);
    var g3 = G(); typeWord(g3, FOR); typeWord(g3, FOR); eq(g3.events.filter(function (x) { return x.type === "correct"; }).length, 1);
    eq(E.computeScore(g3.events, 0, false).firstTryBonus, 10);
  });
  test("13. Aucun score négatif", function () {
    var g1 = G(); typeWord(g1, UNM, wrongOf(UNM)); eq(g1.points, 0);
    eq(E.computeScore([{ type: "wrong" }, { type: "wrong" }, { type: "aid", points: 3, seconds: 15 }], 0, false).total, 0);
    var g2 = G(); for (var i = 0; i < 2; i++) H.revealHalf(g2, grid, UNM.id, null, t0); assert(g2.points >= 0); eq(g2.points, 0);
  });
  test("14. Bonus de temps : 2 points par tranche complète de 10 s (65 s → 12)", function () {
    eq(E.timeBonus(65000, true), 12); eq(E.timeBonus(9999, true), 0); eq(E.timeBonus(10000, true), 2); eq(E.timeBonus(300000, true), 60);
    eq(E.timeBonus(65000, false), 0, "jamais sans victoire");
  });
  test("15. Victoire : chrono arrêté, bonus de temps attribué une seule fois", function () {
    var g1 = G(); solveAll(g1); assert(E.allSolved(g1, grid)); eq(g1.points, 15 * 10 + 10 * 15 + 25 * 10);
    assert(R.finishGame(g1, grid, "success", t0 + 100000));
    var r = g1.result; assert(r.success); eq(r.elapsedMs, 100000); eq(r.score.timeBonus, 40); eq(r.score.total, 550 + 40);
    eq([r.solved, r.easySolved, r.mediumSolved, r.firstTryCorrect, r.wrongAttempts], [25, 15, 10, 25, 0]);
    var snap = JSON.stringify(g1.result); assert(!R.finishGame(g1, grid, "timeout", t0 + 900000)); eq(JSON.stringify(g1.result), snap, "fin unique");
    var g2 = G(); assert(R.finishGame(g2, grid, "success", t0 + 1000)); assert(!g2.result.success, "succès refusé si incomplet");
  });

  /* ---- Aide 1 : lettres ---- */
  test("16. Révéler une lettre : 4 gratuites, la 5e coûte −2 points et −3 s, jamais de 6e", function () {
    var g1 = G(); typeWord(g1, FOR);   // 20 points pour voir la pénalité
    for (var i = 1; i <= 4; i++) {
      var r = H.revealLetter(g1, grid, UNM.id, null, t0); assert(r.ok, "utilisation " + i);
      eq(r.cost, { points: 0, seconds: 0 }); eq(g1.penaltyMs, 0); eq(g1.points, 20);
    }
    var r5 = H.revealLetter(g1, grid, UNM.id, null, t0); assert(r5.ok); eq(r5.cost, { points: 2, seconds: 3 });
    eq(g1.penaltyMs, 3000); eq(g1.points, 18); eq(Tm.remainingMs(g1, t0), 297000);
    var r6 = H.revealLetter(g1, grid, UNM.id, null, t0); assert(!r6.ok); eq(r6.reason, "exhausted");
    eq(g1.hints.letter, 5); eq(g1.penaltyMs, 3000); eq(g1.points, 18); eq(aidEvents(g1).length, 5);
    assert(H.exhausted(g1, "letter")); eq(H.nextCost(g1, "letter"), null);
  });
  test("17. Les lettres révélées sont correctes, uniques, verrouillées et se propagent aux croisements", function () {
    var g1 = G(), seen = {};
    for (var i = 0; i < 5; i++) { var p = H.revealLetter(g1, grid, UNM.id, function () { return 0; }, t0).cells[0]; assert(!seen[p.r + "," + p.c]); seen[p.r + "," + p.c] = 1; eq(E.getLetter(g1, p.r, p.c), grid.cells[p.r][p.c].letter); assert(E.isLocked(g1, grid, p.r, p.c)); assert(!E.setLetterAt(g1, grid, p.r, p.c, "Z").ok); }
    var g2 = G(), done = false;
    UNM.cells.forEach(function (pc, i) {
      var cell = grid.cells[pc.r][pc.c]; if (done || !(cell.across && cell.down)) return;
      var pool = H.unknownCells(g2, grid, UNM), idx = pool.findIndex(function (q) { return q.r === pc.r && q.c === pc.c; });
      H.revealLetter(g2, grid, UNM.id, function () { return (idx + 0.5) / pool.length; }, t0);
      [cell.across, cell.down].forEach(function (id) { var ent = grid.byId[id], k = ent.cells.findIndex(function (q) { return q.r === pc.r && q.c === pc.c; }); eq(E.entryLetters(g2, grid, ent)[k], cell.letter); });
      done = true;
    }); assert(done);
  });
  test("18. Aucune utilisation consommée ni pénalité s'il n'y a rien à révéler ou pas de mot", function () {
    var g1 = G(); typeWord(g1, FOR);
    var r = H.revealLetter(g1, grid, FOR.id, null, t0); assert(!r.ok); eq(r.reason, "solved");
    eq(H.revealLetter(g1, grid, null, null, t0).reason, "no-selection"); eq(H.revealHalf(g1, grid, FOR.id, null, t0).reason, "solved");
    eq([g1.hints.letter, g1.hints.half, g1.penaltyMs, g1.points], [0, 0, 0, 20]);
  });

  /* ---- Aide 2 : moitié ---- */
  test("19. Révéler la moitié : 2 utilisations, chacune −3 points et −15 s, jamais de 3e", function () {
    var g1 = G(); typeWord(g1, FOR); typeWord(g1, SPLIT); eq(g1.points, 45);
    var a = H.revealHalf(g1, grid, UNM.id, null, t0); assert(a.ok); eq(a.cost, { points: 3, seconds: 15 }); eq(g1.points, 42); eq(g1.penaltyMs, 15000);
    var b = H.revealHalf(g1, grid, UNM.id, null, t0); assert(b.ok); eq(g1.points, 39); eq(g1.penaltyMs, 30000); eq(Tm.remainingMs(g1, t0), 270000);
    var c = H.revealHalf(g1, grid, UNM.id, null, t0); assert(!c.ok); eq(c.reason, "exhausted"); eq(g1.hints.half, 2); eq(g1.penaltyMs, 30000);
  });
  test("20. Quantité révélée : moitié des lettres inconnues arrondie à l'inférieur, au moins une", function () {
    var a = G(); eq(H.revealHalf(a, grid, UNM.id, null, t0).cells.length, 6);
    eq(H.revealHalf(a, grid, UNM.id, null, t0).cells.length, 3, "moitié des 6 restantes");
    var b = G(); eq(H.revealHalf(b, grid, SPLIT.id, null, t0).cells.length, 2);
    var c = G(); eq(H.revealHalf(c, grid, MAPW.id, null, t0).cells.length, 1, "3 inconnues → 1");
    var d = G(); E.setLetterAt(d, grid, FOR.cells[0].r, FOR.cells[0].c, "F"); E.setLetterAt(d, grid, FOR.cells[1].r, FOR.cells[1].c, "O");
    var r = H.revealHalf(d, grid, FOR.id, null, t0); eq(r.cells.length, 1, "au moins une"); assert(d.solved[FOR.id]);
    var e1 = G(), r1 = H.revealHalf(e1, grid, UNM.id, function () { return 0; }, t0), e2 = G(), r2 = H.revealHalf(e2, grid, UNM.id, function () { return 0.99; }, t0);
    assert(JSON.stringify(r1.cells) !== JSON.stringify(r2.cells), "tirage aléatoire");
    r1.cells.forEach(function (p) { eq(E.getLetter(e1, p.r, p.c), grid.cells[p.r][p.c].letter); assert(E.isLocked(e1, grid, p.r, p.c)); });
    var f = G(); typeWord(f, UNM, "QQQ" + UNM.answer.slice(3)); var known = H.unknownCells(f, grid, UNM).length;
    eq(known, 3); eq(H.revealHalf(f, grid, UNM.id, null, t0).cells.length, 1, "ne révèle que des lettres inconnues");
  });
  test("21. Pénalité de temps immédiate ; fin immédiate si le chrono atteint zéro", function () {
    var g1 = G(), now = t0 + 280000;           // 20 s restantes
    var a = H.revealHalf(g1, grid, UNM.id, null, now); assert(a.ok && !a.timeUp); eq(Tm.remainingMs(g1, now), 5000);
    var b = H.revealHalf(g1, grid, SPLIT.id, null, now); assert(b.ok && b.timeUp, "zéro atteint"); eq(Tm.remainingMs(g1, now), 0);
    assert(Tm.isExpired(g1, now)); assert(R.finishGame(g1, grid, "timeout", now)); eq(g1.status, "finished"); assert(!g1.result.success);
    var g2 = G(); H.revealHalf(g2, grid, UNM.id, null, t0); Tm.pause(g2, t0 + 5000); eq(Tm.remainingMs(g2, t0 + 99999), 280000, "pénalité conservée en pause");
  });
  test("22. Compteurs indépendants et seulement remis à zéro par une nouvelle partie", function () {
    var g1 = G(); for (var i = 0; i < 5; i++) H.revealLetter(g1, grid, UNM.id, null, t0);
    assert(H.exhausted(g1, "letter") && !H.exhausted(g1, "half")); assert(H.revealHalf(g1, grid, SPLIT.id, null, t0).ok);
    var g2 = G(); H.revealHalf(g2, grid, UNM.id, null, t0); H.revealHalf(g2, grid, SPLIT.id, null, t0);
    assert(H.exhausted(g2, "half") && !H.exhausted(g2, "letter")); assert(H.revealLetter(g2, grid, FOR.id, null, t0).ok);
    E.selectEntry(g2, grid, FOR.id); E.selectEntry(g2, grid, UNM.id); eq(g2.hints, { letter: 1, half: 2 }, "pas de réinitialisation au changement de mot");
    var fresh = G(); eq(fresh.hints, { letter: 0, half: 0 }); eq(fresh.penaltyMs, 0); eq(fresh.points, 0);
  });
  test("23. L'aide « Questionner-moi » n'existe plus", function () {
    assert(!("ask" in H)); eq(Object.keys(E.CONFIG.AIDS), ["letter", "half"]); eq(Object.keys(G().hints), ["letter", "half"]);
  });
  test("24. Pas de double comptage (bonus, pénalités, événements)", function () {
    var g1 = G(); typeWord(g1, FOR); typeWord(g1, FOR); typeWord(g1, UNM, wrongOf(UNM)); typeWord(g1, UNM, wrongOf(UNM)); typeWord(g1, UNM, wrongOf(UNM));
    eq(g1.events.length, 2); eq(g1.errors, 1);
    var sc = E.computeScore(g1.events, 0, false), again = E.computeScore(g1.events, 0, false); eq(sc, again);
    var g2 = G(); typeWord(g2, FOR); R.finishGame(g2, grid, "timeout", t0 + 400000); var best = R.updateBest({}, g2.result, 1).best, b2 = R.updateBest(best, g2.result, 2); assert(!b2.improved, "même résultat : pas de remplacement");
  });

  /* ---- Fin, sauvegarde, meilleurs scores, clavier ---- */
  test("25. Verrouillage après la fin de partie", function () {
    var g1 = G(); R.finishGame(g1, grid, "timeout", t0 + 400000);
    assert(!E.setLetterAt(g1, grid, FOR.cells[0].r, FOR.cells[0].c, "A").ok); assert(!E.applyKey(g1, grid, "A").handled);
    assert(!H.revealLetter(g1, grid, FOR.id, null, t0).ok); assert(!H.revealHalf(g1, grid, FOR.id, null, t0).ok); assert(!Tm.pause(g1, t0 + 5));
  });
  test("26. Sauvegarde et restauration complètes (temps, pénalités, aides, bonus)", function () {
    var store = fakeStore(); S.setBackend(store);
    var g1 = G("Amina"); typeWord(g1, FOR); typeWord(g1, UNM, wrongOf(UNM)); H.revealLetter(g1, grid, SPLIT.id, null, t0); H.revealHalf(g1, grid, UNM.id, null, t0); E.selectEntry(g1, grid, SPLIT.id);
    assert(S.saveGame(g1)); var back = S.loadGame().game; eq(back, JSON.parse(JSON.stringify(g1)));
    eq(back.penaltyMs, 15000); eq(back.hints, { letter: 1, half: 1 }); assert(back.noBonus[SPLIT.id]);
    eq(Tm.remainingMs(back, t0 + 45000), 300000 - 45000 - 15000, "temps recalculé depuis les timestamps + pénalité");
    assert(Tm.isExpired(back, t0 + 286000), "délai dépassé fenêtre fermée : fin au retour");
    assert(!H.revealHalf(back, grid, UNM.id, null, t0).ok || H.used(back, "half") === 2);
  });
  test("27. Reprise, redémarrage, sauvegarde ancienne/corrompue, stockage défaillant", function () {
    var store = fakeStore(); S.setBackend(store);
    S.saveGame(G("A")); eq(S.loadGame().game.player, "A"); S.clearGame(); eq(S.loadGame().game, null);
    store.setItem("dcp.game", "{pas du json"); eq(S.loadGame().error, "corrupt");
    store.setItem("dcp.game", JSON.stringify({ version: 1, player: "x", status: "playing", letters: {}, solved: {}, hints: {}, events: [] })); eq(S.loadGame().error, "version");
    var warned = 0; S.onWarning = function () { warned++; };
    S.setBackend({ getItem: function () { throw new Error("x"); }, setItem: function () { throw new Error("q"); }, removeItem: function () { throw new Error("x"); } });
    eq(S.saveGame(G("B")), false); assert(warned >= 1); eq(S.loadGame().game.player, "B"); S.onWarning = null; S.setBackend(fakeStore());
  });
  test("28. Meilleur score local par joueur, remplacé seulement s'il est meilleur", function () {
    function res(n, t) { return { player: n, score: { total: t }, solved: 10, elapsedMs: 1000 }; }
    var u1 = R.updateBest({}, res("Amina", 100), 1); assert(u1.improved);
    var u2 = R.updateBest(u1.best, res("amina ", 80), 2); assert(!u2.improved); eq(u2.best[S.playerKey("Amina")].score, 100);
    var u3 = R.updateBest(u2.best, res("AMINA", 120), 3); assert(u3.improved); eq(R.updateBest(u3.best, res("Karim", 5), 4).best[S.playerKey("Karim")].score, 5);
    var st = fakeStore(); S.setBackend(st); S.saveBest(u3.best); eq(S.loadBest(), u3.best);
  });
  test("29. Clavier : lettres, flèches, effacement, Entrée, Espace ; cases verrouillées intactes", function () {
    var g1 = G(), c0 = UNM.cells[0]; E.selectEntry(g1, grid, UNM.id);
    E.applyKey(g1, grid, "u"); eq(E.getLetter(g1, c0.r, c0.c), "U"); eq(g1.sel.c, c0.c + 1);
    E.applyKey(g1, grid, "n"); E.applyKey(g1, grid, "Backspace"); eq(E.getLetter(g1, UNM.cells[1].r, UNM.cells[1].c), "");
    E.applyKey(g1, grid, "ArrowLeft"); eq(g1.sel.c, c0.c); E.applyKey(g1, grid, "Delete"); eq(E.getLetter(g1, c0.r, c0.c), "");
    var id1 = E.activeEntry(g1, grid).id; E.applyKey(g1, grid, "Enter"); assert(E.activeEntry(g1, grid).id !== id1);
    eq(g1.errors, 0, "taper/naviguer/effacer ne crée aucune erreur");
    var g2 = G(); typeWord(g2, FOR); assert(!E.setLetterAt(g2, grid, FOR.cells[0].r, FOR.cells[0].c, "Z").ok); assert(!E.clearLetterAt(g2, grid, FOR.cells[0].r, FOR.cells[0].c));
    var g3 = G(); Tm.pause(g3, t0 + 1); assert(!E.applyKey(g3, grid, "A").handled); assert(!H.revealLetter(g3, grid, UNM.id, null, t0).ok);
  });
})(typeof window !== "undefined" ? window : globalThis);
