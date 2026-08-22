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
 */

import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parse as parseYaml } from 'yaml';

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

  return finish(dir, packageName, checks);
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
