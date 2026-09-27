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

import { GENERATED_CTX_CATALOG } from './ctx-catalog.generated.ts';
import { CTX_NOTES } from './ctx-notes.ts';

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

// ---------------------------------------------------------------------------
// ctx.* service map (verified against lib/types/index.d.ts of each package)
// ---------------------------------------------------------------------------

/**
 * ctx.* 服务目录 = 官方生成目录 + 手写说明的合并。
 *
 *   GENERATED_CTX_CATALOG (src/ctx-catalog.generated.ts)
 *     成员 / 类型 / 子系统 / seam —— 由 scripts/gen-ctx-catalog.mjs 从官方
 *     docs/subsystems/*.md 的 cordis-catalog 区块生成, 跟着官方走, 不会腐化。
 *   CTX_NOTES (src/ctx-notes.ts)
 *     中文说明 / 示例 / 官方包名 —— 需要人判断, 手写。
 *
 * 合并规则: 以生成目录为【全集】(官方新增任何服务都会自动出现),
 *           手写说明按 member 覆盖上去; 说明缺失时回退到 subsystem。
 *
 * 历史教训: 这个表原先是手抄的, 只抄了 14 项而官方有 90 项, 于是插件作者
 *           看不到 sessionQuery/storageDomain/spillStore/tokenMeter 等能力,
 *           继续自建官方已有的东西。所以现在改为生成。
 */
const NOTE_BY_MEMBER = new Map(CTX_NOTES.map((n) => [n.member, n]));

export const CTX_SERVICES: CtxService[] = GENERATED_CTX_CATALOG.map((g) => {
  const note = NOTE_BY_MEMBER.get(g.member);
  return {
    member: g.member,
    ...(note?.pkg ? { pkg: note.pkg } : {}),
    type: g.type,
    subsystem: g.subsystem,
    ...(g.seam ? { seam: true } : {}),
    what: note?.what ?? `(官方 ${g.subsystem} 子系统服务; 说明待补)`,
    example: note?.example ?? `见官方 docs/subsystems/${g.subsystem}.md`,
  };
});

export const SCHEDULE_NOTE = [
  '排程(dsh-schedule):不是 ctx 成员,而是 function-plugin(name="schedule")',
  '  - 提供 agent 作用域的持久提醒:一次性(after/at)与固定频率(every)',
  '  - 记录在会话事件日志(事件溯源),宿主重启后仍能结算',
  '  - 底层计时由 cordis-plugin-timer(dsh-base 的 timer 行)驱动',
  '  - 用法:依赖 @deepseek-ai/dsh-schedule 提供的工具/API 注册提醒',
].join('\n');

// ---------------------------------------------------------------------------
// official bundle layers (from dsh-base / dsh-web-app cordis.patch.yml)
// ---------------------------------------------------------------------------

export const BUNDLE_ROWS: BundleRow[] = [
  { id: 'timer', pkg: '@deepseek-ai/cordis-plugin-timer', layer: 'dsh-base', what: '计时器基础设施(排程底层)' },
  { id: 'hmr', pkg: '@deepseek-ai/cordis-plugin-hmr', layer: 'dsh-base', what: '热重载(开发期)' },
  { id: 'llm', pkg: '@deepseek-ai/dsh-llm', layer: 'dsh-base', what: 'LLM 通道(ctx.llm)' },
  { id: 'session', pkg: '@deepseek-ai/dsh-session', layer: 'dsh-base', what: '会话存储(ctx.sessions)' },
  { id: 'typert', pkg: '@deepseek-ai/dsh-typert-registry', layer: 'dsh-base', what: 'typert 协议注册表' },
  { id: 'typert-loader', pkg: '@deepseek-ai/dsh-typert-loader', layer: 'dsh-base', what: 'typert 加载器' },
  { id: 'typert-gateway', pkg: '@deepseek-ai/dsh-api-gateway', layer: 'dsh-base', what: 'API 网关(typert)' },
  { id: 'session-title', pkg: '@deepseek-ai/dsh-session-title', layer: 'dsh-base', what: '会话标题(兜底规则)' },
  { id: 'session-title-llm', pkg: '@deepseek-ai/dsh-session-title-first-prompt-llm', layer: 'dsh-base', what: '会话标题(LLM 生成)' },
  { id: 'user-questions', pkg: '@deepseek-ai/dsh-user-questions', layer: 'dsh-base', what: '用户提问(ctx.userQuestions)' },
  { id: 'agent', pkg: '@deepseek-ai/dsh-agent', layer: 'dsh-base', what: 'Agent 框架(ctx.agents)' },
  { id: 'code-runtime', pkg: '@deepseek-ai/dsh-code-runtime-worker-thread', layer: 'dsh-web-app', what: '代码运行时(worker)' },
  { id: 'storage', pkg: '@deepseek-ai/dsh-storage', layer: 'dsh-web-app', what: '存储抽象(ctx.storage)' },
  { id: 'storage-json', pkg: '@deepseek-ai/dsh-storage-json', layer: 'dsh-web-app', what: 'JSON 文件存储实现' },
  { id: 'storage-domain', pkg: '@deepseek-ai/dsh-storage-domain', layer: 'dsh-web-app', what: '领域存储分区' },
];

export const LAYER_NOTE = [
  '官方 bundle 层叠规则(写插件必备):',
  '  - dsh-base:每个 profile 的核心层,一行一个官方服务(id → 包)',
  '  - dsh-web-app:web 表面,按 id 覆盖 base 的 config,再 insert 自己的行',
  '  - 用户 profile 的 cordis.patch.yml 在最后,后写覆盖先写(按行 id)',
  '  - patch 只替换整行 config,不合并——配置多层的行必须每层完整重述',
  '  - insert 行没有加载顺序语义,激活由服务可用性驱动',
].join('\n');

// ---------------------------------------------------------------------------
// domain package catalog (plugin author picks)
// ---------------------------------------------------------------------------

export const DOMAIN_PACKAGES: { domain: string; pkgs: string[] }[] = [
  { domain: 'LLM 推理', pkgs: ['@deepseek-ai/dsh-llm', '@deepseek-ai/dsh-llm-deepseek', '@deepseek-ai/dsh-llm-retry'] },
  { domain: 'Agent 框架', pkgs: ['@deepseek-ai/dsh-agent', '@deepseek-ai/dsh-agent-loop', '@deepseek-ai/dsh-agent-presets', '@deepseek-ai/dsh-subagent', '@deepseek-ai/dsh-workflow'] },
  { domain: '工具', pkgs: ['@deepseek-ai/dsh-tools', '@deepseek-ai/dsh-tool-bash', '@deepseek-ai/dsh-tool-fs', '@deepseek-ai/dsh-tool-subagent', '@deepseek-ai/dsh-tool-todo', '@deepseek-ai/dsh-tool-ask-user', '@deepseek-ai/dsh-tool-skill', '@deepseek-ai/dsh-tool-web'] },
  { domain: '会话与持久化', pkgs: ['@deepseek-ai/dsh-session', '@deepseek-ai/dsh-session-persistence', '@deepseek-ai/dsh-session-persistence-jsonl', '@deepseek-ai/dsh-session-query-sqlite', '@deepseek-ai/dsh-storage', '@deepseek-ai/dsh-storage-json'] },
  { domain: '技能', pkgs: ['@deepseek-ai/dsh-skill', '@deepseek-ai/dsh-skill-filesystem'] },
  { domain: '排程', pkgs: ['@deepseek-ai/dsh-schedule', '@deepseek-ai/cordis-plugin-timer'] },
  { domain: '文件与沙箱', pkgs: ['@deepseek-ai/dsh-fs', '@deepseek-ai/dsh-fs-local', '@deepseek-ai/dsh-fs-observation-policy', '@deepseek-ai/dsh-fs-sandbox', '@deepseek-ai/dsh-sandbox', '@deepseek-ai/dsh-sandbox-policy'] },
  { domain: 'shell 执行', pkgs: ['@deepseek-ai/dsh-bash-local', '@deepseek-ai/dsh-bash-sandbox', '@deepseek-ai/dsh-pwsh-local', '@deepseek-ai/dsh-pwsh-sandbox', '@deepseek-ai/dsh-subprocess'] },
  { domain: 'Web 宿主', pkgs: ['@deepseek-ai/dsh-host-webserver', '@deepseek-ai/dsh-web-app', '@deepseek-ai/dsh-web-frontend', '@deepseek-ai/dsh-client-runtime', '@deepseek-ai/dsh-client-ui-*'] },
  { domain: '凭证与安全', pkgs: ['@deepseek-ai/dsh-credentials', '@deepseek-ai/dsh-credentials-local', '@deepseek-ai/dsh-authorization', '@deepseek-ai/dsh-permission-presets'] },
  { domain: '任务与目标', pkgs: ['@deepseek-ai/dsh-jobs', '@deepseek-ai/dsh-jobs-local', '@deepseek-ai/dsh-goal', '@deepseek-ai/dsh-goal-round-driver', '@deepseek-ai/dsh-timeout'] },
  { domain: '外部集成', pkgs: ['@deepseek-ai/dsh-mcp-client', '@deepseek-ai/dsh-web-search-deepseek', '@deepseek-ai/dsh-attachment', '@deepseek-ai/dsh-file-reference'] },
];

// ---------------------------------------------------------------------------
// topics
// ---------------------------------------------------------------------------

export const TOPICS: Topic[] = [
  {
    id: 'overview',
    title: 'DSH 插件全景',
    body: [
      '一切皆插件:profile 的 bundles 列表 + cordis.patch.yml 组合出插件树。',
      '官方分两层:dsh-base(核心服务)与 dsh-web-app(浏览器表面)。',
      '你自己的插件 = package.json(dsh.bundle 声明)+ cordis.patch.yml(insert 行)+ dist 入口(name/apply)。',
      '先用 guide_scan 检查你的插件目录,再发布。',
      '',
      BUNDLE_ROWS.filter((r) => r.layer === 'dsh-base').map((r) => `  - ${r.id} → ${r.pkg}`).join('\n'),
      '',
      '完整行清单与配置见 node_modules/@deepseek-ai/dsh-base/cordis.patch.yml。',
    ].join('\n'),
  },
  {
    id: 'bundle',
    title: '插件包合规(boot 硬校验)',
    body: [
      'boot 加载器对 bundles 里的包做硬校验,不满足直接启动失败:',
      '  1. package.json 必须声明 "dsh": { "bundle": { "patch": "./cordis.patch.yml" } }',
      '  2. patch 文件必须是顶层 YAML 数组(纯注释=失败)',
      '  3. 每条是 mapping,insert 项带 id + name,name 应为包名',
      '  4. files 白名单应含 dist + patch 文件(避免 publish 垃圾)',
      '  5. main/types 指向真实文件,入口导出 name + apply',
      '',
      'profile 一致性(bundles ↔ dependencies):',
      '  6. bundles 里的包必须在 dependencies 声明(宿主提供的 @deepseek-ai/dsh-base、@deepseek-ai/dsh-web-app 除外),否则新机器 pnpm install 后 boot 无法解析',
      '  7. dependencies 里声明了 dsh.bundle 的插件必须在 bundles 里,否则装上了也永远不会被挂载("installed but never loaded" 陷阱)',
      '',
      '快速自查:guide_scan <插件目录或 profile 目录>(自动识别模式)',
    ].join('\n'),
  },
  {
    id: 'schedule',
    title: '排程(dsh-schedule)',
    body: SCHEDULE_NOTE,
  },
  {
    id: 'agent',
    title: 'Agent 框架(ctx.agents / subagents / workflow)',
    body: [
      'ctx.agents:AgentRegistry — 注册/获取 agent;每个 agent 有独立作用域服务树。',
      'ctx.subagents:SubagentRuntime — 命名 provider 注册表(spawn/fork/acp/codex/claude-code/dsh-sdk)+ 一次性派发 +',
      '  持久子会话发现(listChildren/listDescendants)+ continuable 子代理(激活、冷恢复、sendMessage、interrupt)。',
      'ctx.agentTeams:TeamService — Agent Teams:每个普通运行时根节点都是隐式 Lead,提供名册、持久对等信箱、共享任务 DAG。',
      '  属实验性 bundle(@deepseek-ai/dsh-experimental-agent-team-profile),未挂载时 ctx.agentTeams 不存在,必须判空。',
      'ctx.workflowEngine:WorkflowEngine — 多 agent 编排(对应宿主 workflow 工具)。',
      'ctx.goals:GoalService — 长周期目标状态机(自动续轮,对应宿主 goal 工具)。',
      '',
      '插件要派活:优先 ctx.subagents/ctx.workflowEngine,而不是自己造循环。',
      '边界:子代理 seam 不提供对等通信、稳定命名名册、共享任务所有权——这三件事由 Agent Teams 补上;',
      '  反过来,Team profile 禁用的只是模型可见的 subagent / subagent_fork 工具,',
      '  ctx.subagents 作为服务 API 仍是共享基础设施,插件照常可调。',
      '参考实现:refs/dsh-src-0.1.7-rc.2 的 packages/subagent/* 与 packages/experimental/agent-team/*。',
    ].join('\n'),
  },
  {
    id: 'ctx',
    title: 'ctx.* 服务地图',
    body: CTX_SERVICES.map((s) => `  ${s.member} (${s.pkg ?? s.subsystem ?? 'official'}) — ${s.what}\n    例:${s.example}`).join('\n'),
  },
  {
    id: 'official',
    title: '官方 bundle 层叠',
    body: LAYER_NOTE,
  },
];

export function learnTopic(query: string): string {
  const q = query.trim().toLowerCase();
  // 1) 精确的 ctx 成员 / 包名匹配优先于宽泛的 topic 列表。
  //    匹配规则(三条都经过回归验证,改动前请先看 test 里的 topic 路由测试):
  //      a) query 以 `ctx.` 开头 -> 按【成员前缀】匹配。不能写成"成员以 query 开头",
  //         那样裸 `ctx` 会命中每个成员, find() 取第一条, 于是 id='ctx' 的官方服务地图
  //         永远不可达(历史 bug)。
  //      b) query 不以 `ctx.` 开头 -> 只允许【完全等于某成员】(如 'storage'),
  //         否则裸 'agent' 会命中 ctx.agentTeams, 把 'agent' 主题挤掉(同样是
  //         "主题不可达"这类 bug, 只是换了个位置)。
  //      c) 包名子串匹配保留(如 'dsh-token-meter').
  //    pkg 可选(未核实的条目不写), 渲染时绝不出现 undefined。
  const pkgLabel = (s: (typeof CTX_SERVICES)[number]) => s.pkg ?? `${s.subsystem} (pkg 未核实)`;
  const ctxHit = q.startsWith('ctx.')
    ? CTX_SERVICES.find((s) => s.member.toLowerCase().startsWith(q))
    : CTX_SERVICES.find((s) => s.member.toLowerCase() === q || (s.pkg ?? '').toLowerCase().includes(q));
  if (ctxHit) {
    return [
      `# ${ctxHit.member} — ${pkgLabel(ctxHit)}`,
      '',
      `类型:${ctxHit.type}`,
      `用途:${ctxHit.what}`,
      `示例:${ctxHit.example}`,
    ].join('\n');
  }
  // 2) topic ids / titles —— 精确 id 必须优先于模糊标题匹配。
  //    否则 'ctx' 会被 title 含 "ctx.agents" 的 agent topic 抢走(它排得更前),
  //    真正 id='ctx' 的官方服务地图永远不可达。
  const hit =
    TOPICS.find((t) => t.id === q) ??
    TOPICS.find((t) => t.title.toLowerCase().includes(q) || q.includes(t.id));
  if (hit) return `# ${hit.title}\n\n${hit.body}`;
  // 3) domain catalog
  const pkgHit = DOMAIN_PACKAGES.find((d) => d.domain.includes(q) || d.pkgs.some((p) => p.includes(q)));
  if (pkgHit) {
    return [`# 领域:${pkgHit.domain}`, '', pkgHit.pkgs.map((p) => `  - ${p}`).join('\n'), '', '可用 guide_learn ctx / bundle / agent / schedule 深入。'].join('\n');
  }
  return [
    '# guide_learn 主题',
    '',
    '可用主题:overview(全景)/ bundle(合规)/ schedule(排程)/ agent(agent 框架)/ ctx(ctx 服务地图)/ official(官方 bundle 层叠)',
    '也可搜 ctx.llm、ctx.tools、dsh-schedule、dsh-agent 等具体成员/包名。',
  ].join('\n');
}
