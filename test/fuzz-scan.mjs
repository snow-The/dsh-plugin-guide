/**
 * Fuzz the conformance scanner.
 *
 * guide_scan is pointed at plugin directories the user (or a marketplace) hands it, so it
 * must survive hostile input: manifests that are not JSON, `files` as a string, `dsh` as
 * an array, patch files that are not YAML, YAML anchor bombs, path traversal in the patch
 * path, gigabyte-ish fields.
 *
 * Invariants, not exact verdicts:
 *   - never throw
 *   - always return a report string containing "verdict:"
 *   - bounded wall time per case
 *
 * Deterministic: seeded PRNG, so a failing case reproduces from the seed.
 *   node test/fuzz-scan.mjs [--iters=200] [--seed=12345]
 */
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { apply } from '../dist/index.js';

const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
const ITERS = Number(args.iters ?? 200);
const SEED = Number(args.seed ?? 20260911);

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = rng(SEED);
const pick = (l) => l[Math.floor(rand() * l.length) % l.length];

const VALID_PATCH = "- insert:\n    - id: dsh-fixture\n      name: '@snow-the/dsh-fixture'\n";
const validManifest = (extra = {}) => JSON.stringify({
  name: '@snow-the/dsh-fixture', version: '0.0.1', main: './dist/index.js',
  files: ['dist', 'cordis.patch.yml'], dsh: { bundle: { patch: './cordis.patch.yml' } }, ...extra,
}, null, 2);

const manifestCorpus = {
  invalidJson: () => '{',
  notJsonAtAll: () => 'this is not json',
  empty: () => '',
  bomValid: () => '\uFEFF' + validManifest(),
  huge: () => validManifest({ description: 'x'.repeat(1024 * 1024) }),
  filesAsString: () => validManifest({ files: 'dist' }),
  filesAsObject: () => validManifest({ files: { dist: true } }),
  filesWithNumbers: () => validManifest({ files: [1, 2, 3] }),
  dshAsString: () => validManifest({ dsh: 'x' }),
  dshAsArray: () => validManifest({ dsh: [] }),
  bundleAsString: () => validManifest({ dsh: { bundle: 'x' } }),
  patchAsNumber: () => validManifest({ dsh: { bundle: { patch: 42 } } }),
  patchTraversal: () => validManifest({ dsh: { bundle: { patch: '../../../../etc/passwd' } } }),
  patchAbsolute: () => validManifest({ dsh: { bundle: { patch: 'C:/definitely/not/here.yml' } } }),
  mainTraversal: () => validManifest({ main: '../../../x.js' }),
  noName: () => JSON.stringify({ version: '1' }),
  unicodeName: () => validManifest({ name: '\u0000\uD83D\uDE00@snow-the/x' }),
  null: () => 'null',
  array: () => '[]',
};

const patchCorpus = {
  valid: () => VALID_PATCH,
  empty: () => '',
  emptyArray: () => '[]',
  mappingNotArray: () => 'insert:\n  - id: x\n',
  invalidYaml: () => '- insert: [',
  anchorBomb: () => { let s = 'a: &a ["x","x"]\n'; for (let i = 0; i < 12; i++) s += 'b' + i + ': &b' + i + ' [*a,*a,*a,*a,*a,*a,*a,*a,*a]\n'; return s; },
  deepNesting: () => '- ' + '['.repeat(500) + ']'.repeat(500),
  huge: () => '- insert:\n    - id: x\n      name: "' + 'y'.repeat(1024 * 1024) + '"\n',
  binary: () => '\u0000\u0001\u0002\u0003',
  jsExpr: () => "- insert:\n    - id: !!js process.exit(1)\n      name: '@snow-the/x'\n",
  insertMissingName: () => '- insert:\n    - id: dsh-fixture\n',
  insertMissingId: () => "- insert:\n    - name: '@snow-the/x'\n",
  insertNotList: () => '- insert: { id: x, name: y }\n',
  duplicateKeys: () => '- insert:\n    - id: a\n      id: b\n      name: c\n',
  tabs: () => '-\tinsert:\n\t\t- id: x\n',
};

const registered = [];
apply({ tools: { register: (t) => registered.push(t) } });
const scan = registered.find((t) => t.name === 'guide_scan');
if (scan === undefined) { console.log(JSON.stringify({ error: 'guide_scan was not registered' })); process.exit(1); }

const problems = [];
const root = mkdtempSync(join(tmpdir(), 'fuzz-scan-'));
for (let i = 0; i < ITERS; i++) {
  const dir = join(root, 'case' + i);
  mkdirSync(dir, { recursive: true });
  const mName = pick(Object.keys(manifestCorpus));
  const pName = pick(Object.keys(patchCorpus));
  writeFileSync(join(dir, 'package.json'), manifestCorpus[mName]());
  if (rand() < 0.8) writeFileSync(join(dir, 'cordis.patch.yml'), patchCorpus[pName]());
  // sometimes mutate the manifest randomly (byte-level) to escape the curated corpus
  if (rand() < 0.3) {
    const mutated = Buffer.from(manifestCorpus[mName]());
    for (let k = 0; k < 3; k++) if (mutated.length > 0) mutated[Math.floor(rand() * mutated.length)] = Math.floor(rand() * 256);
    writeFileSync(join(dir, 'package.json'), mutated);
  }
  const started = Date.now();
  try {
    const report = await scan.execute({ dir });
    if (typeof report !== 'string' || !report.includes('verdict:')) {
      problems.push({ m: mName, p: pName, why: 'SHAPE: no verdict in report' });
    }
  } catch (err) {
    problems.push({ m: mName, p: pName, why: 'THREW: ' + (err && err.message ? err.message : String(err)) });
  }
  const ms = Date.now() - started;
  if (ms > 5000) problems.push({ m: mName, p: pName, why: 'SLOW: ' + ms + 'ms' });
  try { rmSync(dir, { recursive: true, force: true }); } catch { /* */ }
}
try { rmSync(root, { recursive: true, force: true }); } catch { /* */ }

const tally = (key) => { const acc = {}; for (const p of problems) { const k = key(p); acc[k] = (acc[k] ?? 0) + 1; } return acc; };
console.log(JSON.stringify({ seed: SEED, iterations: ITERS, problems: problems.length,
  byReason: tally((p) => String(p.why).split(':')[0]),
  byManifest: tally((p) => p.m), byPatch: tally((p) => p.p),
  samples: problems.slice(0, 6) }, null, 1));
process.exit(problems.length ? 1 : 0);
