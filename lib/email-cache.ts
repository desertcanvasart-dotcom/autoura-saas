/**
 * Email Caching Utilities
 * 
 * Provides local caching for emails to improve performance
 * Uses IndexedDB for persistent storage in the browser
 */

const DB_NAME = 'autoura-email-cache'
// v2: entries keyed by [userId, folder, id] rather than the Gmail id alone.
// One message cached under INBOX and STARRED overwrote itself (its `folder`
// flipped and it dropped out of one list). The owner key is the user AND the
// company (cacheOwnerKey) — keyed by user alone, switching company showed
// the other company's mailbox from cache.
const DB_VERSION = 2
const STORE_NAME = 'emails'
const CACHE_DURATION = 5 * 60 * 1000 // 5 minutes

export interface CachedEmail {
  id: string
  threadId: string
  userId: string
  folder: string
  snippet: string
  from: string
  to: string
  subject: string
  date: string
  body?: string
  attachments?: Array<{
    id: string
    filename: string
    mimeType: string
    size: number
  }>
  labelIds: string[]
  isUnread: boolean
  isStarred: boolean
  cachedAt: number
}

interface CacheMetadata {
  userId: string
  folder: string
  lastFetch: number
  historyId?: string
  totalCount?: number
}

let db: IDBDatabase | null = null

/**
 * Whose cache this is: one person's mailbox in one company (migration 415
 * lets the same person connect a mailbox per company). Null until both are
 * known, which leaves the cache unused rather than shared.
 */
export function cacheOwnerKey(userId: string | null | undefined, tenantId: string | null | undefined): string | null {
  return userId && tenantId ? `${userId}:${tenantId}` : null
}

/**
 * Initialize the IndexedDB database
 */
export async function initEmailCache(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined') {
      resolve() // SSR - skip
      return
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onerror = () => reject(request.error)
    
    request.onsuccess = () => {
      db = request.result
      resolve()
    }

    request.onupgradeneeded = (event) => {
      const database = (event.target as IDBOpenDBRequest).result

      // v1 stores were keyed by message id alone and owned by user alone:
      // drop them (it is only a cache) and start again.
      if (event.oldVersion < 2) {
        if (database.objectStoreNames.contains(STORE_NAME)) database.deleteObjectStore(STORE_NAME)
        if (database.objectStoreNames.contains('metadata')) database.deleteObjectStore('metadata')
      }

      // Create emails store
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        const store = database.createObjectStore(STORE_NAME, { keyPath: ['userId', 'folder', 'id'] })
        store.createIndex('id', 'id', { unique: false })
        store.createIndex('userId', 'userId', { unique: false })
        store.createIndex('folder', 'folder', { unique: false })
        store.createIndex('userId_folder', ['userId', 'folder'], { unique: false })
        store.createIndex('cachedAt', 'cachedAt', { unique: false })
      }

      // Create metadata store
      if (!database.objectStoreNames.contains('metadata')) {
        const metaStore = database.createObjectStore('metadata', { keyPath: ['userId', 'folder'] })
        metaStore.createIndex('userId', 'userId', { unique: false })
      }
    }
  })
}

/**
 * Get cached emails for a folder
 */
export async function getCachedEmails(
  userId: string,
  folder: string,
  options: {
    limit?: number
    offset?: number
    filter?: 'all' | 'unread' | 'starred'
  } = {}
): Promise<{ emails: CachedEmail[]; fromCache: boolean; isStale: boolean }> {
  if (!db) await initEmailCache()
  if (!db) return { emails: [], fromCache: false, isStale: true }

  const { limit = 50, offset = 0, filter = 'all' } = options

  return new Promise((resolve, reject) => {
    const transaction = db!.transaction([STORE_NAME, 'metadata'], 'readonly')
    const store = transaction.objectStore(STORE_NAME)
    const metaStore = transaction.objectStore('metadata')

    // Check metadata for staleness
    const metaRequest = metaStore.get([userId, folder])
    
    metaRequest.onsuccess = () => {
      const metadata = metaRequest.result as CacheMetadata | undefined
      const isStale = !metadata || (Date.now() - metadata.lastFetch > CACHE_DURATION)

      // Get emails
      const index = store.index('userId_folder')
      const range = IDBKeyRange.only([userId, folder])
      const request = index.getAll(range)

      request.onsuccess = () => {
        let emails = request.result as CachedEmail[]

        // Apply filter
        if (filter === 'unread') {
          emails = emails.filter(e => e.isUnread)
        } else if (filter === 'starred') {
          emails = emails.filter(e => e.isStarred)
        }

        // Sort by date descending
        emails.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

        // Apply pagination
        emails = emails.slice(offset, offset + limit)

        resolve({
          emails,
          fromCache: emails.length > 0,
          isStale
        })
      }

      request.onerror = () => reject(request.error)
    }

    metaRequest.onerror = () => reject(metaRequest.error)
  })
}

/**
 * Cache emails
 */
export async function cacheEmails(
  userId: string,
  folder: string,
  emails: CachedEmail[],
  historyId?: string
): Promise<void> {
  if (!db) await initEmailCache()
  if (!db) return

  return new Promise((resolve, reject) => {
    const transaction = db!.transaction([STORE_NAME, 'metadata'], 'readwrite')
    const store = transaction.objectStore(STORE_NAME)
    const metaStore = transaction.objectStore('metadata')

    const now = Date.now()

    // Add/update each email
    for (const email of emails) {
      store.put({
        ...email,
        userId,
        folder,
        cachedAt: now
      })
    }

    // Update metadata
    metaStore.put({
      userId,
      folder,
      lastFetch: now,
      historyId,
      totalCount: emails.length
    } as CacheMetadata)

    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
  })
}

/**
 * Get a single cached email by ID
 */
export async function getCachedEmail(emailId: string): Promise<CachedEmail | null> {
  if (!db) await initEmailCache()
  if (!db) return null

  return new Promise((resolve, reject) => {
    const transaction = db!.transaction([STORE_NAME], 'readonly')
    const store = transaction.objectStore(STORE_NAME)
    // Any folder's copy: the message is the same wherever it is listed.
    const request = store.index('id').get(emailId)

    request.onsuccess = () => resolve(request.result || null)
    request.onerror = () => reject(request.error)
  })
}

/**
 * Update a cached email (e.g., after marking read/starred)
 */
export async function updateCachedEmail(
  emailId: string,
  updates: Partial<CachedEmail>
): Promise<void> {
  if (!db) await initEmailCache()
  if (!db) return

  return new Promise((resolve, reject) => {
    const transaction = db!.transaction([STORE_NAME], 'readwrite')
    const store = transaction.objectStore(STORE_NAME)
    
    // Every folder's copy (read/starred is true of the message, not a list),
    // keeping each copy's own owner and folder — they are its key.
    const cursorRequest = store.index('id').openCursor(IDBKeyRange.only(emailId))
    cursorRequest.onsuccess = () => {
      const cursor = cursorRequest.result
      if (!cursor) return
      const email = cursor.value as CachedEmail
      cursor.update({ ...email, ...updates, id: email.id, userId: email.userId, folder: email.folder, cachedAt: Date.now() })
      cursor.continue()
    }

    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
  })
}

/**
 * Remove emails from cache
 */
export async function removeCachedEmails(emailIds: string[]): Promise<void> {
  if (!db) await initEmailCache()
  if (!db) return

  return new Promise((resolve, reject) => {
    const transaction = db!.transaction([STORE_NAME], 'readwrite')
    const store = transaction.objectStore(STORE_NAME)

    // Every folder's copy of each message.
    const index = store.index('id')
    for (const id of emailIds) {
      const cursorRequest = index.openCursor(IDBKeyRange.only(id))
      cursorRequest.onsuccess = () => {
        const cursor = cursorRequest.result
        if (!cursor) return
        cursor.delete()
        cursor.continue()
      }
    }

    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
  })
}

/**
 * Clear all cached emails for a user
 */
export async function clearEmailCache(userId?: string): Promise<void> {
  if (!db) await initEmailCache()
  if (!db) return

  return new Promise((resolve, reject) => {
    const transaction = db!.transaction([STORE_NAME, 'metadata'], 'readwrite')
    const store = transaction.objectStore(STORE_NAME)
    const metaStore = transaction.objectStore('metadata')

    if (userId) {
      // Clear only specific user's cache
      const index = store.index('userId')
      const range = IDBKeyRange.only(userId)
      const request = index.openCursor(range)

      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result
        if (cursor) {
          store.delete(cursor.primaryKey)
          cursor.continue()
        }
      }

      // Clear metadata for user
      const metaIndex = metaStore.index('userId')
      const metaRequest = metaIndex.openCursor(IDBKeyRange.only(userId))

      metaRequest.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result
        if (cursor) {
          metaStore.delete(cursor.primaryKey)
          cursor.continue()
        }
      }
    } else {
      // Clear everything
      store.clear()
      metaStore.clear()
    }

    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
  })
}

/**
 * Get cache metadata
 */
export async function getCacheMetadata(
  userId: string,
  folder: string
): Promise<CacheMetadata | null> {
  if (!db) await initEmailCache()
  if (!db) return null

  return new Promise((resolve, reject) => {
    const transaction = db!.transaction(['metadata'], 'readonly')
    const store = transaction.objectStore('metadata')
    const request = store.get([userId, folder])

    request.onsuccess = () => resolve(request.result || null)
    request.onerror = () => reject(request.error)
  })
}

/**
 * Clean up old cache entries
 */
export async function cleanupOldCache(maxAge: number = 24 * 60 * 60 * 1000): Promise<void> {
  if (!db) await initEmailCache()
  if (!db) return

  const cutoff = Date.now() - maxAge

  return new Promise((resolve, reject) => {
    const transaction = db!.transaction([STORE_NAME], 'readwrite')
    const store = transaction.objectStore(STORE_NAME)
    const index = store.index('cachedAt')
    const range = IDBKeyRange.upperBound(cutoff)
    const request = index.openCursor(range)

    request.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest).result
      if (cursor) {
        store.delete(cursor.primaryKey)
        cursor.continue()
      }
    }

    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
  })
}
