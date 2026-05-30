/**
 * eeko clone — clone one of your Eeko widgets into a local git repo.
 *
 * Resolves the component to its Artifacts remote, wires the credential helper,
 * clones, checks out the draft branch, and writes eeko.config.json.
 */

import { Command } from 'commander'
import path from 'path'
import { existsSync } from 'fs'
import { loadSessionSync, sessionNeedsRefresh, saveSession } from '../auth/store.js'
import { refreshSession } from '../auth/client.js'
import { getComponentGit } from '../api/client.js'
import { AUTH_CONFIG } from '../auth/config.js'
import { writeEekoConfig } from '../utils/config.js'
import { cloneRepo, checkout } from '../utils/git.js'

async function ensureToken(): Promise<string | null> {
  let session = loadSessionSync()
  if (!session) return null
  if (sessionNeedsRefresh(session) && session.refresh_token) {
    const refreshed = await refreshSession(session.refresh_token)
    if (refreshed) {
      saveSession(refreshed)
      session = refreshed
    }
  }
  return session.access_token
}

export const cloneCommand = new Command('clone')
  .description('Clone one of your Eeko widgets into a local git repo')
  .argument('<componentId>', 'The widget/component id to clone')
  .argument('[dir]', 'Target directory (defaults to the component id)')
  .option('--api-host <url>', 'Override the nexus-api base URL')
  .action(async (componentId: string, dir: string | undefined, opts: { apiHost?: string }) => {
    const token = await ensureToken()
    if (!token) {
      console.error('Not logged in. Run: eeko login')
      process.exit(1)
    }
    const apiBase = opts.apiHost ?? AUTH_CONFIG.api.baseUrl

    let info
    try {
      info = await getComponentGit(token, componentId, apiBase)
    } catch (err) {
      console.error(
        `Could not resolve widget ${componentId}: ${err instanceof Error ? err.message : String(err)}`
      )
      process.exit(1)
    }

    const targetDir = dir ?? componentId
    if (existsSync(targetDir)) {
      console.error(`Directory ${targetDir} already exists`)
      process.exit(1)
    }

    console.log(`Cloning ${info.name} (${info.repoName})…`)
    const result = await cloneRepo(info.remote, targetDir, info.host)
    if (result.code !== 0) {
      console.error('git clone failed:\n' + result.stderr)
      process.exit(1)
    }

    // Check out the draft working branch and link the directory.
    await checkout(targetDir, info.refs.draft)
    writeEekoConfig(path.resolve(targetDir), {
      componentId: info.componentId,
      apiHost: opts.apiHost,
    })

    console.log(`✓ Cloned into ${targetDir} (on ${info.refs.draft})`)
    console.log(`    cd ${targetDir}`)
    console.log(`    eeko dev       # local preview`)
    console.log(`    eeko publish   # git push to draft`)
  })
