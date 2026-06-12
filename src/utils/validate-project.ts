/**
 * Project validation core shared by `eeko build` (human UI and --json) —
 * file presence, manifest schema, interactions structure, and contract lint,
 * all from the same @eeko/sdk primitives the platform validates with.
 * nexus-api's commit-time validation stays authoritative; this is the local
 * pre-flight an author (or agent) iterates against.
 */

import fs from 'fs/promises'
import path from 'path'
import { validateManifest, lintWidget, type LintIssue } from '@eeko/sdk/template'
import { validateInteractions } from '@eeko/sdk/interactions'

export const CANONICAL_FILES = ['index.html', 'styles.css', 'script.js', 'widget.json'] as const

export interface ProjectValidation {
  ok: boolean
  files: { present: string[]; missing: string[] }
  manifest: { ok: boolean; errors: string[] }
  /** null when the manifest has no interactions block. */
  interactions: { ok: boolean; errors: string[] } | null
  lint: { errors: LintIssue[]; warnings: LintIssue[] }
}

export async function validateProject(cwd: string = process.cwd()): Promise<ProjectValidation> {
  const present: string[] = []
  const missing: string[] = []
  const contents: Record<string, string> = {}

  for (const file of CANONICAL_FILES) {
    try {
      contents[file] = await fs.readFile(path.join(cwd, file), 'utf-8')
      present.push(file)
    } catch {
      missing.push(file)
    }
  }

  let manifest: { ok: boolean; errors: string[] } = { ok: false, errors: ['widget.json missing'] }
  let interactions: ProjectValidation['interactions'] = null
  let parsedManifest: unknown = null

  if (contents['widget.json'] !== undefined) {
    try {
      parsedManifest = JSON.parse(contents['widget.json'])
      const result = validateManifest(parsedManifest)
      manifest = result.ok ? { ok: true, errors: [] } : { ok: false, errors: result.errors }
    } catch {
      manifest = { ok: false, errors: ['widget.json is not valid JSON'] }
    }
  }

  const manifestObj =
    parsedManifest && typeof parsedManifest === 'object'
      ? (parsedManifest as Record<string, unknown>)
      : null
  if (manifestObj?.interactions !== undefined) {
    const result = validateInteractions(manifestObj.interactions)
    interactions = result.ok ? { ok: true, errors: [] } : { ok: false, errors: result.errors }
  }

  const lint =
    manifestObj && missing.length === 0
      ? lintWidget({
          manifest: manifestObj,
          html: contents['index.html'] ?? '',
          css: contents['styles.css'] ?? '',
          javascript: contents['script.js'] ?? '',
        })
      : { errors: [], warnings: [] }

  const ok =
    missing.length === 0 &&
    manifest.ok &&
    (interactions === null || interactions.ok) &&
    lint.errors.length === 0

  return { ok, files: { present, missing }, manifest, interactions, lint }
}
