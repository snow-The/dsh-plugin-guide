// src/index.ts
import { defineTool } from "@deepseek-ai/dsh-tools";

// src/boot.ts
import { spawn, execFileSync } from "node:child_process";
import { existsSync, renameSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import net from "node:net";
var TASKBOARD_LOCK = join(homedir(), ".dsh", "task-board", "ledger-v2.lock");
var TASKBOARD_BAK = TASKBOARD_LOCK + ".guide-boot-bak";
function selfEngine(argv1 = process.argv[1] ?? "") {
  if (/[\\/]dsh[\\/]lib[\\/]bin\.js$/.test(argv1) && existsSync(argv1)) {
    return {
      cmd: process.execPath,
      args: [argv1],
      shell: false,
      why: "the same engine that runs this host (" + argv1 + ")"
    };
  }
  return {
    cmd: "dsh",
    args: [],
    shell: true,
    why: "the PATH shim \u2014 this host's bin.js was not identifiable (argv[1]=" + JSON.stringify(argv1) + "), so the check may not cover the running release"
  };
}
function killTree(pid) {
  try {
    if (process.platform === "win32") {
      execFileSync("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore" });
    } else {
      try {
        process.kill(-pid, "SIGKILL");
      } catch {
        process.kill(pid, "SIGKILL");
      }
    }
  } catch {
  }
}
function portOpen(port) {
  return new Promise((resolve2) => {
    const s = net.connect({ port, host: "127.0.0.1" });
    s.setTimeout(1500);
    s.once("connect", () => {
      s.destroy();
      resolve2(true);
    });
    s.once("error", () => resolve2(false));
    s.once("timeout", () => {
      s.destroy();
      resolve2(false);
    });
  });
}
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
function expandEnv(p) {
  return p.replace(/%([^%]+)%/g, (_m, k) => process.env[k] ?? "");
}
var BROWSER_CANDIDATES = {
  win32: [
    "%ProgramFiles%\\Google\\Chrome\\Application\\chrome.exe",
    "%ProgramFiles(x86)%\\Google\\Chrome\\Application\\chrome.exe",
    "%LOCALAPPDATA%\\Google\\Chrome\\Application\\chrome.exe",
    "%ProgramFiles%\\Microsoft\\Edge\\Application\\msedge.exe",
    "%ProgramFiles(x86)%\\Microsoft\\Edge\\Application\\msedge.exe"
  ],
  darwin: [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"
  ],
  linux: [
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/snap/bin/chromium",
    "/usr/bin/microsoft-edge",
    "/usr/bin/microsoft-edge-stable"
  ]
};
var BROWSER_ON_PATH = ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser", "microsoft-edge", "chrome"];
function fromPath() {
  const dirs = (process.env.PATH ?? "").split(process.platform === "win32" ? ";" : ":");
  const exts = process.platform === "win32" ? [".exe", ".cmd"] : [""];
  for (const name2 of BROWSER_ON_PATH) {
    for (const d of dirs) {
      if (!d) continue;
      for (const ext of exts) {
        const p = join(d, name2 + ext);
        if (existsSync(p)) return p;
      }
    }
  }
  return null;
}
function findBrowser() {
  for (const key of ["DSH_PLUGIN_GUIDE_BROWSER", "CHROME_PATH", "PUPPETEER_EXECUTABLE_PATH"]) {
    const v = process.env[key];
    if (v && existsSync(v)) return v;
  }
  for (const c of BROWSER_CANDIDATES[process.platform] ?? []) {
    const p = expandEnv(c);
    if (p && existsSync(p)) return p;
  }
  return fromPath();
}
function extractToken(stdout) {
  const m = /[?&]token=([A-Za-z0-9_\-]+)/.exec(stdout);
  return m ? m[1] : null;
}
function pageRenderCheck(port, uiChecks, token) {
  const browser = findBrowser();
  if (!browser) return null;
  const url = "http://127.0.0.1:" + port + (token ? "/?token=" + encodeURIComponent(token) : "");
  for (let attempt = 0; attempt < 3; attempt++) {
    const profile = mkdtempSync(join(homedir(), "AppData", "Local", "Temp", "dsh-guide-boot-"));
    try {
      const dom = execFileSync(browser, [
        "--headless=new",
        "--disable-gpu",
        "--no-first-run",
        "--disable-extensions",
        "--disable-background-networking",
        "--user-data-dir=" + profile,
        "--dump-dom",
        url
      ], { timeout: 25e3, encoding: "utf8", windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
      const m = /failed to load plugins|failed to (?:import|apply) loader entry|invalid plugin, received object|HARNESS[\s\S]{0,40}?failed to/i.exec(dom);
      const ui = uiChecks.map((c) => ({ id: c.id, found: dom.includes(c.marker) }));
      const authWall = /dsh web authentication required|reopen the URL printed by dsh web/i.test(dom);
      rmSync(profile, { recursive: true, force: true });
      return {
        errors: m ? { snippet: dom.slice(Math.max(0, m.index - 120), m.index + 240).replace(/\s+/g, " ").trim() } : null,
        ui,
        authWall
      };
    } catch {
      rmSync(profile, { recursive: true, force: true });
    }
  }
  return null;
}
async function bootCheck(port, waitMs, uiChecks = []) {
  const p = port ?? 34e3 + Math.floor(Math.random() * 2e3);
  const wait = waitMs ?? 2e4;
  const notes = [];
  let child = null;
  let movedLock = false;
  try {
    if (existsSync(TASKBOARD_LOCK)) {
      try {
        renameSync(TASKBOARD_LOCK, TASKBOARD_BAK);
        movedLock = true;
        notes.push("note: task-board single-instance lock temporarily moved aside (restored after check)");
      } catch (lockErr) {
        notes.push("note: task-board lock is held by the live instance - left in place, proceeding without lock move");
      }
    }
    const engine = selfEngine();
    notes.push("note: booting " + engine.why);
    child = spawn(engine.cmd, [...engine.args, "web", "--port", String(p), "--no-open"], {
      shell: engine.shell,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stderr = "";
    let stdout = "";
    child.stderr?.on("data", (d) => {
      stderr += d.toString();
    });
    child.stdout?.on("data", (d) => {
      stdout += d.toString();
    });
    const exited = new Promise((res) => child.on("exit", (c) => res(c)));
    const timer = sleep(wait).then(() => null);
    const code = await Promise.race([exited, timer]);
    if (code !== null) {
      return {
        ok: false,
        summary: `FAIL: dsh web exited early with code ${code} (port ${p})`,
        detail: (stderr.trim() || "(no stderr)") + "\n--- stdout ---\n" + (stdout.trim() || "(empty)")
      };
    }
    const alive = child.exitCode === null && !child.killed;
    const errTrim = stderr.trim();
    const listening = await portOpen(p);
    if (alive && errTrim.length === 0) {
      const token = extractToken(stdout);
      const page = pageRenderCheck(p, uiChecks, token);
      if (page && page.errors) {
        return {
          ok: false,
          summary: "FAIL: browser-side plugin loader error on http://127.0.0.1:" + p + " (HARNESS overlay)",
          detail: "headless DOM matched error pattern:\n" + page.errors.snippet + "\n--- notes ---\n" + (notes.join("\n") || "(none)")
        };
      }
      if (page && page.authWall && uiChecks.length > 0) {
        return {
          ok: false,
          summary: "FAIL (inconclusive): headless page was the auth wall, not the app on http://127.0.0.1:" + p,
          detail: 'ui checks could not run: the page rendered was "dsh web authentication required", so no client plugin can have mounted there \u2014 the marker result says nothing about the plugin.\ntoken found on host stdout: ' + (token ? "yes (still got the wall)" : "no (host printed no token URL)") + "\n--- notes ---\n" + (notes.join("\n") || "(none)")
        };
      }
      const missing = page ? page.ui.filter((u) => !u.found) : [];
      if (page && missing.length > 0) {
        return {
          ok: false,
          summary: "FAIL: plugin UI markers missing from rendered DOM on http://127.0.0.1:" + p,
          detail: missing.map((u) => "  x " + u.id + " (marker not found)").join("\n") + "\n--- notes ---\n" + (notes.join("\n") || "(none)")
        };
      }
      const pageNotes = [];
      if (page === null) {
        pageNotes.push("note: no chrome/edge found - browser-side page check skipped (server-side checks only)");
      } else {
        pageNotes.push("note: headless page render clean (no plugin loader errors in DOM)");
        if (uiChecks.length > 0) {
          pageNotes.push("ui checks: " + page.ui.map((u) => u.found ? "ok " + u.id : "MISSING " + u.id).join(", "));
        }
      }
      const uiPart = uiChecks.length > 0 && page ? ", ui " + page.ui.filter((u) => u.found).length + "/" + page.ui.length : "";
      const partialReason = page === null ? "no browser found, page-side check did not run" : null;
      return {
        ok: true,
        ...partialReason ? { partial: true, partialReason } : {},
        summary: (partialReason ? "PASS (partial: " + partialReason + ") \u2014 " : "PASS: ") + "dsh web alive after " + wait + "ms on port " + p + ", stderr empty, port " + (listening ? "listening" : "not yet listening (may bind later)") + ", page " + (page ? "DOM clean" : "check skipped (no browser)") + uiPart,
        detail: notes.concat(pageNotes).join("\n") || "(no notes)"
      };
    }
    if (!alive) {
      return {
        ok: false,
        summary: `FAIL: process not alive after ${wait}ms (port ${p})`,
        detail: (errTrim || "(no stderr)") + "\n--- stdout ---\n" + (stdout.trim() || "(empty)")
      };
    }
    return {
      ok: false,
      summary: `FAIL: stderr non-empty after ${wait}ms (${errTrim.length} bytes, port ${p})`,
      detail: errTrim.slice(0, 6e3) + "\n--- stdout ---\n" + (stdout.trim().slice(0, 2e3) || "(empty)")
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/ENOENT|not recognized|not found/i.test(msg)) {
      return {
        ok: false,
        summary: "FAIL: could not start the boot probe \u2014 the dsh engine executable was not found",
        detail: "resolved engine was not executable: " + msg + "\nthis check boots the host's own bin.js; if it disappeared, the running release moved."
      };
    }
    return { ok: false, summary: `FAIL: unexpected error: ${msg}`, detail: msg };
  } finally {
    if (child && child.pid !== void 0) killTree(child.pid);
    if (movedLock && existsSync(TASKBOARD_BAK) && !existsSync(TASKBOARD_LOCK)) {
      try {
        renameSync(TASKBOARD_BAK, TASKBOARD_LOCK);
      } catch {
      }
    }
  }
}

// src/scan.ts
import { existsSync as existsSync2, readdirSync, readFileSync } from "node:fs";
import { join as join2, resolve } from "node:path";
import { parse as parseYaml } from "yaml";
var HOST_PROVIDED_BUNDLES = ["@deepseek-ai/dsh-base", "@deepseek-ai/dsh-web-app"];
function scanPlugin(dir) {
  const checks = [];
  const manifestPath = join2(dir, "package.json");
  let manifest = null;
  let packageName = null;
  if (!existsSync2(manifestPath)) {
    checks.push({ rule: "manifest", ok: false, detail: "package.json missing" });
    return finish(dir, packageName, checks);
  }
  try {
    manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    packageName = typeof manifest.name === "string" ? manifest.name : null;
    checks.push({ rule: "manifest", ok: true, detail: `read ${manifestPath}` });
  } catch (e) {
    checks.push({ rule: "manifest", ok: false, detail: `invalid JSON: ${String(e)}` });
    return finish(dir, packageName, checks);
  }
  const deps = { ...manifest.dependencies, ...manifest.peerDependencies };
  const hasHostDep = Object.keys(deps).some((d) => d.startsWith("@deepseek-ai/dsh-"));
  const hasPatchFile = existsSync2(join2(dir, "cordis.patch.yml"));
  if (manifest.dsh === void 0 && !hasPatchFile && !hasHostDep) {
    checks.push({ rule: "manifest.library", ok: true, detail: "no dsh field, no cordis.patch.yml, no @deepseek-ai/dsh-* dependency \u2014 treated as a library, plugin rules do not apply" });
    const report = finish(dir, packageName, checks);
    report.verdict = "N/A";
    return report;
  }
  const dsh = manifest.dsh;
  const bundle = dsh?.bundle;
  if (!dsh || !bundle || typeof bundle !== "object") {
    checks.push({
      rule: "dsh.bundle",
      ok: false,
      detail: 'package.json must declare "dsh": { "bundle": { "patch": "./cordis.patch.yml" } } \u2014 boot rejects bundles without it'
    });
  } else {
    checks.push({ rule: "dsh.bundle", ok: true, detail: "dsh.bundle declared" });
  }
  const patchRel = typeof bundle?.patch === "string" ? bundle.patch : null;
  const patchPath = patchRel ? resolve(dir, patchRel) : null;
  if (!patchPath) {
    checks.push({ rule: "patch.file", ok: false, detail: "dsh.bundle.patch not set (string path required)" });
  } else if (!existsSync2(patchPath)) {
    checks.push({ rule: "patch.file", ok: false, detail: `dsh.bundle.patch points to missing file: ${patchRel}` });
  } else {
    checks.push({ rule: "patch.file", ok: true, detail: `patch file exists: ${patchRel}` });
  }
  let patchList = null;
  if (patchPath && existsSync2(patchPath)) {
    try {
      patchList = parseYaml(readFileSync(patchPath, "utf8"));
      if (!Array.isArray(patchList)) {
        checks.push({
          rule: "patch.array",
          ok: false,
          detail: `${patchRel} must be a TOP-LEVEL YAML ARRAY of loader patch entries (boot throws otherwise) \u2014 comment-only files fail`
        });
      } else if (patchList.length === 0) {
        checks.push({ rule: "patch.array", ok: false, detail: `${patchRel} is an empty array \u2014 it must insert at least one row` });
      } else {
        checks.push({ rule: "patch.array", ok: true, detail: `${patchRel} parses as a top-level array (${patchList.length} entries)` });
      }
    } catch (e) {
      checks.push({ rule: "patch.array", ok: false, detail: `failed to parse ${patchRel}: ${String(e)}` });
    }
  }
  let isBundle = false;
  if (Array.isArray(patchList)) {
    const badEntry = patchList.findIndex((e) => typeof e !== "object" || e === null || Array.isArray(e));
    if (badEntry >= 0) {
      checks.push({ rule: "patch.entries", ok: false, detail: `entry ${badEntry + 1} is not a mapping` });
    } else {
      checks.push({ rule: "patch.entries", ok: true, detail: "all patch entries are mappings" });
    }
    const inserts = patchList.flatMap((e) => Array.isArray(e.insert) ? e.insert : []);
    const badInsert = inserts.findIndex((it) => {
      const o = it;
      return typeof o?.id !== "string" || typeof o?.name !== "string";
    });
    if (inserts.length === 0) {
      checks.push({ rule: "patch.insert", ok: false, detail: "no - insert: rows found \u2014 the bundle would insert nothing" });
    } else if (badInsert >= 0) {
      checks.push({ rule: "patch.insert", ok: false, detail: `insert item ${badInsert + 1} lacks id or name` });
    } else {
      checks.push({ rule: "patch.insert", ok: true, detail: `${inserts.length} insert item(s), all with id + name` });
    }
    const knownNames = new Set(Object.keys(deps));
    if (packageName) knownNames.add(packageName);
    isBundle = inserts.length > 1 || inserts.some((it) => {
      const n = it.name;
      return typeof n === "string" && n !== packageName;
    });
    const isHostLayer = (n) => n.startsWith("@deepseek-ai/");
    const unknownRows = inserts.map((it) => it.name).filter((n) => typeof n === "string" && !knownNames.has(n) && !isHostLayer(n));
    if (packageName && unknownRows.length > 0) {
      checks.push({
        rule: "patch.selfName",
        ok: false,
        detail: `insert name(s) ${unknownRows.map((n) => JSON.stringify(n)).join(", ")} are neither ${JSON.stringify(packageName)}, a declared dependency, nor a @deepseek-ai/* host layer \u2014 a typo, or a missing declaration`
      });
    } else if (packageName) {
      checks.push({
        rule: "patch.selfName",
        ok: true,
        detail: `${inserts.length} insert row(s): every name is the package itself, a declared dependency, or a host layer`
      });
    }
  }
  if (packageName) {
    const clientPath = join2(dir, "client.js");
    if (existsSync2(clientPath)) {
      const clientText = readFileSync(clientPath, "utf8");
      const loadId = /__ModuleLoader__\.load\(\s*\{\s*id:\s*['"]([^'"]+)['"]/.exec(clientText);
      if (!loadId) {
        checks.push({ rule: "client.loaderId", ok: false, detail: `client.js must call __ModuleLoader__.load({ id: '<package name>', ... }) \u2014 client-modules throws otherwise` });
      } else if (loadId[1] !== packageName) {
        checks.push({ rule: "client.loaderId", ok: false, detail: `client.js registers id "${loadId[1]}" but package name is ${packageName} \u2014 loader fails with "loaded without registering ${packageName}"` });
      } else {
        checks.push({ rule: "client.loaderId", ok: true, detail: `client.js registers __ModuleLoader__.load id = ${packageName}` });
      }
    } else {
      checks.push({ rule: "client.loaderId", ok: true, detail: "no client.js \u2014 client-modules not used" });
    }
  }
  const files = manifest.files;
  if (!Array.isArray(files)) {
    checks.push({ rule: "files", ok: false, detail: 'no "files" allowlist \u2014 npm publish may ship src/, node_modules or other junk' });
  } else {
    const required = /* @__PURE__ */ new Set();
    const addRel = (rel) => {
      if (typeof rel !== "string" || rel.length === 0) return;
      const clean = rel.replace(/^\.\//, "");
      if (clean.length > 0 && clean !== ".") required.add(clean);
    };
    addRel(manifest.main);
    addRel(manifest.types);
    addRel(patchRel);
    if (existsSync2(join2(dir, "client.js"))) addRel("client.js");
    const matchGlob = (pattern, target) => {
      const source = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*\*\//g, "").replace(/\*\*/g, "\0").replace(/\*/g, "[^/]*").replace(/\u0001/g, "(?:.*/)?").replace(/\u0000/g, ".*");
      return new RegExp(`^${source}$`).test(target);
    };
    const covered = (rel, patterns) => patterns.some((raw) => {
      if (typeof raw !== "string") return false;
      const q = raw.replace(/^\.\//, "");
      if (q.includes("*")) return matchGlob(q, rel);
      return rel === q || rel.startsWith(`${q}/`);
    });
    const problems = [...required].filter((entry) => !covered(entry, files));
    if (problems.length === 0) {
      checks.push({ rule: "files", ok: true, detail: `files allowlist ships every entry point (${[...required].join(", ")})` });
    } else {
      checks.push({ rule: "files", ok: false, detail: `files allowlist missing: ${problems.join(", ")}` });
    }
  }
  const main = typeof manifest.main === "string" ? manifest.main : null;
  const types = typeof manifest.types === "string" ? manifest.types : null;
  if (!main) {
    checks.push({ rule: "entry.main", ok: false, detail: 'no "main" field' });
  } else if (!existsSync2(resolve(dir, main))) {
    checks.push({ rule: "entry.main", ok: false, detail: `main file missing: ${main} (run the build first)` });
  } else {
    checks.push({ rule: "entry.main", ok: true, detail: `main resolves: ${main}` });
  }
  if (types && !existsSync2(resolve(dir, types))) {
    checks.push({ rule: "entry.types", ok: false, detail: `types file missing: ${types}` });
  } else if (types) {
    checks.push({ rule: "entry.types", ok: true, detail: `types resolves: ${types}` });
  }
  if (main && existsSync2(resolve(dir, main))) {
    try {
      const text = readFileSync(resolve(dir, main), "utf8");
      const hasName = /\bexport\s+(?:const|var|let)\s+name\b|\bname\s*=\s*['"]/.test(text);
      const hasApply = /\bexport\s+(?:function|const|var|let)\s+apply\b|\bapply\s*[:=(]/.test(text);
      if (hasName && hasApply) {
        checks.push({ rule: "entry.exports", ok: true, detail: "entry exports name + apply" });
      } else if (isBundle) {
        checks.push({
          rule: "entry.exports",
          ok: /export\s*\{\s*\}|export\s+default/.test(text) || !hasName && !hasApply,
          detail: "bundle entry: aggregation only, no plugin exports expected"
        });
      } else {
        const missing = [];
        if (!hasName) missing.push("name");
        if (!hasApply) missing.push("apply");
        checks.push({ rule: "entry.exports", ok: false, detail: `entry likely missing export: ${missing.join(", ")}` });
      }
    } catch {
      checks.push({ rule: "entry.exports", ok: true, detail: "could not probe entry text (binary?)" });
    }
  }
  const HOST_REGISTERED_SERVICES = ["tools"];
  if (main && existsSync2(resolve(dir, main))) {
    try {
      const text = readFileSync(resolve(dir, main), "utf8");
      const injectDecl = text.match(/(?:^|\n)\s*(?:export\s+const|const|var|let)\s+inject\s*=\s*\[([^\]]*)\]/);
      const injectExported = /(?:^|\n)\s*export\s+const\s+inject\b/.test(text) || /(?:^|\n)\s*export\s*\{[^}]*\binject\b/.test(text);
      const injected = injectDecl && injectExported ? [...injectDecl[1].matchAll(/['"]([^'"]+)['"]/g)].map((m) => m[1]) : [];
      const codeOnly = text.replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`/g, "");
      const usedServices = [...new Set(
        [...codeOnly.matchAll(/\bctx\.([A-Za-z_$][\w$]*)/g)].map((m) => m[1])
      )];
      const missing = usedServices.filter((s) => HOST_REGISTERED_SERVICES.includes(s) && !injected.includes(s));
      if (missing.length > 0) {
        checks.push({
          rule: "entry.inject",
          ok: false,
          detail: `apply reads ctx.${missing.join(", ctx.")} but "export const inject" does not declare ${missing.join(", ")} \u2014 cordis proxy THROWS at boot (optional chaining does not help); add: export const inject = [${[.../* @__PURE__ */ new Set([...injected, ...missing])].map((s) => `'${s}'`).join(", ")}]`
        });
      } else {
        checks.push({ rule: "entry.inject", ok: true, detail: "ctx.<service> reads are declared in inject (or the service is optional on the host)" });
      }
    } catch {
      checks.push({ rule: "entry.inject", ok: true, detail: "could not probe entry text (binary?)" });
    }
  }
  if (main && existsSync2(resolve(dir, main))) {
    try {
      const text = readFileSync(resolve(dir, main), "utf8");
      const allowedTypes = /* @__PURE__ */ new Set(["object", "array", "string", "number", "integer", "boolean", "null"]);
      const problems = [];
      let scanned = 0;
      const schemaRe = /schema\s*:\s*\{([\s\S]{0,300}?)\}/g;
      let match;
      while ((match = schemaRe.exec(text)) !== null) {
        scanned += 1;
        const body = match[1];
        const typeMatch = /type\s*:\s*['"]([A-Za-z]+)['"]/.exec(body);
        if (typeMatch === null) continue;
        const declared = typeMatch[1];
        if (!allowedTypes.has(declared)) {
          problems.push(`type '${declared}' is not a JSON-schema type`);
          continue;
        }
        if (declared === "object" && !/additionalProperties/.test(text)) {
          problems.push("object schema without an explicit additionalProperties");
        }
      }
      if (problems.length === 0) {
        checks.push({ rule: "tool.schema", ok: true, detail: scanned > 0 ? `${scanned} schema literal(s) look valid` : "no inline schema literals found" });
      } else {
        checks.push({
          rule: "tool.schema",
          ok: false,
          detail: `the host aborts the whole plugin tree on an invalid tool schema: ${[...new Set(problems)].join("; ")} \u2014 use type object/array/string/number/integer/boolean/null, and give object schemas an explicit additionalProperties`
        });
      }
    } catch {
      checks.push({ rule: "tool.schema", ok: true, detail: "could not probe entry text (binary?)" });
    }
  }
  const scripts = manifest.scripts ?? {};
  const testScript = typeof scripts.test === "string" ? scripts.test.trim() : "";
  const testFiles = findTestFiles(dir);
  let testAdvice;
  if (testScript.length === 0 && testFiles.length > 0) {
    testAdvice = `advisory: ${testFiles.length} test file(s) present but no "scripts.test" - the suite is never run (add: "test": "node --test test")`;
  } else if (testScript.length > 0 && testFiles.length === 0) {
    testAdvice = `advisory: test script "${testScript.slice(0, 50)}" but no test files found - it passes vacuously`;
  } else if (testScript.length === 0) {
    testAdvice = "advisory: no tests at all - nothing guards this plugin against regressions";
  } else {
    testAdvice = `advisory: ${testFiles.length} test file(s); test script: ${testScript.slice(0, 50)}`;
  }
  checks.push({ rule: "scripts.test", ok: true, detail: testAdvice });
  const fuzzScript = typeof scripts.fuzz === "string" ? scripts.fuzz.trim() : "";
  checks.push({
    rule: "scripts.fuzz",
    ok: true,
    detail: fuzzScript.length > 0 ? `advisory: fuzz script: ${fuzzScript.slice(0, 60)}` : 'advisory: no "scripts.fuzz" (recommended for anything that parses external input)'
  });
  return finish(dir, packageName, checks);
}
function findTestFiles(dir) {
  const found = [];
  const looksLikeTest = (name2) => /\.(test|spec)\.[cm]?[jt]sx?$/.test(name2) || /^test[-.].*\.[cm]?[jt]sx?$/.test(name2) || /.test\.mjs$/.test(name2);
  for (const sub of ["", "test", "tests"]) {
    const target = sub === "" ? dir : join2(dir, sub);
    if (!existsSync2(target)) continue;
    let entries = [];
    try {
      entries = readdirSync(target);
    } catch {
      continue;
    }
    for (const name2 of entries) {
      if (looksLikeTest(name2) || sub !== "" && /\.(mjs|cjs|js|ts)$/.test(name2)) found.push(sub === "" ? name2 : sub + "/" + name2);
    }
  }
  return found;
}
function scanProfile(dir) {
  const checks = [];
  const manifestPath = join2(dir, "package.json");
  let manifest = null;
  let packageName = null;
  if (!existsSync2(manifestPath)) {
    checks.push({ rule: "profile.manifest", ok: false, detail: "package.json missing" });
    return finish(dir, packageName, checks);
  }
  try {
    manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    packageName = typeof manifest.name === "string" ? manifest.name : null;
  } catch (e) {
    checks.push({ rule: "profile.manifest", ok: false, detail: `invalid JSON: ${String(e)}` });
    return finish(dir, packageName, checks);
  }
  const profile = manifest.dsh;
  const bundlesRaw = profile?.profile;
  const bundles = Array.isArray(bundlesRaw?.bundles) ? bundlesRaw.bundles.filter((b) => typeof b === "string") : null;
  if (!bundles) {
    checks.push({ rule: "profile.manifest", ok: false, detail: 'not a dsh profile: "dsh": { "profile": { "bundles": [...] } } missing' });
    return finish(dir, packageName, checks);
  }
  checks.push({ rule: "profile.manifest", ok: true, detail: `profile manifest with ${bundles.length} bundle(s)` });
  const deps = manifest.dependencies ?? {};
  const depNames = new Set(Object.keys(deps));
  const missingDeps = bundles.filter((b) => !depNames.has(b) && !HOST_PROVIDED_BUNDLES.includes(b));
  if (missingDeps.length > 0) {
    checks.push({
      rule: "profile.bundleInDeps",
      ok: false,
      detail: `bundles not declared in dependencies (fresh pnpm install cannot resolve them): ${missingDeps.join(", ")} \u2014 add to dependencies (host-provided ${HOST_PROVIDED_BUNDLES.join(", ")} exempt)`
    });
  } else {
    checks.push({
      rule: "profile.bundleInDeps",
      ok: true,
      detail: `every bundle is declared in dependencies (${HOST_PROVIDED_BUNDLES.length} host-provided layers exempt)`
    });
  }
  const nmDir = join2(dir, "node_modules");
  if (!existsSync2(nmDir)) {
    checks.push({ rule: "profile.depsInBundles", ok: true, detail: "node_modules not installed \u2014 plugin-dependency check skipped (run pnpm install first)" });
  } else {
    const mountedByBundle = /* @__PURE__ */ new Set();
    for (const bundleName of bundles) {
      const bundlePkgPath = join2(nmDir, bundleName, "package.json");
      if (!existsSync2(bundlePkgPath)) continue;
      let bundlePkg;
      try {
        bundlePkg = JSON.parse(readFileSync(bundlePkgPath, "utf8"));
      } catch {
        continue;
      }
      const bundleSpec = bundlePkg.dsh?.bundle;
      const patchRel = typeof bundleSpec?.patch === "string" ? bundleSpec.patch : null;
      if (!patchRel) continue;
      const bundlePatchPath = join2(nmDir, bundleName, patchRel);
      if (!existsSync2(bundlePatchPath)) continue;
      try {
        for (const m of readFileSync(bundlePatchPath, "utf8").matchAll(/name:\s*['"]([^'"]+)['"]/g)) {
          mountedByBundle.add(m[1]);
        }
      } catch {
      }
    }
    const orphanPlugins = [];
    let inspected = 0;
    for (const name2 of Object.keys(deps)) {
      const pkgPath = join2(nmDir, name2, "package.json");
      if (!existsSync2(pkgPath)) continue;
      let pkg;
      try {
        pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
      } catch {
        continue;
      }
      const isPlugin = Boolean(pkg.dsh?.bundle);
      if (!isPlugin) continue;
      inspected += 1;
      if (!bundles.includes(name2) && !mountedByBundle.has(name2)) orphanPlugins.push(name2);
    }
    if (orphanPlugins.length > 0) {
      checks.push({
        rule: "profile.depsInBundles",
        ok: false,
        detail: `plugin(s) installed but NOT in dsh.profile.bundles \u2014 boot never mounts them: ${orphanPlugins.join(", ")}`
      });
    } else {
      checks.push({
        rule: "profile.depsInBundles",
        ok: true,
        detail: `all ${inspected} installed plugin dep(s) appear in bundles`
      });
    }
  }
  return finish(dir, packageName, checks);
}
function scan(dir) {
  const manifestPath = join2(dir, "package.json");
  if (existsSync2(manifestPath)) {
    try {
      const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
      const profileShape = manifest.dsh?.profile;
      if (profileShape?.bundles) return scanProfile(dir);
    } catch {
    }
  }
  return scanPlugin(dir);
}
function finish(dir, packageName, checks) {
  const passed = checks.filter((c) => c.ok).length;
  const failed = checks.filter((c) => !c.ok).length;
  return {
    dir,
    packageName,
    checks,
    passed,
    failed,
    verdict: failed === 0 ? "PASS" : "FAIL"
  };
}
function formatReport(report) {
  const lines = [];
  lines.push(`# scan ${report.dir}`);
  lines.push(`package: ${report.packageName ?? "(unknown)"}`);
  lines.push(`verdict: ${report.verdict} (${report.passed} pass / ${report.failed} fail)${report.verdict === "N/A" ? " \u2014 not a DSH plugin" : ""}`);
  for (const c of report.checks) {
    lines.push(`  ${c.ok ? "\u2713" : "\u2717"} ${c.rule}: ${c.detail}`);
  }
  return lines.join("\n");
}

// src/ctx-catalog.generated.ts
var GENERATED_CTX_CATALOG = [
  { member: "ctx.agentDefaultModel", type: "AgentDefaultModelConfig", subsystem: "core", seam: false },
  { member: "ctx.agentLoop", type: "AgentLoop", subsystem: "core", seam: false },
  { member: "ctx.agentPresets", type: "AgentPresetRegistry", subsystem: "core", seam: false },
  { member: "ctx.agents", type: "AgentRegistry", subsystem: "core", seam: false },
  { member: "ctx.agentTeams", type: "TeamService", subsystem: "agent-team", seam: false },
  { member: "ctx.approval", type: "ApprovalService", subsystem: "approval", seam: false },
  { member: "ctx.attachments", type: "AttachmentStore", subsystem: "attachment", seam: true },
  { member: "ctx.authorization", type: "AuthorizationService", subsystem: "credentials", seam: false },
  { member: "ctx.browserUse", type: "BrowserUseRegistry", subsystem: "browser-use", seam: false },
  { member: "ctx.clientModules", type: "ClientModuleRegistry", subsystem: "client-modules", seam: false },
  { member: "ctx.commands", type: "CommandRuntime", subsystem: "commands", seam: false },
  { member: "ctx.compaction", type: "CompactionEngine", subsystem: "compaction", seam: true },
  { member: "ctx.computerUse", type: "ComputerUseRegistry", subsystem: "computer-use", seam: false },
  { member: "ctx.configEditor", type: "ConfigEditor", subsystem: "boot", seam: false },
  { member: "ctx.connection", type: "HostConnectionHandle", subsystem: "web-server", seam: false },
  { member: "ctx.cordisInspect", type: "CordisInspectRegistryService", subsystem: "extensions", seam: false },
  { member: "ctx.credentials", type: "CredentialProvider", subsystem: "credentials", seam: true },
  { member: "ctx.credentialsController", type: "CredentialsController", subsystem: "credentials", seam: false },
  { member: "ctx.deepseekAccount", type: "DeepSeekAccount", subsystem: "credentials", seam: true },
  { member: "ctx.deepseekLlmApiExtensions", type: "DeepSeekLlmApiExtensionRegistry", subsystem: "llm-streaming", seam: false },
  { member: "ctx.directoryPicker", type: "DirectoryPicker", subsystem: "workspace", seam: true },
  { member: "ctx.directoryPickerController", type: "DirectoryPickerController", subsystem: "workspace", seam: false },
  { member: "ctx.dynamicCordisRunner", type: "DynamicCordisRunnerService", subsystem: "extensions", seam: false },
  { member: "ctx.fileReferences", type: "FileReferenceService", subsystem: "session-reference", seam: true },
  { member: "ctx.fileUploads", type: "FileUploads", subsystem: "attachment", seam: false },
  { member: "ctx.fs", type: "FileSystem", subsystem: "filesystem", seam: true },
  { member: "ctx.goals", type: "GoalService", subsystem: "goal", seam: false },
  { member: "ctx.hmr", type: "Hmr", subsystem: "boot", seam: false },
  { member: "ctx.inspector", type: "InspectorService", subsystem: "extensions", seam: false },
  { member: "ctx.invariants", type: "InvariantRegistry", subsystem: "invariants", seam: false },
  { member: "ctx.jobController", type: "JobController", subsystem: "jobs", seam: false },
  { member: "ctx.jobs", type: "JobRegistry", subsystem: "jobs", seam: true },
  { member: "ctx.llm", type: "LlmRuntime", subsystem: "llm-streaming", seam: false },
  { member: "ctx.lsp", type: "LspService", subsystem: "lsp", seam: false },
  { member: "ctx.mcpResources", type: "McpResourceRuntime", subsystem: "mcp", seam: false },
  { member: "ctx.messageFeedback", type: "MessageFeedbackService", subsystem: "feedback", seam: false },
  { member: "ctx.officeToPdf", type: "OfficeToPdf", subsystem: "office-to-pdf", seam: false },
  { member: "ctx.permissionPresets", type: "PermissionPresetService", subsystem: "permission-presets", seam: false },
  { member: "ctx.planMode", type: "PlanModeController", subsystem: "plan", seam: false },
  { member: "ctx.pluginManager", type: "PluginManager", subsystem: "boot", seam: false },
  { member: "ctx.pluginRegistryProbe", type: "PluginRegistryProbe", subsystem: "boot", seam: false },
  { member: "ctx.productTelemetry", type: "ProductTelemetry", subsystem: "product-telemetry", seam: false },
  { member: "ctx.profileContext", type: "ProfileContext", subsystem: "boot", seam: false },
  { member: "ctx.ptcRuntime", type: "PtcRuntime", subsystem: "ptc-runtime", seam: true },
  { member: "ctx.sandbox", type: "SandboxProvider", subsystem: "sandbox", seam: true },
  { member: "ctx.sandboxPolicy", type: "SandboxPolicyService", subsystem: "sandbox", seam: false },
  { member: "ctx.schedule", type: "ScheduleService", subsystem: "schedule", seam: false },
  { member: "ctx.sessionController", type: "SessionController", subsystem: "session", seam: false },
  { member: "ctx.sessionFeedback", type: "SessionFeedbackService", subsystem: "feedback", seam: false },
  { member: "ctx.sessionFileReferences", type: "SessionFileReferences", subsystem: "session-reference", seam: false },
  { member: "ctx.sessionPersistence", type: "SessionPersistence", subsystem: "persistence", seam: true },
  { member: "ctx.sessionProjectionCache", type: "SessionProjectionCache", subsystem: "session-projection", seam: false },
  { member: "ctx.sessionProjections", type: "SessionProjectionRegistry", subsystem: "session-projection", seam: false },
  { member: "ctx.sessionQuery", type: "SessionQueryEngine", subsystem: "session-query", seam: true },
  { member: "ctx.sessionReferenceResolver", type: "SessionReferenceResolver", subsystem: "session-reference", seam: false },
  { member: "ctx.sessions", type: "SessionStore", subsystem: "session", seam: false },
  { member: "ctx.sessionSkillCatalog", type: "SessionSkillCatalog", subsystem: "skills", seam: false },
  { member: "ctx.sessionTelemetry", type: "SessionTelemetryBackend", subsystem: "session-telemetry", seam: true },
  { member: "ctx.sessionTitle", type: "SessionTitleService", subsystem: "session-title", seam: false },
  { member: "ctx.settings", type: "SettingsForms", subsystem: "settings", seam: false },
  { member: "ctx.settingsController", type: "SettingsController", subsystem: "settings", seam: false },
  { member: "ctx.shell", type: "ShellExecutor", subsystem: "shell", seam: true },
  { member: "ctx.shellEnv", type: "ShellEnvRegistry", subsystem: "shell", seam: false },
  { member: "ctx.skills", type: "SkillRegistry", subsystem: "skills", seam: false },
  { member: "ctx.speechController", type: "SpeechController", subsystem: "voice-input", seam: false },
  { member: "ctx.speechToText", type: "SpeechToText", subsystem: "voice-input", seam: false },
  { member: "ctx.spillStore", type: "SpillStore", subsystem: "spill", seam: true },
  { member: "ctx.ssh", type: "SshConnection", subsystem: "ssh", seam: false },
  { member: "ctx.storage", type: "Storage", subsystem: "storage", seam: false },
  { member: "ctx.storageDomain", type: "DomainFacility", subsystem: "storage", seam: false },
  { member: "ctx.subagentModelSelection", type: "SubagentModelSelectionConfig", subsystem: "subagent", seam: false },
  { member: "ctx.subagents", type: "SubagentRuntime", subsystem: "subagent", seam: false },
  { member: "ctx.subprocess", type: "SubprocessRuntime", subsystem: "subprocess", seam: true },
  { member: "ctx.systemPrompt", type: "SystemPrompt", subsystem: "system-prompt", seam: false },
  { member: "ctx.terminalController", type: "TerminalController", subsystem: "workspace", seam: false },
  { member: "ctx.terminals", type: "TerminalSessionService", subsystem: "terminal", seam: false },
  { member: "ctx.tokenMeter", type: "TokenMeter", subsystem: "token-meter", seam: false },
  { member: "ctx.toolResultPruner", type: "ToolResultPruner", subsystem: "compaction", seam: false },
  { member: "ctx.tools", type: "ToolRuntime", subsystem: "tools", seam: false },
  { member: "ctx.typert", type: "TypertRegistry", subsystem: "typert", seam: false },
  { member: "ctx.typertGateway", type: "TypertGatewayService", subsystem: "typert", seam: false },
  { member: "ctx.userQuestions", type: "UserQuestionService", subsystem: "user-questions", seam: false },
  { member: "ctx.web", type: "WebRuntime", subsystem: "web", seam: false },
  { member: "ctx.webhookRuntime", type: "WebhookRuntime", subsystem: "webhook", seam: false },
  { member: "ctx.webServer", type: "WebServer", subsystem: "web-server", seam: false },
  { member: "ctx.workflowEngine", type: "WorkflowEngine", subsystem: "workflow", seam: true },
  { member: "ctx.workspaceChanges", type: "WorkspaceChanges", subsystem: "deliverables", seam: false },
  { member: "ctx.workspaceController", type: "WorkspaceController", subsystem: "workspace", seam: false },
  { member: "ctx.workspaceFiles", type: "WorkspaceFiles", subsystem: "workspace", seam: false },
  { member: "ctx.workspaceRegistry", type: "WorkspaceRegistry", subsystem: "workspace", seam: false }
];

// src/ctx-notes.ts
var CTX_NOTES = [
  { member: "ctx.llm", pkg: "@deepseek-ai/dsh-llm", what: "LLM \u901A\u9053:\u53D1\u8D77 chat/completions \u63A8\u7406", example: "ctx.llm.chat({ messages }) \u6216\u7ECF hostLlm \u9002\u914D" },
  { member: "ctx.agents / ctx.agent", pkg: "@deepseek-ai/dsh-agent", what: "Agent \u6CE8\u518C\u8868\u4E0E\u5F53\u524D agent(\u4F5C\u7528\u57DF\u9694\u79BB\u7684\u670D\u52A1\u6811)", example: "ctx.agent \u53D6\u5F53\u524D\u4F1A\u8BDD agent;ctx.agents \u904D\u5386" },
  { member: "ctx.skills", pkg: "@deepseek-ai/dsh-skill", what: "\u6280\u80FD\u6CE8\u518C/\u67E5\u8BE2(skill \u76EE\u5F55\u3001SKILL.md \u52A0\u8F7D)", example: "ctx.skills \u679A\u4E3E\u53EF\u52A0\u8F7D\u6280\u80FD" },
  { member: "ctx.tools", pkg: "@deepseek-ai/dsh-tools", what: "\u5DE5\u5177\u6CE8\u518C\u4E2D\u5FC3:defineTool + register", example: "ctx.tools.register(defineTool({ name, description, parameters, execute }))" },
  { member: "ctx.sessions", pkg: "@deepseek-ai/dsh-session", what: "\u4F1A\u8BDD\u5B58\u50A8(\u4E8B\u4EF6\u65E5\u5FD7\u3001\u6D88\u606F\u8BFB\u5199)", example: "ctx.sessions \u8BFB\u5199\u5F53\u524D\u4F1A\u8BDD\u5386\u53F2" },
  { member: "ctx.settings", pkg: "@deepseek-ai/dsh-settings", what: "\u8BBE\u7F6E\u8BFB\u5199(\u7528\u6237\u914D\u7F6E\u9762\u677F\u8054\u52A8)", example: "ctx.settings \u5B9A\u4E49/\u8BFB\u53D6\u63D2\u4EF6\u914D\u7F6E\u9879" },
  { member: "ctx.storage", pkg: "@deepseek-ai/dsh-storage", what: '\u5B58\u50A8\u4E2D\u67A2:\u547D\u540D\u540E\u7AEF\u6CE8\u518C\u8868(KV facet)\u3002\u6CE8\u610F\u5B83\u4E0D\u662F\u6570\u636E\u5E93\u2014\u2014KV \u503C\u7684\u5B9A\u4E49\u5C31\u662F"\u4E0D\u900F\u660E JSON,\u65E0 schema/\u65E0\u4E8B\u4EF6/\u65E0\u9886\u57DF\u8BED\u4E49",loadAll() \u5168\u91CF\u8F7D\u5165,\u6CA1\u6709 query/\u7D22\u5F15/FTS/\u5411\u91CF\u68C0\u7D22', example: "const unit = await ctx.storage.get('sqlite').kv.open({ name:'myplugin', version:1, tables:['kv'], hasGlobal:false }); await unit.putRecord('kv', key, value)" },
  { member: "ctx.jobs", pkg: "@deepseek-ai/dsh-jobs", what: "\u540E\u53F0\u4EFB\u52A1(\u957F\u65F6\u8FD0\u884C\u3001\u53EF\u8DDF\u8E2A\u3001\u9632\u5BBF\u4E3B\u9000\u51FA\u4E22\u5931)", example: "ctx.jobs \u63D0\u4EA4/\u67E5\u8BE2\u540E\u53F0 job" },
  { member: "ctx.goals", pkg: "@deepseek-ai/dsh-goal", what: "\u76EE\u6807(\u957F\u5468\u671F\u76EE\u6807\u72B6\u6001\u673A\u3001\u81EA\u52A8\u7EED\u8F6E)", example: "ctx.goals \u6CE8\u518C/\u63A8\u8FDB goal" },
  { member: "ctx.workflowEngine", pkg: "@deepseek-ai/dsh-workflow", what: "\u5DE5\u4F5C\u6D41\u5F15\u64CE(\u591A agent \u7F16\u6392)", example: "ctx.workflowEngine \u6D3E\u53D1 workflow" },
  { member: "ctx.subagents", pkg: "@deepseek-ai/dsh-subagent", what: "\u547D\u540D provider \u6CE8\u518C\u8868 + \u4E00\u6B21\u6027\u6D3E\u53D1 + \u6301\u4E45\u5B50\u4F1A\u8BDD\u53D1\u73B0 + continuable \u5B50\u4EE3\u7406(\u6FC0\u6D3B/\u51B7\u6062\u590D/sendMessage/interrupt)", example: "ctx.subagents.startContinuable({...}) / sendMessage(sender, targetId, content) / listDescendants(rootSessionId)" },
  { member: "ctx.agentTeams", pkg: "@deepseek-ai/dsh-experimental-agent-team", what: "Agent Teams:\u9690\u5F0F Lead \u540D\u518C + \u6301\u4E45\u5BF9\u7B49\u4FE1\u7BB1 + \u5171\u4EAB\u4EFB\u52A1 DAG(\u4EC5\u5B9E\u9A8C\u6027 bundle \u6302\u8F7D\u65F6\u5B58\u5728)", example: "if (ctx.agentTeams) ctx.agentTeams.spawnTeammate(caller, {...})" },
  { member: "ctx.credentials", pkg: "@deepseek-ai/dsh-credentials", what: "\u51ED\u8BC1\u7BA1\u7406(\u5BC6\u94A5\u5B89\u5168\u5B58\u53D6,\u4E0D\u843D\u660E\u6587)", example: "ctx.credentials \u8BFB\u53D6\u7B2C\u4E09\u65B9 API key" },
  { member: "ctx.fs", pkg: "@deepseek-ai/dsh-fs", what: "\u6587\u4EF6\u7CFB\u7EDF\u62BD\u8C61(\u6C99\u7BB1\u611F\u77E5\u7684\u8BFB\u5199)", example: "ctx.fs \u8BFB\u5199\u6587\u4EF6(\u7ECF\u6C99\u7BB1\u7B56\u7565)" },
  { member: "ctx.userQuestions", pkg: "@deepseek-ai/dsh-user-questions", what: "\u5411\u7528\u6237\u63D0\u95EE/\u786E\u8BA4(\u963B\u585E\u7B49\u7B54\u590D)", example: "ctx.userQuestions \u53D1\u8D77 ask_user \u5F0F\u63D0\u95EE" },
  { member: "ctx.storageDomain", what: "\u9886\u57DF\u6570\u636E\u5F62\u6001:\u5728 KV \u540E\u7AEF\u4E4B\u4E0A\u7684 schema \u6821\u9A8C + \u4E8B\u4EF6\u53D1\u5C04\u7684\u57DF(\u5B58\u50A8\u5C42\u91CC\u771F\u6B63\u5E26\u8BED\u4E49\u7684\u4E00\u5C42)", example: "ctx.storage.domain \u58F0\u660E\u57DF + schema,\u8BFB\u5199\u8D70\u57DF\u800C\u975E\u88F8 KV" },
  { member: "ctx.sessionQuery", what: "(abstract seam) \u8DE8\u4F1A\u8BDD\u67E5\u8BE2\u5F15\u64CE:\u903B\u8F91\u8BB0\u5F55\u3001\u6309 provider \u65E0\u5173\u7684\u8FC7\u6EE4/\u6587\u6863\u3001\u5168\u6587\u68C0\u7D22\u5206\u9875\u3001\u4F1A\u8BDD\u8840\u7F18\u3001\u6709\u754C\u4E8B\u4EF6\u8BFB\u53D6\u3001\u4E8B\u4EF6\u5173\u7CFB", example: "ctx.sessionQuery \u68C0\u7D22\u5386\u53F2\u4F1A\u8BDD\u7684\u4E8B\u4EF6/\u6587\u6863(\u66FF\u4EE3\u81EA\u5DF1\u89E3 zstd + \u89E3\u6790 jsonl)" },
  { member: "ctx.sessionPersistence", what: "(abstract seam) \u4F1A\u8BDD\u6301\u4E45\u5316\u63A5\u7F1D(jsonl \u540E\u7AEF\u5373 session-persistence-jsonl)", example: "ctx.sessionPersistence \u662F\u4F1A\u8BDD\u843D\u76D8\u7684\u540E\u7AEF\u5951\u7EA6" },
  // 0.2.2 契約：register() 回 Promise<ProjectionHandle>，必須 await；registry 級的同步讀取已標 deprecated。
  // 來源：安裝版 dsh-session-projection/lib/types/index.d.ts（"Callers must await registration … the callable
  // runtime value is deprecated"）。舊寫法把 register 當同步函式用，在 0.2.2 會拿到一個 Promise 而不是 handle。
  { member: "ctx.sessionProjections", what: '\u6295\u5F71\u6CE8\u518C\u8868:\u4ECE\u65E5\u5FD7\u6D3E\u751F\u7684"\u6BCF\u4F1A\u8BDD\u5F53\u524D\u503C"(\u53EF\u5408\u5E76\u6269\u5C55\u7684\u6295\u5F71\u7C7B\u578B\u8868 + provider \u5951\u7EA6);0.2.2 \u8D77 register() \u56DE Promise<ProjectionHandle>', example: "const handle = await ctx.sessionProjections.register({ key, stateVersion, init, apply }); \u91CA\u653E\u7528 handle.dispose() \u6216 fiber;registry \u7EA7\u540C\u6B65\u8BFB\u53D6\u5DF2\u5F03\u7528" },
  { member: "ctx.sessionProjectionCache", what: "\u6295\u5F71\u7F13\u5B58:\u6301\u4E45\u5316\u7684\u6BCF\u4F1A\u8BDD\u68C0\u67E5\u70B9\u8BB0\u5F55,\u8282\u6D41\u5199\u56DE + \u7F13\u5B58\u5217\u8868\u8BFB\u53D6", example: "\u7531 projection-cache \u63D2\u4EF6\u63D0\u4F9B,\u52A0\u901F\u6295\u5F71\u91CD\u5EFA" },
  { member: "ctx.sessionController", what: "\u4F1A\u8BDD\u63A7\u5236\u5668:\u4F1A\u8BDD\u751F\u547D\u5468\u671F\u52A8\u4F5C(\u521B\u5EFA/\u5207\u6362/\u63A7\u5236)", example: "ctx.sessionController \u7A0B\u5E8F\u5316\u63A7\u5236\u4F1A\u8BDD" },
  { member: "ctx.sessionTitle", what: "\u4F1A\u8BDD\u6807\u9898\u670D\u52A1:\u65E5\u5FD7\u652F\u6491 + provider \u6CE8\u518C\u8868(\u9996\u6761\u6D88\u606F/\u5168 prompt \u4E24\u79CD LLM \u7B56\u7565)", example: "ctx.sessionTitle \u8BFB\u53D6\u6216\u751F\u6210\u4F1A\u8BDD\u6807\u9898" },
  { member: "ctx.sessionTelemetry", what: "(abstract seam) \u4F1A\u8BDD\u9065\u6D4B\u540E\u7AEF:\u4E8B\u4EF6\u6355\u83B7\u3001\u6295\u5F71\u3001\u8131\u654F\u3001\u4E0A\u62A5(otel \u540E\u7AEF\u5373\u5B9E\u73B0)", example: "ctx.sessionTelemetry \u63A5 OpenTelemetry \u65E5\u5FD7\u7BA1\u9053" },
  { member: "ctx.sessionReferenceResolver", what: '\u8DE8\u4F1A\u8BDD\u5FEB\u7167\u5F15\u7528\u89E3\u6790\u5668:\u628A\u522B\u7684\u4F1A\u8BDD\u4F5C\u4E3A"\u4E0D\u53EF\u4FE1\u6A21\u578B\u4E0A\u4E0B\u6587"\u5F15\u5165', example: "ctx.sessionReferenceResolver \u5F15\u7528\u5176\u4ED6\u4F1A\u8BDD\u5185\u5BB9" },
  { member: "ctx.sessionFileReferences", what: "\u4F1A\u8BDD\u7EA7\u6587\u4EF6\u5F15\u7528\u96C6\u5408", example: "\u914D\u5408 @file \u8BED\u6CD5\u8BB0\u5F55\u672C\u4F1A\u8BDD\u5F15\u7528\u8FC7\u7684\u6587\u4EF6" },
  { member: "ctx.fileReferences", what: "(abstract seam) \u6587\u4EF6\u5F15\u7528\u53D1\u73B0\u5951\u7EA6 + \u5171\u4EAB @file \u8BED\u6CD5", example: "ctx.fileReferences \u89E3\u6790\u7528\u6237\u8F93\u5165\u91CC\u7684 @file" },
  { member: "ctx.sessionSkillCatalog", what: "\u672C\u4F1A\u8BDD\u7684\u6280\u80FD\u76EE\u5F55(\u6309\u4F1A\u8BDD\u7EF4\u5EA6\u7684\u6280\u80FD\u53EF\u89C1\u96C6)", example: "ctx.sessionSkillCatalog \u770B\u5F53\u524D\u4F1A\u8BDD\u80FD\u52A0\u8F7D\u54EA\u4E9B\u6280\u80FD" },
  { member: "ctx.compaction", what: "(abstract seam) \u538B\u7F29\u5F15\u64CE:\u9608\u503C\u9A71\u52A8\u7684 LLM \u6458\u8981\u538B\u7F29(compaction-basic \u662F\u5B9E\u73B0)", example: "ctx.compaction \u4E3B\u52A8\u89E6\u53D1/\u67E5\u8BE2\u538B\u7F29" },
  { member: "ctx.toolResultPruner", what: "\u5DE5\u5177\u7ED3\u679C\u526A\u679D\u5668:replay \u5B89\u5168\u7684\u65E0\u6A21\u578B head/middle/tail \u88C1\u526A", example: "ctx.get('toolResultPruner') \u5B58\u5728\u5373\u8BA9\u8DEF(handoff \u5DF2\u8FD9\u6837\u964D\u7EA7)" },
  { member: "ctx.tokenMeter", what: "token \u8BA1\u91CF:\u8BF7\u6C42\u524D\u7684\u9884\u7B97\u4F30\u7B97\u4E0E\u7528\u91CF\u53E3\u5F84", example: "ctx.tokenMeter \u4F30\u7B97\u4E0A\u4E0B\u6587\u5360\u7528(\u81EA\u5EFA metric \u524D\u7684\u6B63\u89E3)" },
  { member: "ctx.spillStore", what: "(abstract seam) \u6EA2\u51FA\u5B58\u50A8:\u8D85\u5927\u5DE5\u5177\u8F93\u51FA\u843D\u76D8\u3001\u4E0A\u4E0B\u6587\u91CC\u53EA\u7559\u6307\u9488", example: "ctx.spillStore \u5B58\u653E\u5927\u8F93\u51FA(\u66FF\u4EE3\u81EA\u5EFA\u4E34\u65F6\u6587\u4EF6)" },
  { member: "ctx.attachments", what: "(abstract seam) \u9644\u4EF6\u5B58\u50A8(\u56FE\u7247/\u6587\u4EF6\u7B49\u5165\u4F1A\u8BDD\u7684\u8F7D\u4F53)", example: "ctx.attachments \u8BFB\u5199\u4F1A\u8BDD\u9644\u4EF6" },
  { member: "ctx.fileUploads", what: "\u6587\u4EF6\u4E0A\u4F20\u901A\u9053", example: "web \u7AEF\u4E0A\u4F20\u6587\u4EF6\u8FDB\u5165\u4F1A\u8BDD" },
  { member: "ctx.jobController", what: "\u540E\u53F0\u4EFB\u52A1\u63A7\u5236\u5668(\u63D0\u4EA4/\u53D6\u6D88/\u67E5\u8BE2\u7684\u5177\u4F53\u63A7\u5236\u9762)", example: "ctx.jobController \u53D6\u6D88\u4E00\u4E2A\u957F\u4EFB\u52A1" },
  { member: "ctx.subagentModelSelection", what: "\u5B50\u4EE3\u7406/\u961F\u53CB\u7684\u6A21\u578B\u9009\u62E9\u914D\u7F6E", example: "\u63A7\u5236 subagent \u7528\u54EA\u4E2A provider/model" },
  { member: "ctx.agentLoop", what: "agent \u4E3B\u5FAA\u73AF(\u8F6E/\u6B65\u63A8\u8FDB)", example: "\u63D2\u4EF6\u6781\u5C11\u76F4\u63A5\u7528;\u7406\u89E3\u6267\u884C\u6A21\u578B\u65F6\u770B\u5B83" },
  { member: "ctx.agentDefaultModel", what: "\u9ED8\u8BA4\u6A21\u578B\u914D\u7F6E(provider/model/reasoningEffort)", example: "\u8BFB\u53D6\u5F53\u524D\u9ED8\u8BA4\u6A21\u578B\u8BBE\u7F6E" },
  { member: "ctx.agentPresets", what: "agent \u9884\u8BBE\u6CE8\u518C\u8868(\u4F1A\u8BDD\u7531\u54EA\u4E2A preset \u7EC4\u5408\u800C\u6210)", example: "ctx.agentPresets \u679A\u4E3E\u53EF\u7528 preset" },
  { member: "ctx.systemPrompt", what: "\u7CFB\u7EDF\u63D0\u793A\u8BCD\u88C5\u914D(\u5206\u7247/\u6CE8\u5165\u70B9)", example: "ctx.systemPrompt \u6CE8\u5165\u63D2\u4EF6\u81EA\u5DF1\u7684\u63D0\u793A\u7247\u6BB5" },
  { member: "ctx.planMode", what: "\u8BA1\u5212\u6A21\u5F0F\u63A7\u5236\u5668(\u5148\u51FA\u8BA1\u5212\u518D\u6267\u884C\u7684\u6A21\u5F0F)", example: "ctx.planMode \u68C0\u6D4B/\u8FDB\u5165\u8BA1\u5212\u6A21\u5F0F" },
  { member: "ctx.commands", what: "\u659C\u6760\u547D\u4EE4\u8FD0\u884C\u65F6(\u4EBA\u7C7B\u53EF\u89E6\u53D1\u7684\u547D\u4EE4)", example: "ctx.commands \u6CE8\u518C /mycommand" },
  { member: "ctx.schedule", pkg: "@deepseek-ai/dsh-schedule", what: "\u6392\u7A0B\u670D\u52A1:agent \u4F5C\u7528\u57DF\u7684\u6301\u4E45\u63D0\u9192(\u4E00\u6B21\u6027/\u56FA\u5B9A\u9891\u7387),\u8BB0\u5F55\u5728\u4F1A\u8BDD\u4E8B\u4EF6\u65E5\u5FD7\u91CC\u3001\u5BBF\u4E3B\u91CD\u542F\u4ECD\u7ED3\u7B97", example: "ctx.schedule \u6CE8\u518C\u5B9A\u65F6\u63D0\u9192" },
  { member: "ctx.approval", what: "\u5BA1\u6279\u670D\u52A1:\u9700\u8981\u4EBA\u7C7B\u6279\u51C6\u7684\u52A8\u4F5C\u8D70\u5B83", example: "ctx.approval \u8BF7\u6C42\u4E00\u6B21\u5BA1\u6279" },
  { member: "ctx.permissionPresets", what: "\u6743\u9650\u9884\u8BBE(read-only / workspace-write / danger-full-access)", example: "ctx.permissionPresets \u67E5\u8BE2/\u5957\u7528\u6743\u9650\u6863" },
  { member: "ctx.sandbox", what: "(abstract seam) \u6C99\u7BB1\u63D0\u4F9B\u8005(\u6267\u884C\u9694\u79BB\u7684\u540E\u7AEF)", example: "ctx.sandbox \u5224\u65AD\u5F53\u524D\u9694\u79BB\u80FD\u529B" },
  { member: "ctx.sandboxPolicy", what: "\u6C99\u7BB1\u7B56\u7565\u670D\u52A1(\u54EA\u4E9B\u64CD\u4F5C\u88AB\u5141\u8BB8)", example: "ctx.sandboxPolicy \u67E5\u8BE2\u7B56\u7565\u51B3\u7B56" },
  { member: "ctx.credentialsController", what: "\u51ED\u8BC1\u63A7\u5236\u9762(\u5F55\u5165/\u66F4\u65B0/\u7BA1\u7406)", example: "\u914D\u7F6E\u754C\u9762\u5199\u51ED\u8BC1\u65F6\u8D70\u5B83" },
  { member: "ctx.authorization", what: "\u6388\u6743\u670D\u52A1", example: "ctx.authorization \u5224\u5B9A\u6388\u6743\u72B6\u6001" },
  { member: "ctx.deepseekAccount", what: "(abstract seam) DeepSeek \u8D26\u53F7\u63A5\u7F1D", example: "\u8BFB\u53D6 DeepSeek \u8D26\u53F7/\u989D\u5EA6\u4FE1\u606F" },
  { member: "ctx.browserUse", what: "\u6D4F\u89C8\u5668\u4F7F\u7528\u6CE8\u518C\u8868(\u628A\u6D4F\u89C8\u5668\u80FD\u529B\u63A5\u7ED9 agent)", example: "ctx.browserUse \u6CE8\u518C/\u83B7\u53D6\u6D4F\u89C8\u5668\u4F1A\u8BDD" },
  { member: "ctx.computerUse", what: "\u7535\u8111\u64CD\u4F5C\u6CE8\u518C\u8868(\u622A\u5C4F/\u8F93\u5165\u7B49 GUI \u63A7\u5236)", example: "ctx.computerUse \u63D0\u4F9B\u684C\u9762\u64CD\u4F5C\u80FD\u529B" },
  { member: "ctx.web", what: "web \u8FD0\u884C\u65F6(\u6293\u53D6/\u641C\u7D22\u7B49 web \u80FD\u529B)", example: "ctx.web \u53D6 web \u80FD\u529B\u9762" },
  { member: "ctx.webServer", what: "HTTP \u670D\u52A1\u5668(\u6302\u8DEF\u7531/\u7AEF\u70B9\u7684\u6B63\u89E3)", example: "ctx.webServer \u6CE8\u518C\u63D2\u4EF6\u81EA\u5DF1\u7684 API \u8DEF\u7531" },
  { member: "ctx.webhookRuntime", what: "webhook \u8FD0\u884C\u65F6(\u5916\u90E8\u56DE\u8C03\u5165\u53E3)", example: "ctx.webhookRuntime \u63A5\u6536\u5916\u90E8\u4E8B\u4EF6" },
  { member: "ctx.connection", what: "\u5BBF\u4E3B\u8FDE\u63A5\u53E5\u67C4(\u4E0E\u524D\u7AEF/\u5BBF\u4E3B\u7684\u8FDE\u63A5)", example: "\u9700\u8981\u4E3B\u52A8\u63A8\u4E8B\u4EF6\u7ED9 UI \u65F6\u7528" },
  { member: "ctx.clientModules", what: "\u5BA2\u6237\u7AEF\u6A21\u5757\u6CE8\u518C\u8868(\u63D2\u4EF6\u7684\u524D\u7AEF bundle \u6302\u8F7D\u70B9)", example: "ctx.clientModules \u6CE8\u518C/\u67E5\u5BA2\u6237\u7AEF\u6A21\u5757" },
  { member: "ctx.settingsController", what: "\u8BBE\u7F6E\u63A7\u5236\u9762(\u914D\u7F6E\u9879\u7684\u8BFB\u5199/\u53D8\u66F4)", example: "\u7A0B\u5E8F\u5316\u6539\u63D2\u4EF6\u8BBE\u7F6E" },
  { member: "ctx.workspaceFiles", what: "\u5DE5\u4F5C\u533A\u6587\u4EF6\u670D\u52A1", example: "ctx.workspaceFiles \u6309\u5DE5\u4F5C\u533A\u5217\u4E3E/\u8BFB\u53D6" },
  { member: "ctx.workspaceRegistry", what: "\u5DE5\u4F5C\u533A\u6CE8\u518C\u8868(\u6709\u54EA\u4E9B\u5DE5\u4F5C\u533A)", example: "ctx.workspaceRegistry \u679A\u4E3E\u5DE5\u4F5C\u533A" },
  { member: "ctx.workspaceController", what: "\u5DE5\u4F5C\u533A\u63A7\u5236\u5668(\u521B\u5EFA/\u5207\u6362)", example: "ctx.workspaceController \u5207\u6362\u5F53\u524D\u5DE5\u4F5C\u533A" },
  { member: "ctx.workspaceChanges", what: "\u5DE5\u4F5C\u533A\u53D8\u66F4(\u4EA4\u4ED8\u7269/\u6539\u52A8\u8FFD\u8E2A)", example: "\u8BFB\u53D6\u672C\u6B21\u6539\u52A8\u6E05\u5355" },
  { member: "ctx.directoryPicker", what: "(abstract seam) \u76EE\u5F55\u9009\u62E9\u5668(UI \u9009\u76EE\u5F55)", example: "\u9700\u8981\u7528\u6237\u9009\u8DEF\u5F84\u65F6\u7528" },
  { member: "ctx.directoryPickerController", what: "\u76EE\u5F55\u9009\u62E9\u5668\u63A7\u5236\u9762", example: "\u6865\u63A5\u524D\u7AEF\u76EE\u5F55\u9009\u62E9" },
  { member: "ctx.terminalController", what: "\u7EC8\u7AEF\u63A7\u5236\u9762", example: "\u63A7\u5236\u5185\u5D4C\u7EC8\u7AEF" },
  { member: "ctx.terminals", what: "\u7EC8\u7AEF\u4F1A\u8BDD\u670D\u52A1(\u6301\u4E45 shell \u4F1A\u8BDD)", example: "ctx.terminals \u5F00/\u590D\u7528\u7EC8\u7AEF\u4F1A\u8BDD" },
  { member: "ctx.shell", what: "(abstract seam) shell \u6267\u884C\u5668", example: "ctx.shell \u6267\u884C\u547D\u4EE4(\u7ECF\u6C99\u7BB1\u7B56\u7565)" },
  { member: "ctx.shellEnv", what: "shell \u73AF\u5883\u6CE8\u518C\u8868(\u6CE8\u5165\u73AF\u5883/\u53D8\u91CF)", example: "ctx.shellEnv \u6CE8\u518C\u547D\u4EE4\u73AF\u5883" },
  { member: "ctx.subprocess", what: "(abstract seam) \u5B50\u8FDB\u7A0B\u8FD0\u884C\u65F6", example: "ctx.subprocess \u8D77\u5B50\u8FDB\u7A0B(\u6BD4\u88F8 spawn \u53EF\u63A7)" },
  { member: "ctx.ssh", what: "SSH \u8FDE\u63A5\u80FD\u529B", example: "ctx.ssh \u8FDE\u8FDC\u7AEF\u4E3B\u673A" },
  { member: "ctx.lsp", what: "LSP \u670D\u52A1:\u8BED\u8A00\u670D\u52A1\u5668(\u8BCA\u65AD/\u8DF3\u8F6C/\u7B26\u53F7)", example: "ctx.lsp \u53D6\u8BED\u8A00\u8BCA\u65AD(\u6BD4 grep \u5F3A)" },
  { member: "ctx.mcpResources", what: "MCP \u8D44\u6E90\u8FD0\u884C\u65F6(\u5916\u90E8 MCP server \u7684\u8D44\u6E90\u9762)", example: "ctx.mcpResources \u5217/\u8BFB MCP \u8D44\u6E90" },
  { member: "ctx.typert", what: "typert \u534F\u8BAE\u6CE8\u518C\u8868(\u7C7B\u578B\u5316 RPC \u5951\u7EA6)", example: "\u8DE8\u8FDB\u7A0B/\u524D\u7AEF\u901A\u4FE1\u7684\u7C7B\u578B\u5316\u6865" },
  { member: "ctx.typertGateway", what: "typert \u7F51\u5173\u670D\u52A1", example: "typert \u8BF7\u6C42\u7684\u7F51\u5173\u4FA7" },
  { member: "ctx.ptcRuntime", what: "(abstract seam) PTC \u8FD0\u884C\u65F6(\u53EF\u7F16\u7A0B\u5DE5\u5177\u8C03\u7528)", example: "PTC \u80FD\u529B\u7684\u8FD0\u884C\u65F6\u63A5\u7F1D" },
  { member: "ctx.invariants", what: "\u4E0D\u53D8\u91CF\u6CE8\u518C\u8868(\u65AD\u8A00/\u5B88\u62A4)", example: "ctx.invariants \u6CE8\u518C\u8FD0\u884C\u65F6\u65AD\u8A00" },
  { member: "ctx.pluginManager", what: "\u63D2\u4EF6\u7BA1\u7406\u5668(\u6302\u8F7D/\u5378\u8F7D)", example: "ctx.pluginManager \u67E5\u5DF2\u6302\u63D2\u4EF6" },
  { member: "ctx.pluginRegistryProbe", what: "\u63D2\u4EF6\u6CE8\u518C\u8868\u63A2\u9488", example: "\u8BCA\u65AD\u63D2\u4EF6\u89E3\u6790\u72B6\u6001" },
  { member: "ctx.profileContext", what: "profile \u4E0A\u4E0B\u6587(\u5F53\u524D\u6863\u4F4D\u4FE1\u606F)", example: "ctx.profileContext \u8BFB\u5F53\u524D profile" },
  { member: "ctx.configEditor", what: "\u914D\u7F6E\u7F16\u8F91\u5668(\u7A0B\u5E8F\u5316\u6539\u914D\u7F6E)", example: "ctx.configEditor \u4FEE\u6539\u914D\u7F6E\u6811" },
  { member: "ctx.hmr", what: "\u70ED\u91CD\u8F7D", example: "\u5F00\u53D1\u671F\u63D2\u4EF6\u70ED\u66F4\u65B0" },
  { member: "ctx.inspector", what: "\u68C0\u67E5\u5668\u670D\u52A1(\u8FD0\u884C\u65F6\u68C0\u89C6)", example: "ctx.inspector \u68C0\u89C6\u670D\u52A1\u56FE" },
  { member: "ctx.cordisInspect", what: "Cordis \u68C0\u89C6\u6CE8\u518C\u8868", example: "\u66B4\u9732\u53EF\u68C0\u89C6\u5BF9\u8C61" },
  { member: "ctx.dynamicCordisRunner", what: "\u52A8\u6001 Cordis \u8FD0\u884C\u5668(\u8FD0\u884C\u65F6\u6267\u884C\u4EE3\u7801)", example: "ctx.dynamicCordisRunner \u52A8\u6001\u8DD1\u4E00\u6BB5\u63D2\u4EF6\u4EE3\u7801" },
  { member: "ctx.messageFeedback", what: "\u5355\u6761\u6D88\u606F\u53CD\u9988(\u70B9\u8D5E/\u70B9\u8E29)", example: "ctx.messageFeedback \u8BB0\u5F55\u6D88\u606F\u53CD\u9988" },
  { member: "ctx.sessionFeedback", what: "\u4F1A\u8BDD\u7EA7\u53CD\u9988", example: "ctx.sessionFeedback \u8BB0\u5F55\u4F1A\u8BDD\u8BC4\u4EF7" },
  { member: "ctx.speechToText", what: "\u8BED\u97F3\u8F6C\u6587\u5B57", example: "ctx.speechToText \u8F6C\u5199\u97F3\u9891" },
  { member: "ctx.speechController", what: "\u8BED\u97F3\u8F93\u5165\u63A7\u5236\u9762", example: "\u63A7\u5236\u5F55\u97F3/\u8F6C\u5199\u6D41\u7A0B" },
  { member: "ctx.officeToPdf", what: "Office \u6587\u6863\u8F6C PDF", example: "ctx.officeToPdf \u8F6C\u6362 docx/xlsx" },
  { member: "ctx.productTelemetry", what: "\u4EA7\u54C1\u9065\u6D4B", example: "\u4E0A\u62A5\u63D2\u4EF6\u4F7F\u7528\u6307\u6807" }
];

// src/guide.ts
var NOTE_BY_MEMBER = new Map(CTX_NOTES.map((n) => [n.member, n]));
var CTX_SERVICES = GENERATED_CTX_CATALOG.map((g) => {
  const note = NOTE_BY_MEMBER.get(g.member);
  return {
    member: g.member,
    ...note?.pkg ? { pkg: note.pkg } : {},
    type: g.type,
    subsystem: g.subsystem,
    ...g.seam ? { seam: true } : {},
    what: note?.what ?? `(\u5B98\u65B9 ${g.subsystem} \u5B50\u7CFB\u7EDF\u670D\u52A1; \u8BF4\u660E\u5F85\u8865)`,
    example: note?.example ?? `\u89C1\u5B98\u65B9 docs/subsystems/${g.subsystem}.md`
  };
});
var SCHEDULE_NOTE = [
  '\u6392\u7A0B(dsh-schedule):\u4E0D\u662F ctx \u6210\u5458,\u800C\u662F function-plugin(name="schedule")',
  "  - \u63D0\u4F9B agent \u4F5C\u7528\u57DF\u7684\u6301\u4E45\u63D0\u9192:\u4E00\u6B21\u6027(after/at)\u4E0E\u56FA\u5B9A\u9891\u7387(every)",
  "  - \u8BB0\u5F55\u5728\u4F1A\u8BDD\u4E8B\u4EF6\u65E5\u5FD7(\u4E8B\u4EF6\u6EAF\u6E90),\u5BBF\u4E3B\u91CD\u542F\u540E\u4ECD\u80FD\u7ED3\u7B97",
  "  - \u5E95\u5C42\u8BA1\u65F6\u7531 cordis-plugin-timer(dsh-base \u7684 timer \u884C)\u9A71\u52A8",
  "  - \u7528\u6CD5:\u4F9D\u8D56 @deepseek-ai/dsh-schedule \u63D0\u4F9B\u7684\u5DE5\u5177/API \u6CE8\u518C\u63D0\u9192"
].join("\n");
var BUNDLE_ROWS = [
  { id: "timer", pkg: "@deepseek-ai/cordis-plugin-timer", layer: "dsh-base", what: "\u8BA1\u65F6\u5668\u57FA\u7840\u8BBE\u65BD(\u6392\u7A0B\u5E95\u5C42)" },
  { id: "hmr", pkg: "@deepseek-ai/cordis-plugin-hmr", layer: "dsh-base", what: "\u70ED\u91CD\u8F7D(\u5F00\u53D1\u671F)" },
  { id: "llm", pkg: "@deepseek-ai/dsh-llm", layer: "dsh-base", what: "LLM \u901A\u9053(ctx.llm)" },
  { id: "session", pkg: "@deepseek-ai/dsh-session", layer: "dsh-base", what: "\u4F1A\u8BDD\u5B58\u50A8(ctx.sessions)" },
  { id: "typert", pkg: "@deepseek-ai/dsh-typert-registry", layer: "dsh-base", what: "typert \u534F\u8BAE\u6CE8\u518C\u8868" },
  { id: "typert-loader", pkg: "@deepseek-ai/dsh-typert-loader", layer: "dsh-base", what: "typert \u52A0\u8F7D\u5668" },
  { id: "typert-gateway", pkg: "@deepseek-ai/dsh-api-gateway", layer: "dsh-base", what: "API \u7F51\u5173(typert)" },
  { id: "session-title", pkg: "@deepseek-ai/dsh-session-title", layer: "dsh-base", what: "\u4F1A\u8BDD\u6807\u9898(\u515C\u5E95\u89C4\u5219)" },
  { id: "session-title-llm", pkg: "@deepseek-ai/dsh-session-title-first-prompt-llm", layer: "dsh-base", what: "\u4F1A\u8BDD\u6807\u9898(LLM \u751F\u6210)" },
  { id: "user-questions", pkg: "@deepseek-ai/dsh-user-questions", layer: "dsh-base", what: "\u7528\u6237\u63D0\u95EE(ctx.userQuestions)" },
  { id: "agent", pkg: "@deepseek-ai/dsh-agent", layer: "dsh-base", what: "Agent \u6846\u67B6(ctx.agents)" },
  { id: "code-runtime", pkg: "@deepseek-ai/dsh-code-runtime-worker-thread", layer: "dsh-web-app", what: "\u4EE3\u7801\u8FD0\u884C\u65F6(worker)" },
  { id: "storage", pkg: "@deepseek-ai/dsh-storage", layer: "dsh-web-app", what: "\u5B58\u50A8\u62BD\u8C61(ctx.storage)" },
  { id: "storage-json", pkg: "@deepseek-ai/dsh-storage-json", layer: "dsh-web-app", what: "JSON \u6587\u4EF6\u5B58\u50A8\u5B9E\u73B0" },
  { id: "storage-domain", pkg: "@deepseek-ai/dsh-storage-domain", layer: "dsh-web-app", what: "\u9886\u57DF\u5B58\u50A8\u5206\u533A" }
];
var LAYER_NOTE = [
  "\u5B98\u65B9 bundle \u5C42\u53E0\u89C4\u5219(\u5199\u63D2\u4EF6\u5FC5\u5907):",
  "  - dsh-base:\u6BCF\u4E2A profile \u7684\u6838\u5FC3\u5C42,\u4E00\u884C\u4E00\u4E2A\u5B98\u65B9\u670D\u52A1(id \u2192 \u5305)",
  "  - dsh-web-app:web \u8868\u9762,\u6309 id \u8986\u76D6 base \u7684 config,\u518D insert \u81EA\u5DF1\u7684\u884C",
  "  - \u7528\u6237 profile \u7684 cordis.patch.yml \u5728\u6700\u540E,\u540E\u5199\u8986\u76D6\u5148\u5199(\u6309\u884C id)",
  "  - patch \u53EA\u66FF\u6362\u6574\u884C config,\u4E0D\u5408\u5E76\u2014\u2014\u914D\u7F6E\u591A\u5C42\u7684\u884C\u5FC5\u987B\u6BCF\u5C42\u5B8C\u6574\u91CD\u8FF0",
  "  - insert \u884C\u6CA1\u6709\u52A0\u8F7D\u987A\u5E8F\u8BED\u4E49,\u6FC0\u6D3B\u7531\u670D\u52A1\u53EF\u7528\u6027\u9A71\u52A8"
].join("\n");
var DOMAIN_PACKAGES = [
  { domain: "LLM \u63A8\u7406", pkgs: ["@deepseek-ai/dsh-llm", "@deepseek-ai/dsh-llm-deepseek", "@deepseek-ai/dsh-llm-retry"] },
  { domain: "Agent \u6846\u67B6", pkgs: ["@deepseek-ai/dsh-agent", "@deepseek-ai/dsh-agent-loop", "@deepseek-ai/dsh-agent-presets", "@deepseek-ai/dsh-subagent", "@deepseek-ai/dsh-workflow"] },
  { domain: "\u5DE5\u5177", pkgs: ["@deepseek-ai/dsh-tools", "@deepseek-ai/dsh-tool-bash", "@deepseek-ai/dsh-tool-fs", "@deepseek-ai/dsh-tool-subagent", "@deepseek-ai/dsh-tool-todo", "@deepseek-ai/dsh-tool-ask-user", "@deepseek-ai/dsh-tool-skill", "@deepseek-ai/dsh-tool-web"] },
  { domain: "\u4F1A\u8BDD\u4E0E\u6301\u4E45\u5316", pkgs: ["@deepseek-ai/dsh-session", "@deepseek-ai/dsh-session-persistence", "@deepseek-ai/dsh-session-persistence-jsonl", "@deepseek-ai/dsh-session-query-sqlite", "@deepseek-ai/dsh-storage", "@deepseek-ai/dsh-storage-json"] },
  { domain: "\u6280\u80FD", pkgs: ["@deepseek-ai/dsh-skill", "@deepseek-ai/dsh-skill-filesystem"] },
  { domain: "\u6392\u7A0B", pkgs: ["@deepseek-ai/dsh-schedule", "@deepseek-ai/cordis-plugin-timer"] },
  { domain: "\u6587\u4EF6\u4E0E\u6C99\u7BB1", pkgs: ["@deepseek-ai/dsh-fs", "@deepseek-ai/dsh-fs-local", "@deepseek-ai/dsh-fs-observation-policy", "@deepseek-ai/dsh-fs-sandbox", "@deepseek-ai/dsh-sandbox", "@deepseek-ai/dsh-sandbox-policy"] },
  { domain: "shell \u6267\u884C", pkgs: ["@deepseek-ai/dsh-bash-local", "@deepseek-ai/dsh-bash-sandbox", "@deepseek-ai/dsh-pwsh-local", "@deepseek-ai/dsh-pwsh-sandbox", "@deepseek-ai/dsh-subprocess"] },
  { domain: "Web \u5BBF\u4E3B", pkgs: ["@deepseek-ai/dsh-host-webserver", "@deepseek-ai/dsh-web-app", "@deepseek-ai/dsh-web-frontend", "@deepseek-ai/dsh-client-runtime", "@deepseek-ai/dsh-client-ui-*"] },
  { domain: "\u51ED\u8BC1\u4E0E\u5B89\u5168", pkgs: ["@deepseek-ai/dsh-credentials", "@deepseek-ai/dsh-credentials-local", "@deepseek-ai/dsh-authorization", "@deepseek-ai/dsh-permission-presets"] },
  { domain: "\u4EFB\u52A1\u4E0E\u76EE\u6807", pkgs: ["@deepseek-ai/dsh-jobs", "@deepseek-ai/dsh-jobs-local", "@deepseek-ai/dsh-goal", "@deepseek-ai/dsh-goal-round-driver", "@deepseek-ai/dsh-timeout"] },
  { domain: "\u5916\u90E8\u96C6\u6210", pkgs: ["@deepseek-ai/dsh-mcp-client", "@deepseek-ai/dsh-web-search-deepseek", "@deepseek-ai/dsh-attachment", "@deepseek-ai/dsh-file-reference"] }
];
var TOPICS = [
  {
    id: "overview",
    title: "DSH \u63D2\u4EF6\u5168\u666F",
    body: [
      "\u4E00\u5207\u7686\u63D2\u4EF6:profile \u7684 bundles \u5217\u8868 + cordis.patch.yml \u7EC4\u5408\u51FA\u63D2\u4EF6\u6811\u3002",
      "\u5B98\u65B9\u5206\u4E24\u5C42:dsh-base(\u6838\u5FC3\u670D\u52A1)\u4E0E dsh-web-app(\u6D4F\u89C8\u5668\u8868\u9762)\u3002",
      "\u4F60\u81EA\u5DF1\u7684\u63D2\u4EF6 = package.json(dsh.bundle \u58F0\u660E)+ cordis.patch.yml(insert \u884C)+ dist \u5165\u53E3(name/apply)\u3002",
      "\u5148\u7528 guide_scan \u68C0\u67E5\u4F60\u7684\u63D2\u4EF6\u76EE\u5F55,\u518D\u53D1\u5E03\u3002",
      "",
      BUNDLE_ROWS.filter((r) => r.layer === "dsh-base").map((r) => `  - ${r.id} \u2192 ${r.pkg}`).join("\n"),
      "",
      "\u5B8C\u6574\u884C\u6E05\u5355\u4E0E\u914D\u7F6E\u89C1 node_modules/@deepseek-ai/dsh-base/cordis.patch.yml\u3002"
    ].join("\n")
  },
  {
    id: "bundle",
    title: "\u63D2\u4EF6\u5305\u5408\u89C4(boot \u786C\u6821\u9A8C)",
    body: [
      "boot \u52A0\u8F7D\u5668\u5BF9 bundles \u91CC\u7684\u5305\u505A\u786C\u6821\u9A8C,\u4E0D\u6EE1\u8DB3\u76F4\u63A5\u542F\u52A8\u5931\u8D25:",
      '  1. package.json \u5FC5\u987B\u58F0\u660E "dsh": { "bundle": { "patch": "./cordis.patch.yml" } }',
      "  2. patch \u6587\u4EF6\u5FC5\u987B\u662F\u9876\u5C42 YAML \u6570\u7EC4(\u7EAF\u6CE8\u91CA=\u5931\u8D25)",
      "  3. \u6BCF\u6761\u662F mapping,insert \u9879\u5E26 id + name,name \u5E94\u4E3A\u5305\u540D",
      "  4. files \u767D\u540D\u5355\u5E94\u542B dist + patch \u6587\u4EF6(\u907F\u514D publish \u5783\u573E)",
      "  5. main/types \u6307\u5411\u771F\u5B9E\u6587\u4EF6,\u5165\u53E3\u5BFC\u51FA name + apply",
      "",
      "profile \u4E00\u81F4\u6027(bundles \u2194 dependencies):",
      "  6. bundles \u91CC\u7684\u5305\u5FC5\u987B\u5728 dependencies \u58F0\u660E(\u5BBF\u4E3B\u63D0\u4F9B\u7684 @deepseek-ai/dsh-base\u3001@deepseek-ai/dsh-web-app \u9664\u5916),\u5426\u5219\u65B0\u673A\u5668 pnpm install \u540E boot \u65E0\u6CD5\u89E3\u6790",
      '  7. dependencies \u91CC\u58F0\u660E\u4E86 dsh.bundle \u7684\u63D2\u4EF6\u5FC5\u987B\u5728 bundles \u91CC,\u5426\u5219\u88C5\u4E0A\u4E86\u4E5F\u6C38\u8FDC\u4E0D\u4F1A\u88AB\u6302\u8F7D("installed but never loaded" \u9677\u9631)',
      "",
      "\u5FEB\u901F\u81EA\u67E5:guide_scan <\u63D2\u4EF6\u76EE\u5F55\u6216 profile \u76EE\u5F55>(\u81EA\u52A8\u8BC6\u522B\u6A21\u5F0F)"
    ].join("\n")
  },
  {
    id: "schedule",
    title: "\u6392\u7A0B(dsh-schedule)",
    body: SCHEDULE_NOTE
  },
  {
    id: "agent",
    title: "Agent \u6846\u67B6(ctx.agents / subagents / workflow)",
    body: [
      "ctx.agents:AgentRegistry \u2014 \u6CE8\u518C/\u83B7\u53D6 agent;\u6BCF\u4E2A agent \u6709\u72EC\u7ACB\u4F5C\u7528\u57DF\u670D\u52A1\u6811\u3002",
      "ctx.subagents:SubagentRuntime \u2014 \u547D\u540D provider \u6CE8\u518C\u8868(spawn/fork/acp/codex/claude-code/dsh-sdk)+ \u4E00\u6B21\u6027\u6D3E\u53D1 +",
      "  \u6301\u4E45\u5B50\u4F1A\u8BDD\u53D1\u73B0(listChildren/listDescendants)+ continuable \u5B50\u4EE3\u7406(\u6FC0\u6D3B\u3001\u51B7\u6062\u590D\u3001sendMessage\u3001interrupt)\u3002",
      "ctx.agentTeams:TeamService \u2014 Agent Teams:\u6BCF\u4E2A\u666E\u901A\u8FD0\u884C\u65F6\u6839\u8282\u70B9\u90FD\u662F\u9690\u5F0F Lead,\u63D0\u4F9B\u540D\u518C\u3001\u6301\u4E45\u5BF9\u7B49\u4FE1\u7BB1\u3001\u5171\u4EAB\u4EFB\u52A1 DAG\u3002",
      "  \u5C5E\u5B9E\u9A8C\u6027 bundle(@deepseek-ai/dsh-experimental-agent-team-profile),\u672A\u6302\u8F7D\u65F6 ctx.agentTeams \u4E0D\u5B58\u5728,\u5FC5\u987B\u5224\u7A7A\u3002",
      "ctx.workflowEngine:WorkflowEngine \u2014 \u591A agent \u7F16\u6392(\u5BF9\u5E94\u5BBF\u4E3B workflow \u5DE5\u5177)\u3002",
      "ctx.goals:GoalService \u2014 \u957F\u5468\u671F\u76EE\u6807\u72B6\u6001\u673A(\u81EA\u52A8\u7EED\u8F6E,\u5BF9\u5E94\u5BBF\u4E3B goal \u5DE5\u5177)\u3002",
      "",
      "\u63D2\u4EF6\u8981\u6D3E\u6D3B:\u4F18\u5148 ctx.subagents/ctx.workflowEngine,\u800C\u4E0D\u662F\u81EA\u5DF1\u9020\u5FAA\u73AF\u3002",
      "\u8FB9\u754C:\u5B50\u4EE3\u7406 seam \u4E0D\u63D0\u4F9B\u5BF9\u7B49\u901A\u4FE1\u3001\u7A33\u5B9A\u547D\u540D\u540D\u518C\u3001\u5171\u4EAB\u4EFB\u52A1\u6240\u6709\u6743\u2014\u2014\u8FD9\u4E09\u4EF6\u4E8B\u7531 Agent Teams \u8865\u4E0A;",
      "  \u53CD\u8FC7\u6765,Team profile \u7981\u7528\u7684\u53EA\u662F\u6A21\u578B\u53EF\u89C1\u7684 subagent / subagent_fork \u5DE5\u5177,",
      "  ctx.subagents \u4F5C\u4E3A\u670D\u52A1 API \u4ECD\u662F\u5171\u4EAB\u57FA\u7840\u8BBE\u65BD,\u63D2\u4EF6\u7167\u5E38\u53EF\u8C03\u3002",
      "\u53C2\u8003\u5B9E\u73B0:refs/dsh-src-0.1.7-rc.2 \u7684 packages/subagent/* \u4E0E packages/experimental/agent-team/*\u3002"
    ].join("\n")
  },
  {
    id: "ctx",
    title: "ctx.* \u670D\u52A1\u5730\u56FE",
    body: CTX_SERVICES.map((s) => `  ${s.member} (${s.pkg ?? s.subsystem ?? "official"}) \u2014 ${s.what}
    \u4F8B:${s.example}`).join("\n")
  },
  {
    id: "official",
    title: "\u5B98\u65B9 bundle \u5C42\u53E0",
    body: LAYER_NOTE
  }
];
function learnTopic(query) {
  const q = query.trim().toLowerCase();
  const pkgLabel = (s) => s.pkg ?? `${s.subsystem} (pkg \u672A\u6838\u5B9E)`;
  const ctxHit = q.startsWith("ctx.") ? CTX_SERVICES.find((s) => s.member.toLowerCase().startsWith(q)) : CTX_SERVICES.find((s) => s.member.toLowerCase() === q || (s.pkg ?? "").toLowerCase().includes(q));
  if (ctxHit) {
    return [
      `# ${ctxHit.member} \u2014 ${pkgLabel(ctxHit)}`,
      "",
      `\u7C7B\u578B:${ctxHit.type}`,
      `\u7528\u9014:${ctxHit.what}`,
      `\u793A\u4F8B:${ctxHit.example}`
    ].join("\n");
  }
  const hit = TOPICS.find((t) => t.id === q) ?? TOPICS.find((t) => t.title.toLowerCase().includes(q) || q.includes(t.id));
  if (hit) return `# ${hit.title}

${hit.body}`;
  const pkgHit = DOMAIN_PACKAGES.find((d) => d.domain.includes(q) || d.pkgs.some((p) => p.includes(q)));
  if (pkgHit) {
    return [`# \u9886\u57DF:${pkgHit.domain}`, "", pkgHit.pkgs.map((p) => `  - ${p}`).join("\n"), "", "\u53EF\u7528 guide_learn ctx / bundle / agent / schedule \u6DF1\u5165\u3002"].join("\n");
  }
  return [
    "# guide_learn \u4E3B\u9898",
    "",
    "\u53EF\u7528\u4E3B\u9898:overview(\u5168\u666F)/ bundle(\u5408\u89C4)/ schedule(\u6392\u7A0B)/ agent(agent \u6846\u67B6)/ ctx(ctx \u670D\u52A1\u5730\u56FE)/ official(\u5B98\u65B9 bundle \u5C42\u53E0)",
    "\u4E5F\u53EF\u641C ctx.llm\u3001ctx.tools\u3001dsh-schedule\u3001dsh-agent \u7B49\u5177\u4F53\u6210\u5458/\u5305\u540D\u3002"
  ].join("\n");
}

// src/index.ts
var name = "dsh-plugin-guide";
var inject = ["tools"];
function apply(ctx) {
  ctx.tools.register(defineTool({
    name: "guide_scan",
    description: "Scan a DSH plugin directory (boot-loader conformance: dsh.bundle declaration, cordis.patch.yml as a top-level YAML array with insert id+name rows, files allowlist, main/types and entry exports) OR a dsh profile directory (bundles/dependencies consistency \u2014 a plugin declared in dependencies but missing from dsh.profile.bundles is never mounted by the boot loader). Auto-detects the mode. Returns a per-rule pass/fail report. Run this before publishing any plugin or deploying a profile.",
    parameters: {
      dir: {
        type: "string",
        description: "Absolute path to the plugin package directory or the dsh profile directory (containing package.json).",
        required: true
      }
    },
    output: {
      schema: { type: "string" },
      render: (_args, value) => [{ type: "text", text: value }]
    },
    async execute(args) {
      return formatReport(scan(args.dir));
    }
  }));
  ctx.tools.register(defineTool({
    name: "guide_boot",
    description: "One-shot DSH boot verification: starts a throwaway `dsh web --port <random cold port> --no-open` instance on this host, waits ~20s, then reports PASS only if the process stays alive, stderr stays empty, the port listens, and (when a browser is available) the rendered page has no plugin loader errors (HARNESS overlay). Optional uiChecks verifies plugin UI actually mounted: pass [{id, marker}] where marker is a substring expected in the rendered DOM (e.g. a data-* attribute the plugin client sets on load). Temporarily moves the task-board single-instance lock aside and restores it.",
    parameters: {
      uiChecks: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            id: { type: "string" },
            marker: { type: "string" }
          }
        },
        description: "Optional plugin UI markers to verify in the rendered DOM (id + marker substring)"
      }
    },
    output: {
      schema: { type: "string" },
      render: (_args, value) => [{ type: "text", text: value }]
    },
    async execute(args) {
      const r = await bootCheck(void 0, void 0, args.uiChecks ?? []);
      return [r.ok ? "PASS" : "FAIL", r.summary, "", r.detail].join("\n");
    }
  }));
  ctx.tools.register(defineTool({
    name: "guide_learn",
    description: "Look up how to use official DSH capabilities when writing plugins: ctx.* service map (ctx.llm / ctx.tools / ctx.agents / ctx.skills / ctx.sessions / ctx.storage / ctx.jobs / ctx.goals / ctx.subagents / ctx.agentTeams / ctx.workflowEngine / ctx.credentials / ctx.fs / ctx.userQuestions), scheduling (dsh-schedule), agent framework, official bundle layering (dsh-base / dsh-web-app), and the official package catalog by domain.",
    parameters: {
      topic: {
        type: "string",
        description: 'Topic id (overview / bundle / schedule / agent / ctx / official) or a free-text query like "ctx.llm", "dsh-schedule", "storage".',
        required: true
      }
    },
    output: {
      schema: { type: "string" },
      render: (_args, value) => [{ type: "text", text: value }]
    },
    async execute(args) {
      return learnTopic(args.topic);
    }
  }));
}
export {
  apply,
  bootCheck,
  extractToken,
  inject,
  name,
  selfEngine
};
