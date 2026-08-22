# dsh-plugin-guide

DSH 插件写作指南 & 合规扫描器(DSH plugin authoring guide & conformance scanner)。

写插件不再"启动即炸":把 dsh boot 加载器的硬校验固化成规则,发布前扫一遍;
同时内置 dsh 官方能力地图,告诉你 `ctx.*` 服务、排程、agent 框架、官方 bundle 怎么用。

## 工具

| 工具 | 作用 |
|---|---|
| `guide_scan <dir>` | 扫描插件目录,按 boot 硬校验逐条打勾: `dsh.bundle` 声明 / patch 顶层数组 / insert id+name / files 白名单 / main/types / 入口导出 name+apply |
| `guide_learn <topic>` | 查官方能力用法: `overview` / `bundle` / `schedule` / `agent` / `ctx` / `official`,或直接搜 `ctx.llm`、`dsh-schedule` 等 |

## 安装

```bash
dsh plugin --profile web add @snow-the/dsh-plugin-guide
```

或手动:package.json dependencies + `dsh.profile.bundles` 加
`@snow-the/dsh-plugin-guide`,然后 `pnpm install` + 重启。

## 发布前自检

```bash
pnpm build && pnpm test
# 然后让 agent 调用 guide_scan 扫你的插件目录
```

扫描规则对齐 `@deepseek-ai/dsh-app-boot` 的 `parsePatchList` /
`loadOverlayPatches` 校验(缺 `dsh.bundle`、patch 只有注释、insert 缺 id/name、
files 缺 dist —— 全是启动失败的常见原因)。

## 能力地图(内置)

- **ctx.\*** 服务:llm / tools / agents / skills / sessions / settings / storage /
  jobs / goals / workflowEngine / subagents / credentials / fs / userQuestions
  (每个带来源包、类型、示例)
- **排程**:`dsh-schedule`(agent 作用域持久提醒,事件日志溯源)+
  `cordis-plugin-timer` 底层
- **官方 bundle 层叠**:dsh-base(核心层)→ dsh-web-app(web 表面)→ 用户 patch,
  按行 id 后写覆盖先写
- **官方包目录**:12 个领域(LLM / agent / 工具 / 会话持久化 / 技能 / 排程 /
  文件沙箱 / shell / web 宿主 / 凭证安全 / 任务目标 / 外部集成)

## 开发

```bash
pnpm install
pnpm build      # tsc + esbuild → dist/index.js
pnpm test       # node --test(11 个用例:合规好/坏样例 + 能力查询)
```

MIT
