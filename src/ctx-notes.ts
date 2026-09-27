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

export const CTX_NOTES: CtxNote[] = [
  { member: 'ctx.llm', pkg: '@deepseek-ai/dsh-llm', what: 'LLM 通道:发起 chat/completions 推理', example: 'ctx.llm.chat({ messages }) 或经 hostLlm 适配' },
  { member: 'ctx.agents / ctx.agent', pkg: '@deepseek-ai/dsh-agent', what: 'Agent 注册表与当前 agent(作用域隔离的服务树)', example: 'ctx.agent 取当前会话 agent;ctx.agents 遍历' },
  { member: 'ctx.skills', pkg: '@deepseek-ai/dsh-skill', what: '技能注册/查询(skill 目录、SKILL.md 加载)', example: 'ctx.skills 枚举可加载技能' },
  { member: 'ctx.tools', pkg: '@deepseek-ai/dsh-tools', what: '工具注册中心:defineTool + register', example: 'ctx.tools.register(defineTool({ name, description, parameters, execute }))' },
  { member: 'ctx.sessions', pkg: '@deepseek-ai/dsh-session', what: '会话存储(事件日志、消息读写)', example: 'ctx.sessions 读写当前会话历史' },
  { member: 'ctx.settings', pkg: '@deepseek-ai/dsh-settings', what: '设置读写(用户配置面板联动)', example: 'ctx.settings 定义/读取插件配置项' },
  { member: 'ctx.storage', pkg: '@deepseek-ai/dsh-storage', what: '存储中枢:命名后端注册表(KV facet)。注意它不是数据库——KV 值的定义就是"不透明 JSON,无 schema/无事件/无领域语义",loadAll() 全量载入,没有 query/索引/FTS/向量检索', example: 'const unit = await ctx.storage.get(\'sqlite\').kv.open({ name:\'myplugin\', version:1, tables:[\'kv\'], hasGlobal:false }); await unit.putRecord(\'kv\', key, value)' },
  { member: 'ctx.jobs', pkg: '@deepseek-ai/dsh-jobs', what: '后台任务(长时运行、可跟踪、防宿主退出丢失)', example: 'ctx.jobs 提交/查询后台 job' },
  { member: 'ctx.goals', pkg: '@deepseek-ai/dsh-goal', what: '目标(长周期目标状态机、自动续轮)', example: 'ctx.goals 注册/推进 goal' },
  { member: 'ctx.workflowEngine', pkg: '@deepseek-ai/dsh-workflow', what: '工作流引擎(多 agent 编排)', example: 'ctx.workflowEngine 派发 workflow' },
  { member: 'ctx.subagents', pkg: '@deepseek-ai/dsh-subagent', what: '命名 provider 注册表 + 一次性派发 + 持久子会话发现 + continuable 子代理(激活/冷恢复/sendMessage/interrupt)', example: 'ctx.subagents.startContinuable({...}) / sendMessage(sender, targetId, content) / listDescendants(rootSessionId)' },
  { member: 'ctx.agentTeams', pkg: '@deepseek-ai/dsh-experimental-agent-team', what: 'Agent Teams:隐式 Lead 名册 + 持久对等信箱 + 共享任务 DAG(仅实验性 bundle 挂载时存在)', example: 'if (ctx.agentTeams) ctx.agentTeams.spawnTeammate(caller, {...})' },
  { member: 'ctx.credentials', pkg: '@deepseek-ai/dsh-credentials', what: '凭证管理(密钥安全存取,不落明文)', example: 'ctx.credentials 读取第三方 API key' },
  { member: 'ctx.fs', pkg: '@deepseek-ai/dsh-fs', what: '文件系统抽象(沙箱感知的读写)', example: 'ctx.fs 读写文件(经沙箱策略)' },
  { member: 'ctx.userQuestions', pkg: '@deepseek-ai/dsh-user-questions', what: '向用户提问/确认(阻塞等答复)', example: 'ctx.userQuestions 发起 ask_user 式提问' },
  { member: 'ctx.storageDomain', what: '领域数据形态:在 KV 后端之上的 schema 校验 + 事件发射的域(存储层里真正带语义的一层)', example: 'ctx.storage.domain 声明域 + schema,读写走域而非裸 KV' },
  { member: 'ctx.sessionQuery', what: '(abstract seam) 跨会话查询引擎:逻辑记录、按 provider 无关的过滤/文档、全文检索分页、会话血缘、有界事件读取、事件关系', example: 'ctx.sessionQuery 检索历史会话的事件/文档(替代自己解 zstd + 解析 jsonl)' },
  { member: 'ctx.sessionPersistence', what: '(abstract seam) 会话持久化接缝(jsonl 后端即 session-persistence-jsonl)', example: 'ctx.sessionPersistence 是会话落盘的后端契约' },
  { member: 'ctx.sessionProjections', what: '投影注册表:从日志派生的"每会话当前值"(可合并扩展的投影类型表 + provider 契约)', example: 'ctx.sessionProjections 注册/读取投影(如统计、大纲)' },
  { member: 'ctx.sessionProjectionCache', what: '投影缓存:持久化的每会话检查点记录,节流写回 + 缓存列表读取', example: '由 projection-cache 插件提供,加速投影重建' },
  { member: 'ctx.sessionController', what: '会话控制器:会话生命周期动作(创建/切换/控制)', example: 'ctx.sessionController 程序化控制会话' },
  { member: 'ctx.sessionTitle', what: '会话标题服务:日志支撑 + provider 注册表(首条消息/全 prompt 两种 LLM 策略)', example: 'ctx.sessionTitle 读取或生成会话标题' },
  { member: 'ctx.sessionTelemetry', what: '(abstract seam) 会话遥测后端:事件捕获、投影、脱敏、上报(otel 后端即实现)', example: 'ctx.sessionTelemetry 接 OpenTelemetry 日志管道' },
  { member: 'ctx.sessionReferenceResolver', what: '跨会话快照引用解析器:把别的会话作为"不可信模型上下文"引入', example: 'ctx.sessionReferenceResolver 引用其他会话内容' },
  { member: 'ctx.sessionFileReferences', what: '会话级文件引用集合', example: '配合 @file 语法记录本会话引用过的文件' },
  { member: 'ctx.fileReferences', what: '(abstract seam) 文件引用发现契约 + 共享 @file 语法', example: 'ctx.fileReferences 解析用户输入里的 @file' },
  { member: 'ctx.sessionSkillCatalog', what: '本会话的技能目录(按会话维度的技能可见集)', example: 'ctx.sessionSkillCatalog 看当前会话能加载哪些技能' },
  { member: 'ctx.compaction', what: '(abstract seam) 压缩引擎:阈值驱动的 LLM 摘要压缩(compaction-basic 是实现)', example: 'ctx.compaction 主动触发/查询压缩' },
  { member: 'ctx.toolResultPruner', what: '工具结果剪枝器:replay 安全的无模型 head/middle/tail 裁剪', example: 'ctx.get(\'toolResultPruner\') 存在即让路(handoff 已这样降级)' },
  { member: 'ctx.tokenMeter', what: 'token 计量:请求前的预算估算与用量口径', example: 'ctx.tokenMeter 估算上下文占用(自建 metric 前的正解)' },
  { member: 'ctx.spillStore', what: '(abstract seam) 溢出存储:超大工具输出落盘、上下文里只留指针', example: 'ctx.spillStore 存放大输出(替代自建临时文件)' },
  { member: 'ctx.attachments', what: '(abstract seam) 附件存储(图片/文件等入会话的载体)', example: 'ctx.attachments 读写会话附件' },
  { member: 'ctx.fileUploads', what: '文件上传通道', example: 'web 端上传文件进入会话' },
  { member: 'ctx.jobController', what: '后台任务控制器(提交/取消/查询的具体控制面)', example: 'ctx.jobController 取消一个长任务' },
  { member: 'ctx.subagentModelSelection', what: '子代理/队友的模型选择配置', example: '控制 subagent 用哪个 provider/model' },
  { member: 'ctx.agentLoop', what: 'agent 主循环(轮/步推进)', example: '插件极少直接用;理解执行模型时看它' },
  { member: 'ctx.agentDefaultModel', what: '默认模型配置(provider/model/reasoningEffort)', example: '读取当前默认模型设置' },
  { member: 'ctx.agentPresets', what: 'agent 预设注册表(会话由哪个 preset 组合而成)', example: 'ctx.agentPresets 枚举可用 preset' },
  { member: 'ctx.systemPrompt', what: '系统提示词装配(分片/注入点)', example: 'ctx.systemPrompt 注入插件自己的提示片段' },
  { member: 'ctx.planMode', what: '计划模式控制器(先出计划再执行的模式)', example: 'ctx.planMode 检测/进入计划模式' },
  { member: 'ctx.commands', what: '斜杠命令运行时(人类可触发的命令)', example: 'ctx.commands 注册 /mycommand' },
  { member: 'ctx.schedule', pkg: '@deepseek-ai/dsh-schedule', what: '排程服务:agent 作用域的持久提醒(一次性/固定频率),记录在会话事件日志里、宿主重启仍结算', example: 'ctx.schedule 注册定时提醒' },
  { member: 'ctx.approval', what: '审批服务:需要人类批准的动作走它', example: 'ctx.approval 请求一次审批' },
  { member: 'ctx.permissionPresets', what: '权限预设(read-only / workspace-write / danger-full-access)', example: 'ctx.permissionPresets 查询/套用权限档' },
  { member: 'ctx.sandbox', what: '(abstract seam) 沙箱提供者(执行隔离的后端)', example: 'ctx.sandbox 判断当前隔离能力' },
  { member: 'ctx.sandboxPolicy', what: '沙箱策略服务(哪些操作被允许)', example: 'ctx.sandboxPolicy 查询策略决策' },
  { member: 'ctx.credentialsController', what: '凭证控制面(录入/更新/管理)', example: '配置界面写凭证时走它' },
  { member: 'ctx.authorization', what: '授权服务', example: 'ctx.authorization 判定授权状态' },
  { member: 'ctx.deepseekAccount', what: '(abstract seam) DeepSeek 账号接缝', example: '读取 DeepSeek 账号/额度信息' },
  { member: 'ctx.browserUse', what: '浏览器使用注册表(把浏览器能力接给 agent)', example: 'ctx.browserUse 注册/获取浏览器会话' },
  { member: 'ctx.computerUse', what: '电脑操作注册表(截屏/输入等 GUI 控制)', example: 'ctx.computerUse 提供桌面操作能力' },
  { member: 'ctx.web', what: 'web 运行时(抓取/搜索等 web 能力)', example: 'ctx.web 取 web 能力面' },
  { member: 'ctx.webServer', what: 'HTTP 服务器(挂路由/端点的正解)', example: 'ctx.webServer 注册插件自己的 API 路由' },
  { member: 'ctx.webhookRuntime', what: 'webhook 运行时(外部回调入口)', example: 'ctx.webhookRuntime 接收外部事件' },
  { member: 'ctx.connection', what: '宿主连接句柄(与前端/宿主的连接)', example: '需要主动推事件给 UI 时用' },
  { member: 'ctx.clientModules', what: '客户端模块注册表(插件的前端 bundle 挂载点)', example: 'ctx.clientModules 注册/查客户端模块' },
  { member: 'ctx.settingsController', what: '设置控制面(配置项的读写/变更)', example: '程序化改插件设置' },
  { member: 'ctx.workspaceFiles', what: '工作区文件服务', example: 'ctx.workspaceFiles 按工作区列举/读取' },
  { member: 'ctx.workspaceRegistry', what: '工作区注册表(有哪些工作区)', example: 'ctx.workspaceRegistry 枚举工作区' },
  { member: 'ctx.workspaceController', what: '工作区控制器(创建/切换)', example: 'ctx.workspaceController 切换当前工作区' },
  { member: 'ctx.workspaceChanges', what: '工作区变更(交付物/改动追踪)', example: '读取本次改动清单' },
  { member: 'ctx.directoryPicker', what: '(abstract seam) 目录选择器(UI 选目录)', example: '需要用户选路径时用' },
  { member: 'ctx.directoryPickerController', what: '目录选择器控制面', example: '桥接前端目录选择' },
  { member: 'ctx.terminalController', what: '终端控制面', example: '控制内嵌终端' },
  { member: 'ctx.terminals', what: '终端会话服务(持久 shell 会话)', example: 'ctx.terminals 开/复用终端会话' },
  { member: 'ctx.shell', what: '(abstract seam) shell 执行器', example: 'ctx.shell 执行命令(经沙箱策略)' },
  { member: 'ctx.shellEnv', what: 'shell 环境注册表(注入环境/变量)', example: 'ctx.shellEnv 注册命令环境' },
  { member: 'ctx.subprocess', what: '(abstract seam) 子进程运行时', example: 'ctx.subprocess 起子进程(比裸 spawn 可控)' },
  { member: 'ctx.ssh', what: 'SSH 连接能力', example: 'ctx.ssh 连远端主机' },
  { member: 'ctx.lsp', what: 'LSP 服务:语言服务器(诊断/跳转/符号)', example: 'ctx.lsp 取语言诊断(比 grep 强)' },
  { member: 'ctx.mcpResources', what: 'MCP 资源运行时(外部 MCP server 的资源面)', example: 'ctx.mcpResources 列/读 MCP 资源' },
  { member: 'ctx.typert', what: 'typert 协议注册表(类型化 RPC 契约)', example: '跨进程/前端通信的类型化桥' },
  { member: 'ctx.typertGateway', what: 'typert 网关服务', example: 'typert 请求的网关侧' },
  { member: 'ctx.ptcRuntime', what: '(abstract seam) PTC 运行时(可编程工具调用)', example: 'PTC 能力的运行时接缝' },
  { member: 'ctx.invariants', what: '不变量注册表(断言/守护)', example: 'ctx.invariants 注册运行时断言' },
  { member: 'ctx.pluginManager', what: '插件管理器(挂载/卸载)', example: 'ctx.pluginManager 查已挂插件' },
  { member: 'ctx.pluginRegistryProbe', what: '插件注册表探针', example: '诊断插件解析状态' },
  { member: 'ctx.profileContext', what: 'profile 上下文(当前档位信息)', example: 'ctx.profileContext 读当前 profile' },
  { member: 'ctx.configEditor', what: '配置编辑器(程序化改配置)', example: 'ctx.configEditor 修改配置树' },
  { member: 'ctx.hmr', what: '热重载', example: '开发期插件热更新' },
  { member: 'ctx.inspector', what: '检查器服务(运行时检视)', example: 'ctx.inspector 检视服务图' },
  { member: 'ctx.cordisInspect', what: 'Cordis 检视注册表', example: '暴露可检视对象' },
  { member: 'ctx.dynamicCordisRunner', what: '动态 Cordis 运行器(运行时执行代码)', example: 'ctx.dynamicCordisRunner 动态跑一段插件代码' },
  { member: 'ctx.messageFeedback', what: '单条消息反馈(点赞/点踩)', example: 'ctx.messageFeedback 记录消息反馈' },
  { member: 'ctx.sessionFeedback', what: '会话级反馈', example: 'ctx.sessionFeedback 记录会话评价' },
  { member: 'ctx.speechToText', what: '语音转文字', example: 'ctx.speechToText 转写音频' },
  { member: 'ctx.speechController', what: '语音输入控制面', example: '控制录音/转写流程' },
  { member: 'ctx.officeToPdf', what: 'Office 文档转 PDF', example: 'ctx.officeToPdf 转换 docx/xlsx' },
  { member: 'ctx.productTelemetry', what: '产品遥测', example: '上报插件使用指标' },
];
