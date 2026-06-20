// Thin typed wrapper over chrome.storage.local. The repo (repo.ts) is the
// high-level API the rest of the app uses; nothing else should touch chrome.storage directly.

export async function kvGet<T>(key: string): Promise<T | undefined> {
  const obj = await chrome.storage.local.get(key)
  return obj[key] as T | undefined
}

export async function kvSet(key: string, value: unknown): Promise<void> {
  await chrome.storage.local.set({ [key]: value })
}

export async function kvRemove(key: string): Promise<void> {
  await chrome.storage.local.remove(key)
}

/** Subscribe to changes of a single key in storage.local. Returns an unsubscribe fn. */
export function onKvChange<T>(key: string, cb: (newValue: T | undefined) => void): () => void {
  const listener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
    if (area === 'local' && key in changes) cb(changes[key].newValue as T | undefined)
  }
  chrome.storage.onChanged.addListener(listener)
  return () => chrome.storage.onChanged.removeListener(listener)
}
