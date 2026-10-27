/* Fin de partie (une seule fois), meilleurs scores locaux et écran de résultat. */
(function (g) {
  "use strict";
  var DCP = g.DCP = g.DCP || {};
  var Results = DCP.Results = {};

  /* Termine la partie. Retourne true seulement lors de la première (et unique) fin. */
  Results.finishGame = function (game, grid, reason, now) {
    var Engine = DCP.Engine, Timer = DCP.Timer, D = Engine.CONFIG.DURATION_MS;
    if (game.status === "finished") return false;
    var played = Timer.playedMs(game, now), penalty = game.penaltyMs || 0;
    var success = reason === "success" && Engine.allSolved(game, grid);
    var elapsed = Math.min(played + penalty, D);
    if (!success) { elapsed = D; played = Math.max(played, D - penalty); }
    var remaining = Math.max(0, D - elapsed);
    var score = Engine.computeScore(game.events, remaining, success);
    game.elapsedMs = played;
    game.runStart = null;
    game.status = "finished";
    game.points = score.total;
    var solved = Engine.solvedCount(game);
    game.result = {
      player: game.player,
      success: success,
      reason: success ? "success" : "timeout",
      elapsedMs: elapsed,
      remainingMs: remaining,
      solved: solved,
      total: grid.entries.length,
      correct: score.correct,
      easySolved: score.easySolved,
      mediumSolved: score.mediumSolved,
      hardSolved: score.hardSolved,
      firstTryCorrect: score.firstTryCorrect,
      wrongAttempts: score.wrong,
      invalidValidations: score.wrong,   // chaque tentative complète incorrecte est aussi une validation incorrecte
      errors: game.errors,
      percent: Math.round(solved * 100 / grid.entries.length),
      hints: { letters: game.hints.letter, half: game.hints.half },
      score: score,
      finishedAt: now
    };
    return true;
  };

  /* Meilleur score par joueur : remplacé seulement si le nouveau score est strictement supérieur. */
  Results.updateBest = function (best, result, now) {
    var key = DCP.Storage.playerKey(result.player);
    var next = {}; Object.keys(best).forEach(function (k) { next[k] = best[k]; });
    var cur = next[key], total = result.score.total;
    if (!cur || total > cur.score) {
      next[key] = { name: result.player, score: total, solved: result.solved, elapsedMs: result.elapsedMs, date: now };
      return { best: next, improved: true, previous: cur || null };
    }
    return { best: next, improved: false, previous: cur };
  };

  Results.corrections = function (game, grid) {
    return grid.entries.filter(function (e) { return !game.solved[e.id]; });
  };

  function mmss(ms) { return DCP.Timer.format(ms); }
  var DIFF = { easy: "facile", medium: "moyenne", hard: "difficile" };
  Results.difficultyLabel = function (d) { return DIFF[d] || d; };

  Results.render = function (root, game, grid, bestInfo, showCorrections) {
    var h = DCP.Dom.h, r = game.result;
    DCP.Dom.clear(root);
    var remaining = Results.corrections(game, grid);
    root.appendChild(h("div", { class: "result-head " + (r.success ? "ok" : "ko") }, [
      h("p", { class: "result-status", text: r.success ? "Victoire" : "Fin de partie" }),
      h("h2", { id: "result-title", tabindex: "-1", text: r.success ? "Félicitations, " + r.player + " !" : "Fin de la partie, " + r.player }),
      h("p", { class: "result-msg", text: r.success
        ? "Victoire ! Tu as résolu les 25 mots avant la fin du temps."
        : "Fin de partie, le temps est écoulé : " + remaining.length + " mot" + (remaining.length > 1 ? "s" : "") + " restai" + (remaining.length > 1 ? "ent" : "t") + " à trouver." })
    ]));
    root.appendChild(h("div", { class: "score-card" }, [
      h("span", { class: "label", text: "Score final" }),
      h("span", { class: "score-value", text: String(r.score.total) }),
      r.success ? h("span", { class: "score-detail", text: "dont bonus de temps : " + r.score.timeBonus + " points" }) :
        h("span", { class: "score-detail", text: "Aucun bonus de temps sans réussite complète" })
    ]));
    var C = DCP.Engine.CONFIG, sc = r.score;
    var stats = [
      ["Joueur", r.player], ["Statut", r.success ? "Victoire" : "Fin de partie"],
      ["Mots trouvés", r.solved + " / " + r.total],
      ["Questions faciles résolues", r.easySolved + " / " + C.EXPECTED.easy],
      ["Questions moyennes résolues", r.mediumSolved + " / " + C.EXPECTED.medium],
      ["Questions difficiles résolues", r.hardSolved + " / " + C.EXPECTED.hard],
      ["Réponses correctes à la première tentative", String(r.firstTryCorrect)],
      ["Tentatives incorrectes", String(r.wrongAttempts)],
      ["Validations incorrectes de mots complets", String(r.invalidValidations)],
      ["Aide « Révéler une lettre »", r.hints.letters + " / " + C.AIDS.letter.max],
      ["Aide « Révéler la moitié »", r.hints.half + " / " + C.AIDS.half.max],
      ["Bonus de première tentative", "+" + sc.firstTryBonus],
      ["Bonus de temps", "+" + sc.timeBonus],
      ["Pénalités d'erreurs", "−" + sc.errorPenalty],
      ["Pénalités de validation incorrecte", "−" + sc.validationPenalty],
      ["Pénalités de points (aides)", "−" + sc.aidPenalty],
      ["Secondes retirées par les aides", sc.aidSeconds + " s"],
      ["Temps utilisé", mmss(r.elapsedMs)], ["Progression", r.percent + " %"]
    ];
    var dl = h("dl", { class: "stats-grid" });
    stats.forEach(function (s) { dl.appendChild(h("div", { class: "stat-item" }, [h("dt", { text: s[0] }), h("dd", { text: s[1] })])); });
    root.appendChild(dl);
    if (bestInfo) {
      root.appendChild(h("p", { class: "best-line", text:
        (bestInfo.improved ? "Nouveau meilleur score local pour " + r.player + " : " : "Meilleur score local de " + r.player + " : ") +
        bestInfo.entry.score + " points (" + bestInfo.entry.solved + " mots, " + mmss(bestInfo.entry.elapsedMs) + ")." }));
    }
    if (remaining.length) {
      var list = h("ul", { class: "remaining-list" });
      remaining.forEach(function (e) {
        var li = h("li", {}, [
          h("strong", { text: "n° " + e.number + (e.direction === "H" ? " horizontal" : " vertical") + " · " + e.length + " lettres" }),
          h("span", { text: " — " + e.clue })
        ]);
        if (showCorrections) li.appendChild(h("span", { class: "answer", text: e.answer }));
        list.appendChild(li);
      });
      root.appendChild(h("section", { class: "remaining" }, [h("h3", { text: "Entrées non résolues" }), list]));
    }
    if (showCorrections) {
      var all = h("ul", { class: "remaining-list all" });
      grid.entries.forEach(function (e) {
        all.appendChild(h("li", { class: game.solved[e.id] ? "done" : "missed" }, [
          h("strong", { text: "n° " + e.number + (e.direction === "H" ? " H" : " V") }),
          h("span", { text: " — " + e.clue }),
          h("span", { class: "answer", text: e.answer })
        ]));
      });
      root.appendChild(h("section", { class: "remaining", id: "corrections" }, [h("h3", { text: "Corrections" }), all]));
    }
  };
})(typeof window !== "undefined" ? window : globalThis);
