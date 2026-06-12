/**
 * Bundled starter templates. Copied by `eeko init` into a new widget dir.
 * Templates ship under `templates/<name>/` at the package root (see the
 * `files` field in package.json).
 *
 * These are the platform's declarative starter archetypes (ported from the
 * canonical WIDGET_STARTERS): behaviour lives in `widget.json`'s
 * `interactions` block and `script.js` is the unmodified canonical seed.
 * A CLI-scaffolded widget therefore matches a server-authored one exactly.
 */

import { readFile, writeFile } from 'fs/promises'
import { fileURLToPath } from 'url'
import path from 'path'

export const TEMPLATES = ['alert', 'chat', 'goal', 'countdown', 'poll', 'banner'] as const
export type TemplateName = (typeof TEMPLATES)[number]

/** Default componentType per template (mirrors each manifest's componentType). */
export const TEMPLATE_COMPONENT_TYPE: Record<TemplateName, string> = {
  alert: 'alert',
  chat: 'chat',
  goal: 'overlay',
  countdown: 'countdown',
  poll: 'poll',
  banner: 'banner',
}

/** Old template names from pre-0.7 releases, mapped to their successors. */
export const LEGACY_TEMPLATE_ALIASES: Record<string, TemplateName> = {
  'chat-overlay': 'chat',
  'goal-bar': 'goal',
}

const CANONICAL_FILES = ['index.html', 'styles.css', 'script.js', 'widget.json']

function templatesRoot(): string {
  // The bundled CLI is `dist/index.js`; templates live at `../templates`.
  return path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'templates')
}

export function isTemplateName(value: string): value is TemplateName {
  return (TEMPLATES as readonly string[]).includes(value)
}

/**
 * Copy a bundled template into `targetDir`, stamping the widget `name` into
 * widget.json.
 */
export async function scaffoldTemplate(
  template: TemplateName,
  targetDir: string,
  widgetName: string
): Promise<void> {
  const src = path.join(templatesRoot(), template)
  for (const file of CANONICAL_FILES) {
    let content = await readFile(path.join(src, file), 'utf-8')
    if (file === 'widget.json') {
      try {
        const json = JSON.parse(content) as Record<string, unknown>
        json.name = widgetName
        content = JSON.stringify(json, null, 2) + '\n'
      } catch {
        // leave the template's own name if it somehow won't parse
      }
    }
    await writeFile(path.join(targetDir, file), content)
  }
}
