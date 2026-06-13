/**
 * eeko.config.json — ties a local artifact directory to a specific Eeko
 * artifact. A directory holds EITHER a widget (componentId) OR an automation
 * (automationId); both forms may carry the catalog projectId they belong to
 * and the owning merchant accountId.
 */

import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'

export interface EekoConfig {
  /** Present in a widget directory (a `uc-{id}` clone). */
  componentId?: string
  /** Present in an automation directory (an `au-{id}` clone). */
  automationId?: string
  /** The catalog project both sides belong to. */
  projectId?: string
  apiHost?: string
  /** Present when the artifact is owned by a merchant account. */
  accountId?: string
}

export const CONFIG_FILENAME = 'eeko.config.json'

/** The artifact a directory represents — exactly one id is set. */
export type ArtifactRef =
  | { kind: 'component'; id: string }
  | { kind: 'automation'; id: string }

/** Resolve which artifact (widget or automation) a loaded config points at. */
export function artifactRef(config: EekoConfig): ArtifactRef | null {
  if (config.componentId) return { kind: 'component', id: config.componentId }
  if (config.automationId) return { kind: 'automation', id: config.automationId }
  return null
}

export function loadEekoConfig(cwd: string = process.cwd()): EekoConfig | null {
  const path = join(cwd, CONFIG_FILENAME)
  if (!existsSync(path)) return null

  try {
    const raw = readFileSync(path, 'utf-8')
    const parsed = JSON.parse(raw) as Partial<EekoConfig>
    const hasComponent = typeof parsed.componentId === 'string' && parsed.componentId
    const hasAutomation = typeof parsed.automationId === 'string' && parsed.automationId
    // A valid config identifies exactly one artifact.
    if (!hasComponent && !hasAutomation) return null
    return {
      componentId: hasComponent ? parsed.componentId : undefined,
      automationId: hasAutomation ? parsed.automationId : undefined,
      projectId: typeof parsed.projectId === 'string' ? parsed.projectId : undefined,
      apiHost: parsed.apiHost,
      accountId: parsed.accountId,
    }
  } catch {
    return null
  }
}

export function writeEekoConfig(cwd: string, config: EekoConfig): void {
  const path = join(cwd, CONFIG_FILENAME)
  // Drop undefined keys so a widget config doesn't carry an empty automationId.
  const clean = Object.fromEntries(
    Object.entries(config).filter(([, v]) => v !== undefined)
  )
  writeFileSync(path, JSON.stringify(clean, null, 2) + '\n', 'utf-8')
}
