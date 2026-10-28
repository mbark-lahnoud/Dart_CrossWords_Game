/* Tests navigateur : l'application réelle est chargée dans une iframe (espace de stockage isolé par ?ns=).
   Sous file:// Chrome interdit l'accès au contenu de l'iframe : ces tests sont alors ignorés (utiliser un serveur local). */
(function (g) {
  "use strict";
  var T = g.DCPTest, test = T.test, assert = T.assert, eq = T.eq;
  var SIZES = [[320, 568], [375, 667], [430, 932], [768, 1024], [1024, 768], [1440, 900], [667, 375], [1024, 500], [360, 640]];
  var counter = 0;
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  function open(w, h, ns) {
    return new Promise(function (resolve, reject) {
      var f = document.createElement("iframe");
      f.style.cssText = "position:fixed;left:0;top:0;border:0;opacity:.01;pointer-events:none;width:" + w + "px;height:" + h + "px";
      f.src = "../index.html?ns=t" + (ns || (Date.now() + "-" + (++counter)));
      f.onload = function () {
        try { void f.contentWindow.document.body; } catch (e) { f.remove(); var s = new Error("iframe inaccessible (file://) : lancer via un serveur HTTP"); s.skip = true; return reject(s); }
        resolve(f);
      };
      document.body.appendChild(f);
    });
  }
  function ctx(f) { return { f: f, w: f.contentWindow, d: f.contentWindow.document, $: function (id) { return f.contentWindow.document.getElementById(id); } }; }
  async function withApp(w, h, fn, ns) {
    var f = await open(w, h, ns); var c = ctx(f);
    try { await fn(c); } finally { if (!ns) f.remove(); }
  }
  function startGame(c, name) {
    c.$("player-name").value = name || "Testeur";
    c.$("btn-start").click();
  }
  function key(c, k) {
    var inp = c.$("grid-input");
    inp.dispatchEvent(new c.w.KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true }));
  }
  function pointer(c, el, type, pt, id) {
    el.dispatchEvent(new c.w.PointerEvent(type, { pointerType: pt || "touch", pointerId: id || 1, button: 0, bubbles: true, cancelable: true }));
  }
  function cellEl(c, r, col) { return c.$("grid").querySelector('[data-r="' + r + '"][data-c="' + col + '"]'); }

  test("36. Footer présent avec les trois mentions exactes", async function () {
    await withApp(800, 700, function (c) {
      var lines = [].map.call(c.$("site-footer").querySelectorAll("p"), function (p) { return p.textContent.trim(); });
      eq(lines, ["Created by : M'bark LAHNOUD", "Supervised by : Mohammed GOUMIH", "DEVOAM-26-27"]);
      assert(c.$("site-footer").offsetHeight > 0, "footer visible");
    });
  }, { browserOnly: true });

  test("Accueil : nom obligatoire, message accessible, aucune partie sans nom", async function () {
    await withApp(800, 700, function (c) {
      c.$("btn-start").click();
      assert(!c.$("name-error").hidden, "message d'erreur");
      assert(c.$("name-error").getAttribute("role") === "alert");
      assert(c.$("screen-game").hidden, "la partie ne doit pas démarrer");
      eq(c.w.DCP.App.getGame(), null);
      assert(/25/.test(c.$("screen-home").textContent) && /5/.test(c.$("screen-home").textContent) && !/Questionner/.test(c.$("screen-home").textContent));
    });
  }, { browserOnly: true });

  test("35. Grille entièrement visible, sans défilement, à toutes les largeurs", async function () {
    for (var i = 0; i < SIZES.length; i++) {
      var w = SIZES[i][0], h = SIZES[i][1];
      await withApp(w, h, async function (c) {
        startGame(c); await wait(150); c.w.scrollTo(0, 0);
        var gridEl = c.$("grid"), wrap = c.$("grid-wrap");
        var cells = gridEl.querySelectorAll(".cell"); assert(cells.length === c.w.DCP.App.grid.rows * c.w.DCP.App.grid.cols);
        var doc = c.d.documentElement;
        assert(doc.scrollWidth <= c.w.innerWidth + 1, w + "x" + h + " : défilement horizontal de la page");
        assert(wrap.scrollWidth <= wrap.clientWidth + 1 && wrap.scrollHeight <= wrap.clientHeight + 1, w + "x" + h + " : défilement interne de la grille");
        var ww = doc.clientWidth, minS = 999, bad = 0;
        [].forEach.call(cells, function (el) {
          var r = el.getBoundingClientRect(); minS = Math.min(minS, r.width);
          if (r.left < -0.5 || r.right > ww + 0.5 || r.top < -0.5 || r.bottom > c.w.innerHeight + 0.5) bad++;
        });
        assert(bad === 0, w + "x" + h + " : " + bad + " cases hors de l'écran (cellule " + minS + "px)");
        assert(minS >= 10, w + "x" + h + " : cases trop petites");
        var wr = wrap.getBoundingClientRect(); assert(wr.width > 0 && wr.height > 0);
      });
    }
  }, { browserOnly: true });

  test("Disposition : grille et panneau des entrées côte à côte sur grand écran", async function () {
    await withApp(1440, 900, async function (c) {
      startGame(c); await wait(100);
      var a = c.$("grid-col").getBoundingClientRect(), b = c.$("side").getBoundingClientRect();
      assert(b.left >= a.right - 1 && Math.abs(a.top - b.top) < 40, "panneau à droite");
    });
    await withApp(375, 667, async function (c) {
      startGame(c); await wait(100);
      var a = c.$("grid-col").getBoundingClientRect(), b = c.$("side").getBoundingClientRect();
      assert(b.top >= a.bottom - 1, "panneau sous la grille sur mobile");
    });
  }, { browserOnly: true });

  test("Score et chrono visibles en jeu (10:00 au départ) ; définitions masquées", async function () {
    await withApp(1024, 768, async function (c) {
      startGame(c); await wait(100);
      assert(/^(10|09):\d\d$/.test(c.$("timer").textContent), "chrono " + c.$("timer").textContent);
      eq(c.w.DCP.Engine.CONFIG.DURATION_MS, 600000);
      eq(c.$("score-value").textContent, "0"); assert(c.$("score-value").offsetHeight > 0 && c.$("timer").offsetHeight > 0);
      var txt = c.$("screen-game").textContent;
      c.w.DCP.PUZZLE.entries.forEach(function (e) { assert(txt.indexOf(e.clue) < 0, "définition visible " + e.id); });
      assert(!/Questionner/i.test(c.d.body.textContent), "« Questionner-moi » doit avoir disparu");
      assert(c.d.querySelectorAll(".aid").length === 2 && !c.$("aid-ask"), "exactement deux aides");
      assert(c.$("hint-pop").hidden);
    });
  }, { browserOnly: true });

  test("33. Indice visible seulement pendant le maintien (tactile, souris, clavier)", async function () {
    await withApp(390, 800, async function (c) {
      startGame(c); await wait(100);
      var btn = c.d.querySelector(".clue-btn"), e = c.w.DCP.App.grid.byId[btn.getAttribute("data-id")];
      assert(c.$("hint-pop").hidden, "caché au départ");
      pointer(c, btn, "pointerdown", "touch");
      assert(!c.$("hint-pop").hidden, "visible au début du maintien");
      assert(c.$("hint-pop-text").textContent === e.clue, "contenu = définition");
      eq(c.$("hint-pop").style.pointerEvents || c.w.getComputedStyle(c.$("hint-pop")).pointerEvents, "none");
      pointer(c, btn, "pointerup", "touch"); assert(c.$("hint-pop").hidden, "masqué au relâchement tactile");
      pointer(c, btn, "pointerdown", "touch"); pointer(c, btn, "pointercancel", "touch"); assert(c.$("hint-pop").hidden, "masqué à l'annulation");
      pointer(c, btn, "pointerdown", "mouse"); assert(!c.$("hint-pop").hidden); pointer(c, btn, "pointerleave", "mouse"); assert(c.$("hint-pop").hidden, "masqué quand le pointeur quitte");
      btn.dispatchEvent(new c.w.MouseEvent("click", { bubbles: true })); assert(c.$("hint-pop").hidden, "un simple clic ne laisse pas l'indice");
      btn.dispatchEvent(new c.w.KeyboardEvent("keydown", { key: " ", bubbles: true, cancelable: true })); assert(!c.$("hint-pop").hidden, "clavier : visible");
      btn.dispatchEvent(new c.w.KeyboardEvent("keyup", { key: " ", bubbles: true, cancelable: true })); assert(c.$("hint-pop").hidden, "clavier : masqué au relâchement");
      // Autre interaction : clic ailleurs, autre touche, nouveau doigt -> masqué ; pas de réaffichage sans nouveau maintien.
      pointer(c, btn, "pointerdown", "mouse"); assert(!c.$("hint-pop").hidden);
      c.$("grid").dispatchEvent(new c.w.PointerEvent("pointerdown", { pointerType: "mouse", pointerId: 2, button: 0, bubbles: true })); assert(c.$("hint-pop").hidden, "clic ailleurs : masqué");
      pointer(c, btn, "pointermove", "mouse"); assert(c.$("hint-pop").hidden, "pas de réaffichage sans nouveau maintien");
      pointer(c, btn, "pointerdown", "touch"); c.d.dispatchEvent(new c.w.KeyboardEvent("keydown", { key: "a", bubbles: true })); assert(c.$("hint-pop").hidden, "autre touche : masqué");
      pointer(c, btn, "pointerdown", "touch"); pointer(c, c.$("grid"), "pointerdown", "touch", 2); assert(c.$("hint-pop").hidden, "second doigt : masqué");
      btn.dispatchEvent(new c.w.KeyboardEvent("keydown", { key: " ", bubbles: true, cancelable: true })); assert(!c.$("hint-pop").hidden);
      btn.dispatchEvent(new c.w.KeyboardEvent("keydown", { key: " ", repeat: true, bubbles: true, cancelable: true })); assert(!c.$("hint-pop").hidden, "répétition ignorée");
      btn.dispatchEvent(new c.w.KeyboardEvent("keydown", { key: "b", bubbles: true })); assert(c.$("hint-pop").hidden, "autre touche pendant maintien clavier");
      btn.dispatchEvent(new c.w.KeyboardEvent("keydown", { key: " ", repeat: true, bubbles: true, cancelable: true })); assert(c.$("hint-pop").hidden, "pas de réaffichage par répétition");
      btn.dispatchEvent(new c.w.KeyboardEvent("keyup", { key: " ", bubbles: true }));
      pointer(c, btn, "pointerdown", "touch"); c.d.dispatchEvent(new c.w.PointerEvent("pointerup", { pointerType: "touch", pointerId: 1, bubbles: true })); assert(c.$("hint-pop").hidden, "relâchement hors du numéro");
      var ev = new c.w.MouseEvent("contextmenu", { bubbles: true, cancelable: true }); btn.dispatchEvent(ev); assert(ev.defaultPrevented, "menu contextuel bloqué");
    });
  }, { browserOnly: true });

  test("33b. Maintien tactile : l'indice reste affiché doigt posé malgré contextmenu, selectstart, pointerleave, perte de capture, resize, scroll et touchend d'un autre doigt", async function () {
    await withApp(390, 800, async function (c) {
      startGame(c); await wait(100);
      var btn = c.d.querySelector(".clue-btn"), pop = c.$("hint-pop");
      pointer(c, btn, "pointerdown", "touch", 7); assert(!pop.hidden, "visible au contact");
      pointer(c, btn, "pointerdown", "touch", 7); assert(!pop.hidden, "doublon de pointerdown ignoré");
      var cm = new c.w.MouseEvent("contextmenu", { bubbles: true, cancelable: true }); btn.dispatchEvent(cm);
      assert(cm.defaultPrevented && !pop.hidden, "appui long (contextmenu) : menu bloqué, indice conservé");
      var ss = new c.w.Event("selectstart", { bubbles: true, cancelable: true }); btn.dispatchEvent(ss); assert(ss.defaultPrevented && !pop.hidden, "selectstart bloqué sans masquer");
      pointer(c, btn, "pointerleave", "touch", 7); assert(!pop.hidden, "pointerleave tactile ignoré");
      btn.dispatchEvent(new c.w.Event("lostpointercapture", { bubbles: true })); assert(!pop.hidden, "lostpointercapture ignoré");
      c.w.dispatchEvent(new c.w.Event("resize")); c.d.dispatchEvent(new c.w.Event("scroll", { bubbles: true })); assert(!pop.hidden, "resize/scroll (barre du navigateur) ignorés");
      await wait(1200); assert(!pop.hidden, "toujours visible après 1,2 s de maintien");
      assert(c.w.getComputedStyle(btn).touchAction === "none", "touch-action ciblé sur le numéro");
      assert(c.w.getComputedStyle(c.$("side")).touchAction !== "none", "le reste de la page peut défiler");
      pointer(c, btn, "pointerup", "touch", 99); assert(!pop.hidden, "pointerup d'un autre pointeur ignoré");
      pointer(c, btn, "pointerup", "touch", 7); assert(pop.hidden, "masqué au relâchement du doigt");
      pointer(c, btn, "pointerdown", "touch", 8); pointer(c, btn, "pointercancel", "touch", 8); assert(pop.hidden, "masqué à l'annulation");
      assert(c.w.getComputedStyle(btn).userSelect === "none");
    });
  }, { browserOnly: true });

  test("34b. Saisie directe dans la grille et navigation clavier (DOM)", async function () {
    await withApp(1024, 768, async function (c) {
      startGame(c); await wait(100);
      var A = c.w.DCP.App, grid = A.grid, e = grid.entries[0], p0 = e.cells[0];
      cellEl(c, p0.r, p0.c).click();
      assert(c.d.activeElement === c.$("grid-input"), "focus sur le champ de saisie");
      key(c, "q"); eq(cellEl(c, p0.r, p0.c).querySelector(".ch").textContent, "Q");
      var p1 = e.cells[1]; assert(cellEl(c, p1.r, p1.c).classList.contains("sel"), "la sélection avance");
      key(c, "Backspace"); key(c, "Backspace");
      eq(cellEl(c, p0.r, p0.c).querySelector(".ch").textContent, "");
      eq(A.getGame().errors, 0);
      assert(c.$("active-info").textContent.indexOf("Mot n° " + e.number) === 0);
    });
  }, { browserOnly: true });

  test("Validation à l'écran : mot correct verrouillé, progression mise à jour", async function () {
    await withApp(1024, 768, async function (c) {
      startGame(c); await wait(100);
      var A = c.w.DCP.App, e = A.grid.byId[A.grid.entries.filter(function (x) { return x.answer === "SET"; })[0].id];
      cellEl(c, e.cells[0].r, e.cells[0].c).click();
      if (A.getGame().sel.dir !== e.direction) cellEl(c, e.cells[0].r, e.cells[0].c).click();
      e.answer.split("").forEach(function (ch) { key(c, ch); });
      assert(A.getGame().solved[e.id], "mot résolu");
      eq(c.$("solved-count").textContent, "1 / 25");
      assert(cellEl(c, e.cells[0].r, e.cells[0].c).classList.contains("solved"));
      var before = A.getGame().points; key(c, "Z"); eq(A.getGame().points, before);
    });
  }, { browserOnly: true });

  function selectEntry(c, e) {
    var p = e.cells[0]; cellEl(c, p.r, p.c).click();
    if (c.w.DCP.Engine.activeEntry(c.w.DCP.App.getGame(), c.w.DCP.App.grid).id !== e.id) cellEl(c, p.r, p.c).click();
  }
  function entryOf(c, a) { return c.w.DCP.App.grid.entries.filter(function (x) { return x.answer === a; })[0]; }

  test("Aides à l'écran : compteurs, messages au-dessus des boutons, pénalités, épuisement indépendant", async function () {
    await withApp(1024, 768, async function (c) {
      startGame(c); await wait(100);
      var A = c.w.DCP.App, unm = entryOf(c, "UNMODIFIABLE"), split = entryOf(c, "SPLIT");
      c.$("aid-letter").click(); assert(/Sélectionne/.test(c.$("toast").textContent), "sélection requise"); eq(A.getGame().hints.letter, 0);
      assert(/Lettres révélées : 0\/5/.test(c.$("aid-letter-left").textContent)); assert(/Moitiés révélées : 0\/2/.test(c.$("aid-half-left").textContent));
      selectEntry(c, unm);
      for (var i = 1; i <= 5; i++) {
        c.$("aid-letter").click(); await wait(400);
        eq(A.getGame().hints.letter, i); assert(c.$("aid-letter-left").textContent === "Lettres révélées : " + i + "/5");
        eq(A.getGame().penaltyMs, i === 5 ? 3000 : 0, "pénalité de temps à l'utilisation " + i);
      }
      assert(c.$("aid-letter").disabled, "bouton lettres désactivé");
      eq(c.$("aid-msg-letter").textContent, "Vous avez consommé toutes vos aides de lettres (5/5).");
      var before = JSON.stringify(A.getGame().hints); c.$("aid-letter").click(); await wait(400); eq(JSON.stringify(A.getGame().hints), before, "pas de 6e utilisation");
      var msg = c.$("aid-msg-letter"), btn = c.$("aid-letter");
      assert(msg.getBoundingClientRect().bottom <= btn.getBoundingClientRect().top + 1, "message au-dessus du bouton");
      assert(!c.$("aid-half").disabled && !/consommé/.test(c.$("aid-msg-half").textContent), "l'autre aide reste active");
      selectEntry(c, split); c.$("aid-half").click(); await wait(400);
      eq(A.getGame().hints.half, 1); eq(A.getGame().penaltyMs, 18000); assert(c.$("aid-half-left").textContent === "Moitiés révélées : 1/2");
      assert(!c.$("aid-half").disabled);
      selectEntry(c, unm); c.$("aid-half").click(); await wait(400);
      assert(c.$("aid-half").disabled); eq(c.$("aid-msg-half").textContent, "Vous avez consommé toutes vos aides de moitié (2/2).");
      assert(c.$("aid-letter").disabled && c.$("aid-half").disabled, "les deux boutons désactivés");
      assert(!c.d.querySelector(".modal"), "messages intégrés, pas de fenêtre séparée");
      eq(A.getGame().errors, 0);
      var rem = c.w.DCP.Timer.remainingMs(A.getGame(), Date.now()); eq(A.getGame().penaltyMs, 33000); assert(rem <= 600000 - 33000 && rem > 600000 - 33000 - 20000, "chrono réduit d'au moins 33 s : " + rem);
    });
  }, { browserOnly: true });

  test("Double clic : une seule utilisation d'aide", async function () {
    await withApp(1024, 768, async function (c) {
      startGame(c); await wait(100); selectEntry(c, entryOf(c, "UNMODIFIABLE"));
      c.$("aid-letter").click(); c.$("aid-letter").click(); await wait(50);
      eq(c.w.DCP.App.getGame().hints.letter, 1);
    });
  }, { browserOnly: true });

  test("Une pénalité qui vide le chronomètre termine immédiatement la partie", async function () {
    var ns = "pen" + Date.now(); var f = await open(1024, 768, ns); var c = ctx(f);
    try {
      startGame(c, "Lina"); await wait(100);
      var A = c.w.DCP.App, g = A.getGame(); g.runStart = Date.now() - 590000;   // 10 s restantes
      selectEntry(c, entryOf(c, "UNMODIFIABLE")); c.$("aid-half").click(); await wait(300);
      assert(!c.$("screen-results").hidden, "résultats affichés"); eq(A.getGame().status, "finished");
      assert(/Fin de partie/.test(c.$("results-content").textContent) && !/Victoire/.test(c.$("results-content").textContent));
      var t = c.$("results-content").textContent;
      ["Score final", "Mots trouvés", "Questions faciles résolues", "Questions moyennes résolues", "première tentative", "Tentatives incorrectes", "Validations incorrectes",
        "Révéler une lettre", "Révéler la moitié", "Bonus de première tentative", "Bonus de temps", "Pénalités d'erreurs", "Pénalités de validation", "Pénalités de points", "Secondes retirées"
      ].forEach(function (k) { assert(t.indexOf(k) >= 0, "champ manquant : " + k); });
      assert(/15 s/.test(t), "secondes retirées affichées");
    } finally { f.remove(); }
  }, { browserOnly: true });

  test("Pause, actualisation sans remise à zéro (temps, pénalités, aides)", async function () {
    var ns = "refresh" + Date.now(); var f = await open(1024, 768, ns); var c = ctx(f);
    try {
      startGame(c); await wait(1300);
      var A = c.w.DCP.App; selectEntry(c, entryOf(c, "UNMODIFIABLE"));
      c.$("aid-half").click(); await wait(400); c.$("aid-letter").click(); await wait(400);
      c.$("btn-pause").click(); assert(!c.$("pause-overlay").hidden); assert(c.$("aid-letter").disabled && c.$("aid-half").disabled, "aides désactivées en pause");
      var t1 = c.$("timer").textContent; await wait(1300); eq(c.$("timer").textContent, t1, "chrono figé en pause");
      var played = A.getGame().elapsedMs, pen = A.getGame().penaltyMs; eq(pen, 15000);
      await new Promise(function (res) { f.onload = res; f.contentWindow.location.reload(); }); c = ctx(f); await wait(150);
      var A2 = c.w.DCP.App; assert(!c.$("screen-game").hidden); eq(A2.getGame().status, "paused");
      eq(A2.getGame().elapsedMs, played); eq(A2.getGame().penaltyMs, 15000); eq(A2.getGame().hints, { letter: 1, half: 1 });
      eq(c.$("timer").textContent, t1); assert(/Lettres révélées : 1\/5/.test(c.$("aid-letter-left").textContent));
      assert(c.d.querySelectorAll(".cell.revealed").length >= 2, "lettres révélées restaurées et verrouillées");
      c.$("btn-resume-game").click(); await wait(1100); assert(c.$("timer").textContent !== t1);
    } finally { f.remove(); }
  }, { browserOnly: true });

  test("Fin par expiration au retour, résultat unique, corrections et Rejouer (chrono remis à 10:00)", async function () {
    var ns = "expire" + Date.now(); var f = await open(1024, 768, ns); var c = ctx(f);
    try {
      startGame(c, "Nadia"); await wait(100);
      var g = c.w.DCP.App.getGame(); g.runStart = Date.now() - 601000; c.w.DCP.Storage.saveGame(g);
      await new Promise(function (res) { f.onload = res; f.contentWindow.location.reload(); }); c = ctx(f); await wait(200);
      assert(!c.$("screen-results").hidden, "résultats affichés");
      var txt = c.$("results-content").textContent;
      assert(/Fin de partie/.test(txt) && /Nadia/.test(txt) && /0 \/ 25/.test(txt) && /Score final/.test(txt));
      assert(c.d.querySelector(".remaining-list li") && !c.d.querySelector(".remaining-list .answer"), "corrections masquées par défaut");
      c.$("btn-corrections").click(); assert(c.d.querySelector(".remaining-list .answer"));
      eq(Object.keys(c.w.DCP.Storage.loadBest()).length, 1); c.w.DCP.App.endGame("timeout"); eq(Object.keys(c.w.DCP.Storage.loadBest()).length, 1);
      c.$("btn-replay").click(); await wait(100);
      assert(!c.$("screen-game").hidden, "Rejouer relance une partie");
      var G2 = c.w.DCP.App.getGame(); eq(G2.status, "playing"); eq(G2.player, "Nadia");
      eq([G2.points, G2.errors, G2.penaltyMs, G2.hints.letter, G2.hints.half, G2.events.length, Object.keys(G2.letters).length], [0, 0, 0, 0, 0, 0, 0]);
      assert(/^(10|09):\d\d$/.test(c.$("timer").textContent) && c.w.DCP.Timer.remainingMs(G2, Date.now()) > 599000, "chrono remis à 600 s");
      assert(/Lettres révélées : 0\/5/.test(c.$("aid-letter-left").textContent) && !c.$("aid-letter").disabled && !c.$("aid-half").disabled);
      assert(c.d.querySelectorAll(".cell.filled").length === 0 && c.d.querySelectorAll(".cell.solved").length === 0);
    } finally { f.remove(); }
  }, { browserOnly: true });

  test("Abandon : confirmation obligatoire, puis retour accueil", async function () {
    await withApp(1024, 768, async function (c) {
      startGame(c); await wait(100);
      c.$("btn-abandon").click(); assert(c.d.querySelector(".modal"), "confirmation");
      assert(c.w.DCP.App.getGame().status === "paused", "partie suspendue pendant la confirmation");
      c.d.querySelector(".modal .btn.ghost").click(); await wait(50);
      assert(c.w.DCP.App.getGame().status === "playing", "annuler reprend la partie");
      c.$("btn-abandon").click(); c.d.querySelector(".modal .btn.danger").click(); await wait(50);
      eq(c.w.DCP.App.getGame(), null); assert(!c.$("screen-home").hidden);
    });
  }, { browserOnly: true });
})(window);
