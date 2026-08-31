// Guard: a PostgREST embed hint must be one somebody has verified exists.
//
// `select('*, inviter:user_profiles!invited_by(...)')` is not resolved by
// column names — PostgREST resolves it from a FOREIGN KEY. When the key is
// missing the whole request fails with PGRST200, taking the rest of the
// query with it. That is silent in a way normal bugs are not: the row is
// there, the filter is right, and the response is a 400 the caller usually
// treats as "nothing found".
//
// It cost real behaviour here. tenant_invitations.invited_by had no FK, so
// GET /api/invitations 500'd on every call in every tenant and the page
// rendered "No pending invitations" — while POST, which runs no embed,
// correctly refused a re-invite as a duplicate. An invitation was invisible
// and undeletable at once, and /api/invitations/verify told every invited
// person their valid link was an "Invalid invitation token".
//
// CI has no database, so this cannot check the constraint itself. What it can
// do is make adding an embed a decision: list it below, having confirmed the
// foreign key exists in a real database (a PGRST200 on a probe means it does
// not). Prefer a second query — nothing in this codebase needs the embed.
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'fs'
import { join } from 'path'

const API_DIR = join(__dirname, '..')

// Verified against the live schema on 2026-08-31 with a PostgREST probe.
const VERIFIED_EMBEDS = new Set([
  'team_members!tasks_assigned_to_fkey',
  'itinerary_services!itinerary_services_day_id_fkey',
])

// Was: team_members!whatsapp_conversations_assigned_team_member_id_fkey.
// Migration 309 added the assignment columns and that key, and the route now
// reads the assignee separately anyway, so nothing is knowingly broken.
const KNOWN_BROKEN = new Set<string>([])

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (entry.endsWith('.ts') && !full.includes('__tests__')) out.push(full)
  }
  return out
}

describe('PostgREST embed hints', () => {
  it('every embed hint is one that has been verified against a real schema', () => {
    const unreviewed: string[] = []
    for (const file of walk(API_DIR)) {
      const src = readFileSync(file, 'utf8')
      for (const line of src.split('\n')) {
        // Skip prose: these hints are quoted in comments explaining the bug.
        if (/^\s*(\/\/|\*|\/\*)/.test(line)) continue
        const m = line.match(/[a-z_]+:([a-z_]+![a-z_]+)/)
        if (!m) continue
        if (VERIFIED_EMBEDS.has(m[1]) || KNOWN_BROKEN.has(m[1])) continue
        unreviewed.push(`${file.replace(API_DIR, 'app/api')}: ${m[1]}`)
      }
    }

    expect(
      unreviewed,
      'New PostgREST embed hint. Probe it against a real database first — a ' +
        'PGRST200 means the foreign key is missing and the query will fail ' +
        'entirely. Prefer a second query; if you keep the embed, add it to ' +
        'VERIFIED_EMBEDS with the date you checked.'
    ).toEqual([])
  })

  it('the invitation routes carry no embed, because their key never existed', () => {
    for (const f of ['invitations/route.ts', 'invitations/verify/route.ts']) {
      const src = readFileSync(join(API_DIR, f), 'utf8')
      const code = src
        .split('\n')
        .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
        .join('\n')
      expect(code, `${f} must not re-introduce the user_profiles embed`).not.toMatch(
        /user_profiles!/
      )
    }
  })
})
