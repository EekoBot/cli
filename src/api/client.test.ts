import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  matchAccount,
  validateAutomationDraft,
  commitAutomationDraft,
  createListing,
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

describe('createListing', () => {
  afterEach(() => vi.unstubAllGlobals())

  function captureFetch(body: unknown) {
    // Type the params so `.mock.calls[0][1]` (the RequestInit) is indexable.
    const fn = vi.fn(async (_url: string, _init: RequestInit) => ({
      ok: true,
      status: 200,
      json: async () => body,
    }))
    vi.stubGlobal('fetch', fn)
    return fn
  }
  const sentBody = (fn: ReturnType<typeof captureFetch>) =>
    JSON.parse(fn.mock.calls[0]![1].body as string)

  it('defaults to a marketplace release carrying the version label', async () => {
    const fetchMock = captureFetch({
      ok: true,
      listing: { id: 'l1', version: 1, version_label: '1.0.0', approval_state: 'draft' },
    })
    await createListing(
      'tok',
      { projectId: 'p1', versionLabel: '1.0.0', changelog: 'init' },
      'https://api.test'
    )
    const body = sentBody(fetchMock)
    expect(body.listingKind).toBe('marketplace')
    expect(body.versionLabel).toBe('1.0.0')
  })

  it('sends listingKind=private and OMITS the version label for a private release', async () => {
    const fetchMock = captureFetch({
      ok: true,
      listing: { id: 'l2', version: 1, version_label: null, approval_state: 'private_published' },
    })
    await createListing(
      'tok',
      { projectId: 'p1', listingKind: 'private', changelog: 'first' },
      'https://api.test'
    )
    const body = sentBody(fetchMock)
    expect(body.listingKind).toBe('private')
    expect('versionLabel' in body).toBe(false)
  })
})
