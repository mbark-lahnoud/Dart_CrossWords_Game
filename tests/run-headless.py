#!/usr/bin/env python3
"""Lance tests/tests.html dans Chromium headless via un serveur HTTP local (Playwright requis).
Usage : python3 tests/run-headless.py   (nécessite : pip install playwright && playwright install chromium)"""
import http.server, socketserver, threading, os, sys, functools
from playwright.sync_api import sync_playwright

root = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=root)
handler.log_message = lambda *a, **k: None
with socketserver.TCPServer(("127.0.0.1", 0), handler) as srv:
    port = srv.server_address[1]
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    with sync_playwright() as p:
        b = p.chromium.launch()
        page = b.new_page()
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.goto(f"http://127.0.0.1:{port}/tests/tests.html")
        page.wait_for_function("window.__results && window.__results.done", timeout=180000)
        res = page.evaluate("window.__results")
        b.close()
    srv.shutdown()
for r in res["results"]:
    tag = {"pass": "  OK   ", "fail": "  ÉCHEC", "skip": "  SKIP "}[r["status"]]
    print(tag, r["name"], ("-> " + r["note"]) if r.get("note") else "")
print(res["counts"], "erreurs JS:", errors)
sys.exit(1 if res["counts"]["fail"] or errors else 0)
