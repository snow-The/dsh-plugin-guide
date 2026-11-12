/**
 * guide_boot — one-shot DSH boot verification.
 *
 * Starts a throwaway `dsh web --port <cold-port> --no-open` instance, waits,
 * and reports PASS only when the process stays alive AND stderr stays empty.
 * A plugin tree that crashes at boot (bad register call, missing entry,
 * import error) exits early or writes to stderr — both get caught here,
 * exactly the failure mode that killed a main instance in the busyloop 0.1.13 incident.
 */
/**
 * Which executable should boot the probe instance.
 *
 * Booting "whatever `dsh` is on PATH" is wrong twice over:
 *  1. on Windows it needs `shell:true`, so every argument goes through cmd.exe —
 *     today they are all internal literals, but that is the shape that turns any
 *     future agent-influenced value into an injection;
 *  2. the PATH `dsh` may be a **different release** than the one loading this
 *     plugin, and a boot check against another version proves nothing about the
 *     engine we are actually running on.
 *
 * `process.argv[1]` is this host's own `…/dsh/lib/bin.js`, so spawning it with
 * the running node binary checks exactly the engine we are running on, with no
 * shell involved. When that cannot be recognised we fall back to the PATH shim
 * (which does need a shell on Windows) and say so in `why` — a silent fallback
 * would read as "verified" when it is not.
 *
 * @param argv1 - this host's script path (defaults to `process.argv[1]`; a
 *   parameter so the fallback branch is testable without faking a process).
 */
export declare function selfEngine(argv1?: string): {
    cmd: string;
    args: string[];
    shell: boolean;
    why: string;
};
export interface BootResult {
    ok: boolean;
    summary: string;
    detail: string;
    /** true when some check could not run at all, so `ok` covers only what did run. */
    partial?: boolean;
    partialReason?: string;
}
export interface UiCheck {
    /** short label, e.g. 'notemap' */
    id: string;
    /** substring expected in the rendered DOM, e.g. 'data-notemap-mounted' */
    marker: string;
}
/** Extract the token the host prints as `dsh web: http://127.0.0.1:<port>/?token=<t>`. */
export declare function extractToken(stdout: string): string | null;
/**
 * Boot a one-shot dsh web instance and verify the plugin tree loads.
 * @param port   cold port (default: random 34000-35999)
 * @param waitMs how long to observe the process (default 20000)
 */
export declare function bootCheck(port?: number, waitMs?: number, uiChecks?: UiCheck[]): Promise<BootResult>;
