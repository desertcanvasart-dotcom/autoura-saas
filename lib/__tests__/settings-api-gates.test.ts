import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

// The setup APIs behind the Settings area: everyone signed in may read and
// use them, only owners, admins and managers may change them. The pages hide
// the buttons; these checks are the lock.

const ROOT = path.join(__dirname, '..', '..')
const src = (p: string) => readFileSync(path.join(ROOT, p), 'utf8')

/** The body of one exported handler — from its `export async function` to the next one. */
function handler(file: string, method: string): string {
  const text = src(file)
  const start = text.indexOf(`export async function ${method}(`)
  if (start < 0) throw new Error(`${file} has no ${method} handler`)
  const next = text.indexOf('export async function ', start + 1)
  return next < 0 ? text.slice(start) : text.slice(start, next)
}

const MANAGE = /roleDenied\(\w+\.role, 'manage'\)|gateRole\('manage'\)/

const CHANGE: Record<string, string[]> = {
  'app/api/templates/route.ts': ['POST'],
  'app/api/templates/[id]/route.ts': ['PUT', 'DELETE'],
  'app/api/templates/starter/route.ts': ['POST'],
  'app/api/copilot/knowledge/route.ts': ['POST'],
  'app/api/copilot/knowledge/[id]/route.ts': ['PATCH', 'DELETE'],
  'app/api/copilot/knowledge/bulk-import/route.ts': ['POST'],
  'app/api/copilot/knowledge/reindex/route.ts': ['POST'],
  'app/api/content-library/route.ts': ['POST', 'PATCH', 'DELETE'],
  'app/api/content-library/[id]/route.ts': ['PUT', 'PATCH', 'DELETE'],
  'app/api/content-library/[id]/variations/route.ts': ['POST', 'PUT', 'PATCH', 'DELETE'],
  'app/api/content-library/categories/route.ts': ['POST', 'PATCH', 'DELETE'],
  'app/api/content-library/writing-rules/route.ts': ['POST', 'PATCH', 'DELETE'],
  'app/api/content-library/prompts/route.ts': ['POST', 'PATCH', 'DELETE'],
}

describe('changing a Settings setup item needs a manager or above', () => {
  for (const [file, methods] of Object.entries(CHANGE)) {
    for (const method of methods) {
      it(`${method} ${file}`, () => expect(handler(file, method)).toMatch(MANAGE))
    }
  }
})

describe('reading them stays open to everyone signed in', () => {
  const READ: Record<string, string> = {
    'app/api/templates/route.ts': 'GET',
    'app/api/templates/[id]/route.ts': 'GET',
    'app/api/copilot/knowledge/route.ts': 'GET',
    'app/api/content-library/route.ts': 'GET',
    'app/api/content-library/[id]/route.ts': 'GET',
    'app/api/content-library/[id]/variations/route.ts': 'GET',
    'app/api/content-library/categories/route.ts': 'GET',
    'app/api/content-library/writing-rules/route.ts': 'GET',
    'app/api/content-library/prompts/route.ts': 'GET',
  }
  for (const [file, method] of Object.entries(READ)) {
    it(`${method} ${file}`, () => expect(handler(file, method)).not.toMatch(MANAGE))
  }
})

describe('using a template is everyday work, not a setting', () => {
  it('sending a template is staff-level', () => {
    const send = src('app/api/templates/send/route.ts')
    expect(send).toContain("roleDenied(authResult.role, 'staff')")
    expect(send).not.toMatch(MANAGE)
  })

  it('using a template is not held to managers', () => {
    expect(src('app/api/templates/[id]/use/route.ts')).not.toMatch(MANAGE)
  })
})

describe('workspace-wide Copilot settings are admin-only', () => {
  it('PATCH copilot/tenant-settings refuses anyone but owners and admins', () => {
    expect(handler('app/api/copilot/tenant-settings/route.ts', 'PATCH')).toContain("['owner', 'admin'].includes(role || '')")
  })
})
