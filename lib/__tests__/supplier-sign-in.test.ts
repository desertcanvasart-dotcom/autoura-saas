import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

const read = (p: string) => readFileSync(p, 'utf8')

describe('supplier sign-in', () => {
  const code = read('app/api/supplier-auth/code/route.ts')
  const verify = read('app/api/supplier-auth/verify/route.ts')

  it('never says whether a phone is known: the same answer for unknown, no email, or sent', () => {
    expect(code.match(/return NextResponse\.json\(SAME_ANSWER\)/g)?.length).toBe(3)
    expect(code).not.toMatch(/not found|unknown number|no supplier/i)
  })

  it('sends at most 3 codes in 15 minutes, stores only the hash, and only to the emails on the supplier records', () => {
    expect(code).toContain('canSendCode(')
    expect(code).toContain('code_hash: hashLoginCode(code, account.id)')
    expect(code).not.toMatch(/code:\s*code[,\s}]/)
    expect(code).toContain('codeEmails(records)')
  })

  it('a wrong code counts a try; a right one is spent once, even if two requests race', () => {
    expect(verify).toContain('attempts: row.attempts + 1')
    expect(verify).toContain(".update({ used_at: now.toISOString() }).eq('id', row!.id).is('used_at', null)")
  })

  it('signing in claims the matching records as PENDING — never approved', () => {
    expect(verify).toContain('claimRecords(')
    const claims = read('lib/supplier-claims.ts')
    expect(claims).not.toMatch(/status:\s*'approved'/)
    expect(claims).toContain('ignoreDuplicates: true')
  })

  it('the cookie is http-only, same-site and holds a random token whose hash is all the database keeps', () => {
    const session = read('lib/supplier-session.ts')
    expect(session).toContain('httpOnly: true')
    expect(session).toContain("sameSite: 'lax'")
    expect(verify).toContain('token_hash: hashSessionToken(token)')
  })

  it('a disabled account cannot sign in or stay signed in', () => {
    expect(verify).toContain('!account.disabled_at')
    expect(read('lib/supplier-session.ts')).toContain('account.disabled_at')
  })

  it('the home sends anyone without a live session to sign-in, and shows only their own agencies', () => {
    const home = read('app/supplier-home/page.tsx')
    expect(home).toContain("redirect('/supplier-login')")
    expect(home).toContain(".eq('account_id', signedIn.account.id)")
  })

  it('sign-out revokes the session and clears the cookie', () => {
    const out = read('app/api/supplier-auth/sign-out/route.ts')
    expect(out).toContain('revoked_at')
    expect(out).toContain("supplierCookie('', 0)")
  })

  it('middleware opens exactly the sign-in, home and their API — and supplier pages never touch Supabase auth', () => {
    const mw = read('middleware.ts')
    for (const p of ["'/api/supplier-auth/',", "'/supplier-login',", "'/supplier-home',"]) expect(mw).toContain(p)
    for (const f of ['lib/supplier-session.ts', 'app/api/supplier-auth/verify/route.ts', 'app/supplier-home/page.tsx']) {
      expect(read(f), f).not.toMatch(/auth\.(signIn|signUp|admin\.createUser)/)
    }
  })
})
