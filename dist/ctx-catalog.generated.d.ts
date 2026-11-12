/**
 * ctx-catalog.generated.ts — 自动生成, 请勿手工编辑。
 *
 * 生成器: scripts/gen-ctx-catalog.mjs
 * 数据来源: C:/Users/snow/.dsh-starter/refs/dsh-src-0.1.7-rc.2/docs/subsystems/*.md
 *           (官方 cordis-catalog 的 `### \`ctx.X\` — \`Type\`` 区块)
 * 生成时间: 2026-09-25T16:22:45.627Z
 * 条目数: 90
 *
 * 重新生成: node scripts/gen-ctx-catalog.mjs
 * 校验同步: node scripts/gen-ctx-catalog.mjs --check
 *
 * 手工维护的说明文字(what/example)不在这里, 见 src/ctx-notes.ts。
 */
export interface GeneratedCtxEntry {
    member: string;
    type: string;
    subsystem: string;
    /** 官方标注为 (abstract seam): 定义契约, 由后端插件提供实现。 */
    seam: boolean;
}
export declare const GENERATED_CTX_CATALOG: GeneratedCtxEntry[];
