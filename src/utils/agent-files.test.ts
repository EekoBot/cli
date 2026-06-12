import { describe, it, expect } from 'vitest'
import { mkdtempSync, readFileSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'
import { AUTHORING_GUIDE, AUTHORING_GUIDE_VERSION } from '@eeko/sdk/authoring-guide'
import {
  renderAgentsMd,
  renderClaudeMd,
  renderMcpJson,
  readGuideVersionStamp,
  writeAgentFiles,
  MCP_PLATFORM_URL,
} from './agent-files.js'

describe('renderAgentsMd', () => {
  it('embeds the SDK authoring guide verbatim', () => {
    expect(renderAgentsMd()).toContain(AUTHORING_GUIDE)
  })

  it('stamps the SDK guide version and parses it back', () => {
    const md = renderAgentsMd()
    expect(md).toContain(`@eeko/sdk v${AUTHORING_GUIDE_VERSION}`)
    expect(readGuideVersionStamp(md)).toBe(AUTHORING_GUIDE_VERSION)
  })

  it('marks promote and releases as human-only', () => {
    const md = renderAgentsMd()
    expect(md).toContain('eeko promote')
    expect(md.toLowerCase()).toContain('human-only')
  })
})

describe('renderClaudeMd', () => {
  it('imports AGENTS.md', () => {
    expect(renderClaudeMd()).toContain('@AGENTS.md')
  })
})

describe('renderMcpJson', () => {
  it('is valid JSON pointing at the platform MCP server', () => {
    const parsed = JSON.parse(renderMcpJson()) as {
      mcpServers: Record<string, { type: string; url: string }>
    }
    expect(parsed.mcpServers['eeko-platform']).toEqual({ type: 'http', url: MCP_PLATFORM_URL })
  })
})

describe('writeAgentFiles', () => {
  it('writes all files into an empty dir and appends .gitignore', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'eeko-agent-files-'))
    const result = await writeAgentFiles(dir)
    expect(result.written.sort()).toEqual(['.gitignore', '.mcp.json', 'AGENTS.md', 'CLAUDE.md'])
    expect(readFileSync(path.join(dir, '.gitignore'), 'utf-8')).toContain('.eeko-dev.json')
  })

  it('skips existing files unless forced', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'eeko-agent-files-'))
    writeFileSync(path.join(dir, 'AGENTS.md'), 'hand-edited')
    const first = await writeAgentFiles(dir)
    expect(first.skipped).toEqual(['AGENTS.md'])
    expect(readFileSync(path.join(dir, 'AGENTS.md'), 'utf-8')).toBe('hand-edited')

    const forced = await writeAgentFiles(dir, { force: true })
    expect(forced.written).toContain('AGENTS.md')
    expect(readFileSync(path.join(dir, 'AGENTS.md'), 'utf-8')).toContain(AUTHORING_GUIDE_VERSION)
  })
})
