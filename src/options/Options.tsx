import { useEffect, useState, type ReactNode } from 'react'
import type { Settings } from '@/shared/types'
import { DEFAULT_SETTINGS } from '@/shared/types'
import { getSettings, putSettings } from '@/shared/storage/repo'

function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-slate-100 py-3">
      <div>
        <div className="text-sm font-medium text-slate-700">{label}</div>
        {hint && <div className="mt-0.5 text-xs text-slate-400">{hint}</div>}
      </div>
      <div className="flex shrink-0 items-center gap-1 pt-0.5">{children}</div>
    </div>
  )
}

export function Options() {
  const [s, setS] = useState<Settings>(DEFAULT_SETTINGS)
  const [status, setStatus] = useState('')
  useEffect(() => {
    void getSettings().then(setS)
  }, [])

  const set = (patch: Partial<Settings>) => setS((p) => ({ ...p, ...patch }))
  const setNotif = (patch: Partial<Settings['notif']>) => setS((p) => ({ ...p, notif: { ...p.notif, ...patch } }))
  const save = async () => {
    await putSettings(s)
    setStatus('Saved ✓')
    setTimeout(() => setStatus(''), 1800)
  }
  const test = () => {
    void chrome.runtime.sendMessage({ type: 'TEST_NOTIFY' })
    setStatus('Sent a test notification — check your desktop')
  }

  return (
    <div className="mx-auto max-w-xl p-8 font-sans text-slate-800">
      <h1 className="text-lg font-semibold">ThriftBooks Wishlist — Settings</h1>

      <Row label="Check interval" hint="How often to re-check while Chrome is open.">
        <input type="number" min={1} value={s.alarmMinutes} onChange={(e) => set({ alarmMinutes: Math.max(1, Number(e.target.value) || 5) })} className="w-20 rounded border border-slate-300 px-2 py-1 text-sm" />
        <span className="text-sm text-slate-500">min</span>
      </Row>

      <Row label="Free-book ceiling" hint="ReadingRewards free-book price limit — flags eligible books.">
        <span className="text-sm text-slate-500">$</span>
        <input type="number" min={0} step="0.5" value={(s.freeBookCeilingCents / 100).toFixed(2)} onChange={(e) => set({ freeBookCeilingCents: Math.max(0, Math.round((Number(e.target.value) || 0) * 100)) })} className="w-24 rounded border border-slate-300 px-2 py-1 text-sm" />
      </Row>

      <Row label="Background-tab sync" hint="When no ThriftBooks tab is open, briefly open a hidden one each check so alerts still fire. More coverage, a little more load.">
        <input type="checkbox" checked={s.backgroundTabSync} onChange={(e) => set({ backgroundTabSync: e.target.checked })} />
      </Row>

      <h2 className="mt-6 text-sm font-semibold text-slate-700">Notifications</h2>
      <Row label="Newly in stock">
        <input type="checkbox" checked={s.notif.newlyInStock} onChange={(e) => setNotif({ newlyInStock: e.target.checked })} />
      </Row>
      <Row label="Free-book eligible">
        <input type="checkbox" checked={s.notif.freeBookEligible} onChange={(e) => setNotif({ freeBookEligible: e.target.checked })} />
      </Row>
      <Row label="New addition" hint="Usually you added it yourself — off by default.">
        <input type="checkbox" checked={s.notif.newAddition} onChange={(e) => setNotif({ newAddition: e.target.checked })} />
      </Row>
      <Row label="Price drop" hint="Notify when a price falls at least this % below its recent low.">
        <input type="checkbox" checked={s.notif.priceDrop} onChange={(e) => setNotif({ priceDrop: e.target.checked })} />
        <input type="number" min={1} max={90} value={s.notif.priceDropPct} onChange={(e) => setNotif({ priceDropPct: Math.min(90, Math.max(1, Number(e.target.value) || 10)) })} className="ml-2 w-16 rounded border border-slate-300 px-2 py-1 text-sm" />
        <span className="text-sm text-slate-500">%</span>
      </Row>

      <div className="mt-6 flex items-center gap-3">
        <button onClick={save} className="rounded bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700">Save</button>
        <button onClick={test} className="rounded border border-slate-300 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50">Send test notification</button>
        {status && <span className="text-sm text-emerald-600">{status}</span>}
      </div>
    </div>
  )
}
