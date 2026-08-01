import { redirect } from 'next/navigation'

// Team Management was consolidated into User Management (/users): both pages
// invited users, changed access roles inline, and removed members — /users
// additionally manages the pending/expired invitation lifecycle, and now
// hosts the Role Permissions reference table this page used to show.
export default function TeamSettingsRedirect() {
  redirect('/users')
}
