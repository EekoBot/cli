import { describe, it, expect } from 'vitest'
import { mkdtempSync, readFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { loadEekoConfig, writeEekoConfig, CONFIG_FILENAME } from './config.js'

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), 'eeko-config-'))
}

describe('eeko.config.json round-trip', () => {
  it('persists and loads accountId for account-owned widgets', () => {
    const dir = tempDir()
    writeEekoConfig(dir, { componentId: 'c1', accountId: 'acct-1' })
    expect(loadEekoConfig(dir)).toEqual({
      componentId: 'c1',
      apiHost: undefined,
      accountId: 'acct-1',
    })
  })

  it('omits accountId from the file entirely for personal widgets', () => {
    const dir = tempDir()
    writeEekoConfig(dir, { componentId: 'c1', accountId: undefined })
    const raw = readFileSync(join(dir, CONFIG_FILENAME), 'utf-8')
    expect(raw).not.toContain('accountId')
    expect(loadEekoConfig(dir)).toEqual({
      componentId: 'c1',
      apiHost: undefined,
      accountId: undefined,
    })
  })

  it('returns null when componentId is missing', () => {
    const dir = tempDir()
    writeEekoConfig(dir, { componentId: '' })
    expect(loadEekoConfig(dir)).toBeNull()
  })
})
