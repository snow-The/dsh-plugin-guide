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

export const GENERATED_CTX_CATALOG: GeneratedCtxEntry[] = [
  { member: "ctx.agentDefaultModel", type: "AgentDefaultModelConfig", subsystem: "core", seam: false },
  { member: "ctx.agentLoop", type: "AgentLoop", subsystem: "core", seam: false },
  { member: "ctx.agentPresets", type: "AgentPresetRegistry", subsystem: "core", seam: false },
  { member: "ctx.agents", type: "AgentRegistry", subsystem: "core", seam: false },
  { member: "ctx.agentTeams", type: "TeamService", subsystem: "agent-team", seam: false },
  { member: "ctx.approval", type: "ApprovalService", subsystem: "approval", seam: false },
  { member: "ctx.attachments", type: "AttachmentStore", subsystem: "attachment", seam: true },
  { member: "ctx.authorization", type: "AuthorizationService", subsystem: "credentials", seam: false },
  { member: "ctx.browserUse", type: "BrowserUseRegistry", subsystem: "browser-use", seam: false },
  { member: "ctx.clientModules", type: "ClientModuleRegistry", subsystem: "client-modules", seam: false },
  { member: "ctx.commands", type: "CommandRuntime", subsystem: "commands", seam: false },
  { member: "ctx.compaction", type: "CompactionEngine", subsystem: "compaction", seam: true },
  { member: "ctx.computerUse", type: "ComputerUseRegistry", subsystem: "computer-use", seam: false },
  { member: "ctx.configEditor", type: "ConfigEditor", subsystem: "boot", seam: false },
  { member: "ctx.connection", type: "HostConnectionHandle", subsystem: "web-server", seam: false },
  { member: "ctx.cordisInspect", type: "CordisInspectRegistryService", subsystem: "extensions", seam: false },
  { member: "ctx.credentials", type: "CredentialProvider", subsystem: "credentials", seam: true },
  { member: "ctx.credentialsController", type: "CredentialsController", subsystem: "credentials", seam: false },
  { member: "ctx.deepseekAccount", type: "DeepSeekAccount", subsystem: "credentials", seam: true },
  { member: "ctx.deepseekLlmApiExtensions", type: "DeepSeekLlmApiExtensionRegistry", subsystem: "llm-streaming", seam: false },
  { member: "ctx.directoryPicker", type: "DirectoryPicker", subsystem: "workspace", seam: true },
  { member: "ctx.directoryPickerController", type: "DirectoryPickerController", subsystem: "workspace", seam: false },
  { member: "ctx.dynamicCordisRunner", type: "DynamicCordisRunnerService", subsystem: "extensions", seam: false },
  { member: "ctx.fileReferences", type: "FileReferenceService", subsystem: "session-reference", seam: true },
  { member: "ctx.fileUploads", type: "FileUploads", subsystem: "attachment", seam: false },
  { member: "ctx.fs", type: "FileSystem", subsystem: "filesystem", seam: true },
  { member: "ctx.goals", type: "GoalService", subsystem: "goal", seam: false },
  { member: "ctx.hmr", type: "Hmr", subsystem: "boot", seam: false },
  { member: "ctx.inspector", type: "InspectorService", subsystem: "extensions", seam: false },
  { member: "ctx.invariants", type: "InvariantRegistry", subsystem: "invariants", seam: false },
  { member: "ctx.jobController", type: "JobController", subsystem: "jobs", seam: false },
  { member: "ctx.jobs", type: "JobRegistry", subsystem: "jobs", seam: true },
  { member: "ctx.llm", type: "LlmRuntime", subsystem: "llm-streaming", seam: false },
  { member: "ctx.lsp", type: "LspService", subsystem: "lsp", seam: false },
  { member: "ctx.mcpResources", type: "McpResourceRuntime", subsystem: "mcp", seam: false },
  { member: "ctx.messageFeedback", type: "MessageFeedbackService", subsystem: "feedback", seam: false },
  { member: "ctx.officeToPdf", type: "OfficeToPdf", subsystem: "office-to-pdf", seam: false },
  { member: "ctx.permissionPresets", type: "PermissionPresetService", subsystem: "permission-presets", seam: false },
  { member: "ctx.planMode", type: "PlanModeController", subsystem: "plan", seam: false },
  { member: "ctx.pluginManager", type: "PluginManager", subsystem: "boot", seam: false },
  { member: "ctx.pluginRegistryProbe", type: "PluginRegistryProbe", subsystem: "boot", seam: false },
  { member: "ctx.productTelemetry", type: "ProductTelemetry", subsystem: "product-telemetry", seam: false },
  { member: "ctx.profileContext", type: "ProfileContext", subsystem: "boot", seam: false },
  { member: "ctx.ptcRuntime", type: "PtcRuntime", subsystem: "ptc-runtime", seam: true },
  { member: "ctx.sandbox", type: "SandboxProvider", subsystem: "sandbox", seam: true },
  { member: "ctx.sandboxPolicy", type: "SandboxPolicyService", subsystem: "sandbox", seam: false },
  { member: "ctx.schedule", type: "ScheduleService", subsystem: "schedule", seam: false },
  { member: "ctx.sessionController", type: "SessionController", subsystem: "session", seam: false },
  { member: "ctx.sessionFeedback", type: "SessionFeedbackService", subsystem: "feedback", seam: false },
  { member: "ctx.sessionFileReferences", type: "SessionFileReferences", subsystem: "session-reference", seam: false },
  { member: "ctx.sessionPersistence", type: "SessionPersistence", subsystem: "persistence", seam: true },
  { member: "ctx.sessionProjectionCache", type: "SessionProjectionCache", subsystem: "session-projection", seam: false },
  { member: "ctx.sessionProjections", type: "SessionProjectionRegistry", subsystem: "session-projection", seam: false },
  { member: "ctx.sessionQuery", type: "SessionQueryEngine", subsystem: "session-query", seam: true },
  { member: "ctx.sessionReferenceResolver", type: "SessionReferenceResolver", subsystem: "session-reference", seam: false },
  { member: "ctx.sessions", type: "SessionStore", subsystem: "session", seam: false },
  { member: "ctx.sessionSkillCatalog", type: "SessionSkillCatalog", subsystem: "skills", seam: false },
  { member: "ctx.sessionTelemetry", type: "SessionTelemetryBackend", subsystem: "session-telemetry", seam: true },
  { member: "ctx.sessionTitle", type: "SessionTitleService", subsystem: "session-title", seam: false },
  { member: "ctx.settings", type: "SettingsForms", subsystem: "settings", seam: false },
  { member: "ctx.settingsController", type: "SettingsController", subsystem: "settings", seam: false },
  { member: "ctx.shell", type: "ShellExecutor", subsystem: "shell", seam: true },
  { member: "ctx.shellEnv", type: "ShellEnvRegistry", subsystem: "shell", seam: false },
  { member: "ctx.skills", type: "SkillRegistry", subsystem: "skills", seam: false },
  { member: "ctx.speechController", type: "SpeechController", subsystem: "voice-input", seam: false },
  { member: "ctx.speechToText", type: "SpeechToText", subsystem: "voice-input", seam: false },
  { member: "ctx.spillStore", type: "SpillStore", subsystem: "spill", seam: true },
  { member: "ctx.ssh", type: "SshConnection", subsystem: "ssh", seam: false },
  { member: "ctx.storage", type: "Storage", subsystem: "storage", seam: false },
  { member: "ctx.storageDomain", type: "DomainFacility", subsystem: "storage", seam: false },
  { member: "ctx.subagentModelSelection", type: "SubagentModelSelectionConfig", subsystem: "subagent", seam: false },
  { member: "ctx.subagents", type: "SubagentRuntime", subsystem: "subagent", seam: false },
  { member: "ctx.subprocess", type: "SubprocessRuntime", subsystem: "subprocess", seam: true },
  { member: "ctx.systemPrompt", type: "SystemPrompt", subsystem: "system-prompt", seam: false },
  { member: "ctx.terminalController", type: "TerminalController", subsystem: "workspace", seam: false },
  { member: "ctx.terminals", type: "TerminalSessionService", subsystem: "terminal", seam: false },
  { member: "ctx.tokenMeter", type: "TokenMeter", subsystem: "token-meter", seam: false },
  { member: "ctx.toolResultPruner", type: "ToolResultPruner", subsystem: "compaction", seam: false },
  { member: "ctx.tools", type: "ToolRuntime", subsystem: "tools", seam: false },
  { member: "ctx.typert", type: "TypertRegistry", subsystem: "typert", seam: false },
  { member: "ctx.typertGateway", type: "TypertGatewayService", subsystem: "typert", seam: false },
  { member: "ctx.userQuestions", type: "UserQuestionService", subsystem: "user-questions", seam: false },
  { member: "ctx.web", type: "WebRuntime", subsystem: "web", seam: false },
  { member: "ctx.webhookRuntime", type: "WebhookRuntime", subsystem: "webhook", seam: false },
  { member: "ctx.webServer", type: "WebServer", subsystem: "web-server", seam: false },
  { member: "ctx.workflowEngine", type: "WorkflowEngine", subsystem: "workflow", seam: true },
  { member: "ctx.workspaceChanges", type: "WorkspaceChanges", subsystem: "deliverables", seam: false },
  { member: "ctx.workspaceController", type: "WorkspaceController", subsystem: "workspace", seam: false },
  { member: "ctx.workspaceFiles", type: "WorkspaceFiles", subsystem: "workspace", seam: false },
  { member: "ctx.workspaceRegistry", type: "WorkspaceRegistry", subsystem: "workspace", seam: false },
];
