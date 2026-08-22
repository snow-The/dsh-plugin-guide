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
  assert.deepEqual(names.sort(), ['guide_learn', 'guide_scan']);
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
