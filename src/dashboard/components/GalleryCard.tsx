import type { ReactNode } from 'react'
import type { WishlistItem, ItemState } from '@/shared/types'
import { isFreeBookEligible } from '@/shared/types'
import { formatCents } from '@/shared/util/money'
import { fmtDate } from '@/shared/util/date'
import { categorize } from '@/shared/taxonomy'
import { normalizePublisher } from '@/shared/util/publisher'

const cap = (s?: string) => (s ? s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : '—')

function Badge({ cls, children }: { cls: string; children: ReactNode }) {
  return <span className={`inline-block rounded px-1.5 py-0.5 text-[12px] font-semibold ${cls}`}>{children}</span>
}
function Row({ k, v, mono }: { k: string; v: ReactNode; mono?: boolean }) {
  return (
    <>
      <dt className="font-semibold text-muted">{k}</dt>
      <dd className={`truncate text-ink${mono ? ' font-mono tabular-nums' : ''}`}>{v}</dd>
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
  const category = categorize(it)

  return (
    <div className="relative flex flex-col rounded-lg border border-line bg-surface p-3 shadow-sm transition hover:shadow-md">
      <button
        onClick={() => onDelete(it)}
        disabled={busy}
        title="Delete from wishlist"
        aria-label={`Delete ${it.title} from wishlist`}
        className="absolute right-1.5 top-1.5 rounded p-1.5 text-faint hover:bg-cream hover:text-ink disabled:opacity-40"
      >
        {busy ? '…' : '🗑'}
      </button>

      <div className="flex gap-3">
        <div className="basis-1/2 shrink-0">
          {it.coverImageUrl ? (
            <img src={it.coverImageUrl} alt="" className="h-auto w-full rounded object-contain shadow-sm" loading="lazy" />
          ) : (
            <div className="aspect-[2/3] w-full rounded bg-cream/50" />
          )}
        </div>
        <div className="flex min-w-0 flex-1 flex-col pr-5">
          <a
            href={it.productUrl}
            target="_blank"
            rel="noreferrer"
            className="block font-display text-lg font-bold leading-tight text-ink hover:text-teal-700"
          >
            {it.title}
          </a>
          <div className="mt-0.5 text-[15px] font-medium text-muted">{it.author ?? '—'}</div>
          <div className="mt-2">
            {inStock ? (
              <div>
                <span className="text-[13px] text-muted">{cap(it.offerCondition)}</span>
                <span className="ml-1.5 font-mono text-lg font-bold tabular-nums text-ink">{formatCents(it.lowestPriceCents)}</span>
              </div>
            ) : (
              <div className="text-[15px] font-medium text-faint">
                Out of stock{it.othersWatching ? ` · ${it.othersWatching} watching` : ''}
              </div>
            )}
          </div>
          <div className="mt-1.5 flex flex-wrap gap-1">
            {back && <Badge cls="bg-accent text-ink">BACK IN STOCK</Badge>}
            {isNew && <Badge cls="bg-teal/10 text-teal-700">NEW</Badge>}
            {free && <Badge cls="bg-accent text-ink">FREE-BOOK PICK</Badge>}
          </div>
        </div>
      </div>

      <dl className="mt-3 grid grid-cols-[5.5rem_1fr] gap-x-2 gap-y-1 border-t border-line pt-2 text-[13px]">
        <Row k="Format" v={cap(it.format)} />
        {it.language && <Row k="Language" v={cap(it.language)} />}
        {category && <Row k="Category" v={category} />}
        {it.publisher && <Row k="Publisher" v={normalizePublisher(it.publisher)} />}
        {it.isbn10 && <Row k="ISBN" v={it.isbn10} mono />}
        {it.isbn13 && <Row k="ISBN13" v={it.isbn13} mono />}
        {it.releaseDate && <Row k="Release" v={fmtDate(it.releaseDate)} mono />}
        <Row k="Lists" v={listNames.join(', ') || '—'} />
      </dl>
    </div>
  )
}
