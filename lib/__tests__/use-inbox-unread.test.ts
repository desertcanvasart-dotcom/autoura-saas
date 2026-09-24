// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'

const toast = vi.fn()
vi.mock('@/app/contexts/ToastContext', () => ({ showToast: (...a: unknown[]) => toast(...a) }))

import { useInboxUnreadCount, requestInboxUnreadRefresh } from '@/lib/use-inbox-unread'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let seen: (number | null)[] = []
function Probe({ userId, notify }: { userId: string | null; notify?: boolean }) {
  seen.push(useInboxUnreadCount(userId, { notify }))
  return null
}

let root: Root
let host: HTMLElement
const flush = () => act(async () => { await new Promise(r => setTimeout(r, 0)) })

function respond(...answers: Array<{ status: number; unreadCount?: number }>) {
  const fetchMock = vi.fn()
  for (const a of answers) {
    fetchMock.mockResolvedValueOnce({
      ok: a.status >= 200 && a.status < 300,
      status: a.status,
      json: async () => ({ unreadCount: a.unreadCount }),
    })
  }
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

async function mount(userId: string | null, notify = false) {
  await act(async () => { root.render(createElement(Probe, { userId, notify })) })
  await flush()
}

beforeEach(() => {
  seen = []
  toast.mockReset()
  host = document.createElement('div')
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  vi.unstubAllGlobals()
})

describe('useInboxUnreadCount', () => {
  it('reads the unread count', async () => {
    respond({ status: 200, unreadCount: 3 })
    await mount('u1')
    expect(seen.at(-1)).toBe(3)
  })

  it('re-reads on request and toasts when mail arrives', async () => {
    respond({ status: 200, unreadCount: 1 }, { status: 200, unreadCount: 3 })
    await mount('u1', true)
    expect(toast).not.toHaveBeenCalled() // the first read is not "new"
    await act(async () => { requestInboxUnreadRefresh() })
    await flush()
    expect(seen.at(-1)).toBe(3)
    expect(toast).toHaveBeenCalledWith('info', '2 new emails in your Inbox')
  })

  it('does not toast when the count drops, or when notify is off', async () => {
    respond({ status: 200, unreadCount: 3 }, { status: 200, unreadCount: 1 })
    await mount('u1', true)
    await act(async () => { requestInboxUnreadRefresh() })
    await flush()
    expect(seen.at(-1)).toBe(1)
    expect(toast).not.toHaveBeenCalled()
  })

  it('shows nothing and stops asking when Gmail is not connected', async () => {
    const f = respond({ status: 401 })
    await mount('u1')
    expect(seen.at(-1)).toBeNull()
    await act(async () => { requestInboxUnreadRefresh() })
    await flush()
    expect(f).toHaveBeenCalledTimes(1)
  })

  it('keeps the last count through a transient failure', async () => {
    respond({ status: 200, unreadCount: 2 }, { status: 500 })
    await mount('u1')
    await act(async () => { requestInboxUnreadRefresh() })
    await flush()
    expect(seen.at(-1)).toBe(2)
  })

  it('asks nothing without a user', async () => {
    const f = respond()
    await mount(null)
    expect(f).not.toHaveBeenCalled()
    expect(seen.at(-1)).toBeNull()
  })
})
