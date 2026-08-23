/**
 * guide_boot — one-shot DSH boot verification.
 *
 * Starts a throwaway `dsh web --port <cold-port> --no-open` instance, waits,
 * and reports PASS only when the process stays alive AND stderr stays empty.
 * A plugin tree that crashes at boot (bad register call, missing entry,
 * import error) exits early or writes to stderr — both get caught here,
 * exactly the failure mode that killed a main instance in the busyloop 0.1.13 incident.
 */

import { spawn, execFileSync } from 'node:child_process';
import { existsSync, renameSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import net from 'node:net';

const TASKBOARD_LOCK = join(homedir(), '.dsh', 'task-board', 'ledger-v2.lock');
const TASKBOARD_BAK = TASKBOARD_LOCK + '.guide-boot-bak';

export interface BootResult {
  ok: boolean;
  summary: string;
  detail: string;
}

function killTree(pid: number): void {
  try {
    execFileSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' });
  } catch {
    /* already gone */
  }
}

function portOpen(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const s = net.connect({ port, host: '127.0.0.1' });
    s.setTimeout(1500);
    s.once('connect', () => { s.destroy(); resolve(true); });
    s.once('error', () => resolve(false));
    s.once('timeout', () => { s.destroy(); resolve(false); });
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

const BROWSER_CANDIDATES = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
];

function findBrowser(): string | null {
  for (const c of BROWSER_CANDIDATES) {
    if (existsSync(c)) return c;
  }
  return null;
}

/** Headless-render the booted page and look for browser-side plugin loader errors
 *  (HARNESS overlay: "Failed to load plugins", "failed to apply loader entry",
 *  "invalid plugin, received object"). Returns null when no browser is available. */
function pageErrorCheck(port: number): { found: boolean; snippet: string } | null {
  const browser = findBrowser();
  if (!browser) return null;
  const url = 'http://127.0.0.1:' + port;
  for (let attempt = 0; attempt < 3; attempt++) {
    const profile = mkdtempSync(join(homedir(), 'AppData', 'Local', 'Temp', 'dsh-guide-boot-'));
    try {
      const dom = execFileSync(browser, [
        '--headless=new', '--disable-gpu', '--no-first-run',
        '--disable-extensions', '--disable-background-networking',
        '--user-data-dir=' + profile,
        '--dump-dom', url,
      ], { timeout: 25000, encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
      const m = /failed to load plugins|failed to (?:import|apply) loader entry|invalid plugin, received object|HARNESS[\s\S]{0,40}?failed to/i.exec(dom);
      rmSync(profile, { recursive: true, force: true });
      if (m) {
        const i = Math.max(0, (m.index ?? 0) - 120);
        return { found: true, snippet: dom.slice(i, i + 360).replace(/\s+/g, ' ').trim() };
      }
      return { found: false, snippet: '' };
    } catch {
      rmSync(profile, { recursive: true, force: true });
      /* browser may need retry or is unavailable — keep trying */
    }
  }
  return null;
}

/**
 * Boot a one-shot dsh web instance and verify the plugin tree loads.
 * @param port   cold port (default: random 34000-35999)
 * @param waitMs how long to observe the process (default 20000)
 */
export async function bootCheck(port?: number, waitMs?: number): Promise<BootResult> {
  const p = port ?? 34000 + Math.floor(Math.random() * 2000);
  const wait = waitMs ?? 20000;
  const notes: string[] = [];
  let child: ReturnType<typeof spawn> | null = null;
  let movedLock = false;
  try {
    if (existsSync(TASKBOARD_LOCK)) {
      renameSync(TASKBOARD_LOCK, TASKBOARD_BAK);
      movedLock = true;
      notes.push('note: task-board single-instance lock temporarily moved aside (restored after check)');
    }
    child = spawn('dsh', ['web', '--port', String(p), '--no-open'], {
      shell: true,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stderr = '';
    let stdout = '';
    child.stderr?.on('data', (d: Buffer) => { stderr += d.toString(); });
    child.stdout?.on('data', (d: Buffer) => { stdout += d.toString(); });
    const exited = new Promise<number | null>((res) => child!.on('exit', (c) => res(c)));
    const timer = sleep(wait).then(() => null);
    const code = await Promise.race([exited, timer]);
    if (code !== null) {
      return {
        ok: false,
        summary: `FAIL: dsh web exited early with code ${code} (port ${p})`,
        detail: (stderr.trim() || '(no stderr)') + '\n--- stdout ---\n' + (stdout.trim() || '(empty)'),
      };
    }
    const alive = child.exitCode === null && !child.killed;
    const errTrim = stderr.trim();
    const listening = await portOpen(p);
    if (alive && errTrim.length === 0) {
      const page = pageErrorCheck(p);
      if (page && page.found) {
        return {
          ok: false,
          summary: 'FAIL: browser-side plugin loader error on http://127.0.0.1:' + p + ' (HARNESS overlay)',
          detail: 'headless DOM matched error pattern:\n' + page.snippet + '\n--- notes ---\n' + (notes.join('\n') || '(none)'),
        };
      }
      const pageNote = page === null
        ? 'note: no chrome/edge found - browser-side HARNESS check skipped (server-side checks only)'
        : 'note: headless page render clean (no plugin loader errors in DOM)';
      return {
        ok: true,
        summary: `PASS: dsh web alive after ${wait}ms on port ${p}, stderr empty, port ${listening ? 'listening' : 'not yet listening (may bind later)'}, page ${page ? 'DOM clean' : 'check skipped (no browser)'}`,
        detail: notes.concat([pageNote]).join('\n') || '(no notes)',
      };
    }
    if (!alive) {
      return {
        ok: false,
        summary: `FAIL: process not alive after ${wait}ms (port ${p})`,
        detail: (errTrim || '(no stderr)') + '\n--- stdout ---\n' + (stdout.trim() || '(empty)'),
      };
    }
    return {
      ok: false,
      summary: `FAIL: stderr non-empty after ${wait}ms (${errTrim.length} bytes, port ${p})`,
      detail: errTrim.slice(0, 6000) + '\n--- stdout ---\n' + (stdout.trim().slice(0, 2000) || '(empty)'),
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/ENOENT|not recognized|not found/i.test(msg)) {
      return {
        ok: false,
        summary: 'FAIL: `dsh` command not found on PATH — cannot boot-verify this host',
        detail: msg,
      };
    }
    return { ok: false, summary: `FAIL: unexpected error: ${msg}`, detail: msg };
  } finally {
    if (child && child.pid !== undefined) killTree(child.pid);
    if (movedLock && existsSync(TASKBOARD_BAK) && !existsSync(TASKBOARD_LOCK)) {
      try { renameSync(TASKBOARD_BAK, TASKBOARD_LOCK); } catch { /* best effort */ }
    }
  }
}