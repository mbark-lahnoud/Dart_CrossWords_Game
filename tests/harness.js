/* Mini framework de test (sans dépendance), utilisable dans le navigateur et sous Node. */
(function (g) {
  "use strict";
  var tests = [];
  var T = g.DCPTest = {
    test: function (name, fn, opts) { tests.push({ name: name, fn: fn, browserOnly: !!(opts && opts.browserOnly) }); },
    assert: function (cond, msg) { if (!cond) throw new Error(msg || "assertion fausse"); },
    eq: function (a, b, msg) {
      var x = JSON.stringify(a), y = JSON.stringify(b);
      if (x !== y) throw new Error((msg ? msg + " : " : "") + "attendu " + y + ", obtenu " + x);
    },
    skip: function (why) { var e = new Error(why); e.skip = true; throw e; },
    run: async function (env) {
      var out = [];
      for (var i = 0; i < tests.length; i++) {
        var t = tests[i];
        if (t.browserOnly && env !== "browser") { out.push({ name: t.name, status: "skip", note: "nécessite un navigateur" }); continue; }
        try { await t.fn(); out.push({ name: t.name, status: "pass" }); }
        catch (e) { out.push({ name: t.name, status: e.skip ? "skip" : "fail", note: e.message }); }
      }
      return out;
    }
  };
})(typeof window !== "undefined" ? window : globalThis);
