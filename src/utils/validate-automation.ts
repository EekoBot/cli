/**
 * Automation validation core shared by `eeko build` (human UI and --json) for
 * an automation directory.
 *
 * Reads + parses the local `automation.json`, then POSTs it to nexus-api's
 * validate-draft endpoint (the authoritative pipeline validator) and surfaces
 * any field-level issues. Local-only structural problems (missing file, bad
 * JSON, no config) are reported as issues with their own stage so the same
 * report shape covers both.
 */

import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { getValidAccessToken } from '../auth/session.js'
import {
  artifactRef,
  loadEekoConfig,
  type EekoConfig,
} from './config.js'
import { validateAutomationDraft, type AutomationValidationIssue } from '../api/client.js'
import { AUTH_CONFIG } from '../auth/config.js'

export const AUTOMATION_FILENAME = 'automation.json'

export interface AutomationValidation {
  ok: boolean
  issues: AutomationValidationIssue[]
}

function localIssue(field: string | undefined, message: string): AutomationValidation {
  return { ok: false, issues: [{ stage: 'cli', field, message }] }
}

export async function validateAutomation(
  cwd: string = process.cwd()
): Promise<AutomationValidation> {
  const config: EekoConfig | null = loadEekoConfig(cwd)
  const ref = config ? artifactRef(config) : null
  if (!ref || ref.kind !== 'automation') {
    return localIssue(
      undefined,
      'No automation here. Run from an automation directory (eeko.config.json with automationId).'
    )
  }

  const filePath = join(cwd, AUTOMATION_FILENAME)
  if (!existsSync(filePath)) {
    return localIssue(
      AUTOMATION_FILENAME,
      `Missing ${AUTOMATION_FILENAME}. Run \`eeko automation init\` to scaffold one.`
    )
  }

  let automation: unknown
  try {
    automation = JSON.parse(readFileSync(filePath, 'utf-8'))
  } catch {
    return localIssue(AUTOMATION_FILENAME, `${AUTOMATION_FILENAME} is not valid JSON`)
  }

  const token = await getValidAccessToken()
  if (!token) {
    return localIssue(undefined, 'Not logged in or session expired. Run: eeko login')
  }

  const apiBase = config?.apiHost ?? AUTH_CONFIG.api.baseUrl
  try {
    const result = await validateAutomationDraft(token, ref.id, automation, apiBase)
    return { ok: result.ok, issues: result.issues ?? [] }
  } catch (err) {
    return localIssue(
      undefined,
      `Validation request failed: ${err instanceof Error ? err.message : String(err)}`
    )
  }
}
