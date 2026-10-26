/* Exécute les tests de logique sous Node : node tests/run-node.js */
const fs = require("fs"), path = require("path"), vm = require("vm");
const root = path.join(__dirname, "..");
const ctx = vm.createContext({ console, setInterval, clearInterval, setTimeout, clearTimeout });
ctx.globalThis = ctx;
["js/crossword-data.js", "js/crossword-engine.js", "js/timer.js", "js/hints.js", "js/storage.js", "js/results.js", "tests/harness.js", "tests/tests-core.js"]
  .forEach(f => vm.runInContext(fs.readFileSync(path.join(root, f), "utf8"), ctx, { filename: f }));
ctx.DCPTest.run("node").then(out => {
  let fail = 0, pass = 0, skip = 0;
  out.forEach(r => {
    if (r.status === "pass") pass++; else if (r.status === "skip") skip++; else fail++;
    console.log((r.status === "pass" ? "  OK   " : r.status === "skip" ? "  SKIP " : "  ÉCHEC") + " " + r.name + (r.note ? "  -> " + r.note : ""));
  });
  console.log(`\n${pass} réussis, ${fail} échoués, ${skip} ignorés`);
  process.exit(fail ? 1 : 0);
});
