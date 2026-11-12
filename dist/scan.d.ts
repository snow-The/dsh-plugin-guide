/**
 * scan.ts — DSH plugin conformance scan.
 *
 * Rules mirror the hard checks in the official boot loader
 * (@deepseek-ai/dsh-official-bundles, which in 0.2.2 took over the bundle list from the retired app-boot path) and the publish hygiene we learned the hard way:
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
 *   11. Tool schemas must be valid JSON-schema: `type` limited to the standard set, and
 *      every object schema needs an explicit `additionalProperties`. The host validates
 *      this inside register() and takes the whole plugin tree down when it fails.
 *   10. (advisory) test discipline: a runnable `scripts.test` AND actual test files.
 *      A missing script, or a script with nothing to run, both mean no safety net - but
 *      they do not stop a plugin from booting, so this is reported without failing the
 *      conformance verdict. A fuzz script is advisory too.
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
/**
 * Official layers provided by the dsh host (global CLI), not by the profile's
 * own node_modules — matches @deepseek-ai/dsh-official-bundles DEFAULT_PROFILE_BUNDLES
 * plus the web-app layer. A profile may list them in bundles without declaring
 * them in dependencies.
 */
export declare const HOST_PROVIDED_BUNDLES: string[];
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
    /** N/A = the package is not a DSH plugin at all (a library), so plugin rules do not apply. */
    verdict: 'PASS' | 'FAIL' | 'N/A';
}
export declare function scanPlugin(dir: string): ScanReport;
/**
 * Scan a dsh profile directory (package.json declares `dsh.profile.bundles`).
 * Catches the "installed but never loaded" trap (a plugin in dependencies but
 * not in bundles) and its mirror (a bundle that is not declared in
 * dependencies, so a fresh install cannot resolve it).
 */
export declare function scanProfile(dir: string): ScanReport;
/**
 * Auto-dispatch: plugin directory → scanPlugin, dsh profile directory →
 * scanProfile (detected by the `dsh.profile.bundles` shape).
 */
export declare function scan(dir: string): ScanReport;
export declare function formatReport(report: ScanReport): string;
