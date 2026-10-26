/* Moteur de grille, validation des réponses, score et navigation clavier.
   Aucune dépendance au DOM : tout est testable sous Node ou dans tests/tests.html. */
(function (g) {
  "use strict";
  var DCP = g.DCP = g.DCP || {};
  var Engine = DCP.Engine = {};

  /* Toutes les règles chiffrées sont centralisées ici (score, temps, aides). */
  var CONFIG = Engine.CONFIG = {
    SAVE_VERSION: 2,
    DURATION_MS: 5 * 60 * 1000,
    POINTS: { easy: 10, medium: 15 },
    FIRST_TRY_BONUS: 10,
    ERROR_PENALTY: 3,            // par tentative complète incorrecte
    VALIDATION_PENALTY: 5,       // en plus, pour la validation incorrecte de ce mot complet
    TIME_BONUS_PER_10S: 2,       // par tranche complète de 10 s restantes, à la victoire
    AIDS: {
      letter: { max: 5, label: "lettres", costs: [[0, 0], [0, 0], [0, 0], [0, 0], [2, 3]] },  // [points, secondes] par utilisation
      half:   { max: 2, label: "moitié",  costs: [[3, 15], [3, 15]] }
    },
    EXPECTED: { total: 25, easy: 15, medium: 10, collections: 10, collectionsEasy: 6, collectionsMedium: 4 }
  };

  Engine.key = function (r, c) { return r + "," + c; };

  /* Normalisation : accents supprimés, majuscules, puis seuls A-Z et 0-9 sont conservés.
     Espaces, tirets, underscores et ponctuation sont donc ignorés. */
  Engine.normalize = function (s) {
    s = String(s === null || s === undefined ? "" : s);
    s = s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    return s.toUpperCase().replace(/[^A-Z0-9]/g, "");
  };

  /* ---------- Construction de la grille ---------- */
  Engine.buildGrid = function (puzzle) {
    var rows = puzzle.rows, cols = puzzle.cols, r, c;
    var cells = [];
    for (r = 0; r < rows; r++) {
      var row = [];
      for (c = 0; c < cols; c++) {
        row.push({ r: r, c: c, letter: null, across: null, down: null, number: null, conflict: false });
      }
      cells.push(row);
    }
    var byId = {};
    var entries = puzzle.entries.map(function (e) {
      var entry = {
        id: e.id, number: e.number, direction: e.direction, row: e.row, col: e.col,
        length: e.length, answer: e.answer, difficulty: e.difficulty, topic: e.topic, clue: e.clue,
        variants: (e.variants || []).slice(), cells: [], outOfBounds: false
      };
      byId[entry.id] = entry;
      for (var i = 0; i < e.answer.length; i++) {
        var rr = e.row + (e.direction === "V" ? i : 0);
        var cc = e.col + (e.direction === "H" ? i : 0);
        if (rr < 0 || cc < 0 || rr >= rows || cc >= cols) { entry.outOfBounds = true; break; }
        var cell = cells[rr][cc], ch = e.answer.charAt(i);
        if (cell.letter && cell.letter !== ch) cell.conflict = true;
        if (!cell.letter) cell.letter = ch;
        if (e.direction === "H") cell.across = e.id; else cell.down = e.id;
        entry.cells.push({ r: rr, c: cc });
      }
      return entry;
    });
    var n = 0;
    for (r = 0; r < rows; r++) {
      for (c = 0; c < cols; c++) {
        if (!cells[r][c].letter) continue;
        var a = (c === 0 || !cells[r][c - 1].letter) && c + 1 < cols && !!cells[r][c + 1].letter;
        var v = (r === 0 || !cells[r - 1][c].letter) && r + 1 < rows && !!cells[r + 1][c].letter;
        if (a || v) cells[r][c].number = ++n;
      }
    }
    return { rows: rows, cols: cols, cells: cells, entries: entries, byId: byId, numberCount: n };
  };

  /* Contrôles automatiques de la grille (utilisés au démarrage et dans les tests). */
  Engine.verifyPuzzle = function (puzzle) {
    var errors = [];
    function err(m) { errors.push(m); }
    var grid = Engine.buildGrid(puzzle);
    var E = grid.entries, ids = {}, answers = {}, clues = {}, count = { easy: 0, medium: 0 }, topics = { collections: 0, collectionsEasy: 0, collectionsMedium: 0, fondamentaux: 0 };
    if (E.length !== CONFIG.EXPECTED.total) err("Nombre d'entrées : " + E.length + " au lieu de 25");
    E.forEach(function (e) {
      if (ids[e.id]) err("Identifiant en double : " + e.id); ids[e.id] = 1;
      if (!/^[A-Z]+$/.test(e.answer)) err(e.id + " : réponse invalide");
      if (e.answer.length !== e.length) err(e.id + " : longueur incohérente");
      if (e.direction !== "H" && e.direction !== "V") err(e.id + " : direction invalide");
      if (!(e.difficulty in count)) err(e.id + " : difficulté invalide"); else count[e.difficulty]++;
      if (e.topic !== "collections" && e.topic !== "fondamentaux") err(e.id + " : thème invalide");
      else if (e.topic === "collections") { topics.collections++; if (e.difficulty === "easy") topics.collectionsEasy++; else topics.collectionsMedium++; }
      else topics.fondamentaux++;
      if (answers[e.answer]) err("Réponse en double : " + e.answer); answers[e.answer] = 1;
      var cl = (e.clue || "").trim();
      if (cl.length < 8) err(e.id + " : définition manquante");
      if (clues[cl]) err(e.id + " : définition en double"); clues[cl] = 1;
      if (new RegExp("(^|[^A-Za-z])" + e.answer + "([^A-Za-z]|$)", "i").test(cl)) err(e.id + " : la définition contient la réponse");
      if (e.outOfBounds) err(e.id + " : sort de la grille");
      e.variants.forEach(function (v) {
        if (Engine.normalize(v).length !== e.length) err(e.id + " : variante de longueur différente");
      });
      var num = grid.cells[e.row] && grid.cells[e.row][e.col] ? grid.cells[e.row][e.col].number : null;
      if (num !== e.number) err(e.id + " : numéro " + e.number + " au lieu de " + num);
    });
    ["easy", "medium"].forEach(function (k) {
      if (count[k] !== CONFIG.EXPECTED[k]) err("Difficulté " + k + " : " + count[k] + " au lieu de " + CONFIG.EXPECTED[k]);
    });
    ["collections", "collectionsEasy", "collectionsMedium"].forEach(function (k) {
      if (topics[k] !== CONFIG.EXPECTED[k]) err("Thème " + k + " : " + topics[k] + " au lieu de " + CONFIG.EXPECTED[k]);
    });
    if (topics.fondamentaux !== CONFIG.EXPECTED.total - CONFIG.EXPECTED.collections) err("Fondamentaux : " + topics.fondamentaux);
    var r, c;
    for (r = 0; r < grid.rows; r++) for (c = 0; c < grid.cols; c++) {
      if (grid.cells[r][c].conflict) err("Collision de lettres en (" + r + "," + c + ")");
    }
    // Séquences accidentelles : tout alignement de 2 cases ou plus doit être une entrée exacte.
    var matched = {};
    function checkRun(r0, c0, len, dir) {
      var cell = grid.cells[r0][c0];
      var id = dir === "H" ? cell.across : cell.down;
      var e = id ? grid.byId[id] : null;
      if (!e || e.row !== r0 || e.col !== c0 || e.length !== len) {
        err("Séquence non prévue en (" + r0 + "," + c0 + ") " + dir + " longueur " + len);
      } else matched[e.id] = 1;
    }
    for (r = 0; r < grid.rows; r++) {
      c = 0;
      while (c < grid.cols) {
        if (grid.cells[r][c].letter) {
          var s = c; while (c < grid.cols && grid.cells[r][c].letter) c++;
          if (c - s >= 2) checkRun(r, s, c - s, "H");
        } else c++;
      }
    }
    for (c = 0; c < grid.cols; c++) {
      r = 0;
      while (r < grid.rows) {
        if (grid.cells[r][c].letter) {
          var s2 = r; while (r < grid.rows && grid.cells[r][c].letter) r++;
          if (r - s2 >= 2) checkRun(s2, c, r - s2, "V");
        } else r++;
      }
    }
    E.forEach(function (e) { if (!matched[e.id]) err(e.id + " : entrée non retrouvée dans la grille"); });
    // Chaque entrée doit croiser au moins une autre entrée.
    E.forEach(function (e) {
      var crosses = e.cells.some(function (p) { var cell = grid.cells[p.r][p.c]; return cell.across && cell.down; });
      if (!crosses) err(e.id + " : aucun croisement");
    });
    return { ok: errors.length === 0, errors: errors, grid: grid };
  };

  /* ---------- État de partie ---------- */
  Engine.newGame = function (player, now) {
    return {
      version: CONFIG.SAVE_VERSION,
      player: String(player),
      status: "playing",          // playing | paused | finished
      startedAt: now,
      elapsedMs: 0,               // temps joué cumulé avant le segment courant (hors pénalités)
      penaltyMs: 0,               // temps retiré par les aides, appliqué immédiatement
      runStart: now,              // début du segment courant (null en pause ou après la fin)
      letters: {},                // "r,c" -> lettre saisie ou révélée
      revealed: {},               // "r,c" -> true si révélée par une aide (verrouillée)
      solved: {},                 // id -> true
      attempts: {},               // id -> tentatives incorrectes déjà évaluées
      noBonus: {},                // id -> true si erreur ou aide : plus de bonus de première tentative
      events: [],                 // correct | wrong | aid
      errors: 0,
      points: 0,                  // score courant (sans bonus de temps)
      hints: { letter: 0, half: 0 },
      sel: null,                  // {r,c,dir}
      result: null,
      bestRecorded: false
    };
  };

  Engine.getLetter = function (game, r, c) { return game.letters[Engine.key(r, c)] || ""; };
  Engine.solvedCount = function (game) { return Object.keys(game.solved).length; };
  Engine.allSolved = function (game, grid) { return Engine.solvedCount(game) === grid.entries.length; };

  Engine.isLocked = function (game, grid, r, c) {
    if (game.revealed[Engine.key(r, c)]) return true;
    var cell = grid.cells[r][c];
    return !!((cell.across && game.solved[cell.across]) || (cell.down && game.solved[cell.down]));
  };

  Engine.entryLetters = function (game, grid, entry) {
    return entry.cells.map(function (p) { return Engine.getLetter(game, p.r, p.c); });
  };

  /* Évalue une entrée. countWrong=false pour les aides (aucune erreur imputée). */
  Engine.evaluateEntry = function (game, grid, id, countWrong) {
    var entry = grid.byId[id];
    if (game.solved[id]) return "solved";
    var letters = Engine.entryLetters(game, grid, entry);
    if (letters.some(function (l) { return !l; })) return "incomplete";
    var attempt = letters.join("");
    var ok = Engine.normalize(entry.answer) === attempt ||
      entry.variants.some(function (v) { return Engine.normalize(v) === attempt; });
    if (ok) {
      game.solved[id] = true;
      game.events.push({ type: "correct", id: id, difficulty: entry.difficulty, firstTry: !game.noBonus[id] });
      Engine.recomputePoints(game);
      return "correct";
    }
    if (!countWrong) return "wrong-uncounted";
    var list = game.attempts[id] || (game.attempts[id] = []);
    if (list.indexOf(attempt) !== -1) return "repeat";
    list.push(attempt);
    game.noBonus[id] = true;
    game.errors++;
    game.events.push({ type: "wrong", id: id });
    Engine.recomputePoints(game);
    return "wrong";
  };

  Engine.evaluateAround = function (game, grid, r, c, countWrong) {
    var cell = grid.cells[r][c], out = { correct: [], wrong: [] };
    [cell.across, cell.down].forEach(function (id) {
      if (!id) return;
      var st = Engine.evaluateEntry(game, grid, id, countWrong);
      if (st === "correct") out.correct.push(id);
      if (st === "wrong") out.wrong.push(id);
    });
    return out;
  };

  /* Place une lettre (saisie du joueur). Ne fait rien si la case est verrouillée ou la partie finie. */
  Engine.setLetterAt = function (game, grid, r, c, ch, countWrong) {
    var res = { ok: false, correct: [], wrong: [] };
    if (game.status !== "playing") return res;
    var cell = grid.cells[r] && grid.cells[r][c];
    if (!cell || !cell.letter || Engine.isLocked(game, grid, r, c)) return res;
    ch = Engine.normalize(ch);
    if (!/^[A-Z]$/.test(ch)) return res;
    game.letters[Engine.key(r, c)] = ch;
    var ev = Engine.evaluateAround(game, grid, r, c, countWrong !== false);
    res.ok = true; res.correct = ev.correct; res.wrong = ev.wrong;
    return res;
  };

  Engine.clearLetterAt = function (game, grid, r, c) {
    if (game.status !== "playing") return false;
    var cell = grid.cells[r] && grid.cells[r][c];
    if (!cell || !cell.letter || Engine.isLocked(game, grid, r, c)) return false;
    var k = Engine.key(r, c);
    if (!game.letters[k]) return false;
    delete game.letters[k];
    return true;
  };

  /* ---------- Score (fonction pure, rejouable à partir des événements) ----------
     correct : points de difficulté (+ bonus de première tentative si firstTry)
     wrong   : −3 (tentative incorrecte) et −5 (validation incorrecte du mot complet) = −8, comptés une fois
     aid     : pénalité de points de l'aide ; les secondes sont retirées du chrono par ailleurs
     Le total est ramené à 0 au minimum après chaque événement, puis le bonus de temps (victoire) s'ajoute. */
  Engine.timeBonus = function (remainingMs, success) {
    if (!success) return 0;
    return CONFIG.TIME_BONUS_PER_10S * Math.floor(Math.floor(Math.max(0, remainingMs) / 1000) / 10);
  };
  Engine.computeScore = function (events, remainingMs, success) {
    var o = { base: 0, firstTryBonus: 0, timeBonus: 0, errorPenalty: 0, validationPenalty: 0, aidPenalty: 0, aidSeconds: 0,
      correct: 0, firstTryCorrect: 0, wrong: 0, easySolved: 0, mediumSolved: 0, total: 0 };
    var total = 0;
    events.forEach(function (e) {
      if (e.type === "correct") {
        var p = CONFIG.POINTS[e.difficulty] || 0;
        total += p; o.base += p; o.correct++;
        if (e.difficulty === "easy") o.easySolved++; else if (e.difficulty === "medium") o.mediumSolved++;
        if (e.firstTry) { total += CONFIG.FIRST_TRY_BONUS; o.firstTryBonus += CONFIG.FIRST_TRY_BONUS; o.firstTryCorrect++; }
      } else if (e.type === "wrong") {
        total = Math.max(0, total - CONFIG.ERROR_PENALTY - CONFIG.VALIDATION_PENALTY);
        o.errorPenalty += CONFIG.ERROR_PENALTY; o.validationPenalty += CONFIG.VALIDATION_PENALTY; o.wrong++;
      } else if (e.type === "aid") {
        total = Math.max(0, total - (e.points || 0));
        o.aidPenalty += e.points || 0; o.aidSeconds += e.seconds || 0;
      }
    });
    o.timeBonus = Engine.timeBonus(remainingMs, success);
    o.total = total + o.timeBonus;
    return o;
  };
  Engine.recomputePoints = function (game) {
    game.points = Engine.computeScore(game.events, 0, false).total;
    return game.points;
  };

  /* ---------- Sélection et navigation ---------- */
  Engine.activeEntry = function (game, grid) {
    var s = game.sel;
    if (!s || !grid.cells[s.r] || !grid.cells[s.r][s.c]) return null;
    var cell = grid.cells[s.r][s.c];
    if (!cell.letter) return null;
    var id = s.dir === "H" ? (cell.across || cell.down) : (cell.down || cell.across);
    return id ? grid.byId[id] : null;
  };

  Engine.selectCell = function (game, grid, r, c) {
    var cell = grid.cells[r] && grid.cells[r][c];
    if (!cell || !cell.letter) return false;
    var cur = game.sel, dir = cur ? cur.dir : "H";
    if (cur && cur.r === r && cur.c === c) {
      if (cell.across && cell.down) dir = dir === "H" ? "V" : "H";
    } else if (dir === "H" && !cell.across) dir = "V";
    else if (dir === "V" && !cell.down) dir = "H";
    game.sel = { r: r, c: c, dir: dir };
    return true;
  };

  Engine.toggleDirection = function (game, grid) {
    var s = game.sel; if (!s) return false;
    var cell = grid.cells[s.r][s.c];
    if (cell.across && cell.down) { s.dir = s.dir === "H" ? "V" : "H"; return true; }
    return false;
  };

  Engine.firstOpenCell = function (game, grid, entry) {
    for (var i = 0; i < entry.cells.length; i++) {
      var p = entry.cells[i];
      if (!Engine.isLocked(game, grid, p.r, p.c) && Engine.getLetter(game, p.r, p.c) !== grid.cells[p.r][p.c].letter) return p;
    }
    for (var j = 0; j < entry.cells.length; j++) {
      var q = entry.cells[j];
      if (!Engine.isLocked(game, grid, q.r, q.c)) return q;
    }
    return entry.cells[0];
  };

  Engine.selectEntry = function (game, grid, id) {
    var entry = grid.byId[id]; if (!entry) return false;
    var p = Engine.firstOpenCell(game, grid, entry);
    game.sel = { r: p.r, c: p.c, dir: entry.direction };
    return true;
  };

  Engine.nextEntryId = function (game, grid, fromId, step) {
    var list = grid.entries, n = list.length, idx = -1, i;
    for (i = 0; i < n; i++) if (list[i].id === fromId) idx = i;
    for (i = 1; i <= n; i++) {
      var e = list[((idx + step * i) % n + n) % n];
      if (!game.solved[e.id]) return e.id;
    }
    return null;
  };

  function indexInEntry(entry, r, c) {
    for (var i = 0; i < entry.cells.length; i++) if (entry.cells[i].r === r && entry.cells[i].c === c) return i;
    return -1;
  }

  /* Applique une touche clavier. Retourne {handled, changed, correct[], wrong[]}. */
  Engine.applyKey = function (game, grid, key) {
    var res = { handled: false, changed: false, correct: [], wrong: [] };
    if (game.status !== "playing") return res;
    var s = game.sel, entry = Engine.activeEntry(game, grid), i;
    if (!s && grid.entries.length) { Engine.selectEntry(game, grid, grid.entries[0].id); s = game.sel; entry = Engine.activeEntry(game, grid); }

    if (/^Arrow(Left|Right|Up|Down)$/.test(key)) {
      res.handled = true;
      var axis = (key === "ArrowLeft" || key === "ArrowRight") ? "H" : "V";
      var cell = grid.cells[s.r][s.c];
      if (axis !== s.dir && (axis === "H" ? cell.across : cell.down)) { s.dir = axis; res.changed = true; return res; }
      var dr = key === "ArrowUp" ? -1 : key === "ArrowDown" ? 1 : 0;
      var dc = key === "ArrowLeft" ? -1 : key === "ArrowRight" ? 1 : 0;
      var r = s.r + dr, c = s.c + dc;
      while (r >= 0 && c >= 0 && r < grid.rows && c < grid.cols && !grid.cells[r][c].letter) { r += dr; c += dc; }
      if (r >= 0 && c >= 0 && r < grid.rows && c < grid.cols) {
        var t = grid.cells[r][c];
        s.r = r; s.c = c;
        if (axis === "H" ? t.across : t.down) s.dir = axis;
        else if (s.dir === "H" ? !t.across : !t.down) s.dir = s.dir === "H" ? "V" : "H";
        res.changed = true;
      }
      return res;
    }
    if (key === " " || key === "Spacebar") { res.handled = true; res.changed = Engine.toggleDirection(game, grid); return res; }
    if (key === "Enter") {
      res.handled = true;
      var nid = Engine.nextEntryId(game, grid, entry ? entry.id : null, 1);
      if (nid) { Engine.selectEntry(game, grid, nid); res.changed = true; }
      return res;
    }
    if (key === "Delete") { res.handled = true; res.changed = Engine.clearLetterAt(game, grid, s.r, s.c); return res; }
    if (key === "Backspace") {
      res.handled = true;
      if (Engine.getLetter(game, s.r, s.c) && !Engine.isLocked(game, grid, s.r, s.c)) {
        res.changed = Engine.clearLetterAt(game, grid, s.r, s.c); return res;
      }
      if (entry) {
        i = indexInEntry(entry, s.r, s.c);
        for (var j = i - 1; j >= 0; j--) {
          var p = entry.cells[j];
          s.r = p.r; s.c = p.c; res.changed = true;
          if (!Engine.isLocked(game, grid, p.r, p.c)) { Engine.clearLetterAt(game, grid, p.r, p.c); break; }
        }
      }
      return res;
    }
    var ch = Engine.normalize(key);
    if (key.length === 1 && /^[A-Z]$/.test(ch)) {
      res.handled = true;
      var set = Engine.setLetterAt(game, grid, s.r, s.c, ch, true);
      res.changed = set.ok; res.correct = set.correct; res.wrong = set.wrong;
      var cur = Engine.activeEntry(game, grid);
      if (cur) {
        i = indexInEntry(cur, s.r, s.c);
        for (var k = i + 1; k < cur.cells.length; k++) {
          var q = cur.cells[k];
          if (!Engine.isLocked(game, grid, q.r, q.c)) { s.r = q.r; s.c = q.c; res.changed = true; break; }
        }
      }
      return res;
    }
    return res;
  };
})(typeof window !== "undefined" ? window : globalThis);
