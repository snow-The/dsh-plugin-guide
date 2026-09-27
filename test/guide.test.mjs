// dsh-plugin-guide tests: tool registration + conformance scan against
// boot-loader rules, using throwaway fixtures that mirror the real failures
// we hit (missing dsh.bundle, comment-only patch, wrong insert name).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { name, apply } from '../dist/index.js';

const HERE = dirname(fileURLToPath(import.meta.url));

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

test('test discipline is advisory and names the real gap (script without tests)', async () => {
  const dir = await makeFixture({
    'package.json': fixtureManifest({ scripts: { test: 'node --test' } }),
    'cordis.patch.yml': "- insert:\n    - id: dsh-fixture\n      name: '@snow-the/dsh-fixture'\n",
    'lib/index.js': 'export const name = "@snow-the/dsh-fixture";\nexport function apply() {}\n',
  });
  try {
    const { ctx, registered } = makeCtx();
    apply(ctx);
    const out = await registered.find((d) => d.name === 'guide_scan').execute({ dir });
    assert.match(out, /verdict: PASS/, 'a missing safety net must not fail a boot scan');
    assert.match(out, /scripts\.test: advisory: .*passes vacuously/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('test discipline flags test files that never run', async () => {
  const dir = await makeFixture({
    'package.json': fixtureManifest({}),
    'cordis.patch.yml': "- insert:\n    - id: dsh-fixture\n      name: '@snow-the/dsh-fixture'\n",
    'lib/index.js': 'export const name = "@snow-the/dsh-fixture";\nexport function apply() {}\n',
    'test/orphan.test.mjs': "import { test } from 'node:test';\ntest('x', () => {});\n",
  });
  try {
    const { ctx, registered } = makeCtx();
    apply(ctx);
    const out = await registered.find((d) => d.name === 'guide_scan').execute({ dir });
    assert.match(out, /scripts\.test: advisory: 1 test file\(s\) present but no "scripts\.test"/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('a plugin with tests and a script reports them, and fuzz stays advisory', async () => {
  const dir = await makeFixture({
    'package.json': fixtureManifest({ scripts: { test: 'node --test test/', fuzz: 'node test/fuzz.mjs' } }),
    'cordis.patch.yml': "- insert:\n    - id: dsh-fixture\n      name: '@snow-the/dsh-fixture'\n",
    'lib/index.js': 'export const name = "@snow-the/dsh-fixture";\nexport function apply() {}\n',
    'test/real.test.mjs': "import { test } from 'node:test';\ntest('x', () => {});\n",
  });
  try {
    const { ctx, registered } = makeCtx();
    apply(ctx);
    const out = await registered.find((d) => d.name === 'guide_scan').execute({ dir });
    assert.match(out, /scripts\.test: advisory: 1 test file\(s\)/);
    assert.match(out, /scripts\.fuzz: advisory: fuzz script/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('tool.schema catches type json (a real boot-breaker)', async () => {
  const dir = await makeFixture({
    'package.json': fixtureManifest({}),
    'cordis.patch.yml': "- insert:\n    - id: dsh-fixture\n      name: '@snow-the/dsh-fixture'\n",
    'lib/index.js': [
      'export const name = "@snow-the/dsh-fixture";',
      'export function apply(ctx) {',
      '  ctx.tools.register({ name: "x", parameters: { type: "object" }, output: { schema: { type: "json" } } });',
      '}',
    ].join('\n'),
  });
  try {
    const { ctx, registered } = makeCtx();
    apply(ctx);
    const out = await registered.find((d) => d.name === 'guide_scan').execute({ dir });
    assert.match(out, /verdict: FAIL/);
    assert.match(out, /tool\.schema: .*type 'json' is not a JSON-schema type/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('tool.schema catches an object schema with no explicit additionalProperties', async () => {
  const dir = await makeFixture({
    'package.json': fixtureManifest({}),
    'cordis.patch.yml': "- insert:\n    - id: dsh-fixture\n      name: '@snow-the/dsh-fixture'\n",
    'lib/index.js': [
      'export const name = "@snow-the/dsh-fixture";',
      'export function apply(ctx) {',
      '  ctx.tools.register({ name: "x", output: { schema: { type: "object" } } });',
      '}',
    ].join('\n'),
  });
  try {
    const { ctx, registered } = makeCtx();
    apply(ctx);
    const out = await registered.find((d) => d.name === 'guide_scan').execute({ dir });
    assert.match(out, /verdict: FAIL/);
    assert.match(out, /object schema without an explicit additionalProperties/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('tool.schema passes a valid schema', async () => {
  const dir = await makeFixture({
    'package.json': fixtureManifest({}),
    'cordis.patch.yml': "- insert:\n    - id: dsh-fixture\n      name: '@snow-the/dsh-fixture'\n",
    'lib/index.js': [
      'export const name = "@snow-the/dsh-fixture";',
      'export function apply(ctx) {',
      '  ctx.tools.register({ name: "x", output: { schema: { type: "object", additionalProperties: true } } });',
      '}',
    ].join('\n'),
  });
  try {
    const { ctx, registered } = makeCtx();
    apply(ctx);
    const out = await registered.find((d) => d.name === 'guide_scan').execute({ dir });
    assert.match(out, /tool\.schema: 1 schema literal\(s\) look valid/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// --- drift guards: 服务目录必须跟着官方走, 不能再退回手抄 -------------------------

test('the ctx catalog covers every member of the generated official catalog', async () => {
  // 回归守卫: 这个表原先是手抄的, 只抄了 14 项而官方有 90 项 —— 插件作者因此看不到
  // sessionQuery/storageDomain/spillStore/tokenMeter 等官方能力, 继续自建官方已有的东西。
  // 该测试让"清单落后于官方"立刻变红, 而不是等到某天有人手工发现。
  //
  // 走真实链路(apply + guide_learn)而不是 import 内部导出, 顺便证明工具本身可用。
  const gen = readFileSync(join(HERE, '..', 'src', 'ctx-catalog.generated.ts'), 'utf8');
  const official = [...gen.matchAll(/member: "([^"]+)"/g)].map((m) => m[1]);
  assert.ok(official.length >= 80, `生成目录异常偏小: ${official.length} 条`);

  const { ctx, registered } = makeCtx();
  apply(ctx);
  const out = await registered.find((d) => d.name === 'guide_learn').execute({ topic: 'ctx' });

  const missing = official.filter((m) => !out.includes(m));
  assert.deepEqual(missing, [], `guide_learn('ctx') 缺少官方成员: ${missing.join(', ')}`);

  // 历史 bug: ctx.schedule 渲染成 "# ctx.schedule — undefined"
  assert.doesNotMatch(out, /— undefined/, 'guide_learn 渲染出了 undefined');

  // 抽查几个"当年漏掉"的关键服务确实在目录里
  for (const key of ['ctx.sessionQuery', 'ctx.storageDomain', 'ctx.spillStore', 'ctx.tokenMeter', 'ctx.agentTeams']) {
    assert.ok(out.includes(key), `目录缺少关键服务 ${key}`);
  }
});

test('every declared topic id is reachable (no topic shadowed by a ctx match)', async () => {
  // 回归守卫: 曾经 'ctx' 被 title 含 "ctx.agents" 的 agent 主题抢走, 后来修 ctx 匹配时
  // 又反过来让 'agent' 被 ctx.agentTeams 抢走 —— 两次都是"声明的主题不可达"。
  // 这里对【每个】登记的 topic id 断言: 传它必须拿回它自己的标题。
  const { ctx, registered } = makeCtx();
  apply(ctx);
  const gl = registered.find((d) => d.name === 'guide_learn');

  const ids = ['overview', 'bundle', 'schedule', 'agent', 'ctx', 'official'];
  for (const id of ids) {
    const out = await gl.execute({ topic: id });
    assert.ok(
      out.startsWith('# ') && out.length > 60,
      `topic '${id}' 没有返回一个主题(可能被 ctx 成员匹配抢走): ${out.split('\n')[0]}`,
    );
    // 'ctx' 必须是服务地图本身, 而不是某个单条服务
    if (id === 'ctx') {
      assert.match(out, /ctx\.\* 服务地图|服务地图/, `topic 'ctx' 未返回服务地图`);
      assert.ok(out.split('\n').filter((l) => l.startsWith('  ctx.')).length >= 80, `服务地图条目不足`);
    }
  }
});

