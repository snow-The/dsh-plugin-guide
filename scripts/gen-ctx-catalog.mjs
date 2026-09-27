#!/usr/bin/env node
/**
 * gen-ctx-catalog.mjs — 从官方源码的 cordis-catalog 生成 ctx.* 服务目录。
 *
 * 为什么需要它(根因):
 *   dsh-plugin-guide 原来的 CTX_SERVICES 是【手抄】的, 最初只抄了 14 个, 而官方有 90 个。
 *   手抄的清单会持续腐化 —— 官方加了服务, 插件作者看到的仍然是旧的, 于是继续自建
 *   官方已有的能力。这份生成器让清单跟着官方源码走, 而不是跟着记忆走。
 *
 * 数据来源: <refs>/docs/subsystems/*.md 中形如
 *     ### `ctx.storageDomain` — `DomainFacility`
 *   的生成校验区块(cordis-catalog)。只读 .md 的标题行, 不读散文。
 *
 * 用法:
 *   node scripts/gen-ctx-catalog.mjs [--src <dsh-src-root>] [--out <file>] [--check]
 *   --check: 只校验"已生成文件是否与源码同步", 不写文件(CI/测试用)
 */
import { readdirSync, readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = resolve(HERE, '..');

/** 官方源码根: 依次尝试参数 > 环境变量 > 已知解压位置。 */
function defaultSrcRoots() {
  return [
    process.env.DSH_SRC_ROOT,
    'C:\\Users\\snow\\.dsh-starter\\refs\\dsh-src-0.1.7-rc.2',
    join(PLUGIN_ROOT, '..', '..', 'refs', 'dsh-src-0.1.7-rc.2'),
  ].filter(Boolean);
}

function parseArgs(argv) {
  const a = { src: null, out: join(PLUGIN_ROOT, 'src', 'ctx-catalog.generated.ts'), check: false };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--src') a.src = argv[++i];
    else if (argv[i] === '--out') a.out = argv[++i];
    else if (argv[i] === '--check') a.check = true;
  }
  return a;
}

/**
 * 从 docs/subsystems 抽取 ctx 成员。
 * @returns {{member:string,type:string,seam:boolean,subsystem:string}[]}
 */
export function extractCatalog(srcRoot) {
  const dir = join(srcRoot, 'docs', 'subsystems');
  if (!existsSync(dir)) {
    throw new Error(`找不到官方文档目录: ${dir}\n(用 --src 指定 dsh 源码根, 或设 DSH_SRC_ROOT)`);
  }
  const byMember = new Map();
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.md') && !n.endsWith('.zh.md')).sort()) {
    const subsystem = f.replace(/\.md$/, '');
    const text = readFileSync(join(dir, f), 'utf8');
    for (const line of text.split(/\r?\n/)) {
      // ### `ctx.storageDomain` — `DomainFacility`   (可能带 "(abstract seam)" 注解)
      const m = line.match(/^###\s+`(ctx\.[A-Za-z0-9_]+)`\s*—\s*`([^`]+)`\s*(.*)$/);
      if (!m) continue;
      const member = m[1];
      if (byMember.has(member)) continue; // 同名只取首个(子系统文件按名排序, 结果确定)
      byMember.set(member, {
        member,
        type: m[2].trim(),
        seam: /abstract seam/i.test(m[3] ?? ''),
        subsystem,
      });
    }
  }
  return [...byMember.values()].sort((a, b) => a.member.localeCompare(b.member));
}

function render(catalog, srcRoot, generatedAt) {
  const rows = catalog.map((c) => {
    const seam = c.seam ? 'true' : 'false';
    return `  { member: ${JSON.stringify(c.member)}, type: ${JSON.stringify(c.type)}, subsystem: ${JSON.stringify(c.subsystem)}, seam: ${seam} },`;
  });
  return `/**
 * ctx-catalog.generated.ts — 自动生成, 请勿手工编辑。
 *
 * 生成器: scripts/gen-ctx-catalog.mjs
 * 数据来源: ${srcRoot.replace(/\\/g, '/')}/docs/subsystems/*.md
 *           (官方 cordis-catalog 的 \`### \\\`ctx.X\\\` — \\\`Type\\\`\` 区块)
 * 生成时间: ${generatedAt}
 * 条目数: ${catalog.length}
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
${rows.join('\n')}
];
`;
}

function main() {
  const args = parseArgs(process.argv);
  const srcRoot = args.src ?? defaultSrcRoots().find((p) => existsSync(join(p, 'docs', 'subsystems')));
  if (!srcRoot) {
    console.error('找不到官方源码根。用 --src <path> 指定, 或设 DSH_SRC_ROOT。');
    console.error('已尝试:\n  ' + defaultSrcRoots().join('\n  '));
    process.exit(2);
  }
  const catalog = extractCatalog(srcRoot);
  const generatedAt = args.check ? '(check 模式: 忽略时间戳)' : new Date().toISOString();
  const content = render(catalog, srcRoot, generatedAt);

  if (args.check) {
    if (!existsSync(args.out)) {
      console.error(`✖ 生成文件不存在: ${args.out}`);
      process.exit(1);
    }
    const cur = readFileSync(args.out, 'utf8');
    const strip = (s) => s.replace(/ \* 生成时间: .*/g, '');
    if (strip(cur) === strip(content)) {
      console.log(`✅ catalog 与官方源码同步 (${catalog.length} 个 ctx 成员)`);
      process.exit(0);
    }
    const curCount = (cur.match(/^  \{ member:/gm) ?? []).length;
    console.error(`✖ catalog 与官方源码不同步: 已生成 ${curCount} 条, 源码抽取 ${catalog.length} 条`);
    console.error('  修法: node scripts/gen-ctx-catalog.mjs');
    process.exit(1);
  }

  mkdirSync(dirname(args.out), { recursive: true });
  writeFileSync(args.out, content);
  const seams = catalog.filter((c) => c.seam).length;
  const subs = new Set(catalog.map((c) => c.subsystem)).size;
  console.log(`✅ 写入 ${args.out}`);
  console.log(`   ${catalog.length} 个 ctx 成员 | ${seams} 个 abstract seam | ${subs} 个子系统`);
  console.log(`   来源: ${srcRoot}`);
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('gen-ctx-catalog.mjs')) {
  main();
}
