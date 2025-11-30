/**
 * @eeko/cli - Eeko Widget Development CLI
 *
 * Commands:
 * - eeko dev     Start local development server
 * - eeko test    Send test events
 * - eeko init    Create new widget project
 * - eeko build   Validate widget structure
 * - eeko login   Login to Eeko
 * - eeko logout  Logout from Eeko
 * - eeko whoami  Show current logged in user
 */

import { Command } from 'commander'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { devCommand } from './commands/dev.js'
import { testCommand } from './commands/test.js'
import { initCommand } from './commands/init.js'
import { buildCommand } from './commands/build.js'
import { loginCommand } from './commands/login.js'
import { logoutCommand } from './commands/logout.js'
import { whoamiCommand } from './commands/whoami.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const pkg = JSON.parse(readFileSync(join(__dirname, '../package.json'), 'utf-8'))

const program = new Command()

program
  .name('eeko')
  .description('CLI for local Eeko widget development')
  .version(pkg.version)

// Register commands
program.addCommand(devCommand)
program.addCommand(testCommand)
program.addCommand(initCommand)
program.addCommand(buildCommand)
program.addCommand(loginCommand)
program.addCommand(logoutCommand)
program.addCommand(whoamiCommand)

// Parse CLI arguments
program.parse()
