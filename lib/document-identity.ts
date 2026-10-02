// ============================================
// The letterhead a server-rendered document carries
// ============================================
// Settings → Organization (lib/sender-tenant), with the logo fetched as a
// data: URL for the PDF libraries — after the SSRF check, because the server
// is the one fetching a URL the tenant typed.

import { loadSenderTenant } from '@/lib/sender-tenant'
import { identityFromTenant, fetchLogoDataUrl, type CompanyIdentity } from '@/lib/company-identity'
import { checkPublicHttpUrl } from '@/lib/ssrf-guard'

export async function loadDocumentIdentity(tenantId: string | null | undefined): Promise<CompanyIdentity> {
  const tenant = await loadSenderTenant(tenantId)
  const logoUrl = tenant?.logo_url
  const logoDataUrl = logoUrl && (await checkPublicHttpUrl(logoUrl)).ok
    ? await fetchLogoDataUrl(logoUrl)
    : undefined
  return { ...identityFromTenant(tenant), logoDataUrl }
}
