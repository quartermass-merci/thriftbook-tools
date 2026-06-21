import { useEffect, useMemo, useState, type ReactNode } from 'react'
import type { WishlistSnapshot, WishlistItem, Settings, ItemState } from '@/shared/types'
import { isFreeBookEligible } from '@/shared/types'
import { getSnapshot, getSettings, getItemStates, getPriceHistory, STORAGE_KEYS } from '@/shared/storage/repo'
import { onKvChange } from '@/shared/storage/kv'
import { formatCents } from '@/shared/util/money'
import { fmtDate, parseDate, authorSortName } from '@/shared/util/date'
import { triggerSyncFromUI, deleteItemViaUI, triggerEnrichFromUI } from '@/shared/sync-trigger'
import { GalleryCard } from './components/GalleryCard'
import { categorize, categoryRank } from '@/shared/taxonomy'

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
  { id: 'category', label: 'Category' },
  { id: 'availability', label: 'Availability' },
  { id: 'format', label: 'Format' },
  { id: 'condition', label: 'Condition' },
  { id: 'publisher', label: 'Publisher' },
  { id: 'language', label: 'Language' },
] as const

const MONO_COLS = new Set(['price', 'watching', 'copies', 'backInStock', 'wishlisted', 'published', 'isbn10', 'isbn13'])

const CONDITION_ORDER = ['New', 'Like New', 'Very Good', 'Good', 'Acceptable', 'Unknown']
const conditionRank = (s: string) => {
  const i = CONDITION_ORDER.indexOf(s)
  return i < 0 ? CONDITION_ORDER.length : i
}

type ScanDim = 'off' | 'overall' | 'category' | 'author' | 'publisher'
type Taste = {
  author: Map<string, number>
  publisher: Map<string, number>
  category: Map<string, number>
  maxA: number
  maxP: number
  maxC: number
}

const cap = (s?: string) => (s ? s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : '—')

function Chip({ children }: { children: ReactNode }) {
  return <span className="mr-1 inline-block rounded bg-cream/50 px-1.5 py-0.5 text-[13px] text-muted">{children}</span>
}
function Flag({ children }: { children: ReactNode }) {
  return <span className="mr-1 inline-block rounded bg-cream/60 px-1 py-0.5 text-[12px] font-medium text-muted">{children}</span>
}
function FreshBadges({ st, cutoff }: { st?: ItemState; cutoff: number }) {
  if (!st) return null
  const back = st.lastBackInStockAt != null && st.lastBackInStockAt > cutoff
  const isNew = !back && st.firstSeenAt > cutoff
  if (!back && !isNew) return null
  return (
    <>
      {back && <span className="mr-1 inline-block rounded bg-accent px-1 py-0.5 text-[12px] font-semibold text-ink">BACK IN STOCK</span>}
      {isNew && <span className="mr-1 inline-block rounded bg-teal/10 px-1 py-0.5 text-[12px] font-semibold text-teal">NEW</span>}
    </>
  )
}

function FacetGroup({ label, options, excluded, onToggle, onAll, onNone }: { label: string; options: Array<[string, number]>; excluded: Set<string>; onToggle: (v: string) => void; onAll: () => void; onNone: () => void }) {
  if (!options.length) return null
  return (
    <div className="mb-3">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-[13px] font-semibold uppercase tracking-wide text-faint">{label}</span>
        <span className="text-[12px] text-faint">
          <button onClick={onAll} className="hover:text-teal">All</button>
          {' · '}
          <button onClick={onNone} className="hover:text-teal">None</button>
        </span>
      </div>
      <div className="max-h-44 space-y-0.5 overflow-y-auto">
        {options.map(([v, n]) => (
          <label key={v} className="flex cursor-pointer items-center gap-2 text-[15px] text-ink">
            <input type="checkbox" checked={!excluded.has(v)} onChange={() => onToggle(v)} />
            <span className="flex-1 truncate">{v}</span>
            <span className="text-[13px] text-faint">{n}</span>
          </label>
        ))}
      </div>
    </div>
  )
}

function priceArr(history?: Array<[number, number]>): number[] {
  return (history ?? []).map((x) => x[1])
}
function trendPct(item: WishlistItem, history?: Array<[number, number]>): number | null {
  if (item.availability !== 'in_stock' || item.lowestPriceCents == null) return null
  const pts = priceArr(history)
  if (pts.length < 2) return null
  const min = Math.min(...pts), max = Math.max(...pts)
  return max > min ? (item.lowestPriceCents - min) / (max - min) : null
}
function Sparkline({ points }: { points: number[] }) {
  if (points.length < 2) return null
  const w = 60, h = 16
  const min = Math.min(...points), max = Math.max(...points), range = max - min || 1
  const step = w / (points.length - 1)
  const d = points.map((p, i) => `${(i * step).toFixed(1)},${(h - ((p - min) / range) * h).toFixed(1)}`).join(' ')
  const up = points[points.length - 1] > points[0]
  return (
    <svg width={w} height={h} className="inline-block align-middle">
      <polyline points={d} fill="none" stroke={up ? '#213f4c' : '#088778'} strokeWidth="1.5" />
    </svg>
  )
}
function PriceTrend({ item, history }: { item: WishlistItem; history?: Array<[number, number]> }) {
  if (item.availability !== 'in_stock' || item.lowestPriceCents == null) return <span className="text-faint">—</span>
  const pts = priceArr(history)
  if (pts.length < 2) return <span className="text-faint" title="Builds as prices change over time">—</span>
  const min = Math.min(...pts), max = Math.max(...pts), cur = item.lowestPriceCents
  const pct = max > min ? (cur - min) / (max - min) : 0.5
  const v = max === min ? null : pct <= 0.25 ? { t: 'Great', c: 'text-teal' } : pct >= 0.75 ? { t: 'High', c: 'text-ink' } : { t: 'Typical', c: 'text-muted' }
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap">
      <Sparkline points={pts} />
      {v && <span className={`text-[12px] font-semibold ${v.c}`}>{v.t}</span>}
    </span>
  )
}

export function App() {
  const [snapshot, setSnapshot] = useState<WishlistSnapshot | undefined>()
  const [settings, setSettings] = useState<Settings | undefined>()
  const [states, setStates] = useState<Record<string, ItemState>>({})
  const [histories, setHistories] = useState<Record<string, Array<[number, number]>>>({})
  const [viewMode, setViewMode] = useState<ViewMode>('list')
  const [search, setSearch] = useState('')
  const [priceMin, setPriceMin] = useState('')
  const [priceMax, setPriceMax] = useState('')
  const [freeBookOnly, setFreeBookOnly] = useState(false)
  const [scanDim, setScanDim] = useState<ScanDim>('off')
  const [excl, setExcl] = useState<Record<string, Set<string>>>({})
  const [sorts, setSorts] = useState<SortSpec[]>([{ key: 'wishlisted', dir: 'desc' }])
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [enriching, setEnriching] = useState(false)

  useEffect(() => {
    void getSnapshot().then(setSnapshot)
    void getSettings().then(setSettings)
    void getItemStates().then(setStates)
    void getPriceHistory().then(setHistories)
    return onKvChange<WishlistSnapshot>(STORAGE_KEYS.snapshot, (v) => {
      setSnapshot(v)
      void getItemStates().then(setStates)
      void getPriceHistory().then(setHistories)
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

  // Taste profile across the whole wishlist — how often each author / publisher /
  // category recurs. Drives the free-credit scan's affinity ranking.
  const taste = useMemo(() => {
    const author = new Map<string, number>()
    const publisher = new Map<string, number>()
    const category = new Map<string, number>()
    for (const it of items) {
      if (it.author) author.set(it.author, (author.get(it.author) ?? 0) + 1)
      if (it.publisher) publisher.set(it.publisher, (publisher.get(it.publisher) ?? 0) + 1)
      const c = categorize(it)
      if (c) category.set(c, (category.get(c) ?? 0) + 1)
    }
    const max = (m: Map<string, number>) => Math.max(1, ...m.values())
    return { author, publisher, category, maxA: max(author), maxP: max(publisher), maxC: max(category) }
  }, [items])

  const scanScore = (it: WishlistItem): number => {
    const a = it.author ? taste.author.get(it.author) ?? 0 : 0
    const p = it.publisher ? taste.publisher.get(it.publisher) ?? 0 : 0
    const c = categorize(it)
    const cn = c ? taste.category.get(c) ?? 0 : 0
    switch (scanDim) {
      case 'author': return a
      case 'publisher': return p
      case 'category': return cn
      case 'overall': return a / taste.maxA + p / taste.maxP + cn / taste.maxC
      default: return 0
    }
  }

  const facetValuesOf = (it: WishlistItem, id: string): string[] => {
    switch (id) {
      case 'list': return listsOf(it)
      case 'category': { const c = categorize(it); return c ? [c] : [] }
      case 'availability': return [it.availability === 'in_stock' ? 'In stock' : 'Out of stock']
      case 'format': return [it.format ? cap(it.format) : 'Other']
      case 'condition': return it.availability === 'in_stock' && it.offerCondition ? [cap(it.offerCondition)] : []
      case 'publisher': return it.publisher ? [it.publisher] : []
      case 'language': return [it.language ? cap(it.language) : 'Unknown']
      default: return []
    }
  }

  const facetOptions = useMemo(() => {
    const m: Record<string, Map<string, number>> = {}
    FACETS.forEach((f) => (m[f.id] = new Map()))
    for (const it of items) for (const f of FACETS) for (const v of facetValuesOf(it, f.id)) m[f.id].set(v, (m[f.id].get(v) ?? 0) + 1)
    const out: Record<string, Array<[string, number]>> = {}
    for (const f of FACETS) {
      const entries = [...m[f.id].entries()]
      if (f.id === 'condition') entries.sort((a, b) => conditionRank(a[0]) - conditionRank(b[0]))
      else if (f.id === 'category') entries.sort((a, b) => categoryRank(a[0]) - categoryRank(b[0]))
      else entries.sort((a, b) => b[1] - a[1])
      out[f.id] = entries
    }
    return out
  }, [items, listName])

  const cols: Col[] = useMemo(
    () => [
      { key: 'author', label: 'Author', sortVal: (i) => authorSortName(i.author).toLowerCase() || null, render: (i) => <span className="whitespace-nowrap">{authorSortName(i.author) || '—'}</span> },
      {
        key: 'title', label: 'Title', sortVal: (i) => i.title.toLowerCase(),
        render: (i) => (
          <div className="flex gap-2">
            {i.coverImageUrl ? <img src={i.coverImageUrl} alt="" className="h-10 w-7 shrink-0 rounded object-cover" loading="lazy" /> : <div className="h-10 w-7 shrink-0 rounded bg-cream/50" />}
            <div className="min-w-0">
              <a href={i.productUrl} target="_blank" rel="noreferrer" className="line-clamp-2 font-medium text-ink hover:text-teal">{i.title}</a>
              <div className="mt-0.5">
                <FreshBadges st={states[i.id]} cutoff={freshCutoff} />
                {isFreeBookEligible(i, ceiling) && <span className="inline-block rounded bg-accent px-1 py-0.5 text-[12px] font-semibold text-ink">FREE-BOOK PICK</span>}
              </div>
            </div>
          </div>
        ),
      },
      { key: 'lists', label: 'Lists', sortVal: (i) => listsOf(i).slice().sort().join(',') || null, render: (i) => listsOf(i).map((n) => <Chip key={n}>{n}</Chip>) },
      { key: 'format', label: 'Format', sortVal: (i) => i.format ?? null, render: (i) => <span className="whitespace-nowrap capitalize">{i.format?.replace('_', ' ') ?? '—'}</span> },
      { key: 'language', label: 'Language', sortVal: (i) => i.language ?? null, render: (i) => <span className="whitespace-nowrap capitalize">{i.language ? cap(i.language) : '—'}</span> },
      { key: 'category', label: 'Category', sortVal: (i) => { const c = categorize(i); return c ? categoryRank(c) : null }, render: (i) => <span className="whitespace-nowrap">{categorize(i) ?? '—'}</span> },
      { key: 'publisher', label: 'Publisher', sortVal: (i) => i.publisher?.toLowerCase() ?? null, render: (i) => <span className="whitespace-nowrap">{i.publisher ?? '—'}</span> },
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
      { key: 'price', label: 'Lowest', align: 'right', sortVal: (i) => (i.availability === 'in_stock' && i.lowestPriceCents != null ? i.lowestPriceCents : null), render: (i) => <span className="whitespace-nowrap text-base font-semibold text-ink">{i.availability === 'in_stock' ? formatCents(i.lowestPriceCents) : '—'}</span> },
      {
        key: 'status', label: 'Status', sortVal: (i) => (i.availability === 'in_stock' ? 0 : 1),
        render: (i) => i.availability === 'in_stock'
          ? <span className="whitespace-nowrap text-teal">In stock{i.quantityAvailable ? ` (${i.quantityAvailable})` : ''}</span>
          : <span className="text-faint">Out of stock</span>,
      },
      { key: 'watching', label: 'Watching', align: 'center', title: 'Other users watching this item', sortVal: (i) => i.othersWatching ?? null, render: (i) => i.othersWatching ?? '—' },
      { key: 'copies', label: 'Copies/mo', align: 'center', title: 'Copies that come into stock per month (0 = very rare)', sortVal: (i) => i.copiesPerMonth ?? null, render: (i) => i.copiesPerMonth ?? '—' },
      { key: 'backInStock', label: 'Back in stock', title: 'Most recent return to stock (recorded since install)', sortVal: (i) => states[i.id]?.lastBackInStockAt ?? null, render: (i) => <span className="whitespace-nowrap text-muted">{fmtDate(states[i.id]?.lastBackInStockAt)}</span> },
      { key: 'wishlisted', label: 'Wishlisted', sortVal: (i) => parseDate(i.dateAdded) ?? null, render: (i) => <span className="whitespace-nowrap text-muted">{fmtDate(i.dateAdded)}</span> },
      { key: 'published', label: 'Published', sortVal: (i) => parseDate(i.releaseDate) ?? null, render: (i) => <span className="whitespace-nowrap text-muted">{fmtDate(i.releaseDate)}</span> },
      { key: 'isbn10', label: 'ISBN', sortVal: (i) => i.isbn10 ?? null, render: (i) => i.isbn10 ?? '—' },
      { key: 'isbn13', label: 'ISBN13', sortVal: (i) => i.isbn13 ?? null, render: (i) => i.isbn13 ?? '—' },
      { key: 'trend', label: 'Price trend', title: 'Current price vs its recorded range', sortVal: (i) => trendPct(i, histories[i.id]), render: (i) => <PriceTrend item={i} history={histories[i.id]} /> },
    ],
    [listName, ceiling, states, freshCutoff, histories],
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
    if (scanDim !== 'off') {
      arr.sort((a, b) => scanScore(b) - scanScore(a) || (b.lowestPriceCents ?? 0) - (a.lowestPriceCents ?? 0))
      return arr
    }
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
  }, [filtered, sorts, cols, scanDim, taste])

  const sortSummary = sorts.map((s) => `${cols.find((c) => c.key === s.key)?.label ?? s.key} ${s.dir === 'asc' ? '↑' : '↓'}`).join(', then ')
  const counts = useMemo(() => ({
    total: items.length,
    shown: filtered.length,
    buyable: items.filter((i) => i.availability === 'in_stock').length,
    free: items.filter((i) => isFreeBookEligible(i, ceiling)).length,
  }), [items, filtered, ceiling])

  const enrichedCount = useMemo(() => items.filter((i) => categorize(i) != null).length, [items])

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
    setExcl({}); setSearch(''); setPriceMin(''); setPriceMax(''); setFreeBookOnly(false); setScanDim('off')
  }
  const sync = async () => {
    setStatus('Syncing…')
    const ack = await triggerSyncFromUI()
    setStatus(ack.ok ? `Synced ${ack.itemCount} books` : ack.error ?? 'Could not sync')
  }
  const runEnrichAll = async () => {
    setEnriching(true)
    setStatus('Enriching from product pages — watch the bar climb…')
    const ack = await triggerEnrichFromUI()
    setEnriching(false)
    setStatus(ack.ok ? `Enriched ${ack.enriched ?? 0} more books` : ack.error ?? 'Could not enrich')
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
    <div className="flex h-screen flex-col bg-canvas font-sans text-ink">
      <header className="border-b-4 border-accent bg-teal px-6 py-4 text-canvas">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight">ThriftBooks Wishlist</h1>
            <p className="mt-0.5 text-[15px] text-canvas/75">
              {snapshot ? (
                <>
                  <span className="font-mono font-semibold text-canvas">{counts.shown}</span> of{' '}
                  <span className="font-mono text-canvas">{counts.total}</span> ·{' '}
                  <span className="font-mono font-semibold text-canvas">{counts.buyable}</span> buyable ·{' '}
                  <span className="font-mono font-semibold text-accent">{counts.free}</span> free-book picks
                </>
              ) : (
                'Not synced yet'
              )}
              {status && <span className="ml-2 text-canvas/60">· {status}</span>}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 text-[15px] text-canvas/80">
              <span>Sort</span>
              <select
                value={sorts[0]?.key ?? 'wishlisted'}
                onChange={(e) => setSorts([{ key: e.target.value, dir: sorts[0]?.dir ?? 'asc' }])}
                className="rounded border border-white/25 bg-white/10 px-2 py-1 text-canvas"
              >
                {cols.map((c) => <option key={c.key} value={c.key} className="text-ink">{c.label === 'Lowest' ? 'Lowest price' : c.label}</option>)}
              </select>
              <button
                onClick={() => setSorts((p) => [{ key: p[0]?.key ?? 'wishlisted', dir: p[0]?.dir === 'asc' ? 'desc' : 'asc' }])}
                title="Toggle ascending / descending"
                className="rounded border border-white/25 px-1.5 py-1 hover:bg-white/10"
              >
                {sorts[0]?.dir === 'asc' ? '↑' : '↓'}
              </button>
            </div>
            <div className="flex overflow-hidden rounded border border-white/25 text-[15px]">
              <button onClick={() => setViewMode('list')} className={`px-3 py-1.5 ${viewMode === 'list' ? 'bg-canvas text-teal' : 'text-canvas/80 hover:bg-white/10'}`}>List</button>
              <button onClick={() => setViewMode('gallery')} className={`px-3 py-1.5 ${viewMode === 'gallery' ? 'bg-canvas text-teal' : 'text-canvas/80 hover:bg-white/10'}`}>Gallery</button>
            </div>
            <button onClick={sync} className="rounded border border-white/30 px-3 py-1.5 text-[15px] hover:bg-white/10">↻ Sync</button>
          </div>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="w-60 shrink-0 overflow-y-auto border-r border-line p-5">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-[15px] font-semibold">Filters</span>
            {filtersActive && <button onClick={resetFilters} className="text-[13px] text-teal hover:underline">Reset</button>}
          </div>
          {snapshot && enrichedCount < items.length && (
            <div className="mb-3 rounded border border-line bg-cream/20 p-2 text-[13px]">
              <div className="flex items-center justify-between">
                <span className="text-muted">Categorized <span className="font-mono">{enrichedCount}</span> / <span className="font-mono">{items.length}</span></span>
                <button onClick={runEnrichAll} disabled={enriching} className="font-medium text-teal hover:underline disabled:opacity-50">{enriching ? 'Enriching…' : 'Enrich all'}</button>
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded bg-line">
                <div className="h-full rounded bg-teal transition-all" style={{ width: `${items.length ? Math.round((enrichedCount / items.length) * 100) : 0}%` }} />
              </div>
            </div>
          )}
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search title / author" className="mb-3 w-full rounded border border-line px-2 py-1.5 text-[15px]" />
          <label className="mb-3 flex cursor-pointer items-center gap-2 text-[15px] text-ink">
            <input type="checkbox" checked={freeBookOnly} onChange={(e) => { setFreeBookOnly(e.target.checked); if (!e.target.checked) setScanDim('off') }} />
            Free-book picks only
          </label>
          <div className="mb-3">
            <div className="mb-1 text-[13px] font-semibold uppercase tracking-wide text-faint">Price ($)</div>
            <div className="flex items-center gap-1">
              <input value={priceMin} onChange={(e) => setPriceMin(e.target.value)} placeholder="min" inputMode="decimal" className="w-full rounded border border-line px-2 py-1 text-[15px]" />
              <span className="text-faint">–</span>
              <input value={priceMax} onChange={(e) => setPriceMax(e.target.value)} placeholder="max" inputMode="decimal" className="w-full rounded border border-line px-2 py-1 text-[15px]" />
            </div>
          </div>
          <div className="my-4 border-t border-line" />
          {FACETS.map((f) => (
            <FacetGroup
              key={f.id}
              label={f.label}
              options={facetOptions[f.id] ?? []}
              excluded={excl[f.id] ?? new Set()}
              onToggle={(v) => toggleExcl(f.id, v)}
              onAll={() => setExcl((prev) => ({ ...prev, [f.id]: new Set() }))}
              onNone={() => setExcl((prev) => ({ ...prev, [f.id]: new Set((facetOptions[f.id] ?? []).map(([v]) => v)) }))}
            />
          ))}
        </aside>

        <main className="min-w-0 flex-1 overflow-auto p-5">
          {!snapshot ? (
            <Empty title="No data yet">Open your <a className="text-teal underline" href="https://www.thriftbooks.com/list/" target="_blank" rel="noreferrer">ThriftBooks wishlist</a> with this extension installed — it syncs automatically.</Empty>
          ) : (
            <>
              {freeBookOnly && <ScanBar dim={scanDim} onPick={setScanDim} count={filtered.length} />}
              {scanDim !== 'off' ? (
                sorted.length === 0 ? (
                  <Empty title="No eligible books">Nothing at or under ${(ceiling / 100).toFixed(2)} is in stock right now. Loosen a filter or check back after a sync.</Empty>
                ) : (
                  <ScanResults items={sorted} dim={scanDim} taste={taste} />
                )
              ) : sorted.length === 0 ? (
                <Empty title="No matches">{filtersActive ? 'Nothing matches your filters.' : 'Your synced wishlist is empty.'}</Empty>
              ) : viewMode === 'gallery' ? (
            <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(320px,1fr))]">
              {sorted.map((it) => (
                <GalleryCard key={it.id} it={it} st={states[it.id]} ceiling={ceiling} freshCutoff={freshCutoff} listNames={listsOf(it)} onDelete={onDelete} busy={busy === it.id} />
              ))}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <p className="mb-2 text-[13px] text-faint">
                Sorted by {sortSummary}. Click a column to sort, <strong>Shift-click</strong> a second for a tiebreaker. Price trend and Back-in-stock fill in as you sync over time.
              </p>
              <table className="w-full min-w-[1600px] border-collapse text-[15px]">
                <thead>
                  <tr className="border-b border-line text-left text-[13px] uppercase tracking-wide text-faint">
                    {cols.map((c) => {
                      const si = sorts.findIndex((s) => s.key === c.key)
                      return (
                        <th key={c.key} onClick={(e) => onSort(c.key, e.shiftKey)} title={c.title} className={`sticky top-0 z-10 bg-canvas cursor-pointer select-none py-2 pr-3 font-medium hover:text-ink ${c.align === 'right' ? 'text-right' : c.align === 'center' ? 'text-center' : ''} ${c.pending ? 'text-faint' : ''}`}>
                          {c.label}
                          {si >= 0 && <span className="ml-0.5 text-teal">{sorts[si].dir === 'asc' ? '▲' : '▼'}{sorts.length > 1 && <sub>{si + 1}</sub>}</span>}
                        </th>
                      )
                    })}
                    <th className="sticky top-0 z-10 bg-canvas w-8 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((it) => (
                    <tr key={it.id} className="border-b border-line align-top hover:bg-cream/30">
                      {cols.map((c) => (
                        <td key={c.key} className={`py-2 pr-3 ${MONO_COLS.has(c.key) ? 'font-mono tabular-nums ' : ''}${c.align === 'right' ? 'text-right' : c.align === 'center' ? 'text-center' : ''}`}>{c.render(it)}</td>
                      ))}
                      <td className="py-2 text-right">
                        <button onClick={() => onDelete(it)} disabled={busy === it.id} title="Delete from wishlist" className="rounded p-1 text-faint hover:bg-cream hover:text-ink disabled:opacity-40">
                          {busy === it.id ? '…' : '🗑'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  )
}

function Empty({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mx-auto mt-10 max-w-md rounded-lg border border-dashed border-line p-10 text-center">
      <p className="text-lg font-medium text-muted">{title}</p>
      <p className="mt-2 text-[15px] text-muted">{children}</p>
    </div>
  )
}

function ScanBar({ dim, onPick, count }: { dim: ScanDim; onPick: (d: ScanDim) => void; count: number }) {
  const opts: Array<[ScanDim, string]> = [
    ['overall', 'Best overall'],
    ['category', 'By category'],
    ['author', 'By author'],
    ['publisher', 'By publisher'],
  ]
  return (
    <div className="mb-4 rounded-lg border border-teal/30 bg-teal/5 p-4">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="font-display text-lg font-semibold text-teal">Free-credit scan</span>
        <span className="text-[13px] text-muted">Rank your {count} eligible {count === 1 ? 'book' : 'books'} by what best fits your taste:</span>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {opts.map(([d, label]) => (
          <button
            key={d}
            onClick={() => onPick(dim === d ? 'off' : d)}
            className={`rounded-full border px-3 py-1 text-[13px] ${dim === d ? 'border-teal bg-teal text-canvas' : 'border-line text-ink hover:bg-cream/40'}`}
          >
            {label}
          </button>
        ))}
        {dim !== 'off' && (
          <button onClick={() => onPick('off')} className="rounded-full px-3 py-1 text-[13px] text-muted hover:text-teal">Clear</button>
        )}
      </div>
    </div>
  )
}

function reasonFor(it: WishlistItem, dim: ScanDim, taste: Taste): string {
  const a = it.author ? taste.author.get(it.author) ?? 0 : 0
  const p = it.publisher ? taste.publisher.get(it.publisher) ?? 0 : 0
  const c = categorize(it)
  const cn = c ? taste.category.get(c) ?? 0 : 0
  const authorTxt = a > 1 ? `${a - 1} more by ${it.author} on your list` : `Only ${it.author ?? 'this'} title you want`
  const pubTxt = it.publisher ? `${p} from ${it.publisher} on your list` : 'Publisher not enriched yet'
  const catTxt = c ? `${c} · ${cn} in your wishlist` : 'Not categorized yet'
  if (dim === 'author') return authorTxt
  if (dim === 'publisher') return pubTxt
  if (dim === 'category') return catTxt
  const aN = a / taste.maxA, pN = p / taste.maxP, cN = cn / taste.maxC
  if (a > 0 && aN >= pN && aN >= cN) return authorTxt
  if (c && cN >= pN) return catTxt
  if (p > 0) return pubTxt
  return c ? catTxt : 'On your wishlist'
}

function ScanResults({ items, dim, taste }: { items: WishlistItem[]; dim: ScanDim; taste: Taste }) {
  return (
    <ol className="space-y-2">
      {items.map((it, i) => (
        <li key={it.id} className="flex items-center gap-3 rounded-lg border border-line bg-surface p-3">
          <span className="w-6 shrink-0 text-center font-mono text-lg font-bold text-faint">{i + 1}</span>
          {it.coverImageUrl ? (
            <img src={it.coverImageUrl} alt="" className="h-14 w-10 shrink-0 rounded object-cover" loading="lazy" />
          ) : (
            <div className="h-14 w-10 shrink-0 rounded bg-cream/50" />
          )}
          <div className="min-w-0 flex-1">
            <a href={it.productUrl} target="_blank" rel="noreferrer" className="line-clamp-1 font-display text-lg font-bold text-ink hover:text-teal">{it.title}</a>
            <div className="text-[13px] text-muted">{authorSortName(it.author) || '—'}</div>
            <div className="mt-1 inline-flex rounded bg-teal/10 px-1.5 py-0.5 text-[12px] font-medium text-teal">{reasonFor(it, dim, taste)}</div>
          </div>
          <div className="shrink-0 text-right">
            <div className="font-mono text-lg font-bold tabular-nums text-ink">{formatCents(it.lowestPriceCents)}</div>
            <div className="text-[13px] text-muted">{cap(it.offerCondition)}</div>
          </div>
        </li>
      ))}
    </ol>
  )
}
