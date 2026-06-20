import { useEffect, useMemo, useState, type ReactNode } from 'react'
import type { WishlistSnapshot, WishlistItem, Settings, ItemState } from '@/shared/types'
import { isFreeBookEligible } from '@/shared/types'
import { getSnapshot, getSettings, getItemStates, STORAGE_KEYS } from '@/shared/storage/repo'
import { onKvChange } from '@/shared/storage/kv'
import { formatCents } from '@/shared/util/money'
import { fmtDate, parseDate, authorSortName } from '@/shared/util/date'
import { triggerSyncFromUI, deleteItemViaUI } from '@/shared/sync-trigger'

const VIEWS = ['All items', 'Buyable', 'Recent additions', 'Free-Book Finder'] as const
type View = (typeof VIEWS)[number]
type SortDir = 'asc' | 'desc'
interface SortSpec { key: string; dir: SortDir }

interface Col {
  key: string
  label: string
  title?: string
  align?: 'left' | 'right' | 'center'
  pending?: boolean
  render: (it: WishlistItem) => ReactNode
  sortVal: (it: WishlistItem) => number | string | null
}

function Chip({ children }: { children: ReactNode }) {
  return <span className="mr-1 inline-block rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-600">{children}</span>
}
function Flag({ children }: { children: ReactNode }) {
  return <span className="mr-1 inline-block rounded bg-amber-100 px-1 py-0.5 text-[10px] font-medium text-amber-700">{children}</span>
}
const cap = (s?: string) => (s ? s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : '—')
function FreshBadges({ st, cutoff }: { st?: ItemState; cutoff: number }) {
  if (!st) return null
  const back = st.lastBackInStockAt != null && st.lastBackInStockAt > cutoff
  const isNew = !back && st.firstSeenAt > cutoff
  if (!back && !isNew) return null
  return (
    <>
      {back && <span className="mr-1 inline-block rounded bg-green-600 px-1 py-0.5 text-[10px] font-semibold text-white">BACK IN STOCK</span>}
      {isNew && <span className="mr-1 inline-block rounded bg-blue-100 px-1 py-0.5 text-[10px] font-semibold text-blue-700">NEW</span>}
    </>
  )
}

export function App() {
  const [snapshot, setSnapshot] = useState<WishlistSnapshot | undefined>()
  const [settings, setSettings] = useState<Settings | undefined>()
  const [states, setStates] = useState<Record<string, ItemState>>({})
  const [view, setView] = useState<View>('All items')
  const [hideNew, setHideNew] = useState(false)
  const [hideOOS, setHideOOS] = useState(false)
  const [sorts, setSorts] = useState<SortSpec[]>([{ key: 'wishlisted', dir: 'desc' }])
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState<string | null>(null)

  useEffect(() => {
    void getSnapshot().then(setSnapshot)
    void getSettings().then(setSettings)
    void getItemStates().then(setStates)
    return onKvChange<WishlistSnapshot>(STORAGE_KEYS.snapshot, (v) => {
      setSnapshot(v)
      void getItemStates().then(setStates)
    })
  }, [])

  const ceiling = settings?.freeBookCeilingCents ?? 700
  const freshCutoff = Date.now() - 7 * 24 * 60 * 60 * 1000
  const listName = useMemo(() => {
    const m = new Map<string, string>()
    snapshot?.subLists.forEach((s) => m.set(s.id, s.name))
    return m
  }, [snapshot])
  const listsOf = (it: WishlistItem) => it.subListIds.map((id) => listName.get(id) ?? id)

  const cols: Col[] = useMemo(
    () => [
      { key: 'author', label: 'Author', sortVal: (i) => authorSortName(i.author).toLowerCase(), render: (i) => <span className="whitespace-nowrap">{authorSortName(i.author) || '—'}</span> },
      {
        key: 'title', label: 'Title', sortVal: (i) => i.title.toLowerCase(),
        render: (i) => (
          <div className="flex gap-2">
            {i.coverImageUrl ? <img src={i.coverImageUrl} alt="" className="h-10 w-7 shrink-0 rounded object-cover" loading="lazy" /> : <div className="h-10 w-7 shrink-0 rounded bg-slate-100" />}
            <div className="min-w-0">
              <a href={i.productUrl} target="_blank" rel="noreferrer" className="line-clamp-2 font-medium text-slate-800 hover:text-indigo-600">{i.title}</a>
              <div className="mt-0.5">
                <FreshBadges st={states[i.id]} cutoff={freshCutoff} />
                {isFreeBookEligible(i, ceiling) && <span className="inline-block rounded bg-emerald-100 px-1 py-0.5 text-[10px] font-semibold text-emerald-700">FREE-BOOK PICK</span>}
              </div>
            </div>
          </div>
        ),
      },
      { key: 'genre', label: 'Genre', pending: true, title: 'Coming soon — enriched from each book’s page', sortVal: (i) => i.genre ?? '', render: (i) => i.genre ?? '—' },
      { key: 'lists', label: 'Lists', sortVal: (i) => listsOf(i).slice().sort().join(','), render: (i) => listsOf(i).map((n) => <Chip key={n}>{n}</Chip>) },
      { key: 'format', label: 'Format', sortVal: (i) => i.format ?? '', render: (i) => <span className="whitespace-nowrap capitalize">{i.format?.replace('_', ' ') ?? '—'}</span> },
      {
        key: 'condition', label: 'Condition', sortVal: (i) => i.offerCondition ?? '',
        render: (i) => (
          <span className="whitespace-nowrap">
            {i.availability === 'in_stock' ? cap(i.offerCondition) : '—'}
            {' '}
            {i.isExLibrary && <Flag>Ex-Lib</Flag>}
            {i.isMissingDustJacket && <Flag>No DJ</Flag>}
            {i.isLargePrint && <Flag>LP</Flag>}
          </span>
        ),
      },
      { key: 'price', label: 'Lowest', align: 'right', sortVal: (i) => (i.availability === 'in_stock' && i.lowestPriceCents != null ? i.lowestPriceCents : null), render: (i) => <span className="whitespace-nowrap font-medium">{i.availability === 'in_stock' ? formatCents(i.lowestPriceCents) : '—'}</span> },
      {
        key: 'status', label: 'Status', sortVal: (i) => (i.availability === 'in_stock' ? 0 : 1),
        render: (i) => i.availability === 'in_stock'
          ? <span className="whitespace-nowrap text-emerald-600">In stock{i.quantityAvailable ? ` (${i.quantityAvailable})` : ''}</span>
          : <span className="text-slate-400">Out of stock</span>,
      },
      { key: 'watching', label: 'Watching', align: 'center', title: 'Other users watching this item', sortVal: (i) => i.othersWatching ?? null, render: (i) => i.othersWatching ?? '—' },
      { key: 'copies', label: 'Copies/mo', align: 'center', title: 'Copies that come into stock per month (0 = very rare)', sortVal: (i) => i.copiesPerMonth ?? null, render: (i) => i.copiesPerMonth ?? '—' },
      { key: 'backInStock', label: 'Back in stock', title: 'Most recent return to stock (recorded since install)', sortVal: (i) => states[i.id]?.lastBackInStockAt ?? null, render: (i) => <span className="whitespace-nowrap text-slate-500">{fmtDate(states[i.id]?.lastBackInStockAt)}</span> },
      { key: 'wishlisted', label: 'Wishlisted', sortVal: (i) => parseDate(i.dateAdded) ?? null, render: (i) => <span className="whitespace-nowrap text-slate-500">{fmtDate(i.dateAdded)}</span> },
      { key: 'published', label: 'Published', sortVal: (i) => parseDate(i.releaseDate) ?? null, render: (i) => <span className="whitespace-nowrap text-slate-500">{fmtDate(i.releaseDate)}</span> },
      { key: 'trend', label: 'Price trend', pending: true, title: 'Populates as price history accrues', sortVal: () => 0, render: () => '—' },
    ],
    [listName, ceiling, states, freshCutoff],
  )

  const counts = useMemo(() => {
    const items = snapshot?.items ?? []
    return {
      total: items.length,
      buyable: items.filter((i) => i.availability === 'in_stock').length,
      free: items.filter((i) => isFreeBookEligible(i, ceiling)).length,
    }
  }, [snapshot, ceiling])

  const rows = useMemo(() => {
    let items = [...(snapshot?.items ?? [])]
    if (view === 'Buyable') items = items.filter((i) => i.availability === 'in_stock')
    else if (view === 'Free-Book Finder') items = items.filter((i) => isFreeBookEligible(i, ceiling))
    if (hideNew) items = items.filter((i) => i.offerCondition !== 'new')
    if (hideOOS) items = items.filter((i) => i.availability === 'in_stock')
    items.sort((a, b) => {
      for (const s of sorts) {
        const col = cols.find((c) => c.key === s.key)
        if (!col) continue
        const va = col.sortVal(a)
        const vb = col.sortVal(b)
        let r: number
        // missing values always sort last, regardless of direction
        if (va === null || vb === null) r = va === null && vb === null ? 0 : va === null ? 1 : -1
        else {
          const base = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb))
          r = s.dir === 'asc' ? base : -base
        }
        if (r !== 0) return r
      }
      return 0
    })
    return items
  }, [snapshot, view, hideNew, hideOOS, sorts, ceiling, cols])

  const sortSummary = sorts.map((s) => `${cols.find((c) => c.key === s.key)?.label ?? s.key} ${s.dir === 'asc' ? '↑' : '↓'}`).join(', then ')

  const onSort = (key: string, additive: boolean) => {
    setSorts((prev) => {
      const existing = prev.find((s) => s.key === key)
      const toggled: SortSpec = { key, dir: existing && existing.dir === 'asc' ? 'desc' : 'asc' }
      if (!additive) return [toggled] // plain click → single-column sort
      if (prev[0]?.key === key) return [toggled, ...prev.slice(1)] // shift on primary → flip primary
      return [prev[0], toggled].filter(Boolean).slice(0, 2) as SortSpec[] // shift → set/replace secondary
    })
  }

  const sync = async () => {
    setStatus('Syncing…')
    const ack = await triggerSyncFromUI()
    setStatus(ack.ok ? `Synced ${ack.itemCount} books` : ack.error ?? 'Could not sync')
  }

  const onDelete = async (it: WishlistItem) => {
    if (it.idListItem == null) {
      setStatus('Re-sync first — this item is missing its list-item id.')
      return
    }
    if (!window.confirm(`Delete "${it.title}" from your ThriftBooks wishlist?\n\nThis removes it from your account and can't be undone from here.`)) return
    setBusy(it.id)
    const ack = await deleteItemViaUI(it.idListItem, it.id)
    setBusy(null)
    setStatus(ack.ok ? `Deleted "${it.title}"` : ack.error ?? 'Delete failed')
  }

  return (
    <div className="min-h-screen bg-white font-sans text-slate-800">
      <header className="border-b border-slate-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold">ThriftBooks Wishlist</h1>
            <p className="text-xs text-slate-500">
              {snapshot ? `${counts.total} books · ${counts.buyable} buyable · ${counts.free} free-book picks · synced ${new Date(snapshot.capturedAt).toLocaleString([], { hour: 'numeric', minute: '2-digit', month: 'short', day: 'numeric' })}` : 'Not synced yet'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {status && <span className="text-xs text-slate-500">{status}</span>}
            <button onClick={sync} className="rounded bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700">Sync</button>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {VIEWS.map((v) => (
            <button key={v} onClick={() => { setView(v); if (v === 'Recent additions') setSorts([{ key: 'wishlisted', dir: 'desc' }]) }} className={`rounded px-3 py-1.5 text-sm ${view === v ? 'bg-slate-800 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>{v}</button>
          ))}
          <span className="mx-1 h-5 w-px bg-slate-200" />
          <button
            onClick={() => setHideNew((h) => !h)}
            className={`rounded border px-3 py-1.5 text-sm ${hideNew ? 'border-indigo-600 bg-indigo-50 text-indigo-700' : 'border-slate-300 text-slate-600 hover:bg-slate-50'}`}
            title="Hide books whose buyable copy is New (can't be shipped to Canada)"
          >
            {hideNew ? '✓ Hiding New' : 'Hide New'}
          </button>
          <button
            onClick={() => setHideOOS((h) => !h)}
            className={`rounded border px-3 py-1.5 text-sm ${hideOOS ? 'border-indigo-600 bg-indigo-50 text-indigo-700' : 'border-slate-300 text-slate-600 hover:bg-slate-50'}`}
            title="Hide out-of-stock books — show only what you can buy right now"
          >
            {hideOOS ? '✓ Hiding out of stock' : 'Hide out of stock'}
          </button>
        </div>
      </header>

      <main className="px-6 py-5">
        {!snapshot ? (
          <Empty title="No data yet">Open your <a className="text-indigo-600 underline" href="https://www.thriftbooks.com/list/" target="_blank" rel="noreferrer">ThriftBooks wishlist</a> with this extension installed — it syncs automatically.</Empty>
        ) : rows.length === 0 ? (
          <Empty title={`Nothing in "${view}"${hideNew ? ' (with New hidden)' : ''}`}>Try a different view or toggle off filters.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <p className="mb-2 text-[11px] text-slate-400">
              Sorted by {sortSummary}. Click a column to sort; <strong>Shift-click</strong> a second column for a tiebreaker (e.g. Lists, then Lowest).
            </p>
            <table className="w-full min-w-[1100px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-[11px] uppercase tracking-wide text-slate-400">
                  {cols.map((c) => {
                    const si = sorts.findIndex((s) => s.key === c.key)
                    return (
                      <th
                        key={c.key}
                        onClick={(e) => onSort(c.key, e.shiftKey)}
                        title={c.title}
                        className={`cursor-pointer select-none py-2 pr-3 font-medium hover:text-slate-700 ${c.align === 'right' ? 'text-right' : c.align === 'center' ? 'text-center' : ''} ${c.pending ? 'text-slate-300' : ''}`}
                      >
                        {c.label}
                        {si >= 0 && (
                          <span className="ml-0.5 text-indigo-600">
                            {sorts[si].dir === 'asc' ? '▲' : '▼'}
                            {sorts.length > 1 && <sub>{si + 1}</sub>}
                          </span>
                        )}
                      </th>
                    )
                  })}
                  <th className="w-8 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((it) => (
                  <tr key={it.id} className="border-b border-slate-100 align-top hover:bg-slate-50">
                    {cols.map((c) => (
                      <td key={c.key} className={`py-2 pr-3 ${c.align === 'right' ? 'text-right' : c.align === 'center' ? 'text-center' : ''}`}>
                        {c.render(it)}
                      </td>
                    ))}
                    <td className="py-2 text-right">
                      <button
                        onClick={() => onDelete(it)}
                        disabled={busy === it.id}
                        title="Delete from wishlist"
                        className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-40"
                      >
                        {busy === it.id ? '…' : '🗑'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  )
}

function Empty({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mx-auto mt-10 max-w-md rounded-lg border border-dashed border-slate-300 p-10 text-center">
      <p className="text-base font-medium text-slate-600">{title}</p>
      <p className="mt-2 text-sm text-slate-500">{children}</p>
    </div>
  )
}
