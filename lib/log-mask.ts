/** A phone number reduced to its last four digits, for logs. */
export function maskPhone(phone: string | null | undefined): string {
  const digits = String(phone ?? '').replace(/\D/g, '')
  return digits.length > 4 ? `…${digits.slice(-4)}` : digits ? '…' : ''
}
