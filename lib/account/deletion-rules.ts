// Who may delete their own account (app/api/account): a company is never left
// without an owner.

export type Membership = { tenant_id: string; role: string; status: string; company: string }
export type OtherMember = { role: string; status: string }
export type DeletionBlock = { code: 'sole_member' | 'last_owner'; error: string } | null

export function deletionBlocker(mine: Membership[], othersByTenant: Map<string, OtherMember[]>): DeletionBlock {
  for (const m of mine) {
    if (m.role !== 'owner' || m.status !== 'active') continue
    const active = (othersByTenant.get(m.tenant_id) ?? []).filter(o => o.status === 'active')
    if (active.length === 0) {
      return {
        code: 'sole_member',
        error: `You are the only member of ${m.company}. Close the company instead (Settings → Company): your account is deleted with it.`,
      }
    }
    if (!active.some(o => o.role === 'owner')) {
      return {
        code: 'last_owner',
        error: `You are the last owner of ${m.company}. Make another member an owner first (Settings → Team).`,
      }
    }
  }
  return null
}
