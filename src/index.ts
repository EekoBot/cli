/**
 * @eeko/cli — Eeko widget development CLI
 *
 * Commands:
 *   eeko init      Scaffold a new widget project
 *   eeko clone     Clone an existing widget into a local git repo
 *   eeko dev       Start local development server (--live for real events)
 *   eeko test      Send test events
 *   eeko build     Validate widget structure
 *   eeko login     Login to Eeko
 *   eeko logout    Logout
 *   eeko whoami    Show current user
 *   eeko publish   Push local widget changes to your draft ref
 *   eeko promote   Publish your widget live (draft → main)
 *   eeko automation init  Create a git-native automation for a project
 */

import { Command } from 'commander'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { devCommand } from './commands/dev.js'
import { testCommand } from './commands/test.js'
import { initCommand } from './commands/init.js'
import { cloneCommand } from './commands/clone.js'
import { buildCommand } from './commands/build.js'
import { loginCommand } from './commands/login.js'
import { logoutCommand } from './commands/logout.js'
import { whoamiCommand } from './commands/whoami.js'
import { publishCommand } from './commands/publish.js'
import { promoteCommand } from './commands/promote.js'
import { credentialHelperCommand } from './commands/credential-helper.js'
import { agentsMdCommand } from './commands/agents-md.js'
import { automationCommand } from './commands/automation-init.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const pkg = JSON.parse(readFileSync(join(__dirname, '../package.json'), 'utf-8'))

const program = new Command()

program.name('eeko').description('CLI for local Eeko widget development').version(pkg.version)

program.addCommand(initCommand)
program.addCommand(cloneCommand)
program.addCommand(devCommand)
program.addCommand(testCommand)
program.addCommand(buildCommand)
program.addCommand(loginCommand)
program.addCommand(logoutCommand)
program.addCommand(whoamiCommand)
program.addCommand(publishCommand)
program.addCommand(promoteCommand)
program.addCommand(automationCommand)
program.addCommand(agentsMdCommand)
// Hidden — invoked by git, not humans.
program.addCommand(credentialHelperCommand, { hidden: true })

program.parse()
