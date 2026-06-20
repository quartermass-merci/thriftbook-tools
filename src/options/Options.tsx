import { DEFAULT_SETTINGS } from '@/shared/types'

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between border-b border-slate-100 pb-2">
      <dt className="text-slate-500">{k}</dt>
      <dd className="font-medium">{v}</dd>
    </div>
  )
}

export function Options() {
  const s = DEFAULT_SETTINGS
  return (
    <div className="mx-auto max-w-xl p-8 font-sans text-slate-800">
      <h1 className="text-lg font-semibold">ThriftBooks Wishlist — Settings</h1>
      <p className="mt-0.5 text-xs text-slate-500">
        Placeholder · editable persistence lands in M3
      </p>

      <dl className="mt-6 space-y-3 text-sm">
        <Row k="Check interval" v={`${s.alarmMinutes} min`} />
        <Row k="Free-book ceiling" v={`$${(s.freeBookCeilingCents / 100).toFixed(2)}`} />
        <Row k="Background-tab sync" v={s.backgroundTabSync ? 'On' : 'Off'} />
        <Row k="Notify · newly in stock" v={s.notif.newlyInStock ? 'On' : 'Off'} />
        <Row
          k="Notify · price drop"
          v={`${s.notif.priceDrop ? 'On' : 'Off'} (≥${s.notif.priceDropPct}%)`}
        />
        <Row k="Notify · free-book eligible" v={s.notif.freeBookEligible ? 'On' : 'Off'} />
        <Row k="Notify · new addition" v={s.notif.newAddition ? 'On' : 'Off'} />
      </dl>
    </div>
  )
}
