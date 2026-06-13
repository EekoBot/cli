/**
 * eeko promote — publish your artifact live (promote draft → main).
 *
 * Server-mediated gate: nexus-api reads the draft ref and commits it onto the
 * published ref (the only blessed writer of `main`). Works for both widgets
 * (`uc-`) and automations (`au-`).
 */

import { Command } from 'commander'
import { getValidAccessToken } from '../auth/session.js'
import { artifactRef, loadEekoConfig } from '../utils/config.js'
import { promoteDraft, promoteAutomationDraft } from '../api/client.js'
import { AUTH_CONFIG } from '../auth/config.js'

export const promoteCommand = new Command('promote')
  .description('Publish your artifact live (promote draft → main)')
  .action(async () => {
    const token = await getValidAccessToken()
    if (!token) {
      console.error('Not logged in or session expired. Run: eeko login')
      process.exit(1)
    }

    const cfg = loadEekoConfig()
    const ref = cfg ? artifactRef(cfg) : null
    if (!cfg || !ref) {
      console.error('No eeko.config.json here — run from an artifact directory.')
      process.exit(1)
    }
    const apiBase = cfg.apiHost ?? AUTH_CONFIG.api.baseUrl

    try {
      if (ref.kind === 'automation') {
        await promoteAutomationDraft(token, ref.id, apiBase)
        console.log(`✓ Automation published live (${ref.id})`)
      } else {
        await promoteDraft(token, ref.id, apiBase)
        console.log(`✓ Published live: https://${ref.id}.widgets.eeko.app/`)
      }
    } catch (err) {
      console.error(`Promote failed: ${err instanceof Error ? err.message : String(err)}`)
      process.exit(1)
    }
  })
