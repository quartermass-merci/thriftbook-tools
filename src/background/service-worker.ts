// MV3 service worker. M0: register the sync alarm and a message router stub.
// Real orchestration (snapshot -> diff -> notify) lands in M3.

const SYNC_ALARM = 'wishlist-sync'

chrome.runtime.onInstalled.addListener(() => {
  console.log('[TB-Wishlist] installed')
  chrome.alarms.create(SYNC_ALARM, { periodInMinutes: 5 })
})

chrome.runtime.onStartup.addListener(() => {
  console.log('[TB-Wishlist] startup — re-asserting alarms')
  chrome.alarms.create(SYNC_ALARM, { periodInMinutes: 5 })
})

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === SYNC_ALARM) {
    console.log('[TB-Wishlist] sync alarm fired — orchestration lands in M3')
  }
})

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  console.log('[TB-Wishlist] message', msg)
  if (msg?.type === 'PING') {
    sendResponse({ ok: true, ts: Date.now() })
    return true
  }
  return undefined
})

export {}
