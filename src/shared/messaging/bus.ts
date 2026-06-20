import type { Msg } from './protocol'

/** Fire-and-forget broadcast to the extension (SW + any open UI). Swallows
 *  "no receiver" rejections so callers don't need to care who's listening. */
export function broadcast(msg: Msg): void {
  try {
    void chrome.runtime.sendMessage(msg).catch(() => {})
  } catch {
    /* context gone */
  }
}

/** Send a message to a specific tab's content script and await its reply. */
export async function sendToTab<T = unknown>(tabId: number, msg: Msg): Promise<T | undefined> {
  try {
    return (await chrome.tabs.sendMessage(tabId, msg)) as T
  } catch {
    return undefined
  }
}
