import { describe, it, expect } from 'vitest'
import { mkdtempSync, readFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { loadEekoConfig, writeEekoConfig, artifactRef, CONFIG_FILENAME } from './config.js'

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

  it('round-trips an automation directory (automationId + projectId)', () => {
    const dir = tempDir()
    writeEekoConfig(dir, { automationId: 'au-1', projectId: 'proj-1' })
    const loaded = loadEekoConfig(dir)
    expect(loaded).toEqual({
      componentId: undefined,
      automationId: 'au-1',
      projectId: 'proj-1',
      apiHost: undefined,
      accountId: undefined,
    })
    // The widget id key must not leak into an automation config file.
    const raw = readFileSync(join(dir, CONFIG_FILENAME), 'utf-8')
    expect(raw).not.toContain('componentId')
  })

  it('loads with just an automationId', () => {
    const dir = tempDir()
    writeEekoConfig(dir, { automationId: 'au-2' })
    expect(loadEekoConfig(dir)?.automationId).toBe('au-2')
  })
})

describe('artifactRef', () => {
  it('resolves a component', () => {
    expect(artifactRef({ componentId: 'c1' })).toEqual({ kind: 'component', id: 'c1' })
  })

  it('resolves an automation', () => {
    expect(artifactRef({ automationId: 'a1' })).toEqual({ kind: 'automation', id: 'a1' })
  })

  it('prefers a component when both are set (shouldn\'t happen, but is defined)', () => {
    expect(artifactRef({ componentId: 'c1', automationId: 'a1' })).toEqual({
      kind: 'component',
      id: 'c1',
    })
  })

  it('returns null when neither id is set', () => {
    expect(artifactRef({})).toBeNull()
  })
})
