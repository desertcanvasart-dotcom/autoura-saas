import { redirect } from 'next/navigation'

// The two B2B quote stores were consolidated onto b2b_quotes (migration
// 270; docs/B2B-QUOTE-STORES-OPTIONS.md). /quotes/b2b is the single list.
export default function B2BQuotesRedirect() {
  redirect('/quotes/b2b')
}
