/**
 * dsh-plugin-guide — DSH plugin authoring guide & conformance scanner.
 *
 * Tools:
 *   guide_scan  — scan a plugin directory OR a dsh profile directory. Plugin
 *                 mode checks boot-loader conformance (dsh.bundle declaration,
 *                 patch array, insert id/name, files allowlist, entry exports);
 *                 profile mode checks bundles/dependencies consistency (a
 *                 plugin in dependencies but not in bundles is never mounted).
 *   guide_learn — look up official DSH capability usage: ctx.* services,
 *                 official bundle layers, schedule / agent patterns.
 */

import { defineTool } from '@deepseek-ai/dsh-tools';
import { formatReport, scan } from './scan.ts';
import { learnTopic } from './guide.ts';

export const name = 'dsh-plugin-guide';
export const inject = ['tools'];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function apply(ctx: any): void {
  ctx.tools.register(defineTool({
    name: 'guide_scan',
    description:
      'Scan a DSH plugin directory (boot-loader conformance: dsh.bundle declaration, cordis.patch.yml as a top-level YAML array with insert id+name rows, files allowlist, main/types and entry exports) OR a dsh profile directory (bundles/dependencies consistency — a plugin declared in dependencies but missing from dsh.profile.bundles is never mounted by the boot loader). Auto-detects the mode. Returns a per-rule pass/fail report. Run this before publishing any plugin or deploying a profile.',
    parameters: {
      dir: {
        type: 'string',
        description: 'Absolute path to the plugin package directory or the dsh profile directory (containing package.json).',
        required: true,
      },
    },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    async execute(args) {
      return formatReport(scan(args.dir));
    },
  }));

  ctx.tools.register(defineTool({
    name: 'guide_learn',
    description:
      'Look up how to use official DSH capabilities when writing plugins: ctx.* service map (ctx.llm / ctx.tools / ctx.agents / ctx.skills / ctx.sessions / ctx.storage / ctx.jobs / ctx.goals / ctx.subagents / ctx.workflowEngine / ctx.credentials / ctx.fs / ctx.userQuestions), scheduling (dsh-schedule), agent framework, official bundle layering (dsh-base / dsh-web-app), and the official package catalog by domain.',
    parameters: {
      topic: {
        type: 'string',
        description: 'Topic id (overview / bundle / schedule / agent / ctx / official) or a free-text query like "ctx.llm", "dsh-schedule", "storage".',
        required: true,
      },
    },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    async execute(args) {
      return learnTopic(args.topic);
    },
  }));
}
