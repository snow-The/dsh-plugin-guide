// 把裸说明符 `@deepseek-ai/dsh-tools` 重定向到测试替身。
//
// 用 node:module 的 registerHooks（同步钩子，Node ≥22 可用），和仓库里
// dsh-setup/scripts/plugin-load-check.mjs 用的是同一套机制 —— 那里是把 @deepseek-ai/*
// 映射到宿主，这里是把一个包映射到本地 stub。
//
// 只替换这一个说明符：任何其它 @deepseek-ai/* 仍然正常解析，不会被静默兜住。
import { registerHooks } from 'node:module'

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === '@deepseek-ai/dsh-tools') {
      return { url: new URL('./stub-dsh-tools.mjs', import.meta.url).href, shortCircuit: true }
    }
    return nextResolve(specifier, context)
  },
})
