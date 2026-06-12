/**
 * eeko agents-md — (re)generate the agent-facing files (AGENTS.md, CLAUDE.md,
 * .mcp.json) in an existing widget project. The upgrade path for projects
 * scaffolded by older CLI versions, and the refresh path after an @eeko/sdk
 * guide update.
 */

import { Command } from 'commander'
import { loadEekoConfig } from '../utils/config.js'
import { writeAgentFiles } from '../utils/agent-files.js'

export const agentsMdCommand = new Command('agents-md')
  .description('Generate AGENTS.md, CLAUDE.md and .mcp.json for this widget project')
  .option('--force', 'Overwrite existing files')
  .action(async (opts: { force?: boolean }) => {
    if (!loadEekoConfig()) {
      console.error(
        'Not a widget project (no eeko.config.json here). Run from a directory created by `eeko init` or `eeko clone`.'
      )
      process.exit(1)
    }

    const { written, skipped } = await writeAgentFiles(process.cwd(), { force: opts.force })
    for (const file of written) console.log(`✓ wrote ${file}`)
    for (const file of skipped) console.log(`- skipped ${file} (exists; use --force to regenerate)`)
    if (written.length === 0 && skipped.length > 0) process.exitCode = 0
  })
