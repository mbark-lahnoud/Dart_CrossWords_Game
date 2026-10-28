#!/usr/bin/env python3
"""Test tactile réel (événements Chromium via CDP, appareil mobile émulé) : l'indice reste affiché pendant
tout l'appui long et disparaît au relâchement. Usage : python3 tests/run-touch.py (Playwright requis)."""
import http.server, socketserver, threading, os, sys, functools
from playwright.sync_api import sync_playwright
root = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
h = functools.partial(http.server.SimpleHTTPRequestHandler, directory=root); h.log_message = lambda *a, **k: None
ok = True
def check(name, cond):
    global ok; print(("  OK    " if cond else "  ÉCHEC ") + name); ok = ok and cond
with socketserver.TCPServer(("127.0.0.1", 0), h) as srv:
    port = srv.server_address[1]; threading.Thread(target=srv.serve_forever, daemon=True).start()
    with sync_playwright() as p:
        b = p.chromium.launch()
        ctx = b.new_context(viewport={"width": 390, "height": 844}, has_touch=True, is_mobile=True, device_scale_factor=2)
        pg = ctx.new_page(); errs = []; pg.on("pageerror", lambda e: errs.append(str(e)))
        events = []
        pg.goto(f"http://127.0.0.1:{port}/index.html?ns=touch")
        pg.fill("#player-name", "Mobile"); pg.tap("#btn-start"); pg.wait_for_timeout(300)
        pg.evaluate("""() => { window.__ev = []; ['contextmenu','selectstart','pointerleave','pointercancel','lostpointercapture','pointerup'].forEach(t =>
            document.addEventListener(t, e => window.__ev.push(t), true)); }""")
        btn = pg.locator(".clue-btn").first
        btn.scroll_into_view_if_needed(); pg.wait_for_timeout(200)
        box = btn.bounding_box(); x = box["x"] + box["width"] / 2; y = box["y"] + box["height"] / 2
        cdp = ctx.new_cdp_session(pg)
        cdp.send("Input.dispatchTouchEvent", {"type": "touchStart", "touchPoints": [{"x": x, "y": y}]})
        pg.wait_for_timeout(150)
        check("indice visible dès le contact", pg.evaluate("!document.getElementById('hint-pop').hidden"))
        for ms in (500, 1000, 1500, 2500):
            pg.wait_for_timeout(ms - (0 if ms == 500 else {1000: 500, 1500: 1000, 2500: 1500}[ms]))
            check(f"indice toujours visible ~{ms} ms (doigt posé)", pg.evaluate("!document.getElementById('hint-pop').hidden"))
        cdp.send("Input.dispatchTouchEvent", {"type": "touchEnd", "touchPoints": []})
        pg.wait_for_timeout(150)
        check("indice masqué au relâchement du doigt", pg.evaluate("document.getElementById('hint-pop').hidden"))
        print("  événements observés pendant l'appui :", pg.evaluate("window.__ev"))
        # un simple tap ne laisse rien d'affiché
        btn.tap(); pg.wait_for_timeout(300)
        check("un simple tap ne laisse pas l'indice", pg.evaluate("document.getElementById('hint-pop').hidden"))
        check("aucune erreur JavaScript", not errs)
        b.close()
    srv.shutdown()
sys.exit(0 if ok else 1)
