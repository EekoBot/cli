/**
 * eeko promote — publish your widget live (promote draft → main).
 *
 * Server-mediated gate: nexus-api reads the draft ref and commits it onto the
 * published ref (the only blessed writer of `main`).
 */

import { Command } from 'commander'
import { loadSessionSync, sessionNeedsRefresh, saveSession } from '../auth/store.js'
import { refreshSession } from '../auth/client.js'
import { loadEekoConfig } from '../utils/config.js'
import { promoteDraft } from '../api/client.js'
import { AUTH_CONFIG } from '../auth/config.js'

export const promoteCommand = new Command('promote')
  .description('Publish your widget live (promote draft → main)')
  .action(async () => {
    let session = loadSessionSync()
    if (!session) {
      console.error('Not logged in. Run: eeko login')
      process.exit(1)
    }
    if (sessionNeedsRefresh(session) && session.refresh_token) {
      const refreshed = await refreshSession(session.refresh_token)
      if (refreshed) {
        saveSession(refreshed)
        session = refreshed
      }
    }

    const cfg = loadEekoConfig()
    if (!cfg) {
      console.error('No eeko.config.json here — run from a widget directory.')
      process.exit(1)
    }
    const apiBase = cfg.apiHost ?? AUTH_CONFIG.api.baseUrl

    try {
      await promoteDraft(session.access_token, cfg.componentId, apiBase)
      console.log(`✓ Published live: https://${cfg.componentId}.widgets.eeko.app/`)
    } catch (err) {
      console.error(`Promote failed: ${err instanceof Error ? err.message : String(err)}`)
      process.exit(1)
    }
  })
