/**
 * scan.ts — DSH plugin conformance scan.
 *
 * Rules mirror the hard checks in the official boot loader
 * (@deepseek-ai/dsh-app-boot) and the publish hygiene we learned the hard way:
 *
 *   1. package.json must declare `dsh.bundle` (a patch file or an entry).
 *   2. `dsh.bundle.patch` must point to an existing file.
 *   3. The patch file must parse as a TOP-LEVEL YAML ARRAY of loader patch
 *      entries (boot throws otherwise: "must be a top-level YAML array").
 *   4. Every entry must be a mapping; every `insert` item needs `id` + `name`.
 *   5. `insert[].name` should equal the package's own name (self-insert).
 *   6. `files` allowlist should ship dist + the patch file.
 *   7. `main` / `types` must resolve to existing files.
 *   8. The bundled entry module should export `name` and `apply` (static probe
 *      of the built dist text when present).
 *   9. Every `ctx.<service>` read of a host-registered service must be declared
 *      in `export const inject` (cordis proxy throws "cannot get property X
 *      without inject" at apply time; optional chaining does not help).
 *      Currently enforced for 'tools' — the service every dsh host registers
 *      and the one we crashed on. Optional host capabilities (ctx.http) read
 *      as undefined and are ignored to avoid false positives.
 *
 * Profile mode (scanProfile, auto-selected when the target is a dsh profile —
 * its package.json declares `dsh.profile.bundles`):
 *
 *   9.  Every entry in `dsh.profile.bundles` must also be declared in
 *       `dependencies` (except the host-provided official layers) — otherwise a
 *       fresh `pnpm install` cannot resolve the bundle and boot fails.
 *   10. Every dependency that is itself a dsh plugin (its installed package.json
 *       declares `dsh.bundle`) must appear in `dsh.profile.bundles` — otherwise
 *       the boot loader never mounts it ("installed but never loaded", the
 *       classic deps-only trap).
 */

import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parse as parseYaml } from 'yaml';

/**
 * Official layers provided by the dsh host (global CLI), not by the profile's
 * own node_modules — matches @deepseek-ai/dsh-app-boot DEFAULT_PROFILE_BUNDLES
 * plus the web-app layer. A profile may list them in bundles without declaring
 * them in dependencies.
 */
export const HOST_PROVIDED_BUNDLES = ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app'];

export interface CheckResult {
  rule: string;
  ok: boolean;
  detail: string;
}

export interface ScanReport {
  dir: string;
  packageName: string | null;
  checks: CheckResult[];
  passed: number;
  failed: number;
  verdict: 'PASS' | 'FAIL';
}

export function scanPlugin(dir: string): ScanReport {
  const checks: CheckResult[] = [];
  const manifestPath = join(dir, 'package.json');
  let manifest: Record<string, unknown> | null = null;
  let packageName: string | null = null;

  // ---- 0. manifest readable ----------------------------------------------
  if (!existsSync(manifestPath)) {
    checks.push({ rule: 'manifest', ok: false, detail: 'package.json missing' });
    return finish(dir, packageName, checks);
  }
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Record<string, unknown>;
    packageName = typeof manifest.name === 'string' ? manifest.name : null;
    checks.push({ rule: 'manifest', ok: true, detail: `read ${manifestPath}` });
  } catch (e) {
    checks.push({ rule: 'manifest', ok: false, detail: `invalid JSON: ${String(e)}` });
    return finish(dir, packageName, checks);
  }

  // ---- 1. dsh.bundle declaration -----------------------------------------
  const dsh = manifest.dsh as Record<string, unknown> | undefined;
  const bundle = dsh?.bundle as Record<string, unknown> | undefined;
  if (!dsh || !bundle || (typeof bundle !== 'object')) {
    checks.push({
      rule: 'dsh.bundle',
      ok: false,
      detail: 'package.json must declare "dsh": { "bundle": { "patch": "./cordis.patch.yml" } } — boot rejects bundles without it',
    });
  } else {
    checks.push({ rule: 'dsh.bundle', ok: true, detail: 'dsh.bundle declared' });
  }

  // ---- 2. patch file exists ----------------------------------------------
  const patchRel = typeof bundle?.patch === 'string' ? bundle.patch : null;
  const patchPath = patchRel ? resolve(dir, patchRel) : null;
  if (!patchPath) {
    checks.push({ rule: 'patch.file', ok: false, detail: 'dsh.bundle.patch not set (string path required)' });
  } else if (!existsSync(patchPath)) {
    checks.push({ rule: 'patch.file', ok: false, detail: `dsh.bundle.patch points to missing file: ${patchRel}` });
  } else {
    checks.push({ rule: 'patch.file', ok: true, detail: `patch file exists: ${patchRel}` });
  }

  // ---- 3. patch is a top-level array -------------------------------------
  let patchList: unknown = null;
  if (patchPath && existsSync(patchPath)) {
    try {
      patchList = parseYaml(readFileSync(patchPath, 'utf8'));
      if (!Array.isArray(patchList)) {
        checks.push({
          rule: 'patch.array',
          ok: false,
          detail: `${patchRel} must be a TOP-LEVEL YAML ARRAY of loader patch entries (boot throws otherwise) — comment-only files fail`,
        });
      } else if (patchList.length === 0) {
        checks.push({ rule: 'patch.array', ok: false, detail: `${patchRel} is an empty array — it must insert at least one row` });
      } else {
        checks.push({ rule: 'patch.array', ok: true, detail: `${patchRel} parses as a top-level array (${patchList.length} entries)` });
      }
    } catch (e) {
      checks.push({ rule: 'patch.array', ok: false, detail: `failed to parse ${patchRel}: ${String(e)}` });
    }
  }

  // ---- 4. entries are mappings; inserts carry id + name -------------------
  if (Array.isArray(patchList)) {
    const badEntry = patchList.findIndex((e) => typeof e !== 'object' || e === null || Array.isArray(e));
    if (badEntry >= 0) {
      checks.push({ rule: 'patch.entries', ok: false, detail: `entry ${badEntry + 1} is not a mapping` });
    } else {
      checks.push({ rule: 'patch.entries', ok: true, detail: 'all patch entries are mappings' });
    }

    const inserts = patchList.flatMap((e) => (Array.isArray((e as Record<string, unknown>).insert) ? (e as Record<string, unknown>).insert as unknown[] : []));
    const badInsert = inserts.findIndex((it) => {
      const o = it as Record<string, unknown>;
      return typeof o?.id !== 'string' || typeof o?.name !== 'string';
    });
    if (inserts.length === 0) {
      checks.push({ rule: 'patch.insert', ok: false, detail: 'no - insert: rows found — the bundle would insert nothing' });
    } else if (badInsert >= 0) {
      checks.push({ rule: 'patch.insert', ok: false, detail: `insert item ${badInsert + 1} lacks id or name` });
    } else {
      checks.push({ rule: 'patch.insert', ok: true, detail: `${inserts.length} insert item(s), all with id + name` });
    }

    // ---- 5. self-insert name matches package name --------------------------
    if (packageName) {
      const mismatched = inserts.filter((it) => (it as Record<string, unknown>).name !== packageName);
      if (mismatched.length > 0) {
        checks.push({
          rule: 'patch.selfName',
          ok: false,
          detail: `insert name(s) ${mismatched.map((m) => JSON.stringify((m as Record<string, unknown>).name)).join(', ')} differ from package name ${packageName}`,
        });
      } else {
        checks.push({ rule: 'patch.selfName', ok: true, detail: `insert name matches package name ${packageName}` });
      }
    }
  }

  // ---- 6. files allowlist ships dist + patch ------------------------------
  const files = manifest.files;
  if (!Array.isArray(files)) {
    checks.push({ rule: 'files', ok: false, detail: 'no "files" allowlist — npm publish may ship src/, node_modules or other junk' });
  } else {
    const problems: string[] = [];
    if (!files.includes('dist')) problems.push('dist');
    if (patchRel && !files.includes(patchRel.replace(/^\.\//, ''))) problems.push(patchRel);
    if (problems.length === 0) {
      checks.push({ rule: 'files', ok: true, detail: 'files allowlist includes dist and the patch file' });
    } else {
      checks.push({ rule: 'files', ok: false, detail: `files allowlist missing: ${problems.join(', ')}` });
    }
  }

  // ---- 7. main / types resolve --------------------------------------------
  const main = typeof manifest.main === 'string' ? manifest.main : null;
  const types = typeof manifest.types === 'string' ? manifest.types : null;
  if (!main) {
    checks.push({ rule: 'entry.main', ok: false, detail: 'no "main" field' });
  } else if (!existsSync(resolve(dir, main))) {
    checks.push({ rule: 'entry.main', ok: false, detail: `main file missing: ${main} (run the build first)` });
  } else {
    checks.push({ rule: 'entry.main', ok: true, detail: `main resolves: ${main}` });
  }
  if (types && !existsSync(resolve(dir, types))) {
    checks.push({ rule: 'entry.types', ok: false, detail: `types file missing: ${types}` });
  } else if (types) {
    checks.push({ rule: 'entry.types', ok: true, detail: `types resolves: ${types}` });
  }

  // ---- 8. entry module exports name + apply (static probe) ----------------
  if (main && existsSync(resolve(dir, main))) {
    try {
      const text = readFileSync(resolve(dir, main), 'utf8');
      const hasName = /\bexport\s+(?:const|var|let)\s+name\b|\bname\s*=\s*['"]/.test(text);
      const hasApply = /\bexport\s+(?:function|const|var|let)\s+apply\b|\bapply\s*[:=(]/.test(text);
      if (hasName && hasApply) {
        checks.push({ rule: 'entry.exports', ok: true, detail: 'entry exports name + apply' });
      } else {
        const missing: string[] = [];
        if (!hasName) missing.push('name');
        if (!hasApply) missing.push('apply');
        checks.push({ rule: 'entry.exports', ok: false, detail: `entry likely missing export: ${missing.join(', ')}` });
      }
    } catch {
      checks.push({ rule: 'entry.exports', ok: true, detail: 'could not probe entry text (binary?)' });
    }
  }

  // ---- 9. ctx service access requires inject (cordis crash lesson) --------
  // cordis wraps ctx in a Service proxy: READING a registered-but-not-injected
  // service property (e.g. ctx.tools) THROWS "cannot get property X without
  // inject" at apply time — optional chaining (ctx.tools?.register) does NOT
  // help because the proxy get trap throws. Boot then fails hard. Services the
  // host does NOT register (ctx.http in the dsh host) read as undefined and do
  // not throw. We therefore only enforce services every dsh host registers —
  // currently 'tools' (the one we crashed on) — so optional host capabilities
  // never produce false positives.
  const HOST_REGISTERED_SERVICES = ['tools'];
  if (main && existsSync(resolve(dir, main))) {
    try {
      const text = readFileSync(resolve(dir, main), 'utf8');
      // Declaration and export must be statement-anchored (^ or newline) so the
      // rule's own help text ("add: export const inject = [...]") never matches.
      // esbuild bundles hoist the declaration to `var inject = [...]` and collect
      // exports at the tail (`export { ..., inject, ... }`) — both forms covered.
      const injectDecl = text.match(/(?:^|\n)\s*(?:export\s+const|const|var|let)\s+inject\s*=\s*\[([^\]]*)\]/);
      const injectExported = /(?:^|\n)\s*export\s+const\s+inject\b/.test(text)
        || /(?:^|\n)\s*export\s*\{[^}]*\binject\b/.test(text);
      const injected = injectDecl && injectExported
        ? [...injectDecl[1].matchAll(/['"]([^'"]+)['"]/g)].map((m) => m[1])
        : [];
      // Strip string literals before counting ctx.<service> reads, so doc text
      // inside descriptions (guide_learn lists "ctx.tools" etc.) is not treated
      // as code access.
      const codeOnly = text.replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`/g, '');
      const usedServices = [...new Set(
        [...codeOnly.matchAll(/\bctx\.([A-Za-z_$][\w$]*)/g)].map((m) => m[1]),
      )];
      const missing = usedServices.filter((s) => HOST_REGISTERED_SERVICES.includes(s) && !injected.includes(s));
      if (missing.length > 0) {
        checks.push({
          rule: 'entry.inject',
          ok: false,
          detail: `apply reads ctx.${missing.join(', ctx.')} but "export const inject" does not declare ${missing.join(', ')} — cordis proxy THROWS at boot (optional chaining does not help); add: export const inject = [${[...new Set([...injected, ...missing])].map((s) => `'${s}'`).join(', ')}]`,
        });
      } else {
        checks.push({ rule: 'entry.inject', ok: true, detail: 'ctx.<service> reads are declared in inject (or the service is optional on the host)' });
      }
    } catch {
      checks.push({ rule: 'entry.inject', ok: true, detail: 'could not probe entry text (binary?)' });
    }
  }

  return finish(dir, packageName, checks);
}

/**
 * Scan a dsh profile directory (package.json declares `dsh.profile.bundles`).
 * Catches the "installed but never loaded" trap (a plugin in dependencies but
 * not in bundles) and its mirror (a bundle that is not declared in
 * dependencies, so a fresh install cannot resolve it).
 */
export function scanProfile(dir: string): ScanReport {
  const checks: CheckResult[] = [];
  const manifestPath = join(dir, 'package.json');
  let manifest: Record<string, unknown> | null = null;
  let packageName: string | null = null;

  // ---- manifest + profile shape ------------------------------------------
  if (!existsSync(manifestPath)) {
    checks.push({ rule: 'profile.manifest', ok: false, detail: 'package.json missing' });
    return finish(dir, packageName, checks);
  }
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Record<string, unknown>;
    packageName = typeof manifest.name === 'string' ? manifest.name : null;
  } catch (e) {
    checks.push({ rule: 'profile.manifest', ok: false, detail: `invalid JSON: ${String(e)}` });
    return finish(dir, packageName, checks);
  }
  const profile = manifest.dsh as Record<string, unknown> | undefined;
  const bundlesRaw = profile?.profile as Record<string, unknown> | undefined;
  const bundles = Array.isArray(bundlesRaw?.bundles) ? (bundlesRaw.bundles as unknown[]).filter((b): b is string => typeof b === 'string') : null;
  if (!bundles) {
    checks.push({ rule: 'profile.manifest', ok: false, detail: 'not a dsh profile: "dsh": { "profile": { "bundles": [...] } } missing' });
    return finish(dir, packageName, checks);
  }
  checks.push({ rule: 'profile.manifest', ok: true, detail: `profile manifest with ${bundles.length} bundle(s)` });

  // ---- 9. every bundle is declared in dependencies ------------------------
  const deps = (manifest.dependencies ?? {}) as Record<string, unknown>;
  const depNames = new Set(Object.keys(deps));
  const missingDeps = bundles.filter((b) => !depNames.has(b) && !HOST_PROVIDED_BUNDLES.includes(b));
  if (missingDeps.length > 0) {
    checks.push({
      rule: 'profile.bundleInDeps',
      ok: false,
      detail: `bundles not declared in dependencies (fresh pnpm install cannot resolve them): ${missingDeps.join(', ')} — add to dependencies (host-provided ${HOST_PROVIDED_BUNDLES.join(', ')} exempt)`,
    });
  } else {
    checks.push({
      rule: 'profile.bundleInDeps',
      ok: true,
      detail: `every bundle is declared in dependencies (${HOST_PROVIDED_BUNDLES.length} host-provided layers exempt)`,
    });
  }

  // ---- 10. installed plugin deps are in bundles ---------------------------
  const nmDir = join(dir, 'node_modules');
  if (!existsSync(nmDir)) {
    checks.push({ rule: 'profile.depsInBundles', ok: true, detail: 'node_modules not installed — plugin-dependency check skipped (run pnpm install first)' });
  } else {
    const orphanPlugins: string[] = [];
    let inspected = 0;
    for (const name of Object.keys(deps)) {
      const pkgPath = join(nmDir, name, 'package.json');
      if (!existsSync(pkgPath)) continue; // git/scoped deps resolved elsewhere
      let pkg: Record<string, unknown>;
      try {
        pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as Record<string, unknown>;
      } catch {
        continue;
      }
      const isPlugin = Boolean((pkg.dsh as Record<string, unknown> | undefined)?.bundle);
      if (!isPlugin) continue; // plain library, not a bundle plugin
      inspected += 1;
      if (!bundles.includes(name)) orphanPlugins.push(name);
    }
    if (orphanPlugins.length > 0) {
      checks.push({
        rule: 'profile.depsInBundles',
        ok: false,
        detail: `plugin(s) installed but NOT in dsh.profile.bundles — boot never mounts them: ${orphanPlugins.join(', ')}`,
      });
    } else {
      checks.push({
        rule: 'profile.depsInBundles',
        ok: true,
        detail: `all ${inspected} installed plugin dep(s) appear in bundles`,
      });
    }
  }

  return finish(dir, packageName, checks);
}

/**
 * Auto-dispatch: plugin directory → scanPlugin, dsh profile directory →
 * scanProfile (detected by the `dsh.profile.bundles` shape).
 */
export function scan(dir: string): ScanReport {
  const manifestPath = join(dir, 'package.json');
  if (existsSync(manifestPath)) {
    try {
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Record<string, unknown>;
      const profileShape = (manifest.dsh as Record<string, unknown> | undefined)?.profile as Record<string, unknown> | undefined;
      if (profileShape?.bundles) return scanProfile(dir);
    } catch {
      // fall through to scanPlugin which reports the JSON error
    }
  }
  return scanPlugin(dir);
}

function finish(dir: string, packageName: string | null, checks: CheckResult[]): ScanReport {
  const passed = checks.filter((c) => c.ok).length;
  const failed = checks.filter((c) => !c.ok).length;
  return {
    dir,
    packageName,
    checks,
    passed,
    failed,
    verdict: failed === 0 ? 'PASS' : 'FAIL',
  };
}

export function formatReport(report: ScanReport): string {
  const lines: string[] = [];
  lines.push(`# scan ${report.dir}`);
  lines.push(`package: ${report.packageName ?? '(unknown)'}`);
  lines.push(`verdict: ${report.verdict} (${report.passed} pass / ${report.failed} fail)`);
  for (const c of report.checks) {
    lines.push(`  ${c.ok ? '✓' : '✗'} ${c.rule}: ${c.detail}`);
  }
  return lines.join('\n');
}
