// 测试期用的 dsh-tools 替身。
//
// 为什么需要：`@deepseek-ai/dsh-tools@0.2.1-rc.2` 有 12 个 peer 依赖，全部**精确钉在
// 0.2.1-rc.2**（@deepseek-ai/dsh-agent / dsh-ptc-runtime / dsh-llm / dsh-session /
// dsh-system-prompt / dsh-user-approval / dsh-sandbox / dsh-sandbox-policy /
// dsh-working-directory / dsh-scope …）外加 cordis ~4.0.5。在插件目录里把这些全部
// 装一份，等于把半个宿主复制到 devDependencies —— 那既不可维护，也会立刻随宿主换代过期。
//
// 而本插件只从 dsh-tools 取了**一个符号**：`defineTool`（6 处调用）。它就是把
// {name, description, parameters, handler} 组装成工具定义的薄封装，语义上等价于恒等。
// 所以测试里用恒等替身，运行期照旧 import 真的 —— 换掉的是"用哪个工厂"，不是被测逻辑。
export const defineTool = (spec) => spec;
export default { defineTool };
