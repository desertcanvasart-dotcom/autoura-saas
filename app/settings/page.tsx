import { redirect } from 'next/navigation'

// /settings opens the Account group, which everyone has. (Old ?tab= links
// are sent to their own pages by next.config.js's redirects.)
export default function SettingsIndex() {
  redirect('/settings/profile')
}
