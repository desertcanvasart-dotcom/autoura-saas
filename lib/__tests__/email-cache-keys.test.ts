import { describe, it, expect } from 'vitest'
import { cacheOwnerKey } from '@/lib/email-cache'
import { readFileSync } from 'node:fs'
import path from 'node:path'

// The inbox cache kept one entry per Gmail id and one owner per user: a message
// cached under INBOX and STARRED overwrote itself, and switching company showed
// the other company's mailbox from cache.

const root = path.join(__dirname, '..', '..')
const cache = readFileSync(path.join(root, 'lib/email-cache.ts'), 'utf8')

describe('cacheOwnerKey', () => {
  it('is one person in one company', () => {
    expect(cacheOwnerKey('u1', 'tA')).toBe('u1:tA')
    expect(cacheOwnerKey('u1', 'tA')).not.toBe(cacheOwnerKey('u1', 'tB'))
  })
  it('is nothing until both are known — no shared cache meanwhile', () => {
    expect(cacheOwnerKey('u1', null)).toBeNull()
    expect(cacheOwnerKey(undefined, 'tA')).toBeNull()
  })
})

describe('the cache store', () => {
  it('keys each entry by owner, folder and message', () => {
    expect(cache).toContain("keyPath: ['userId', 'folder', 'id']")
    expect(cache).not.toContain("keyPath: 'id'")
  })
  it('replaces the v1 store on upgrade', () => {
    expect(cache).toMatch(/const DB_VERSION = 2/)
    expect(cache).toMatch(/oldVersion < 2[\s\S]{0,200}deleteObjectStore\(STORE_NAME\)/)
  })
  it('updates and removes every folder’s copy of a message', () => {
    expect(cache).toMatch(/updateCachedEmail[\s\S]*index\('id'\)\.openCursor/)
    expect(cache).toMatch(/removeCachedEmails[\s\S]*index\('id'\)/)
  })
})

describe('the inbox', () => {
  it('caches per user and company', () => {
    const page = readFileSync(path.join(root, 'app/inbox/_views/EmailView.tsx'), 'utf8')
    expect(page).toContain('useEmailCache(cacheOwnerKey(user?.id, tenant?.id))')
  })
})
