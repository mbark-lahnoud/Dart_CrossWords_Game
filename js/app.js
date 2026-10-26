/* Interface : écrans, grille, saisie, indices au maintien, aides, pause, sauvegarde et résultats. */
(function (g) {
  "use strict";
  var DCP = g.DCP, E = DCP.Engine, T = DCP.Timer, H = DCP.Hints, S = DCP.Storage, R = DCP.Results, Snd = DCP.Sound;
  var h = DCP.Dom.h, clear = DCP.Dom.clear;
  var doc = document;
  function $(id) { return doc.getElementById(id); }

  var P = DCP.PUZZLE;
  var grid = E.buildGrid(P);
  var game = null;
  var cellEls = [];
  var screenName = "home";
  var modals = [];
  var heldId = null;
  var showCorrections = false;
  var toastTimer = null;
  var lastShownSecond = -1;
  var announced = {};

  /* ------------------------------------------------------------------ */
  /* Utilitaires                                                         */
  /* ------------------------------------------------------------------ */
  function playing() { return !!game && game.status === "playing"; }
  function dirLabel(d) { return d === "H" ? "Horizontal" : "Vertical"; }
  function plural(n, one, many) { return n + " " + (n > 1 ? many : one); }
  function toast(msg) {
    var t = $("toast");
    t.textContent = msg;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.textContent = ""; }, 4500);
  }
  function save() { if (game) S.saveGame(game); }
  function srSay(msg) { $("sr-live").textContent = msg; }

  /* ------------------------------------------------------------------ */
  /* Règles                                                              */
  /* ------------------------------------------------------------------ */
  function rulesNode() {
    var items = [
      "La grille contient 25 mots sur Dart : 15 faciles et 10 moyens (10 sur les collections, 15 sur les fondamentaux). Tu disposes de 5 minutes.",
      "Clique sur une case puis tape directement les lettres. Flèches : naviguer. Espace ou nouveau clic sur la case : changer de direction. Entrée : mot suivant. Retour arrière ou Suppr : effacer.",
      "Les définitions sont cachées. Maintiens le numéro d'une entrée (clic enfoncé, doigt appuyé, ou touche Espace sur le numéro au clavier) : la définition s'affiche tant que tu maintiens.",
      "Un mot est vérifié dès que toutes ses cases sont remplies. Un mot correct est verrouillé. Une tentative complète incorrecte coûte 3 points, plus 5 points de pénalité de validation. Taper, effacer ou changer de case n'en coûte jamais.",
      "Deux aides : « Révéler une lettre » (5 fois ; les 4 premières gratuites, la 5e coûte 2 points et 3 secondes) et « Révéler la moitié » (2 fois ; chacune coûte 3 points et 15 secondes). Les lettres révélées sont verrouillées et le mot concerné perd son bonus de première tentative.",
      "Score : 10 points par mot facile, 15 par mot moyen, +10 si le mot est trouvé du premier coup sans aide, et +2 points par tranche de 10 secondes restantes si tu termines les 25 mots. Le score ne descend jamais sous zéro.",
      "Pause : le chronomètre s'arrête et la grille est masquée. Ta partie est sauvegardée automatiquement sur cet appareil."
    ];
    return h("ol", { class: "rules-list" }, items.map(function (t) { return h("li", { text: t }); }));
  }

  /* ------------------------------------------------------------------ */
  /* Modales                                                             */
  /* ------------------------------------------------------------------ */
  var modalSeq = 0;
  function openModal(opts) {
    var prevFocus = doc.activeElement;
    var id = "modal-title-" + (++modalSeq);
    var actions = h("div", { class: "row modal-actions" });
    var backdrop = h("div", { class: "modal-backdrop" });
    var dlg = h("div", { class: "modal" + (opts.small ? " small" : ""), role: "dialog", "aria-modal": "true", "aria-labelledby": id }, [
      h("h2", { class: "modal-title", id: id, text: opts.title })
    ]);
    if (opts.body) dlg.appendChild(opts.body);
    var api = { closed: false };
    function close(value) {
      if (api.closed) return; api.closed = true;
      if (backdrop.parentNode) backdrop.parentNode.removeChild(backdrop);
      modals = modals.filter(function (m) { return m !== api; });
      if (prevFocus && prevFocus.focus && doc.body.contains(prevFocus)) { try { prevFocus.focus({ preventScroll: true }); } catch (e) { /* ignoré */ } }
      if (opts.onClose) opts.onClose(value);
    }
    api.close = close;
    (opts.buttons || []).forEach(function (b) {
      var btn = h("button", { type: "button", class: "btn " + (b.cls || ""), text: b.label });
      btn.addEventListener("click", function () { close(b.value); });
      actions.appendChild(btn);
    });
    dlg.appendChild(actions);
    backdrop.appendChild(dlg);
    backdrop.addEventListener("keydown", function (e) {
      if (e.key === "Escape") { e.stopPropagation(); close(opts.escValue); return; }
      if (e.key === "Tab") {
        var f = dlg.querySelectorAll("button, [href], input, [tabindex]:not([tabindex='-1'])");
        if (!f.length) return;
        var first = f[0], last = f[f.length - 1];
        if (e.shiftKey && doc.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && doc.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    });
    $("modal-root").appendChild(backdrop);
    modals.push(api);
    var focusBtn = actions.querySelector("." + (opts.focusClass || "primary")) || actions.querySelector("button");
    if (focusBtn) focusBtn.focus({ preventScroll: true });
    return api;
  }
  function closeAllModals() { modals.slice().forEach(function (m) { m.close(); }); }

  function confirmDialog(o) {
    return new Promise(function (resolve) {
      openModal({
        title: o.title, small: true, body: h("p", { class: "modal-text", text: o.text }), escValue: false,
        focusClass: o.focusClass || "ghost",
        buttons: [{ label: o.cancel || "Annuler", value: false, cls: "ghost" }, { label: o.ok, value: true, cls: o.danger ? "danger" : "primary" }],
        onClose: function (v) { resolve(v === true); }
      });
    });
  }

  /* ------------------------------------------------------------------ */
  /* Écrans                                                              */
  /* ------------------------------------------------------------------ */
  function showScreen(name) {
    screenName = name;
    ["home", "game", "results"].forEach(function (n) { $("screen-" + n).hidden = n !== name; });
    window.scrollTo(0, 0);
    if (name === "game") { requestAnimationFrame(fitGrid); }
  }

  function showHome() {
    hideHint();
    showScreen("home");
    $("player-name").value = "";
    $("name-error").hidden = true;
    $("player-name").removeAttribute("aria-invalid");
    refreshHomeCards();
    var title = $("home-title"); title.setAttribute("tabindex", "-1");
  }

  function refreshHomeCards() {
    var resume = $("resume-card"), last = $("last-result-card");
    resume.hidden = true; last.hidden = true;
    if (!game) return;
    if (game.status === "finished") {
      last.hidden = false;
      $("last-result-text").textContent = game.player + " : " + game.result.solved + " / " + game.result.total + " mots, " +
        (game.result.success ? "réussite." : "temps écoulé.");
    } else {
      resume.hidden = false;
      $("resume-text").textContent = game.player + " · " + Engine_solvedText() + " · temps restant " +
        T.format(T.remainingMs(game, Date.now())) + (game.status === "paused" ? " (en pause)" : "") + ".";
    }
  }
  function Engine_solvedText() { return E.solvedCount(game) + " / " + grid.entries.length + " mots"; }

  /* ------------------------------------------------------------------ */
  /* Rendu de la grille                                                  */
  /* ------------------------------------------------------------------ */
  function renderGrid() {
    var gridEl = $("grid");
    clear(gridEl);
    cellEls = [];
    gridEl.style.setProperty("--cols", grid.cols);
    gridEl.style.setProperty("--rows", grid.rows);
    for (var r = 0; r < grid.rows; r++) {
      var rowEl = h("div", { class: "grid-row", role: "row" });
      cellEls[r] = [];
      for (var c = 0; c < grid.cols; c++) {
        var cell = grid.cells[r][c], el;
        if (cell.letter) {
          el = h("div", { class: "cell", role: "gridcell", "data-r": r, "data-c": c }, [
            cell.number ? h("span", { class: "num", "aria-hidden": "true", text: String(cell.number) }) : null,
            h("span", { class: "ch" })
          ]);
        } else {
          el = h("div", { class: "cell blk", role: "gridcell", "aria-hidden": "true" });
        }
        rowEl.appendChild(el);
        cellEls[r][c] = el;
      }
      gridEl.appendChild(rowEl);
    }
  }

  function renderClues() {
    var lh = $("clues-h"), lv = $("clues-v");
    clear(lh); clear(lv);
    grid.entries.forEach(function (e) {
      var btn = h("button", {
        type: "button", class: "clue-btn " + e.difficulty, "data-id": e.id,
        "aria-label": "Entrée " + e.number + ", " + (e.direction === "H" ? "horizontale" : "verticale") + ", " + plural(e.length, "lettre", "lettres") +
          ", niveau " + R.difficultyLabel(e.difficulty) + ". Maintenir pour afficher la définition."
      }, [
        h("span", { class: "cn", text: String(e.number) }),
        h("span", { class: "cm", text: e.length + " lettres" }),
        h("span", { class: "cd", "aria-hidden": "true" })
      ]);
      bindHold(btn, e.id);
      (e.direction === "H" ? lh : lv).appendChild(h("li", {}, [btn]));
    });
  }

  function updateGrid() {
    var active = game ? E.activeEntry(game, grid) : null;
    var inActive = {};
    if (active) active.cells.forEach(function (p) { inActive[p.r + "," + p.c] = 1; });
    for (var r = 0; r < grid.rows; r++) {
      for (var c = 0; c < grid.cols; c++) {
        var cell = grid.cells[r][c];
        if (!cell.letter) continue;
        var el = cellEls[r][c], k = r + "," + c;
        var letter = game ? E.getLetter(game, r, c) : "";
        var chEl = el.lastChild;
        if (chEl.textContent !== letter) chEl.textContent = letter;
        var solved = game && ((cell.across && game.solved[cell.across]) || (cell.down && game.solved[cell.down]));
        var cls = "cell" +
          (letter ? " filled" : "") +
          (game && game.revealed[k] ? " revealed" : "") +
          (solved ? " solved" : "") +
          (inActive[k] ? " active" : "") +
          (game && game.sel && game.sel.r === r && game.sel.c === c ? " sel" : "");
        if (el.className.replace(/ ?flash/, "") !== cls) el.className = cls + (/flash/.test(el.className) ? " flash" : "");
        el.setAttribute("aria-selected", game && game.sel && game.sel.r === r && game.sel.c === c ? "true" : "false");
        el.setAttribute("aria-label", (cell.number ? "Numéro " + cell.number + ", " : "") + "ligne " + (r + 1) + ", colonne " + (c + 1) + ", " +
          (letter ? letter : "vide") + (game && game.revealed[k] ? ", révélée" : "") + (solved ? ", mot résolu" : ""));
      }
    }
  }

  var AID_NAMES = { letter: "Lettres révélées", half: "Moitiés révélées" };
  var CONSUMED = {
    letter: "Vous avez consommé toutes vos aides de lettres (5/5).",
    half: "Vous avez consommé toutes vos aides de moitié (2/2)."
  };
  function costText(c) { return c.points === 0 && c.seconds === 0 ? "gratuite" : "−" + c.points + " point" + (c.points > 1 ? "s" : "") + " et −" + c.seconds + " s"; }
  /* Compteurs, messages au-dessus des boutons et état activé/désactivé : indépendants pour chaque aide. */
  function updateAids() {
    var up = playing();
    ["letter", "half"].forEach(function (kind) {
      var max = E.CONFIG.AIDS[kind].max, used = H.used(game, kind), btn = $("aid-" + kind), msg = $("aid-msg-" + kind);
      var out = H.exhausted(game, kind);
      $("aid-" + kind + "-left").textContent = AID_NAMES[kind] + " : " + used + "/" + max;
      btn.disabled = !up || out;
      btn.classList.toggle("used", out);
      msg.classList.toggle("exhausted", out);
      if (out) msg.textContent = CONSUMED[kind];
      else {
        var c = H.nextCost(game, kind);
        msg.textContent = (kind === "letter" && used < 4)
          ? "Encore " + (4 - used) + " utilisation" + (4 - used > 1 ? "s" : "") + " gratuite" + (4 - used > 1 ? "s" : "") + "."
          : "Prochaine utilisation : " + costText(c) + ".";
      }
    });
  }

  function updateStatus() {
    if (!game) return;
    var solved = E.solvedCount(game), total = grid.entries.length, pct = Math.round(solved * 100 / total);
    $("solved-count").textContent = solved + " / " + total;
    $("error-count").textContent = String(game.errors);
    $("progress-text").textContent = pct + " %";
    $("progress-fill").style.width = pct + "%";
    $("progress").setAttribute("aria-valuenow", String(pct));
    var active = E.activeEntry(game, grid);
    $("active-info").textContent = active
      ? "Mot n° " + active.number + " · " + dirLabel(active.direction) + " · " + plural(active.length, "lettre", "lettres") + (game.solved[active.id] ? " · résolu" : "")
      : "Sélectionne une case pour commencer.";
    $("score-value").textContent = String(game.points);
    updateAids();
    var chips = doc.querySelectorAll(".clue-btn");
    for (var i = 0; i < chips.length; i++) {
      var id = chips[i].getAttribute("data-id");
      chips[i].classList.toggle("solved", !!game.solved[id]);
      chips[i].classList.toggle("current", !!active && active.id === id);
    }
    var paused = game.status === "paused";
    $("pause-overlay").hidden = !paused;
    var pb = $("btn-pause");
    pb.textContent = paused ? "Reprendre" : "Pause";
    pb.setAttribute("aria-label", paused ? "Reprendre la partie" : "Mettre en pause");
    pb.disabled = game.status === "finished";
    $("grid-wrap").classList.toggle("paused", paused);
  }

  function refresh() { updateGrid(); updateStatus(); }

  /* ------------------------------------------------------------------ */
  /* Dimensionnement : toute la grille toujours visible, sans défilement */
  /* ------------------------------------------------------------------ */
  var lastCell = 0;
  function fitGrid() {
    if (screenName !== "game") return;
    var col = $("grid-col"), wrap = $("grid-wrap"), gridEl = $("grid");
    var cs = getComputedStyle(col);
    var pad = parseFloat(getComputedStyle(wrap).paddingLeft) || 0;
    var availW = col.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - 2 * pad;
    var top = wrap.getBoundingClientRect().top + window.pageYOffset;
    var availH = window.innerHeight - top - 2 * pad - 14;
    availH = Math.max(availH, 150);
    function calc(gap) {
      return Math.floor(Math.min((availW - (grid.cols - 1) * gap) / grid.cols, (availH - (grid.rows - 1) * gap) / grid.rows));
    }
    var gap = 2, size = calc(gap);
    if (size < 26) { gap = 1; size = calc(gap); }
    size = Math.max(10, Math.min(60, size));
    var key = size + "/" + gap;
    if (key === lastCell) return;
    lastCell = key;
    gridEl.style.setProperty("--cell", size + "px");
    gridEl.style.setProperty("--gap", gap + "px");
    gridEl.style.setProperty("--fs", Math.max(9, Math.round(size * 0.58)) + "px");
    gridEl.style.setProperty("--nfs", Math.max(6, Math.round(size * 0.3)) + "px");
  }
  var fitQueued = false;
  function queueFit() {
    if (fitQueued) return; fitQueued = true;
    requestAnimationFrame(function () { fitQueued = false; lastCell = 0; fitGrid(); });
  }

  /* ------------------------------------------------------------------ */
  /* Saisie                                                              */
  /* ------------------------------------------------------------------ */
  function flashEntry(id) {
    var e = grid.byId[id];
    e.cells.forEach(function (p) {
      var el = cellEls[p.r][p.c]; el.classList.add("flash");
      setTimeout(function () { el.classList.remove("flash"); }, 700);
    });
  }

  function afterKey(res) {
    refresh();
    if (res.correct.length) {
      res.correct.forEach(flashEntry);
      Snd.play("ok");
      toast("Mot n° " + grid.byId[res.correct[0]].number + " validé.");
    } else if (res.wrong.length) {
      Snd.play("bad");
      toast("Le mot n° " + grid.byId[res.wrong[0]].number + " n'est pas correct. Corrige tes lettres.");
    }
    save();
    if (E.allSolved(game, grid)) endGame("success");
  }

  function handleKey(k) {
    if (!playing()) return false;
    var res = E.applyKey(game, grid, k);
    if (!res.handled) return false;
    if (res.changed || res.correct.length || res.wrong.length) afterKey(res);
    return true;
  }

  function focusInput() {
    var inp = $("grid-input");
    try { inp.focus({ preventScroll: true }); } catch (e) { inp.focus(); }
  }

  function bindInput() {
    var inp = $("grid-input"), wrap = $("grid-wrap"), prev = "";
    inp.addEventListener("focus", function () {
      wrap.classList.add("focused");
      if (playing() && !game.sel) { E.selectEntry(game, grid, E.nextEntryId(game, grid, null, 1) || grid.entries[0].id); refresh(); }
    });
    inp.addEventListener("blur", function () { wrap.classList.remove("focused"); });
    inp.addEventListener("keydown", function (e) {
      if (e.ctrlKey || e.metaKey || e.altKey || e.key === "Tab") return;
      if (e.key === "Escape") { inp.blur(); return; }
      if (e.isComposing || e.keyCode === 229 || e.key === "Unidentified" || e.key === "Process") return;
      if (handleKey(e.key)) e.preventDefault();
    });
    inp.addEventListener("beforeinput", function (e) {
      if (e.inputType === "deleteContentBackward") { e.preventDefault(); handleKey("Backspace"); }
    });
    inp.addEventListener("input", function (e) {
      var v = inp.value, add = "";
      if (e.isComposing) {
        add = (v.length > prev.length && v.indexOf(prev) === 0) ? v.slice(prev.length) : (v !== prev ? v.slice(-1) : "");
        prev = v;
      } else { add = v; inp.value = ""; prev = ""; }
      for (var i = 0; i < add.length; i++) handleKey(add.charAt(i));
    });
    inp.addEventListener("compositionend", function () { inp.value = ""; prev = ""; });

    $("grid").addEventListener("click", function (e) {
      var el = e.target.closest ? e.target.closest(".cell") : null;
      if (!el || el.classList.contains("blk") || !playing()) return;
      var r = +el.getAttribute("data-r"), c = +el.getAttribute("data-c");
      if (E.selectCell(game, grid, r, c)) { refresh(); save(); focusInput(); }
    });

    // Frappe directe quand rien n'a le focus (ex. après un clic sur le fond de la page).
    doc.addEventListener("keydown", function (e) {
      if (screenName !== "game" || !playing() || modals.length) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (doc.activeElement !== doc.body) return;
      if (/^Arrow/.test(e.key) || e.key === "Backspace" || (e.key.length === 1 && /[A-Za-z]/.test(e.key))) {
        focusInput();
        if (handleKey(e.key)) e.preventDefault();
      }
    });
  }

  /* ------------------------------------------------------------------ */
  /* Indices au maintien                                                 */
  /* ------------------------------------------------------------------ */
  /* Règle unique : un indice n'existe que pendant un maintien (souris, doigt ou touche Espace/Entrée
     sur le numéro). Toute autre interaction ou tout relâchement le masque immédiatement, et seul un
     NOUVEAU maintien (pointerdown ou nouvelle pression non répétée) peut le réafficher. */
  var heldKind = null;            // "pointer" | "key" | null
  function showHint(id, anchor, kind) {
    if (!playing()) return;
    var e = grid.byId[id], pop = $("hint-pop");
    heldId = id; heldKind = kind || "pointer";
    $("hint-pop-title").textContent = "Mot n° " + e.number + " · " + dirLabel(e.direction) + " · " + plural(e.length, "lettre", "lettres");
    $("hint-pop-text").textContent = e.clue;
    pop.hidden = false;
    var a = anchor.getBoundingClientRect(), w = pop.offsetWidth, hh = pop.offsetHeight, vw = doc.documentElement.clientWidth;
    var left = Math.min(Math.max(8, a.left + a.width / 2 - w / 2), vw - w - 8);
    var barBottom = $("game-bar").getBoundingClientRect().bottom;
    var top = a.top - hh - 10;
    if (top < barBottom + 6) top = a.bottom + 10;
    pop.style.left = left + "px"; pop.style.top = top + "px";
  }
  function hideHint() {
    heldId = null; heldKind = null;
    var pop = $("hint-pop");
    if (!pop.hidden) pop.hidden = true;
  }
  function isHoldKey(k) { return k === " " || k === "Enter" || k === "Spacebar"; }

  function bindHold(btn, id) {
    // Début du maintien : souris (bouton principal) ou doigt.
    btn.addEventListener("pointerdown", function (e) {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      if (!playing()) return;
      E.selectEntry(game, grid, id); refresh();
      showHint(id, btn, "pointer");
    });
    // Fin du maintien : relâchement, annulation, sortie du pointeur.
    ["pointerup", "pointercancel", "pointerleave", "lostpointercapture"].forEach(function (ev) { btn.addEventListener(ev, hideHint); });
    btn.addEventListener("contextmenu", function (e) { e.preventDefault(); });   // menu contextuel du maintien tactile
    btn.addEventListener("dragstart", function (e) { e.preventDefault(); });
    // Clavier : maintien de Espace/Entrée sur le numéro ; la répétition automatique ne réaffiche rien.
    btn.addEventListener("keydown", function (e) {
      if (!isHoldKey(e.key)) return;
      e.preventDefault();
      if (!e.repeat && playing()) { E.selectEntry(game, grid, id); refresh(); showHint(id, btn, "key"); }
    });
    btn.addEventListener("keyup", function (e) { if (isHoldKey(e.key)) { e.preventDefault(); hideHint(); } });
    btn.addEventListener("blur", hideHint);
    btn.addEventListener("click", function (e) { e.preventDefault(); hideHint(); });   // un clic simple ne laisse rien affiché
  }

  /* Gardes globales (phase de capture, sans jamais bloquer ni détourner l'événement :
     la grille, les boutons et le clavier continuent de fonctionner normalement). */
  function installHintGuards() {
    // Toute nouvelle interaction pointeur/tactile (ailleurs, autre doigt, autre bouton) masque l'indice.
    // Le pointerdown du numéro lui-même repasse ensuite par showHint() pour le nouveau maintien.
    doc.addEventListener("pointerdown", function () { if (heldId) hideHint(); }, true);
    // Relâchement n'importe où dans la page (même si le pointeur a quitté le numéro).
    doc.addEventListener("pointerup", function () { if (heldId) hideHint(); }, true);
    doc.addEventListener("pointercancel", function () { if (heldId) hideHint(); }, true);
    doc.addEventListener("touchend", function () { if (heldId) hideHint(); }, true);
    doc.addEventListener("touchcancel", function () { if (heldId) hideHint(); }, true);
    // Toute autre touche du clavier masque l'indice (seule la répétition de la touche de maintien est ignorée).
    doc.addEventListener("keydown", function (e) {
      if (!heldId) return;
      if (heldKind === "key" && e.repeat && isHoldKey(e.key)) return;
      hideHint();
    }, true);
    // Défilement, molette, redimensionnement, clic droit, sélection : autre interaction.
    ["wheel", "scroll", "contextmenu", "selectstart"].forEach(function (ev) {
      doc.addEventListener(ev, function () { if (heldId) hideHint(); }, { capture: true, passive: true });
    });
    window.addEventListener("resize", hideHint);
    window.addEventListener("blur", hideHint);
  }

  /* ------------------------------------------------------------------ */
  /* Aides                                                               */
  /* ------------------------------------------------------------------ */
  var AID_MSG = {
    "no-selection": "Sélectionne d'abord un mot dans la grille.",
    "solved": "Ce mot est déjà résolu.",
    "nothing": "Aucune lettre à révéler dans ce mot. L'aide n'est pas consommée.",
    "exhausted": "Cette aide est épuisée.",
    "inactive": "Les aides sont désactivées."
  };
  var lastAidAt = { letter: 0, half: 0 };
  function useAid(kind) {
    if (!playing()) return;
    var now = Date.now();
    if (now - lastAidAt[kind] < 350) return;           // un double clic ne compte que comme une utilisation
    if (H.exhausted(game, kind)) { updateAids(); return; }
    var active = E.activeEntry(game, grid), id = active ? active.id : null;
    var res = kind === "letter" ? H.revealLetter(game, grid, id, null, now) : H.revealHalf(game, grid, id, null, now);
    if (!res.ok) { toast(AID_MSG[res.reason]); return; }
    lastAidAt[kind] = now;                              // seules les utilisations valides arment l'anti double clic
    res.solved.forEach(flashEntry);
    if (res.solved.length) Snd.play("ok");
    lastShownSecond = -1;
    refresh(); updateTimer(T.remainingMs(game, now)); save();
    var n = res.cells.length;
    toast((kind === "letter" ? "Lettre révélée" : n + " lettre" + (n > 1 ? "s" : "") + " révélée" + (n > 1 ? "s" : "")) +
      (res.cost.points || res.cost.seconds ? " (−" + res.cost.points + " point" + (res.cost.points > 1 ? "s" : "") + ", −" + res.cost.seconds + " s)." : " (gratuit)."));
    if (res.timeUp) endGame("timeout");                 // la pénalité de temps a vidé le chronomètre
    else if (E.allSolved(game, grid)) endGame("success");
    else if (window.matchMedia && matchMedia("(pointer:fine)").matches) focusInput();
  }

  /* ------------------------------------------------------------------ */
  /* Cycle de partie                                                     */
  /* ------------------------------------------------------------------ */
  function startFlow() {
    var input = $("player-name");
    var name = input.value.replace(/\s+/g, " ").trim();
    if (!name) {
      $("name-error").hidden = false;
      input.setAttribute("aria-invalid", "true");
      input.focus();
      return;
    }
    $("name-error").hidden = true; input.removeAttribute("aria-invalid");
    var go = function () { beginGame(name); };
    if (game && game.status !== "finished") {
      confirmDialog({
        title: "Remplacer la partie en cours ?",
        text: "Une partie de " + game.player + " est déjà sauvegardée. En commencer une nouvelle l'abandonnera définitivement.",
        ok: "Abandonner et commencer", cancel: "Garder la partie", danger: true
      }).then(function (yes) { if (yes) go(); });
    } else go();
  }

  function beginGame(name) {
    S.clearGame();
    game = E.newGame(name, Date.now());
    lastShownSecond = -1; announced = {}; showCorrections = false;
    save();
    enterGameScreen();
  }

  function enterGameScreen() {
    showScreen("game");
    refresh();
    updateTimer(T.remainingMs(game, Date.now()));
    queueFit();
  }

  function resumeFlow() {
    if (!game || game.status === "finished") return;
    if (game.status === "paused") T.resume(game, Date.now());
    save();
    enterGameScreen();
  }

  function setPause(on) {
    if (!game) return;
    if (on && game.status === "playing") {
      T.pause(game, Date.now()); hideHint(); $("grid-input").blur();
    } else if (!on && game.status === "paused") {
      T.resume(game, Date.now());
    } else return;
    lastShownSecond = -1; updateTimer(T.remainingMs(game, Date.now()));
    refresh(); save();
    if (!on) { var b = $("btn-pause"); b.focus({ preventScroll: true }); }
  }

  function abandonFlow() {
    if (!game) return;
    var wasPlaying = playing();
    if (wasPlaying) setPause(true);
    confirmDialog({
      title: "Abandonner la partie ?",
      text: "Ta progression, tes aides et ton chronomètre seront perdus. Tu devras saisir ton nom pour recommencer.",
      ok: "Abandonner et recommencer", cancel: "Continuer à jouer", danger: true
    }).then(function (yes) {
      if (yes) { S.clearGame(); game = null; hideHint(); showHome(); }
      else if (wasPlaying) setPause(false);
    });
  }

  function goHomeFromGame() {
    if (playing()) setPause(true);
    save();
    showHome();
  }

  function endGame(reason) {
    if (!game || game.status === "finished") return;
    var now = Date.now();
    if (!R.finishGame(game, grid, reason, now)) return;
    hideHint(); closeAllModals();
    var upd = R.updateBest(S.loadBest(), game.result, now);
    S.saveBest(upd.best);
    game.result.newBest = upd.improved;
    game.bestRecorded = true;
    save();
    refresh();
    Snd.play("end");
    showResults();
  }

  function bestInfoFor(result) {
    var entry = S.loadBest()[S.playerKey(result.player)];
    return entry ? { entry: entry, improved: !!result.newBest } : null;
  }

  function showResults() {
    showScreen("results");
    R.render($("results-content"), game, grid, bestInfoFor(game.result), showCorrections);
    var b = $("btn-corrections");
    b.textContent = showCorrections ? "Masquer les corrections" : "Voir les corrections";
    b.setAttribute("aria-expanded", showCorrections ? "true" : "false");
    var t = $("result-title"); if (t) t.focus({ preventScroll: true });
  }

  /* Rejouer : nouvelle partie immédiate pour le même joueur (grille, score, bonus, pénalités, chrono 5:00 et aides remis à zéro). */
  function replayFlow() {
    var name = game ? game.player : "";
    if (!name) { leaveResults(); return; }
    beginGame(name);
  }

  function leaveResults() {
    S.clearGame(); game = null; showCorrections = false;
    showHome();
  }

  /* ------------------------------------------------------------------ */
  /* Chronomètre                                                         */
  /* ------------------------------------------------------------------ */
  function updateTimer(remaining) {
    var sec = Math.ceil(remaining / 1000);
    if (sec !== lastShownSecond) {
      lastShownSecond = sec;
      var el = $("timer");
      el.textContent = T.format(remaining);
      el.classList.toggle("warn", sec <= 60);
      [120, 60, 30].forEach(function (m) {
        if (sec <= m && !announced[m] && sec > 0) { announced[m] = 1; srSay("Il reste " + (m >= 60 ? m / 60 + " minute" + (m > 60 ? "s" : "") : m + " secondes") + "."); }
      });
    }
  }
  var ticker = T.createTicker({
    getGame: function () { return game; },
    onTick: function (remaining, gm) { if (screenName === "game" && gm.status !== "finished") updateTimer(remaining); },
    onExpire: function () { endGame("timeout"); },
    intervalMs: 250
  });

  /* ------------------------------------------------------------------ */
  /* Initialisation                                                      */
  /* ------------------------------------------------------------------ */
  function syncSound(on) {
    Snd.enabled = on;
    $("opt-sound-home").checked = on;
    var b = $("btn-sound");
    b.setAttribute("aria-pressed", on ? "true" : "false");
    b.textContent = on ? "Sons activés" : "Sons coupés";
    b.setAttribute("aria-label", on ? "Couper les sons" : "Activer les sons");
  }
  function setSound(on) { syncSound(on); S.saveSettings({ sound: on }); }

  function showBanner(msg) {
    var b = $("storage-warning"); b.textContent = msg; b.hidden = false;
  }

  function init() {
    S.onWarning = showBanner;
    S.init();
    var check = E.verifyPuzzle(P);
    if (!check.ok) { showBanner("Erreur interne de grille : " + check.errors.join(" | ")); $("btn-start").disabled = true; }

    $("rules-content").appendChild(rulesNode());
    renderGrid(); renderClues(); bindInput();
    syncSound(S.loadSettings().sound);

    $("btn-start").addEventListener("click", startFlow);
    $("player-name").addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); startFlow(); } });
    $("player-name").addEventListener("input", function () { if ($("player-name").value.trim()) { $("name-error").hidden = true; this.removeAttribute("aria-invalid"); } });
    $("opt-sound-home").addEventListener("change", function () { setSound(this.checked); });
    $("btn-sound").addEventListener("click", function () { setSound(!Snd.enabled); });
    $("btn-resume").addEventListener("click", resumeFlow);
    $("btn-discard").addEventListener("click", function () {
      confirmDialog({ title: "Abandonner la partie ?", text: "La sauvegarde de " + (game ? game.player : "") + " sera supprimée définitivement.", ok: "Abandonner", cancel: "Garder la partie", danger: true })
        .then(function (yes) { if (yes) { S.clearGame(); game = null; showHome(); } });
    });
    $("btn-last-result").addEventListener("click", function () { if (game && game.status === "finished") showResults(); });
    $("btn-pause").addEventListener("click", function () { setPause(game && game.status === "playing"); });
    $("btn-resume-game").addEventListener("click", function () { setPause(false); });
    $("btn-rules").addEventListener("click", function () {
      openModal({ title: "Règles du jeu", body: h("div", { class: "rules" }, [rulesNode(), h("p", { class: "modal-text", text: "Le chronomètre continue pendant que cette fenêtre est ouverte." })]), escValue: true, buttons: [{ label: "Fermer", value: true, cls: "primary" }] });
    });
    $("btn-abandon").addEventListener("click", abandonFlow);
    $("btn-home").addEventListener("click", goHomeFromGame);
    $("aid-letter").addEventListener("click", function () { useAid("letter"); });
    $("aid-half").addEventListener("click", function () { useAid("half"); });
        $("btn-replay").addEventListener("click", replayFlow);
    $("btn-results-home").addEventListener("click", leaveResults);
    $("btn-corrections").addEventListener("click", function () { showCorrections = !showCorrections; showResults(); });

    window.addEventListener("resize", queueFit);
    window.addEventListener("orientationchange", queueFit);
    if (window.ResizeObserver) new ResizeObserver(queueFit).observe($("grid-col"));
    doc.addEventListener("visibilitychange", function () {
      if (doc.hidden) { hideHint(); save(); } else ticker.tick();
    });
    window.addEventListener("pagehide", save);
    installHintGuards();
    setInterval(function () { if (game && game.status !== "finished") save(); }, 5000);

    // Restauration d'une éventuelle partie sauvegardée.
    var loaded = S.loadGame();
    if (loaded.error) showBanner("La sauvegarde précédente était illisible ou d'une version incompatible : elle a été mise de côté et une nouvelle partie peut commencer.");
    if (loaded.game) {
      game = loaded.game;
      lastShownSecond = -1; announced = {};
      if (game.status === "finished") { showResults(); }
      else if (T.isExpired(game, Date.now())) { enterGameScreen(); endGame("timeout"); }
      else enterGameScreen();
    } else showHome();
    ticker.start();
  }

  DCP.App = {
    getGame: function () { return game; }, grid: grid,
    handleKey: handleKey, endGame: endGame, fitGrid: fitGrid
  };
  if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", init); else init();
})(typeof window !== "undefined" ? window : globalThis);
