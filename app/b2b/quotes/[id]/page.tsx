import { redirect } from 'next/navigation'

// Old tour_quotes detail URL, redirected to the consolidated store's
// detail page (migration 270). Ids from the retired store don't resolve
// there — the table was empty at consolidation time, so none exist.
export default async function B2BQuoteRedirect({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  redirect(`/quotes/b2b/${id}`)
}
