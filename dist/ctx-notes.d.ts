/**
 * ctx-notes.ts — 手工维护的 ctx.* 说明与包名映射(唯一手写处)。
 *
 * 为什么分成两个文件:
 *   - ctx-catalog.generated.ts  ← 生成, 提供【成员/类型/子系统/seam】(跟着官方源码走, 不会腐化)
 *   - ctx-notes.ts (本文件)      ← 手写, 提供【中文说明/示例/官方包名】(需要人判断, 无法生成)
 *   guide.ts 把两者按 member 合并; 官方新增服务会立刻出现在目录里(说明留空),
 *   而不是像以前那样 —— 手抄清单只有 14 项, 官方 90 项, 插件作者于是继续自建。
 *
 * 维护约定:
 *   - 只有 what/example/pkg 需要人工更新; 不要在本文件重复 member/type/subsystem
 *   - pkg 拿不准就【省略】, 合并时会回退到 subsystem 显示; 绝不猜测包名
 *   - 只给"确实会给插件作者造成误导"的条目写 what(例如 ctx.storage 不是数据库)
 */
export interface CtxNote {
    member: string;
    /** 挂载该服务的官方包; 未核实则省略(渲染时回退到 subsystem)。 */
    pkg?: string;
    /** 中文说明(可省)。 */
    what?: string;
    /** 用法示例(可省)。 */
    example?: string;
}
export declare const CTX_NOTES: CtxNote[];
