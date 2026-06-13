import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  matchAccount,
  validateAutomationDraft,
  commitAutomationDraft,
  type EekoAccount,
} from './client.js'

function mockFetch(status: number, body: unknown): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    }))
  )
}

const accounts: EekoAccount[] = [
  { id: 'acct-1', slug: 'my-shop', name: 'My Shop' },
  { id: 'acct-2', slug: 'other-store', name: 'Other Store', approval_status: 'approved' },
]

describe('matchAccount', () => {
  it('matches by id', () => {
    expect(matchAccount(accounts, 'acct-2')?.slug).toBe('other-store')
  })

  it('matches by slug', () => {
    expect(matchAccount(accounts, 'my-shop')?.id).toBe('acct-1')
  })

  it('returns undefined when nothing matches', () => {
    expect(matchAccount(accounts, 'nope')).toBeUndefined()
  })

  it('prefers an exact id match when another account has that slug', () => {
    const colliding: EekoAccount[] = [
      { id: 'acct-1', slug: 'acct-2', name: 'Slug Collides' },
      { id: 'acct-2', slug: 'other', name: 'Id Owner' },
    ]
    expect(matchAccount(colliding, 'acct-2')?.name).toBe('Id Owner')
  })

  it('matches slugs case-insensitively', () => {
    expect(matchAccount(accounts, 'My-Shop')?.id).toBe('acct-1')
    expect(matchAccount(accounts, 'OTHER-STORE')?.id).toBe('acct-2')
  })

  it('requires an exact (case-sensitive) id match', () => {
    expect(matchAccount(accounts, 'ACCT-1')).toBeUndefined()
  })
})

describe('validateAutomationDraft', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('returns ok on a 200', async () => {
    mockFetch(200, { ok: true })
    const r = await validateAutomationDraft('tok', 'au-1', {}, 'https://api.test')
    expect(r.ok).toBe(true)
  })

  it('returns the issues array (not throwing) on a 400', async () => {
    mockFetch(400, {
      ok: false,
      issues: [{ stage: 'trigger', field: 'channelId', message: 'required' }],
    })
    const r = await validateAutomationDraft('tok', 'au-1', {}, 'https://api.test')
    expect(r.ok).toBe(false)
    expect(r.issues).toEqual([
      { stage: 'trigger', field: 'channelId', message: 'required' },
    ])
  })

  it('throws on a non-issue error body', async () => {
    mockFetch(500, { error: 'boom' })
    await expect(
      validateAutomationDraft('tok', 'au-1', {}, 'https://api.test')
    ).rejects.toThrow('boom')
  })
})

describe('commitAutomationDraft', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('returns the commit result on success', async () => {
    mockFetch(200, { ok: true, sha: 'deadbeef', ref: 'draft' })
    const r = await commitAutomationDraft('tok', 'au-1', {}, 'msg', 'https://api.test')
    expect(r.sha).toBe('deadbeef')
  })

  it('surfaces validation issues from the error body instead of throwing', async () => {
    mockFetch(400, {
      issues: [{ stage: 'action', field: 'componentId', message: 'unknown widget' }],
    })
    const r = await commitAutomationDraft('tok', 'au-1', {}, 'msg', 'https://api.test')
    expect(r.ok).toBe(false)
    expect(r.issues?.[0].message).toBe('unknown widget')
  })
})
