import { useEffect, useState, type ReactNode } from 'react'
import type { Settings } from '@/shared/types'
import { DEFAULT_SETTINGS } from '@/shared/types'
import { getSettings, putSettings } from '@/shared/storage/repo'

function Row({ label, hint, htmlFor, children }: { label: string; hint?: string; htmlFor?: string; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-line py-3">
      <div>
        <label htmlFor={htmlFor} className="text-[15px] font-medium text-ink">{label}</label>
        {hint && <div className="mt-0.5 text-[13px] text-faint">{hint}</div>}
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
    <div className="mx-auto max-w-xl p-8 font-sans text-ink">
      <h1 className="font-display text-xl font-semibold">Thriftbook Tools — Settings</h1>

      <Row label="Check interval" hint="How often to re-check while Chrome is open." htmlFor="opt-interval">
        <input id="opt-interval" type="number" min={1} value={s.alarmMinutes} onChange={(e) => set({ alarmMinutes: Math.max(1, Number(e.target.value) || 5) })} className="w-20 rounded border border-line px-2 py-1 text-[15px]" />
        <span className="text-[15px] text-muted">min</span>
      </Row>

      <Row label="Free-book ceiling" hint="ReadingRewards free-book price limit — flags eligible books." htmlFor="opt-ceiling">
        <span className="text-[15px] text-muted">$</span>
        <input id="opt-ceiling" type="number" min={0} step="0.5" value={(s.freeBookCeilingCents / 100).toFixed(2)} onChange={(e) => set({ freeBookCeilingCents: Math.max(0, Math.round((Number(e.target.value) || 0) * 100)) })} className="w-24 rounded border border-line px-2 py-1 text-[15px]" />
      </Row>

      <Row label="Background-tab sync" hint="When no ThriftBooks tab is open, briefly open a hidden one each check so alerts still fire. More coverage, a little more load." htmlFor="opt-bgsync">
        <input id="opt-bgsync" type="checkbox" checked={s.backgroundTabSync} onChange={(e) => set({ backgroundTabSync: e.target.checked })} />
      </Row>

      <h2 className="mt-6 text-[15px] font-semibold text-ink">Notifications</h2>
      <Row label="Newly in stock" htmlFor="opt-newstock">
        <input id="opt-newstock" type="checkbox" checked={s.notif.newlyInStock} onChange={(e) => setNotif({ newlyInStock: e.target.checked })} />
      </Row>
      <Row label="Free-book eligible" htmlFor="opt-freebook">
        <input id="opt-freebook" type="checkbox" checked={s.notif.freeBookEligible} onChange={(e) => setNotif({ freeBookEligible: e.target.checked })} />
      </Row>
      <Row label="New addition" hint="Usually you added it yourself — off by default." htmlFor="opt-newadd">
        <input id="opt-newadd" type="checkbox" checked={s.notif.newAddition} onChange={(e) => setNotif({ newAddition: e.target.checked })} />
      </Row>
      <Row label="Price drop" hint="Notify when a price falls at least this % below its recent low." htmlFor="opt-pricedrop">
        <input id="opt-pricedrop" type="checkbox" checked={s.notif.priceDrop} onChange={(e) => setNotif({ priceDrop: e.target.checked })} />
        <input type="number" min={1} max={90} aria-label="Price-drop threshold, percent" value={s.notif.priceDropPct} onChange={(e) => setNotif({ priceDropPct: Math.min(90, Math.max(1, Number(e.target.value) || 10)) })} className="ml-2 w-16 rounded border border-line px-2 py-1 text-[15px]" />
        <span className="text-[15px] text-muted">%</span>
      </Row>

      <div className="mt-6 flex items-center gap-3">
        <button onClick={save} className="rounded bg-teal-700 px-4 py-2 text-[15px] font-medium text-white hover:opacity-90">Save</button>
        <button onClick={test} className="rounded border border-line px-3 py-2 text-[15px] text-muted hover:bg-cream/30">Send test notification</button>
        {status && <span className="text-[15px] text-teal-700">{status}</span>}
      </div>
    </div>
  )
}
