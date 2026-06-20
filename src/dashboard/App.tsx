import { useEffect, useMemo, useState, type ReactNode } from 'react'
import type { WishlistSnapshot, WishlistItem, Settings, ItemState } from '@/shared/types'
import { isFreeBookEligible } from '@/shared/types'
import { getSnapshot, getSettings, getItemStates, STORAGE_KEYS } from '@/shared/storage/repo'
import { onKvChange } from '@/shared/storage/kv'
import { formatCents } from '@/shared/util/money'
import { fmtDate, parseDate, authorSortName } from '@/shared/util/date'
import { triggerSyncFromUI, deleteItemViaUI } from '@/shared/sync-trigger'
import { GalleryCard } from './components/GalleryCard'

type SortDir = 'asc' | 'desc'
interface SortSpec { key: string; dir: SortDir }
type ViewMode = 'list' | 'gallery'

interface Col {
  key: string
  label: string
  title?: string
  align?: 'left' | 'right' | 'center'
  pending?: boolean
  render: (it: WishlistItem) => ReactNode
  sortVal: (it: WishlistItem) => number | string | null
}

const FACETS = [
  { id: 'list', label: 'List' },
  { id: 'genre', label: 'Genre' },
  { id: 'availability', label: 'Availability' },
  { id: 'format', label: 'Format' },
  { id: 'condition', label: 'Condition' },
  { id: 'language', label: 'Language' },
] as const

const cap = (s?: string) => (s ? s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : '—')

function Chip({ children }: { children: ReactNode }) {
  return <span className="mr-1 inline-block rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-600">{children}</span>
}
function Flag({ children }: { children: ReactNode }) {
  return <span className="mr-1 inline-block rounded bg-amber-100 px-1 py-0.5 text-[10px] font-medium text-amber-700">{children}</span>
}
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

function FacetGroup({ label, options, excluded, onToggle }: { label: string; options: Array<[string, number]>; excluded: Set<string>; onToggle: (v: string) => void }) {
  if (!options.length) return null
  return (
    <div className="mb-3">
      <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</div>
      <div className="space-y-0.5">
        {options.map(([v, n]) => (
          <label key={v} className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={!excluded.has(v)} onChange={() => onToggle(v)} />
            <span className="flex-1 truncate">{v}</span>
            <span className="text-xs text-slate-400">{n}</span>
          </label>
        ))}
      </div>
    </div>
  )
}

export function App() {
  const [snapshot, setSnapshot] = useState<WishlistSnapshot | undefined>()
  const [settings, setSettings] = useState<Settings | undefined>()
  const [states, setStates] = useState<Record<string, ItemState>>({})
  const [viewMode, setViewMode] = useState<ViewMode>('list')
  const [search, setSearch] = useState('')
  const [priceMin, setPriceMin] = useState('')
  const [priceMax, setPriceMax] = useState('')
  const [freeBookOnly, setFreeBookOnly] = useState(false)
  const [excl, setExcl] = useState<Record<string, Set<string>>>({})
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
  const items = useMemo(() => snapshot?.items ?? [], [snapshot])
  const listName = useMemo(() => {
    const m = new Map<string, string>()
    snapshot?.subLists.forEach((s) => m.set(s.id, s.name))
    return m
  }, [snapshot])
  const listsOf = (it: WishlistItem) => it.subListIds.map((id) => listName.get(id) ?? id)

  const facetValuesOf = (it: WishlistItem, id: string): string[] => {
    switch (id) {
      case 'list': return listsOf(it)
      case 'genre': return it.genre ? [it.genre] : []
      case 'availability': return [it.availability === 'in_stock' ? 'In stock' : 'Out of stock']
      case 'format': return [it.format ? cap(it.format) : 'Other']
      case 'condition': return it.availability === 'in_stock' && it.offerCondition ? [cap(it.offerCondition)] : []
      case 'language': return [it.language ? cap(it.language) : 'Unknown']
      default: return []
    }
  }

  const facetOptions = useMemo(() => {
    const m: Record<string, Map<string, number>> = {}
    FACETS.forEach((f) => (m[f.id] = new Map()))
    for (const it of items) for (const f of FACETS) for (const v of facetValuesOf(it, f.id)) m[f.id].set(v, (m[f.id].get(v) ?? 0) + 1)
    const out: Record<string, Array<[string, number]>> = {}
    for (const f of FACETS) out[f.id] = [...m[f.id].entries()].sort((a, b) => b[1] - a[1])
    return out
  }, [items, listName])

  const cols: Col[] = useMemo(
    () => [
      { key: 'author', label: 'Author', sortVal: (i) => authorSortName(i.author).toLowerCase() || null, render: (i) => <span className="whitespace-nowrap">{authorSortName(i.author) || '—'}</span> },
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
      { key: 'genre', label: 'Genre', sortVal: (i) => i.genre ?? null, render: (i) => i.genre ?? '—' },
      { key: 'lists', label: 'Lists', sortVal: (i) => listsOf(i).slice().sort().join(',') || null, render: (i) => listsOf(i).map((n) => <Chip key={n}>{n}</Chip>) },
      { key: 'format', label: 'Format', sortVal: (i) => i.format ?? null, render: (i) => <span className="whitespace-nowrap capitalize">{i.format?.replace('_', ' ') ?? '—'}</span> },
      {
        key: 'condition', label: 'Condition', sortVal: (i) => (i.availability === 'in_stock' ? i.offerCondition ?? null : null),
        render: (i) => (
          <span className="whitespace-nowrap">
            {i.availability === 'in_stock' ? cap(i.offerCondition) : '—'}{' '}
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
    ],
    [listName, ceiling, states, freshCutoff],
  )

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    const minC = priceMin ? Math.round(parseFloat(priceMin) * 100) : null
    const maxC = priceMax ? Math.round(parseFloat(priceMax) * 100) : null
    return items.filter((it) => {
      if (q && !`${it.title} ${it.author ?? ''}`.toLowerCase().includes(q)) return false
      if (freeBookOnly && !isFreeBookEligible(it, ceiling)) return false
      if (minC != null || maxC != null) {
        if (it.availability !== 'in_stock' || it.lowestPriceCents == null) return false
        if (minC != null && it.lowestPriceCents < minC) return false
        if (maxC != null && it.lowestPriceCents > maxC) return false
      }
      for (const f of FACETS) {
        const ex = excl[f.id]
        if (!ex || ex.size === 0) continue
        const vals = facetValuesOf(it, f.id)
        if (vals.length && vals.every((v) => ex.has(v))) return false
      }
      return true
    })
  }, [items, search, freeBookOnly, priceMin, priceMax, excl, ceiling, listName])

  const sorted = useMemo(() => {
    const arr = [...filtered]
    arr.sort((a, b) => {
      for (const s of sorts) {
        const col = cols.find((c) => c.key === s.key)
        if (!col) continue
        const va = col.sortVal(a)
        const vb = col.sortVal(b)
        let r: number
        if (va === null || vb === null) r = va === null && vb === null ? 0 : va === null ? 1 : -1
        else {
          const base = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb))
          r = s.dir === 'asc' ? base : -base
        }
        if (r !== 0) return r
      }
      return 0
    })
    return arr
  }, [filtered, sorts, cols])

  const sortSummary = sorts.map((s) => `${cols.find((c) => c.key === s.key)?.label ?? s.key} ${s.dir === 'asc' ? '↑' : '↓'}`).join(', then ')
  const counts = useMemo(() => ({
    total: items.length,
    shown: filtered.length,
    buyable: items.filter((i) => i.availability === 'in_stock').length,
    free: items.filter((i) => isFreeBookEligible(i, ceiling)).length,
  }), [items, filtered, ceiling])

  const onSort = (key: string, additive: boolean) => {
    setSorts((prev) => {
      const existing = prev.find((s) => s.key === key)
      const toggled: SortSpec = { key, dir: existing && existing.dir === 'asc' ? 'desc' : 'asc' }
      if (!additive) return [toggled]
      if (prev[0]?.key === key) return [toggled, ...prev.slice(1)]
      return [prev[0], toggled].filter(Boolean).slice(0, 2) as SortSpec[]
    })
  }
  const toggleExcl = (facetId: string, value: string) => {
    setExcl((prev) => {
      const set = new Set(prev[facetId] ?? [])
      if (set.has(value)) set.delete(value)
      else set.add(value)
      return { ...prev, [facetId]: set }
    })
  }
  const resetFilters = () => {
    setExcl({}); setSearch(''); setPriceMin(''); setPriceMax(''); setFreeBookOnly(false)
  }
  const sync = async () => {
    setStatus('Syncing…')
    const ack = await triggerSyncFromUI()
    setStatus(ack.ok ? `Synced ${ack.itemCount} books` : ack.error ?? 'Could not sync')
  }
  const onDelete = async (it: WishlistItem) => {
    if (it.idListItem == null) { setStatus('Re-sync first — this item is missing its list-item id.'); return }
    if (!window.confirm(`Delete "${it.title}" from your ThriftBooks wishlist?\n\nThis removes it from your account and can't be undone from here.`)) return
    setBusy(it.id)
    const ack = await deleteItemViaUI(it.idListItem, it.id)
    setBusy(null)
    setStatus(ack.ok ? `Deleted "${it.title}"` : ack.error ?? 'Delete failed')
  }

  const filtersActive = !!search || !!priceMin || !!priceMax || freeBookOnly || Object.values(excl).some((s) => s.size > 0)

  return (
    <div className="min-h-screen bg-white font-sans text-slate-800">
      <header className="flex items-center justify-between border-b border-slate-200 px-6 py-3">
        <div>
          <h1 className="text-lg font-semibold">ThriftBooks Wishlist</h1>
          <p className="text-xs text-slate-500">
            {snapshot ? `Showing ${counts.shown} of ${counts.total} · ${counts.buyable} buyable · ${counts.free} free-book picks` : 'Not synced yet'}
            {status && <span className="ml-2 text-slate-400">· {status}</span>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 text-sm text-slate-600">
            <span>Sort</span>
            <select
              value={sorts[0]?.key ?? 'wishlisted'}
              onChange={(e) => setSorts([{ key: e.target.value, dir: sorts[0]?.dir ?? 'asc' }])}
              className="rounded border border-slate-300 px-2 py-1"
            >
              {cols.map((c) => <option key={c.key} value={c.key}>{c.label === 'Lowest' ? 'Lowest price' : c.label}</option>)}
            </select>
            <button
              onClick={() => setSorts((p) => [{ key: p[0]?.key ?? 'wishlisted', dir: p[0]?.dir === 'asc' ? 'desc' : 'asc' }])}
              title="Toggle ascending / descending"
              className="rounded border border-slate-300 px-1.5 py-1"
            >
              {sorts[0]?.dir === 'asc' ? '↑' : '↓'}
            </button>
          </div>
          <div className="flex overflow-hidden rounded border border-slate-300 text-sm">
            <button onClick={() => setViewMode('list')} className={`px-3 py-1.5 ${viewMode === 'list' ? 'bg-slate-800 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>List</button>
            <button onClick={() => setViewMode('gallery')} className={`px-3 py-1.5 ${viewMode === 'gallery' ? 'bg-slate-800 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>Gallery</button>
          </div>
          <button onClick={sync} className="rounded bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700">Sync</button>
        </div>
      </header>

      <div className="flex">
        <aside className="w-56 shrink-0 border-r border-slate-200 p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-sm font-semibold">Filters</span>
            {filtersActive && <button onClick={resetFilters} className="text-xs text-indigo-600 hover:underline">Reset</button>}
          </div>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search title / author" className="mb-3 w-full rounded border border-slate-300 px-2 py-1.5 text-sm" />
          <label className="mb-3 flex cursor-pointer items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={freeBookOnly} onChange={(e) => setFreeBookOnly(e.target.checked)} />
            Free-book picks only
          </label>
          <div className="mb-3">
            <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Price ($)</div>
            <div className="flex items-center gap-1">
              <input value={priceMin} onChange={(e) => setPriceMin(e.target.value)} placeholder="min" inputMode="decimal" className="w-full rounded border border-slate-300 px-2 py-1 text-sm" />
              <span className="text-slate-400">–</span>
              <input value={priceMax} onChange={(e) => setPriceMax(e.target.value)} placeholder="max" inputMode="decimal" className="w-full rounded border border-slate-300 px-2 py-1 text-sm" />
            </div>
          </div>
          {FACETS.map((f) => (
            <FacetGroup key={f.id} label={f.label} options={facetOptions[f.id] ?? []} excluded={excl[f.id] ?? new Set()} onToggle={(v) => toggleExcl(f.id, v)} />
          ))}
        </aside>

        <main className="min-w-0 flex-1 p-5">
          {!snapshot ? (
            <Empty title="No data yet">Open your <a className="text-indigo-600 underline" href="https://www.thriftbooks.com/list/" target="_blank" rel="noreferrer">ThriftBooks wishlist</a> with this extension installed — it syncs automatically.</Empty>
          ) : sorted.length === 0 ? (
            <Empty title="No matches">{filtersActive ? 'Nothing matches your filters.' : 'Your synced wishlist is empty.'}</Empty>
          ) : viewMode === 'gallery' ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {sorted.map((it) => (
                <GalleryCard key={it.id} it={it} st={states[it.id]} ceiling={ceiling} freshCutoff={freshCutoff} listNames={listsOf(it)} onDelete={onDelete} busy={busy === it.id} />
              ))}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <p className="mb-2 text-[11px] text-slate-400">
                Sorted by {sortSummary}. Click a column to sort; <strong>Shift-click</strong> a second column for a tiebreaker.
              </p>
              <table className="w-full min-w-[1100px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-[11px] uppercase tracking-wide text-slate-400">
                    {cols.map((c) => {
                      const si = sorts.findIndex((s) => s.key === c.key)
                      return (
                        <th key={c.key} onClick={(e) => onSort(c.key, e.shiftKey)} title={c.title} className={`cursor-pointer select-none py-2 pr-3 font-medium hover:text-slate-700 ${c.align === 'right' ? 'text-right' : c.align === 'center' ? 'text-center' : ''} ${c.pending ? 'text-slate-300' : ''}`}>
                          {c.label}
                          {si >= 0 && <span className="ml-0.5 text-indigo-600">{sorts[si].dir === 'asc' ? '▲' : '▼'}{sorts.length > 1 && <sub>{si + 1}</sub>}</span>}
                        </th>
                      )
                    })}
                    <th className="w-8 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((it) => (
                    <tr key={it.id} className="border-b border-slate-100 align-top hover:bg-slate-50">
                      {cols.map((c) => (
                        <td key={c.key} className={`py-2 pr-3 ${c.align === 'right' ? 'text-right' : c.align === 'center' ? 'text-center' : ''}`}>{c.render(it)}</td>
                      ))}
                      <td className="py-2 text-right">
                        <button onClick={() => onDelete(it)} disabled={busy === it.id} title="Delete from wishlist" className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-40">
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
