import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import {
  mapTwilioStatus,
  canAdvanceStatus,
  previousStatusesFor,
} from '@/lib/whatsapp-status'
import { toConversationPhone, conversationPhoneKeys } from '@/lib/whatsapp-phone'
import { replacePlaceholders } from '@/lib/template-placeholders'
import { missingGoogleScopes } from '@/lib/google-scopes'
import { memberIsActive, INACTIVE_MEMBER_STATUSES } from '@/lib/member-status'

// ============================================================================
// Documents audit, round 12 — communications & staff access
// ============================================================================

const src = (f: string) => readFileSync(path.join(process.cwd(), f), 'utf8')

describe('staff deactivation is per company', () => {
  it('the account flag and the company membership both count', () => {
    expect(memberIsActive(true, 'active')).toBe(true)
    expect(memberIsActive(null, 'active')).toBe(true)
    expect(memberIsActive(true, 'deactivated')).toBe(false)
    expect(memberIsActive(true, 'suspended')).toBe(false)
    expect(memberIsActive(false, 'active')).toBe(false)
    expect(memberIsActive(true, 'invited')).toBe(true)
  })

  it('the profile route writes the membership, not user_profiles.is_active', () => {
    const route = src('app/api/profiles/[id]/route.ts')
    expect(route).toMatch(/const \{ is_active: isActive, (role: newRole, )?\.\.\.profileUpdate \} = updateData/)
    expect(route).toMatch(/setMemberActive\(adminClient, authResult\.tenant_id!/)
    expect(route).not.toMatch(/\.update\(updateData\)/)
    // scoped to the caller's tenant
    const fn = route.slice(route.indexOf('async function setMemberActive'))
    expect(fn).toMatch(/\.eq\('tenant_id', tenantId\)/)
  })

  it('middleware refuses a user whose only memberships are deactivated', () => {
    const mw = src('middleware.ts')
    expect(mw).toMatch(/\.in\('status', \[\.\.\.INACTIVE_MEMBER_STATUSES\]\)/)
    expect(mw).toMatch(/\(profile && !profile\.is_active\) \|\| deactivatedHere/)
    expect(INACTIVE_MEMBER_STATUSES).toContain('deactivated')
  })

  it('migration 406 lets tenant_members carry deactivated', () => {
    const sql = src('supabase/migrations/406_tenant_members_deactivated_status.sql')
    expect(sql).toMatch(/DROP CONSTRAINT IF EXISTS tenant_members_status_check/)
    expect(sql).toMatch(/'deactivated'/)
  })
})

describe('WhatsApp status mapping', () => {
  it('maps Twilio statuses onto the allowed set', () => {
    expect(mapTwilioStatus('undelivered')).toBe('failed')
    expect(mapTwilioStatus('failed')).toBe('failed')
    for (const s of ['queued', 'accepted', 'scheduled', 'sending', 'receiving']) {
      expect(mapTwilioStatus(s)).toBe('pending')
    }
    expect(mapTwilioStatus('received')).toBe('delivered')
    expect(mapTwilioStatus('sent')).toBe('sent')
    expect(mapTwilioStatus('Delivered')).toBe('delivered')
    expect(mapTwilioStatus('read')).toBe('read')
    expect(mapTwilioStatus('something-new')).toBeNull()
    expect(mapTwilioStatus(undefined)).toBeNull()
  })

  it('never moves backwards', () => {
    expect(canAdvanceStatus('read', 'sent')).toBe(false)
    expect(canAdvanceStatus('delivered', 'sent')).toBe(false)
    expect(canAdvanceStatus('read', 'delivered')).toBe(false)
    expect(canAdvanceStatus('sent', 'delivered')).toBe(true)
    expect(canAdvanceStatus('delivered', 'read')).toBe(true)
    expect(canAdvanceStatus('sent', 'sent')).toBe(false)
  })

  it('failed replaces pending/sent but not delivered/read', () => {
    expect(canAdvanceStatus('pending', 'failed')).toBe(true)
    expect(canAdvanceStatus('sent', 'failed')).toBe(true)
    expect(canAdvanceStatus('delivered', 'failed')).toBe(false)
    expect(canAdvanceStatus('read', 'failed')).toBe(false)
  })

  it('previousStatusesFor lists what the conditional update may replace', () => {
    expect(previousStatusesFor('sent')).toEqual(['pending'])
    expect(previousStatusesFor('failed')).toEqual(['pending', 'sent'])
    expect(previousStatusesFor('read')).toEqual(['pending', 'sent', 'delivered', 'failed'])
    expect(previousStatusesFor('pending')).toEqual([])
  })

  it('the callback writes the mapped status under a status guard', () => {
    const route = src('app/api/whatsapp/status-callback/route.ts')
    expect(route).toMatch(/mapTwilioStatus\(messageStatus\)/)
    expect(route).toMatch(/\.in\('status', replaceable\)/)
    expect(route).not.toMatch(/status: messageStatus/)
  })
})

describe('WhatsApp conversation phone key', () => {
  it('normalises to E.164 with a leading +', () => {
    expect(toConversationPhone('201001234567')).toBe('+201001234567')
    expect(toConversationPhone('+20 100 123 4567')).toBe('+201001234567')
    expect(toConversationPhone('0020 100-123-4567')).toBe('+201001234567')
    expect(toConversationPhone('(44) 20 7946 0958')).toBe('+442079460958')
    // trunk 0 without a country cannot be made E.164
    expect(toConversationPhone('0100 123 4567')).toBe('01001234567')
    expect(toConversationPhone('')).toBe('')
  })

  it('looks up both the new and the legacy spelling', () => {
    expect(conversationPhoneKeys('201001234567')).toEqual(['+201001234567', '201001234567'])
    expect(conversationPhoneKeys('')).toEqual([])
  })

  it('both app routes store and look up the normalised key', () => {
    for (const f of ['app/api/whatsapp/conversations/route.ts', 'app/api/whatsapp/messages/route.ts']) {
      const route = src(f)
      expect(route, f).toMatch(/const cleanPhone = await conversationPhoneNumber\(phone_number, tenant_id\)/)
      expect(route, f).toMatch(/\.in\('phone_number', conversationPhoneKeys\(cleanPhone\)\)/)
      expect(route, f).not.toMatch(/phone_number\.replace\(\/\[\^\\d\+\]\/g, ''\)/)
    }
  })
})

describe('email template placeholders', () => {
  const data = { client_name: 'Smith & <b>Sons</b>', note: '"hi"' }

  it('escapes values with escape: true', () => {
    expect(replacePlaceholders('<p>Dear {{client_name}}</p>', data, { escape: true }))
      .toBe('<p>Dear Smith &amp; &lt;b&gt;Sons&lt;/b&gt;</p>')
  })

  it('leaves the template markup and unknown placeholders alone', () => {
    expect(replacePlaceholders('<b>{{missing}}</b>', data, { escape: true })).toBe('<b>{{missing}}</b>')
  })

  it('plain-text use stays unescaped', () => {
    expect(replacePlaceholders('Re: {{client_name}}', data)).toBe('Re: Smith & <b>Sons</b>')
  })

  it('the inbox escapes the HTML body only', () => {
    const page = src('app/inbox/page.tsx')
    expect(page).toMatch(/replacePlaceholders\(selectedTemplate\.content, finalData, \{ escape: true \}\)/)
    expect(page).toMatch(/replacePlaceholders\(selectedTemplate\.subject, finalData\)/)
  })
})

describe('Gmail granted scopes', () => {
  const required = [
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/gmail.send',
    'https://www.googleapis.com/auth/userinfo.email',
  ]

  it('reports a scope left unticked', () => {
    expect(missingGoogleScopes(
      'https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/userinfo.email',
      required
    )).toEqual(['https://www.googleapis.com/auth/gmail.send'])
  })

  it('accepts every scope granted, including short names', () => {
    expect(missingGoogleScopes(
      'openid email https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/gmail.readonly',
      required
    )).toEqual([])
  })

  it('the callback refuses before saving the token', () => {
    const route = src('app/api/auth/google/callback/route.ts')
    const check = route.indexOf('missingGoogleScopes(tokens.scope, GMAIL_SCOPES)')
    expect(check).toBeGreaterThan(-1)
    expect(route.indexOf(".from('gmail_tokens')")).toBeGreaterThan(check)
    expect(route).toMatch(/error=missing_scopes/)
    expect(src('app/settings/email/page.tsx')).toMatch(/error === 'missing_scopes'/)
  })
})
