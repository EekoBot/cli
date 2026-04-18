/**
 * eeko.config.json — ties a local widget directory to a specific
 * merchant component on the user's Eeko account.
 */

import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'

export interface EekoConfig {
  componentId: string
  apiHost?: string
}

export const CONFIG_FILENAME = 'eeko.config.json'

export function loadEekoConfig(cwd: string = process.cwd()): EekoConfig | null {
  const path = join(cwd, CONFIG_FILENAME)
  if (!existsSync(path)) return null

  try {
    const raw = readFileSync(path, 'utf-8')
    const parsed = JSON.parse(raw) as Partial<EekoConfig>
    if (!parsed.componentId || typeof parsed.componentId !== 'string') {
      return null
    }
    return {
      componentId: parsed.componentId,
      apiHost: parsed.apiHost,
    }
  } catch {
    return null
  }
}

export function writeEekoConfig(cwd: string, config: EekoConfig): void {
  const path = join(cwd, CONFIG_FILENAME)
  writeFileSync(path, JSON.stringify(config, null, 2) + '\n', 'utf-8')
}
