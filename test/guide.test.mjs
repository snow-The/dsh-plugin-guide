// dsh-plugin-guide tests: tool registration + conformance scan against
// boot-loader rules, using throwaway fixtures that mirror the real failures
// we hit (missing dsh.bundle, comment-only patch, wrong insert name).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { name, apply } from '../dist/index.js';

function makeCtx() {
  const registered = [];
  return { ctx: { tools: { register: (def) => registered.push(def) } }, registered };
}

async function makeFixture(files) {
  const dir = await mkdtemp(join(tmpdir(), 'guide-'));
  for (const [rel, content] of Object.entries(files)) {
    const p = join(dir, rel);
    await mkdir(join(p, '..'), { recursive: true });
    await writeFile(p, content);
  }
  return dir;
}

const GOOD_MANIFEST = JSON.stringify({
  name: '@snow-the/good-plugin',
  version: '0.1.0',
  main: './dist/index.js',
  types: './dist/index.d.ts',
  files: ['dist', 'cordis.patch.yml'],
  dsh: { bundle: { patch: './cordis.patch.yml' } },
}, null, 2);

const GOOD_PATCH = `# good plugin
- insert:
    - id: good-plugin
      name: '@snow-the/good-plugin'
`;

const GOOD_ENTRY = `export const name = 'good-plugin';
export const inject = ['tools'];
export function apply(ctx) { ctx.tools.register({ name: 'x' }); }
`;

test('exports name and apply', () => {
  assert.equal(name, 'dsh-plugin-guide');
  assert.equal(typeof apply, 'function');
});

test('apply registers guide_scan and guide_learn', () => {
  const { ctx, registered } = makeCtx();
  apply(ctx);
  const names = registered.map((d) => d.name);
  assert.deepEqual(names.sort(), ['guide_boot', 'guide_learn', 'guide_scan']);
});

test('guide_scan passes a fully compliant plugin', async () => {
  const dir = await makeFixture({
    'package.json': GOOD_MANIFEST,
    'cordis.patch.yml': GOOD_PATCH,
    'dist/index.js': GOOD_ENTRY,
    'dist/index.d.ts': 'export declare const name: string;',
  });
  try {
    const { ctx, registered } = makeCtx();
    apply(ctx);
    const out = await registered.find((d) => d.name === 'guide_scan').execute({ dir });
    assert.match(out, /verdict: PASS/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('guide_scan fails a plugin without dsh.bundle (boot would reject)', async () => {
  const dir = await makeFixture({
    'package.json': JSON.stringify({ name: '@snow-the/x', version: '0.1.0', main: './dist/index.js' }, null, 2),
    'cordis.patch.yml': GOOD_PATCH,
    'dist/index.js': GOOD_ENTRY,
  });
  try {
    const { ctx, registered } = makeCtx();
    apply(ctx);
    const out = await registered.find((d) => d.name === 'guide_scan').execute({ dir });
    assert.match(out, /verdict: FAIL/);
    assert.match(out, /dsh\.bundle/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('guide_scan fails a comment-only patch (the exact busyloop 0.1.3 bug)', async () => {
  const dir = await makeFixture({
    'package.json': GOOD_MANIFEST,
    'cordis.patch.yml': '# only comments — no top-level array\n# boom\n',
    'dist/index.js': GOOD_ENTRY,
    'dist/index.d.ts': '',
  });
  try {
    const { ctx, registered } = makeCtx();
    apply(ctx);
    const out = await registered.find((d) => d.name === 'guide_scan').execute({ dir });
    assert.match(out, /verdict: FAIL/);
    assert.match(out, /top-level yaml array/i);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('guide_scan flags insert name mismatch with package name', async () => {
  const dir = await makeFixture({
    'package.json': GOOD_MANIFEST,
    'cordis.patch.yml': `- insert:\n    - id: other\n      name: '@snow-the/other'\n`,
    'dist/index.js': GOOD_ENTRY,
    'dist/index.d.ts': '',
  });
  try {
    const { ctx, registered } = makeCtx();
    apply(ctx);
    const out = await registered.find((d) => d.name === 'guide_scan').execute({ dir });
    assert.match(out, /verdict: FAIL/);
    assert.match(out, /differ from package name/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('guide_scan handles a missing directory gracefully', async () => {
  const { ctx, registered } = makeCtx();
  apply(ctx);
  const out = await registered.find((d) => d.name === 'guide_scan').execute({ dir: join(tmpdir(), 'definitely-not-here-12345') });
  assert.match(out, /package.json missing/);
});

test('guide_scan fails ctx.tools access without inject (the exact busyloop 0.1.5 crash)', async () => {
  const dir = await makeFixture({
    'package.json': GOOD_MANIFEST,
    'cordis.patch.yml': GOOD_PATCH,
    'dist/index.js': `export const name = 'bad-inject';
export function apply(ctx) { ctx.tools.register({ name: 'x' }); }
`,
    'dist/index.d.ts': '',
  });
  try {
    const { ctx, registered } = makeCtx();
    apply(ctx);
    const out = await registered.find((d) => d.name === 'guide_scan').execute({ dir });
    assert.match(out, /verdict: FAIL/);
    assert.match(out, /entry\.inject/);
    assert.match(out, /does not declare tools/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('guide_scan ignores optional host services (ctx.http) — no false positive', async () => {
  const dir = await makeFixture({
    'package.json': GOOD_MANIFEST,
    'cordis.patch.yml': GOOD_PATCH,
    'dist/index.js': `export const name = 'http-ok';
export const inject = ['tools'];
export function apply(ctx) { ctx.tools.register({ name: 'x' }); ctx.http?.mount('/x', () => {}); }
`,
    'dist/index.d.ts': '',
  });
  try {
    const { ctx, registered } = makeCtx();
    apply(ctx);
    const out = await registered.find((d) => d.name === 'guide_scan').execute({ dir });
    assert.match(out, /verdict: PASS/);
    assert.doesNotMatch(out, /entry\.inject.*FAIL/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('guide_learn returns the overview topic', async () => {
  const { ctx, registered } = makeCtx();
  apply(ctx);
  const out = await registered.find((d) => d.name === 'guide_learn').execute({ topic: 'overview' });
  assert.match(out, /DSH 插件全景/);
  assert.match(out, /dsh-base/);
});

test('guide_learn answers a ctx.* query', async () => {
  const { ctx, registered } = makeCtx();
  apply(ctx);
  const out = await registered.find((d) => d.name === 'guide_learn').execute({ topic: 'ctx.llm' });
  assert.match(out, /ctx\.llm/);
  assert.match(out, /LlmRuntime/);
});

test('guide_learn answers the schedule topic', async () => {
  const { ctx, registered } = makeCtx();
  apply(ctx);
  const out = await registered.find((d) => d.name === 'guide_learn').execute({ topic: 'schedule' });
  assert.match(out, /dsh-schedule/);
  assert.match(out, /事件日志/);
});

test('guide_learn falls back to the topic menu for unknown queries', async () => {
  const { ctx, registered } = makeCtx();
  apply(ctx);
  const out = await registered.find((d) => d.name === 'guide_learn').execute({ topic: 'zzz-nonsense' });
  assert.match(out, /可用主题/);
});

// ---- profile mode ----------------------------------------------------------

const PLUGIN_IN_NM = (name) => JSON.stringify({
  name,
  version: '0.1.0',
  main: './dist/index.js',
  files: ['dist'],
  dsh: { bundle: { patch: './cordis.patch.yml' } },
}, null, 2);

function makeProfileManifest({ deps = {}, bundles = [] }) {
  return JSON.stringify({
    name: 'dsh-profile-test',
    private: true,
    dependencies: deps,
    dsh: { profile: { bundles } },
  }, null, 2);
}

test('guide_scan profile mode passes a consistent profile (bundles ↔ dependencies)', async () => {
  const dir = await makeFixture({
    'package.json': makeProfileManifest({
      deps: { '@snow-the/dsh-busyloop': '^0.1.4', '@snow-the/dsh-gitkit': '^0.1.0' },
      bundles: ['@snow-the/dsh-busyloop', '@snow-the/dsh-gitkit'],
    }),
    'node_modules/@snow-the/dsh-busyloop/package.json': PLUGIN_IN_NM('@snow-the/dsh-busyloop'),
    'node_modules/@snow-the/dsh-gitkit/package.json': PLUGIN_IN_NM('@snow-the/dsh-gitkit'),
  });
  try {
    const { ctx, registered } = makeCtx();
    apply(ctx);
    const out = await registered.find((d) => d.name === 'guide_scan').execute({ dir });
    assert.match(out, /verdict: PASS/);
    assert.match(out, /profile\.depsInBundles.*all 2 installed plugin/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('guide_scan profile mode catches the busyloop trap: plugin in deps but not in bundles', async () => {
  const dir = await makeFixture({
    'package.json': makeProfileManifest({
      deps: { '@snow-the/dsh-busyloop': '^0.1.4' },
      bundles: [],
    }),
    'node_modules/@snow-the/dsh-busyloop/package.json': PLUGIN_IN_NM('@snow-the/dsh-busyloop'),
  });
  try {
    const { ctx, registered } = makeCtx();
    apply(ctx);
    const out = await registered.find((d) => d.name === 'guide_scan').execute({ dir });
    assert.match(out, /verdict: FAIL/);
    assert.match(out, /installed but NOT in dsh\.profile\.bundles/);
    assert.match(out, /dsh-busyloop/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('guide_scan profile mode flags a bundle missing from dependencies (unresolvable on fresh install)', async () => {
  const dir = await makeFixture({
    'package.json': makeProfileManifest({
      deps: {},
      bundles: ['@snow-the/dsh-ghost'],
    }),
  });
  try {
    const { ctx, registered } = makeCtx();
    apply(ctx);
    const out = await registered.find((d) => d.name === 'guide_scan').execute({ dir });
    assert.match(out, /verdict: FAIL/);
    assert.match(out, /bundles not declared in dependencies/);
    assert.match(out, /dsh-ghost/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('guide_scan profile mode exempts host-provided official layers (dsh-base / dsh-web-app)', async () => {
  const dir = await makeFixture({
    'package.json': makeProfileManifest({
      deps: { '@snow-the/dsh-gitkit': '^0.1.0' },
      bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app', '@snow-the/dsh-gitkit'],
    }),
    'node_modules/@snow-the/dsh-gitkit/package.json': PLUGIN_IN_NM('@snow-the/dsh-gitkit'),
  });
  try {
    const { ctx, registered } = makeCtx();
    apply(ctx);
    const out = await registered.find((d) => d.name === 'guide_scan').execute({ dir });
    assert.match(out, /verdict: PASS/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

/** Manifest builder for the files-rule fixtures (a plugin shipping lib/, not dist/). */
const fixtureManifest = (extra) => JSON.stringify({
  name: '@snow-the/dsh-fixture', version: '0.0.1', type: 'module',
  main: './lib/index.js', files: ['lib', 'cordis.patch.yml'],
  dsh: { bundle: { patch: './cordis.patch.yml' } },
  ...extra,
}, null, 2);

test('files rule judges the manifest entry points, not a hardcoded dist/', async () => {
  // three of our own plugins ship lib/ or a root index.js and were falsely flagged
  const dir = await makeFixture({
    'package.json': fixtureManifest({}),
    'cordis.patch.yml': "- insert:\n    - id: dsh-fixture\n      name: '@snow-the/dsh-fixture'\n",
    'lib/index.js': 'export const name = "@snow-the/dsh-fixture";\nexport function apply() {}\n',
  });
  try {
    const { ctx, registered } = makeCtx();
    apply(ctx);
    const out = await registered.find((d) => d.name === 'guide_scan').execute({ dir });
    assert.match(out, /verdict: PASS/);
    assert.match(out, /files allowlist ships every entry point/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('files rule still fails when the allowlist really omits an entry point', async () => {
  const dir = await makeFixture({
    'package.json': fixtureManifest({ files: ['cordis.patch.yml'] }),
    'cordis.patch.yml': "- insert:\n    - id: dsh-fixture\n      name: '@snow-the/dsh-fixture'\n",
    'lib/index.js': 'export const name = "@snow-the/dsh-fixture";\n',
  });
  try {
    const { ctx, registered } = makeCtx();
    apply(ctx);
    const out = await registered.find((d) => d.name === 'guide_scan').execute({ dir });
    assert.match(out, /verdict: FAIL/);
    assert.match(out, /files allowlist missing: lib/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('a package with no plugin markers at all is reported as N/A, not FAIL', async () => {
  const dir = await makeFixture({
    'package.json': JSON.stringify({ name: '@snow-the/goroutine', version: '0.1.1', type: 'module', main: './src/index.js', files: ['src'] }, null, 2),
    'src/index.js': 'export function pool() {}\n',
  });
  try {
    const { ctx, registered } = makeCtx();
    apply(ctx);
    const out = await registered.find((d) => d.name === 'guide_scan').execute({ dir });
    assert.match(out, /verdict: N\/A/);
    assert.match(out, /treated as a library/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('a plugin that merely forgot dsh.bundle still FAILS (library shortcut must not swallow it)', async () => {
  const dir = await makeFixture({
    'package.json': JSON.stringify({ name: '@snow-the/dsh-forgot', version: '0.0.1', main: './index.js', files: ['index.js', 'cordis.patch.yml'] }, null, 2),
    'cordis.patch.yml': '- insert:\n    - id: dsh-forgot\n      name: \'@snow-the/dsh-forgot\'\n',
    'index.js': 'export const name = "@snow-the/dsh-forgot";\n',
  });
  try {
    const { ctx, registered } = makeCtx();
    apply(ctx);
    const out = await registered.find((d) => d.name === 'guide_scan').execute({ dir });
    assert.match(out, /verdict: FAIL/);
    assert.match(out, /must declare "dsh"/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
