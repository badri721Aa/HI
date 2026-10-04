// Tiny reactive IndexedDB wrapper for large data (highlights, notes, pages, history).
// Lives in the extension origin: usable from the service worker, side panel and hub.
// Content scripts run in the page's origin, so they go through background messages instead.
//
// Every write broadcasts { store, op, key } on BroadcastChannel('mm-db') so open views re-render.

const DB_NAME = 'master-mind'
const VERSION = 1

const SCHEMA = {
  highlights: { keyPath: 'id', indexes: ['pageKey', 'tag', 'site', 'created'] },
  notes: { keyPath: 'id', indexes: ['updated'] },
  pages: { keyPath: 'key', indexes: ['site', 'visited'] },
  history: { keyPath: 'id', indexes: ['ts', 'tabId', 'parentId'] },
  kv: { keyPath: 'k', indexes: [] },
}

let dbPromise
function open() {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      for (const [name, { keyPath, indexes }] of Object.entries(SCHEMA)) {
        if (db.objectStoreNames.contains(name)) continue
        const os = db.createObjectStore(name, { keyPath })
        for (const ix of indexes) os.createIndex(ix, ix)
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return dbPromise
}

const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('mm-db') : null
const listeners = new Set()
channel?.addEventListener('message', e => { for (const l of listeners) l(e.data) })
function emit(evt) {
  channel?.postMessage(evt)
  for (const l of listeners) l(evt) // same-context listeners (BroadcastChannel skips the sender)
}

/** Subscribe to writes from any extension context. cb({store, op: 'put'|'delete'|'clear', key}) */
export function onChange(cb) {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

async function tx(store, mode, fn) {
  const db = await open()
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode)
    const os = t.objectStore(store)
    let out
    Promise.resolve(fn(os)).then(v => { out = v }, reject)
    t.oncomplete = () => resolve(out)
    t.onerror = () => reject(t.error)
    t.onabort = () => reject(t.error)
  })
}

const wrap = req => new Promise((resolve, reject) => { req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error) })

export const db = {
  async get(store, key) {
    return tx(store, 'readonly', os => wrap(os.get(key)))
  },
  async all(store) {
    return tx(store, 'readonly', os => wrap(os.getAll()))
  },
  /** All records where index === value. */
  async by(store, index, value) {
    return tx(store, 'readonly', os => wrap(os.index(index).getAll(value)))
  },
  async put(store, value) {
    await tx(store, 'readwrite', os => wrap(os.put(value)))
    emit({ store, op: 'put', key: value[SCHEMA[store].keyPath] })
    return value
  },
  async putMany(store, values) {
    if (!values.length) return values
    await tx(store, 'readwrite', os => Promise.all(values.map(v => wrap(os.put(v)))))
    emit({ store, op: 'put', key: null })
    return values
  },
  async delete(store, key) {
    await tx(store, 'readwrite', os => wrap(os.delete(key)))
    emit({ store, op: 'delete', key })
  },
  async clear(store) {
    await tx(store, 'readwrite', os => wrap(os.clear()))
    emit({ store, op: 'clear', key: null })
  },
  async count(store) {
    return tx(store, 'readonly', os => wrap(os.count()))
  },
  /** Delete the oldest records by an index until at most `max` remain. */
  async trim(store, index, max) {
    const n = await this.count(store)
    if (n <= max) return 0
    let removed = 0
    await tx(store, 'readwrite', os => new Promise((resolve, reject) => {
      const req = os.index(index).openCursor()
      req.onsuccess = () => {
        const c = req.result
        if (!c || removed >= n - max) return resolve()
        c.delete(); removed++; c.continue()
      }
      req.onerror = () => reject(req.error)
    }))
    emit({ store, op: 'delete', key: null })
    return removed
  },
  stores: Object.keys(SCHEMA),
}

export const uid = (p = '') => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
