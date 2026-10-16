// ============================================
// "Set your password" — the invitee's own mailbox proves the address
// ============================================
// The invitation link is not proof of the mailbox: the inviter is handed the
// same link (to copy when the email fails, and on every resend), so anyone who
// opened it could accept as the invitee. Accepting therefore never chooses a
// password. It creates the account (unconfirmed, with a random password nobody
// knows) and this email carries a one-time link to the invitee's own inbox;
// opening it confirms the address and lets them set the password.

import crypto from 'crypto'
import { sendMail } from '@/lib/email-send'

type AdminAuth = {
  auth: {
    admin: {
      generateLink(params: {
        type: 'recovery'
        email: string
        options?: { redirectTo?: string }
      }): Promise<{ data: { properties?: { action_link?: string } | null } | null; error: unknown }>
    }
  }
}

/** A password no one is told: the account cannot be signed into until reset. */
export function unusablePassword(): string {
  return crypto.randomBytes(32).toString('base64url')
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch] as string))
}

export function setupEmailHtml(link: string, companyName: string | null): string {
  const company = escapeHtml(String(companyName || '').trim())
  const href = escapeHtml(link)
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;background-color:#f3f4f6;">
  <div style="max-width:600px;margin:0 auto;padding:20px;">
    <div style="background-color:white;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
      <div style="background-color:#647C47;padding:32px;text-align:center;">
        <h1 style="color:white;margin:0;font-size:24px;font-weight:600;">Set your password</h1>
      </div>
      <div style="padding:32px;">
        <p style="color:#374151;font-size:16px;margin:0 0 16px 0;">
          Your place on ${company ? `<strong>${company}</strong>'s` : 'the'} team on Autoura is ready. Choose a password to finish setting up your account.
        </p>
        <div style="text-align:center;margin:32px 0;">
          <a href="${href}" style="display:inline-block;background-color:#647C47;color:white;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:600;font-size:16px;">
            Set my password
          </a>
        </div>
        <p style="color:#9ca3af;font-size:12px;margin:24px 0 0 0;text-align:center;">
          This link works once and expires soon. If it has expired, use "Forgot password" on the sign-in page.
        </p>
      </div>
      <div style="background-color:#f9fafb;padding:16px 24px;border-top:1px solid #e5e7eb;">
        <p style="color:#9ca3af;font-size:11px;margin:0;text-align:center;">
          If you didn't accept an invitation to Autoura, ignore this email — no one can sign in to this account without it.
        </p>
      </div>
    </div>
  </div>
</body>
</html>`
}

/**
 * Email the invitee a one-time link to set their password. Opening it confirms
 * the address (Supabase confirms an unconfirmed account on a recovery link)
 * and lands on /reset-password with a session.
 */
export async function sendPasswordSetupEmail(
  admin: AdminAuth,
  email: string,
  companyName: string | null,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://getautoura.net'
  const { data, error } = await admin.auth.admin.generateLink({
    type: 'recovery',
    email,
    options: { redirectTo: `${baseUrl}/reset-password` },
  })
  const link = data?.properties?.action_link
  if (error || !link) return { ok: false, error: 'Could not create the setup link' }

  const sent = await sendMail({
    to: email,
    subject: companyName ? `Set your password to join ${companyName} on Autoura` : 'Set your Autoura password',
    html: setupEmailHtml(link, companyName),
  })
  return sent.success ? { ok: true } : { ok: false, error: sent.error || 'Could not send the setup email' }
}
