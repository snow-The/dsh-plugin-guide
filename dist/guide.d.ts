/**
 * guide.ts — DSH official capability map.
 *
 * Curated from the installed official suite (@deepseek-ai/*, dsh 0.1.x):
 *   - the ctx.* service surface each official package mounts
 *   - the official bundle layers (dsh-base core rows, dsh-web-app surface)
 *   - the domain package catalog a plugin author can depend on / inject
 *
 * This is the "learn how to use dsh properly" half of dsh-plugin-guide.
 */
export interface CtxService {
    member: string;
    /** Official package that mounts the service. Omitted when unverified — never guessed. */
    pkg?: string;
    type: string;
    what: string;
    example: string;
    /** Authoritative subsystem id from the official cordis-catalog (docs/subsystems/*). */
    subsystem?: string;
    /** 官方标注为 (abstract seam): 定义契约, 能力面取决于挂了哪个后端实现。 */
    seam?: boolean;
}
export interface BundleRow {
    id: string;
    pkg: string;
    layer: string;
    what: string;
}
export interface Topic {
    id: string;
    title: string;
    body: string;
}
export declare const CTX_SERVICES: CtxService[];
export declare const SCHEDULE_NOTE: string;
export declare const BUNDLE_ROWS: BundleRow[];
export declare const LAYER_NOTE: string;
export declare const DOMAIN_PACKAGES: {
    domain: string;
    pkgs: string[];
}[];
export declare const TOPICS: Topic[];
export declare function learnTopic(query: string): string;
