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
})
