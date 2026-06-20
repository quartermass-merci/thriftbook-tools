import type { ReactNode } from 'react'
import type { WishlistItem, ItemState } from '@/shared/types'
import { isFreeBookEligible } from '@/shared/types'
import { formatCents } from '@/shared/util/money'
import { fmtDate } from '@/shared/util/date'

const cap = (s?: string) => (s ? s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : '—')

function Badge({ cls, children }: { cls: string; children: ReactNode }) {
  return <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold ${cls}`}>{children}</span>
}
function Row({ k, v }: { k: string; v: ReactNode }) {
  return (
    <>
      <dt className="font-semibold text-slate-500">{k}</dt>
      <dd className="truncate text-slate-700">{v}</dd>
    </>
  )
}

export function GalleryCard({
  it,
  st,
  ceiling,
  freshCutoff,
  listNames,
  onDelete,
  busy,
}: {
  it: WishlistItem
  st?: ItemState
  ceiling: number
  freshCutoff: number
  listNames: string[]
  onDelete: (it: WishlistItem) => void
  busy: boolean
}) {
  const inStock = it.availability === 'in_stock'
  const free = isFreeBookEligible(it, ceiling)
  const back = st?.lastBackInStockAt != null && st.lastBackInStockAt > freshCutoff
  const isNew = !back && st != null && st.firstSeenAt > freshCutoff

  return (
    <div className="relative flex flex-col rounded-lg border border-slate-200 bg-white p-3 shadow-sm transition hover:shadow-md">
      <button
        onClick={() => onDelete(it)}
        disabled={busy}
        title="Delete from wishlist"
        className="absolute right-1.5 top-1.5 rounded p-1 text-slate-300 hover:bg-red-50 hover:text-red-600 disabled:opacity-40"
      >
        {busy ? '…' : '🗑'}
      </button>

      <div className="flex gap-3">
        {it.coverImageUrl ? (
          <img src={it.coverImageUrl} alt="" className="h-32 w-20 shrink-0 rounded object-contain" loading="lazy" />
        ) : (
          <div className="h-32 w-20 shrink-0 rounded bg-slate-100" />
        )}
        <div className="min-w-0 flex-1 pr-5">
          <a
            href={it.productUrl}
            target="_blank"
            rel="noreferrer"
            className="block text-base font-extrabold leading-tight text-slate-900 hover:text-indigo-600"
          >
            {it.title}
          </a>
          <div className="mt-0.5 text-sm font-medium text-slate-600">{it.author ?? '—'}</div>
          <div className="mt-2">
            {inStock ? (
              <div>
                <span className="text-xs text-slate-500">{cap(it.offerCondition)}</span>
                <span className="ml-1.5 text-lg font-bold text-rose-700">{formatCents(it.lowestPriceCents)}</span>
              </div>
            ) : (
              <div className="text-sm font-medium text-slate-400">
                Out of stock{it.othersWatching ? ` · ${it.othersWatching} watching` : ''}
              </div>
            )}
          </div>
          <div className="mt-1.5 flex flex-wrap gap-1">
            {back && <Badge cls="bg-green-600 text-white">BACK IN STOCK</Badge>}
            {isNew && <Badge cls="bg-blue-100 text-blue-700">NEW</Badge>}
            {free && <Badge cls="bg-emerald-100 text-emerald-700">FREE-BOOK PICK</Badge>}
          </div>
        </div>
      </div>

      <dl className="mt-3 grid grid-cols-[5.5rem_1fr] gap-x-2 gap-y-0.5 border-t border-slate-100 pt-2 text-xs">
        <Row k="Format" v={cap(it.format)} />
        {it.language && <Row k="Language" v={cap(it.language)} />}
        {it.genre && <Row k="Genre" v={it.genre} />}
        {it.isbn10 && <Row k="ISBN" v={it.isbn10} />}
        {it.isbn13 && <Row k="ISBN13" v={it.isbn13} />}
        {it.releaseDate && <Row k="Release" v={fmtDate(it.releaseDate)} />}
        <Row k="Lists" v={listNames.join(', ') || '—'} />
      </dl>
    </div>
  )
}
