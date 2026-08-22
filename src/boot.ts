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
import { existsSync, renameSync } from 'node:fs';
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
      return {
        ok: true,
        summary: `PASS: dsh web alive after ${wait}ms on port ${p}, stderr empty, port ${listening ? 'listening' : 'not yet listening (may bind later)'}`,
        detail: notes.join('\n') || '(no notes)',
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