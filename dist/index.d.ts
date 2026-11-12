/**
 * dsh-plugin-guide — DSH plugin authoring guide & conformance scanner.
 *
 * Tools:
 *   guide_scan  — scan a plugin directory OR a dsh profile directory. Plugin
 *                 mode checks boot-loader conformance (dsh.bundle declaration,
 *                 patch array, insert id/name, files allowlist, entry exports);
 *                 profile mode checks bundles/dependencies consistency (a
 *                 plugin in dependencies but not in bundles is never mounted).
 *   guide_learn — look up official DSH capability usage: ctx.* services,
 *                 official bundle layers, schedule / agent patterns.
 */
export { bootCheck, extractToken, selfEngine } from './boot.ts';
export declare const name = "dsh-plugin-guide";
export declare const inject: string[];
export declare function apply(ctx: any): void;
