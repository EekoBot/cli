/**
 * Drift guard: every bundled template must satisfy the same contract lint the
 * platform's canon enforces. A template that fails here would scaffold a
 * widget that contradicts the AGENTS.md guide sitting next to it.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { validateManifest, lintWidget } from '@eeko/sdk/template'
import { validateInteractions } from '@eeko/sdk/interactions'
import { TEMPLATES, TEMPLATE_COMPONENT_TYPE } from './templates.js'

const TEMPLATES_ROOT = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'templates'
)

function loadTemplate(name: string) {
  const dir = path.join(TEMPLATES_ROOT, name)
  return {
    manifest: JSON.parse(readFileSync(path.join(dir, 'widget.json'), 'utf-8')) as Record<
      string,
      unknown
    >,
    html: readFileSync(path.join(dir, 'index.html'), 'utf-8'),
    css: readFileSync(path.join(dir, 'styles.css'), 'utf-8'),
    javascript: readFileSync(path.join(dir, 'script.js'), 'utf-8'),
  }
}

describe.each([...TEMPLATES])('template %s', (name) => {
  const widget = loadTemplate(name)

  it('has a valid manifest', () => {
    const result = validateManifest(widget.manifest)
    expect(result.ok, JSON.stringify(!result.ok && result.errors)).toBe(true)
  })

  it('declares componentType matching the registry', () => {
    expect(widget.manifest.componentType).toBe(TEMPLATE_COMPONENT_TYPE[name])
  })

  it('carries a valid declarative interactions block', () => {
    expect(widget.manifest.interactions, 'declarative starters must ship interactions').toBeDefined()
    const result = validateInteractions(widget.manifest.interactions)
    expect(result.ok, JSON.stringify(!result.ok && result.errors)).toBe(true)
  })

  it('passes the contract lint with no errors', () => {
    const result = lintWidget(widget)
    expect(result.errors, JSON.stringify(result.errors)).toEqual([])
  })
})
