// ============================================
// COMPANY IDENTITY ON CUSTOMER-FACING DOCUMENTS
// ============================================
// Every PDF generator hardcoded one operator — "Travel2Egypt", its website,
// email and phone — in headers, footers and signature blocks. In a
// multi-tenant product that meant Afford Egypt's invoices introduced
// themselves as Travel2Egypt: the same identity bug fixed for email senders
// (see app/api/send-email), one artifact further down.
//
// The identity on a document comes from the TENANT, whose fields already
// exist and are edited in Settings → Organization. The rule when a field is
// missing: OMIT the line. A blank footer is unremarkable; another operator's
// name on your invoice is not. There is no non-tenant default identity, and
// there must never be one.

export interface CompanyIdentity {
  name: string
  email?: string
  phone?: string
  website?: string
}

/** The tenant fields documents render. All optional so partial rows degrade. */
export interface TenantIdentityFields {
  company_name?: string | null
  contact_email?: string | null
  company_phone?: string | null
  company_website?: string | null
}

export function identityFromTenant(
  tenant: TenantIdentityFields | null | undefined
): CompanyIdentity {
  return {
    // Empty string, not a placeholder brand: generators skip empty lines.
    name: tenant?.company_name?.trim() || '',
    email: tenant?.contact_email?.trim() || undefined,
    phone: tenant?.company_phone?.trim() || undefined,
    website: tenant?.company_website?.trim() || undefined,
  }
}

/**
 * The "Name | website | email" footer used across the generators, built from
 * whatever exists. Returns '' when nothing does, and callers skip the line.
 */
export function identityFooterLine(company: CompanyIdentity): string {
  return [company.name, company.website, company.email, company.phone]
    .filter((part): part is string => !!part && part.length > 0)
    .join(' | ')
}
