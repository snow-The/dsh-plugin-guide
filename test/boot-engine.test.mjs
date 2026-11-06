// boot engine resolution: guide_boot must boot the SAME engine that runs this
// host, not "whatever `dsh` is on PATH".
//
// 為什麼要有這支：2026-11-07 改 boot.ts 的時候發現 bootCheck 整條路徑**零測試覆蓋**，
// 而它是這個外掛最危險的一段（它會拉一個真的 dsh 起來）。沒有測試就改它，
// 只能靠「跑一次看起來沒事」——那正是我們到處在抓的假讀數。
//
// 這裡釘的四件事：
//   1. 認得宿主 bin.js 的形狀 → 用 process.execPath + bin.js，且 **shell:false**
//   2. 形狀不對 → 退回 PATH shim，且 shell:true（Windows 上 .cmd 只能這樣起）
//   3. 形狀對**但檔案不存在** → 也退回（證明真的檢查存在性，不只是比對正則）
//   4. 退回時 `why` 必須說明原因 —— fallback 不可以靜默，否則會讀成「已驗證」

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { selfEngine } from '../dist/index.js';

/** 造一個形狀正確的假 bin.js：<tmp>/dsh/lib/bin.js */
async function fakeEngine() {
  const root = await mkdtemp(join(tmpdir(), 'guide-boot-engine-'));
  const dir = join(root, 'dsh', 'lib');
  await mkdir(dir, { recursive: true });
  const bin = join(dir, 'bin.js');
  await writeFile(bin, '// probe\n');
  return { root, bin, cleanup: () => rm(root, { recursive: true, force: true }) };
}

test('認得宿主 bin.js：用 node + bin.js，且不經 shell', async () => {
  const f = await fakeEngine();
  try {
    const e = selfEngine(f.bin);
    assert.equal(e.shell, false, 'must not need a shell when we have the real script path');
    assert.equal(e.cmd, process.execPath, 'must run the same node binary as this host');
    assert.deepEqual(e.args, [f.bin], 'argv must be the host\'s own bin.js');
    assert.match(e.why, /same engine/, 'why must say it is the same engine');
  } finally {
    await f.cleanup();
  }
});

test('形狀對但檔案不存在 → 退回 PATH（存在性檢查是真的，不是只比正則）', () => {
  const e = selfEngine('C:/definitely/not/here/dsh/lib/bin.js');
  assert.equal(e.shell, true, 'fallback needs a shell on Windows (.cmd shim)');
  assert.equal(e.cmd, 'dsh');
  assert.deepEqual(e.args, []);
  assert.match(e.why, /not identifiable/, 'fallback reason must be visible');
  assert.match(e.why, /bin\.js/, 'fallback reason must quote what it saw');
});

test('形狀不對（不是 dsh 的 bin.js）→ 退回 PATH', () => {
  const e = selfEngine('C:/Windows/System32/cmd.exe');
  assert.equal(e.shell, true);
  assert.equal(e.cmd, 'dsh');
});

test('不帶參數時讀 process.argv[1]（在測試執行器下不是 bin.js，所以應退回並說明）', () => {
  const e = selfEngine();
  // 兩種都合法：在某些宿主上 argv[1] 真的就是 bin.js。要釘的是「它讀了 argv[1]」。
  if (e.shell === false) {
    assert.equal(e.args[0], process.argv[1]);
  } else {
    assert.match(e.why, /argv\[1\]/, 'fallback must name the value it could not use');
  }
});

test('why 永遠非空：任何一條路徑都要說得出理由', () => {
  for (const input of ['', 'C:/x.js', 'C:/a/dsh/lib/bin.js']) {
    const e = selfEngine(input);
    assert.equal(typeof e.why, 'string');
    assert.ok(e.why.length > 10, `why too short for input ${JSON.stringify(input)}: ${e.why}`);
  }
});
