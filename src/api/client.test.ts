import { describe, it, expect } from 'vitest'
import { matchAccount, type EekoAccount } from './client.js'

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
