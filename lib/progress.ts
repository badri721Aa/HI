import * as React from "react"

const STORAGE_KEY = "nosignal:completed-tutorials"
const SYNC_EVENT = "nosignal:progress"

function read(): Set<string> {
  if (typeof window === "undefined") return new Set()
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    return new Set(raw ? (JSON.parse(raw) as string[]) : [])
  } catch {
    // localStorage can be unavailable (private mode, quota, disabled) —
    // treat it the same as "nothing completed yet".
    return new Set()
  }
}

function write(set: Set<string>) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...set]))
    window.dispatchEvent(new Event(SYNC_EVENT))
  } catch {
    // Same as above — a failed write just means progress isn't remembered.
  }
}

export function toggleCompleted(slug: string) {
  const set = read()
  if (set.has(slug)) set.delete(slug)
  else set.add(slug)
  write(set)
}

/** Live-updating set of completed tutorial slugs, synced across tabs via
 * the storage event and within a tab via a custom event fired on write. */
export function useCompletedTutorials(): Set<string> {
  // Starts empty to match the server (no localStorage during SSR), then
  // corrected on mount below — same one-time hydration-correction pattern
  // as theme-provider.tsx.
  const [completed, setCompleted] = React.useState<Set<string>>(() => new Set())

  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCompleted(read())
    const sync = () => setCompleted(read())
    window.addEventListener("storage", sync)
    window.addEventListener(SYNC_EVENT, sync)
    return () => {
      window.removeEventListener("storage", sync)
      window.removeEventListener(SYNC_EVENT, sync)
    }
  }, [])

  return completed
}
