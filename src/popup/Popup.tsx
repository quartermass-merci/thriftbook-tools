import { useEffect, useState } from 'react'
import type { WishlistSnapshot, Settings } from '@/shared/types'
import { isFreeBookEligible } from '@/shared/types'
import { getSnapshot, getSettings, STORAGE_KEYS } from '@/shared/storage/repo'
import { onKvChange } from '@/shared/storage/kv'
import { triggerSyncFromUI } from '@/shared/sync-trigger'

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded border border-slate-200 p-2">
      <div className="text-lg font-semibold">{value}</div>
      <div className="text-[11px] text-slate-500">{label}</div>
    </div>
  )
}

export function Popup() {
  const [snapshot, setSnapshot] = useState<WishlistSnapshot | undefined>()
  const [settings, setSettings] = useState<Settings | undefined>()
  const [status, setStatus] = useState('')

  useEffect(() => {
    void getSnapshot().then(setSnapshot)
    void getSettings().then(setSettings)
    return onKvChange<WishlistSnapshot>(STORAGE_KEYS.snapshot, (v) => setSnapshot(v))
  }, [])

  const ceiling = settings?.freeBookCeilingCents ?? 700
  const items = snapshot?.items ?? []
  const inStock = items.filter((i) => i.availability === 'in_stock').length
  const free = items.filter((i) => isFreeBookEligible(i, ceiling)).length

  const openDashboard = () => chrome.tabs.create({ url: chrome.runtime.getURL('src/dashboard/index.html') })

  const syncNow = async () => {
    setStatus('Syncing…')
    const ack = await triggerSyncFromUI()
    setStatus(ack.ok ? `Synced ${ack.itemCount} books` : ack.error ?? 'Could not sync')
  }

  return (
    <div className="w-80 p-4 font-sans text-slate-800">
      <h1 className="text-base font-semibold">ThriftBooks Wishlist</h1>
      <p className="mt-0.5 text-xs text-slate-500">
        {snapshot ? `Synced ${new Date(snapshot.capturedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : 'Not synced yet'}
      </p>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <Stat label="Tracked" value={items.length} />
        <Stat label="In stock" value={inStock} />
        <Stat label="Free-book" value={free} />
      </div>

      <div className="mt-3 flex gap-2">
        <button onClick={openDashboard} className="flex-1 rounded bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700">
          Open dashboard
        </button>
        <button onClick={syncNow} className="rounded border border-slate-300 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50">
          Sync now
        </button>
      </div>

      {status && <p className="mt-2 text-[11px] text-slate-500">{status}</p>}
    </div>
  )
}
