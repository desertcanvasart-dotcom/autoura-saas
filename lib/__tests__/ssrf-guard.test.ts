import { describe, it, expect } from 'vitest'
import { isPrivateAddress, checkPublicHttpUrl } from '@/lib/ssrf-guard'

describe('isPrivateAddress', () => {
  it('flags the addresses an SSRF payload would target', () => {
    for (const ip of [
      '127.0.0.1', '0.0.0.0', '10.1.2.3', '172.16.5.4', '172.31.255.1',
      '192.168.1.1', '169.254.169.254', // cloud metadata
      '100.64.0.1', '::1', 'fe80::1', 'fd00::1', 'fc00::1', '::ffff:127.0.0.1',
    ]) {
      expect(isPrivateAddress(ip), ip).toBe(true)
    }
  })

  it('allows real public addresses', () => {
    for (const ip of ['8.8.8.8', '1.1.1.1', '93.184.216.34', '2606:4700:4700::1111']) {
      expect(isPrivateAddress(ip), ip).toBe(false)
    }
  })

  it('treats an unparseable address as unsafe', () => {
    expect(isPrivateAddress('not-an-ip')).toBe(true)
  })

  it('does not mistake 172.15/172.32 (public) for the 172.16/12 private block', () => {
    expect(isPrivateAddress('172.15.0.1')).toBe(false)
    expect(isPrivateAddress('172.32.0.1')).toBe(false)
  })
})

describe('checkPublicHttpUrl', () => {
  it('rejects a literal metadata IP without any DNS', async () => {
    const r = await checkPublicHttpUrl('http://169.254.169.254/latest/meta-data/')
    expect(r.ok).toBe(false)
  })

  it('rejects loopback by name and by IP', async () => {
    expect((await checkPublicHttpUrl('http://127.0.0.1:8080/')).ok).toBe(false)
    expect((await checkPublicHttpUrl('http://[::1]/')).ok).toBe(false)
  })

  it('rejects non-http schemes', async () => {
    for (const u of ['file:///etc/passwd', 'gopher://x', 'data:text/html,x', 'ftp://h/']) {
      expect((await checkPublicHttpUrl(u)).ok, u).toBe(false)
    }
  })

  it('rejects junk and empty input', async () => {
    expect((await checkPublicHttpUrl('')).ok).toBe(false)
    expect((await checkPublicHttpUrl(null)).ok).toBe(false)
    expect((await checkPublicHttpUrl('not a url')).ok).toBe(false)
  })

  it('accepts a public literal IP', async () => {
    const r = await checkPublicHttpUrl('https://8.8.8.8/logo.png')
    expect(r.ok).toBe(true)
  })
})
