// ============================================
// The agency's letterhead in an HTML email
// ============================================
// Payment reminders (manual, bulk and the scheduled sweep) were headed
// "Travel2Egypt", signed "Travel2Egypt Team" and footed "Travel2Egypt |
// Cairo, Egypt" for every agency. They now carry the same identity as the
// agency's documents: Settings → Organization (lib/company-identity).
// Tenant text is escaped — it is typed by a person and lands in HTML.

import { identityFromTenant, letterheadFooterLines, type CompanyIdentity, type TenantIdentityFields } from '@/lib/company-identity'

// Callers join the tenant with these columns (written out in each select so
// the typed client keeps its row types): company_name, contact_email,
// company_phone, company_website, logo_url, primary_color, tagline,
// company_address, license_number, tax_number, document_footer_text.

const FALLBACK_COLOR = '#647C47'

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

function brand(company: CompanyIdentity): string {
  const hex = company.primaryColor?.trim() ?? ''
  return /^#?[0-9a-fA-F]{6}$/.test(hex) ? (hex.startsWith('#') ? hex : `#${hex}`) : FALLBACK_COLOR
}

/** Only an http(s) logo URL goes into an <img src>. */
function safeLogo(company: CompanyIdentity): string | null {
  const url = company.logoUrl?.trim()
  return url && /^https?:\/\//i.test(url) ? url : null
}

export function emailIdentity(tenant: TenantIdentityFields | null | undefined): CompanyIdentity {
  return identityFromTenant(tenant)
}

/** The brand-coloured header row: logo and/or name, and the tagline. */
export function emailHeaderRow(company: CompanyIdentity): string {
  const color = brand(company)
  const logo = safeLogo(company)
  const name = company.name ? escapeHtml(company.name) : ''
  const tagline = company.tagline ? escapeHtml(company.tagline) : ''
  return `
          <tr>
            <td style="background-color: ${color}; padding: 28px 40px; text-align: center;">
              ${logo ? `<img src="${escapeHtml(logo)}" alt="${name}" style="max-height: 48px; max-width: 180px; margin-bottom: ${name ? '10px' : '0'}; display: inline-block;">` : ''}
              ${name ? `<h1 style="margin: 0; color: #ffffff; font-size: 22px; font-weight: 600;">${name}</h1>` : ''}
              ${tagline ? `<p style="margin: 6px 0 0; color: rgba(255,255,255,0.85); font-size: 13px;">${tagline}</p>` : ''}
            </td>
          </tr>`
}

/** "Best regards, <name>" — or just "Best regards," when there is no name. */
export function emailSignOff(company: CompanyIdentity): string {
  return company.name ? `Best regards,<br><strong>${escapeHtml(company.name)}</strong>` : 'Best regards,'
}

/** The footer row: the same lines a document's footer prints, then `note`. */
export function emailFooterRow(company: CompanyIdentity, note?: string): string {
  const lines = letterheadFooterLines(company).map(escapeHtml)
  const parts = [
    company.name ? `<p style="margin: 0 0 6px; color: #374151; font-size: 13px; font-weight: 600; text-align: center;">${escapeHtml(company.name)}</p>` : '',
    ...lines.map(l => `<p style="margin: 0 0 4px; color: #6b7280; font-size: 12px; text-align: center;">${l}</p>`),
    company.footerText ? `<p style="margin: 8px 0 0; color: #9ca3af; font-size: 11px; text-align: center; white-space: pre-line;">${escapeHtml(company.footerText)}</p>` : '',
    note ? `<p style="margin: 10px 0 0; color: #9ca3af; font-size: 11px; text-align: center;">${note}</p>` : '',
  ].filter(Boolean)
  return `
          <tr>
            <td style="background-color: #f9fafb; padding: 25px 40px; border-top: 1px solid #e5e7eb;">
              ${parts.join('\n              ')}
            </td>
          </tr>`
}
