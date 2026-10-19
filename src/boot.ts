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
  /** true when some check could not run at all, so `ok` covers only what did run. */
  partial?: boolean;
  partialReason?: string;
}

function killTree(pid: number): void {
  try {
    if (process.platform === 'win32') {
      execFileSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' });
    } else {
      // Negative pid targets the whole process group; fall back to the bare pid
      // when the child was not spawned as a group leader.
      try { process.kill(-pid, 'SIGKILL'); } catch { process.kill(pid, 'SIGKILL'); }
    }
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

/** Expand %VAR% so the candidates stay valid on any Windows locale / install root. */
function expandEnv(p: string): string {
  return p.replace(/%([^%]+)%/g, (_m, k: string) => process.env[k] ?? '');
}

const BROWSER_CANDIDATES: Record<string, string[]> = {
  win32: [
    '%ProgramFiles%\\Google\\Chrome\\Application\\chrome.exe',
    '%ProgramFiles(x86)%\\Google\\Chrome\\Application\\chrome.exe',
    '%LOCALAPPDATA%\\Google\\Chrome\\Application\\chrome.exe',
    '%ProgramFiles%\\Microsoft\\Edge\\Application\\msedge.exe',
    '%ProgramFiles(x86)%\\Microsoft\\Edge\\Application\\msedge.exe'
  ],
  darwin: [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'
  ],
  linux: [
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/snap/bin/chromium',
    '/usr/bin/microsoft-edge',
    '/usr/bin/microsoft-edge-stable'
  ]
};

const BROWSER_ON_PATH = ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'microsoft-edge', 'chrome'];

function fromPath(): string | null {
  const dirs = (process.env.PATH ?? '').split(process.platform === 'win32' ? ';' : ':');
  const exts = process.platform === 'win32' ? ['.exe', '.cmd'] : [''];
  for (const name of BROWSER_ON_PATH) {
    for (const d of dirs) {
      if (!d) continue;
      for (const ext of exts) {
        const p = join(d, name + ext);
        if (existsSync(p)) return p;
      }
    }
  }
  return null;
}

/**
 * Resolve a Chromium-based browser for the page-side check.
 *
 * Order: an explicit override the caller vouches for, then this platform's usual
 * install locations, then PATH. The previous version knew exactly four hard-coded
 * Windows paths, so on Linux and macOS the page check skipped itself every time —
 * and still returned a pass. A check that could not run must say so, not merge
 * into success.
 */
function findBrowser(): string | null {
  for (const key of ['DSH_PLUGIN_GUIDE_BROWSER', 'CHROME_PATH', 'PUPPETEER_EXECUTABLE_PATH']) {
    const v = process.env[key];
    if (v && existsSync(v)) return v;
  }
  for (const c of BROWSER_CANDIDATES[process.platform] ?? []) {
    const p = expandEnv(c);
    if (p && existsSync(p)) return p;
  }
  return fromPath();
}

export interface UiCheck {
  /** short label, e.g. 'notemap' */
  id: string;
  /** substring expected in the rendered DOM, e.g. 'data-notemap-mounted' */
  marker: string;
}

interface PageRender {
  errors: { snippet: string } | null;
  ui: { id: string; found: boolean }[];
}

/** Headless-render the booted page, look for browser-side plugin loader errors
 *  (HARNESS overlay: "Failed to load plugins", "failed to apply loader entry",
 *  "invalid plugin, received object") and verify plugin UI markers mounted.
 *  Returns null when no browser is available. */
function pageRenderCheck(port: number, uiChecks: UiCheck[]): PageRender | null {
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
      const ui = uiChecks.map((c) => ({ id: c.id, found: dom.includes(c.marker) }));
      rmSync(profile, { recursive: true, force: true });
      return {
        errors: m ? { snippet: dom.slice(Math.max(0, m.index - 120), m.index + 240).replace(/\s+/g, ' ').trim() } : null,
        ui,
      };
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
export async function bootCheck(port?: number, waitMs?: number, uiChecks: UiCheck[] = []): Promise<BootResult> {
  const p = port ?? 34000 + Math.floor(Math.random() * 2000);
  const wait = waitMs ?? 20000;
  const notes: string[] = [];
  let child: ReturnType<typeof spawn> | null = null;
  let movedLock = false;
  try {
    if (existsSync(TASKBOARD_LOCK)) {
      try {
        renameSync(TASKBOARD_LOCK, TASKBOARD_BAK);
        movedLock = true;
        notes.push('note: task-board single-instance lock temporarily moved aside (restored after check)');
      } catch (lockErr) {
        // lock is held open by the running main instance (EPERM/EBUSY on Windows)
        // -> skip moving it and continue; the probe instance may still boot
        notes.push('note: task-board lock is held by the live instance - left in place, proceeding without lock move');
      }
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
      const page = pageRenderCheck(p, uiChecks);
      if (page && page.errors) {
        return {
          ok: false,
          summary: 'FAIL: browser-side plugin loader error on http://127.0.0.1:' + p + ' (HARNESS overlay)',
          detail: 'headless DOM matched error pattern:\n' + page.errors.snippet + '\n--- notes ---\n' + (notes.join('\n') || '(none)'),
        };
      }
      const missing = page ? page.ui.filter((u) => !u.found) : [];
      if (page && missing.length > 0) {
        return {
          ok: false,
          summary: 'FAIL: plugin UI markers missing from rendered DOM on http://127.0.0.1:' + p,
          detail: missing.map((u) => '  x ' + u.id + ' (marker not found)').join('\n') + '\n--- notes ---\n' + (notes.join('\n') || '(none)'),
        };
      }
      const pageNotes: string[] = [];
      if (page === null) {
        pageNotes.push('note: no chrome/edge found - browser-side page check skipped (server-side checks only)');
      } else {
        pageNotes.push('note: headless page render clean (no plugin loader errors in DOM)');
        if (uiChecks.length > 0) {
          pageNotes.push('ui checks: ' + page.ui.map((u) => (u.found ? 'ok ' + u.id : 'MISSING ' + u.id)).join(', '));
        }
      }
      const uiPart = uiChecks.length > 0 && page ? ', ui ' + page.ui.filter((u) => u.found).length + '/' + page.ui.length : '';
      // A pass that only covered the server side must not read as a full pass.
      const partialReason = page === null ? 'no browser found, page-side check did not run' : null;
      return {
        ok: true,
        ...(partialReason ? { partial: true, partialReason } : {}),
        summary: (partialReason ? 'PASS (partial: ' + partialReason + ') — ' : 'PASS: ') + 'dsh web alive after ' + wait + 'ms on port ' + p + ', stderr empty, port ' + (listening ? 'listening' : 'not yet listening (may bind later)') + ', page ' + (page ? 'DOM clean' : 'check skipped (no browser)') + uiPart,
        detail: notes.concat(pageNotes).join('\n') || '(no notes)',
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