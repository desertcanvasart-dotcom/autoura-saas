// quote_versions.changed_by references auth.users — a schema PostgREST does
// not expose, and the generated types carry no relationship for it. The old
// `users:changed_by (email)` embed therefore failed the WHOLE query with
// PGRST200 on all three version routes (list, single, compare). The email is
// joined app-side instead: user_profiles.id mirrors auth.users.id.

type Db = {
  from(table: string): {
    select(cols: string): {
      in(col: string, values: string[]): PromiseLike<{ data: Array<{ id: string; email: string }> | null }>
    }
  }
}

/** Attach `users: { email } | null` to each row, the shape the embed used to produce. */
export async function attachChangerEmails<T extends { changed_by: string | null }>(
  supabase: object,
  rows: T[]
): Promise<Array<T & { users: { email: string } | null }>> {
  const ids = [...new Set(rows.map(r => r.changed_by).filter((v): v is string => Boolean(v)))]
  const { data } = ids.length
    ? await (supabase as Db).from('user_profiles').select('id, email').in('id', ids)
    : { data: [] }
  const emailById = new Map((data ?? []).map(u => [u.id, u.email]))
  return rows.map(r => ({
    ...r,
    users: r.changed_by && emailById.has(r.changed_by) ? { email: emailById.get(r.changed_by)! } : null,
  }))
}
