/**
 * eeko.config.json — ties a local directory to the Eeko platform.
 *
 * Three shapes, distinguished by which id is set:
 *   - PROJECT ROOT: `projectId` only (no artifact id) — the parent folder that
 *     `eeko project init` creates; `widget/` and `automation/` sides live under it.
 *   - WIDGET dir:   `componentId` (+ the projectId it belongs to) — a `uc-{id}` clone.
 *   - AUTOMATION dir: `automationId` (+ projectId) — an `au-{id}` clone.
 *
 * All shapes may carry the owning merchant `accountId` (absent = personal). A
 * project's owner is set once at `eeko project init`; both sides inherit it
 * server-side, so the side commands never reason about ownership.
 */

import { readFileSync, writeFileSync, existsSync } from 'fs'
import { dirname, join } from 'path'

export interface EekoConfig {
  /** Present in a widget directory (a `uc-{id}` clone). */
  componentId?: string
  /** Present in an automation directory (an `au-{id}` clone). */
  automationId?: string
  /** The catalog project both sides belong to (also the sole id in a project root). */
  projectId?: string
  apiHost?: string
  /** Present when the project/artifact is owned by a merchant account. */
  accountId?: string
  /** Human-readable project name (project-root config only). */
  name?: string
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

/** The project context a side command (`widget init` / `automation init`) binds to. */
export interface ProjectContext {
  projectId: string
  accountId?: string
  apiHost?: string
}

/**
 * Read a PROJECT-ROOT config (a `projectId` with no artifact id). Returns null
 * if the directory is absent, unparseable, has no projectId, or is actually a
 * widget/automation SIDE dir (an artifact id is set).
 */
export function loadProjectConfig(cwd: string = process.cwd()): EekoConfig | null {
  const path = join(cwd, CONFIG_FILENAME)
  if (!existsSync(path)) return null
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf-8')) as Partial<EekoConfig>
    if (typeof parsed.projectId !== 'string' || !parsed.projectId) return null
    if (parsed.componentId || parsed.automationId) return null // a side dir, not a project root
    return {
      projectId: parsed.projectId,
      accountId: typeof parsed.accountId === 'string' ? parsed.accountId : undefined,
      apiHost: parsed.apiHost,
      name: typeof parsed.name === 'string' ? parsed.name : undefined,
    }
  } catch {
    return null
  }
}

/**
 * Resolve the project a side command should attach to: walk cwd → parents for
 * the first config carrying a `projectId` (a project root, OR a sibling side
 * dir's config when run from inside one). Returns null if none found.
 */
export function findProjectContext(cwd: string = process.cwd()): ProjectContext | null {
  let dir = cwd
  for (let i = 0; i < 8; i++) {
    const path = join(dir, CONFIG_FILENAME)
    if (existsSync(path)) {
      try {
        const parsed = JSON.parse(readFileSync(path, 'utf-8')) as Partial<EekoConfig>
        if (typeof parsed.projectId === 'string' && parsed.projectId) {
          return {
            projectId: parsed.projectId,
            accountId: typeof parsed.accountId === 'string' ? parsed.accountId : undefined,
            apiHost: parsed.apiHost,
          }
        }
      } catch {
        /* keep walking */
      }
    }
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return null
}
