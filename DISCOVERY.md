# ThriftBooks Wishlist — Discovery Findings

Reverse-engineered live (logged in as Paul) on 2026-06-19. This is the spec the
data adapter is built against. ThriftBooks is a **Next.js** app (App Router +
Turbopack) with a .NET/JSON backend model surfaced in the page.

## TL;DR — the data source

There is a clean, credentialed JSON API:

```
GET https://www.thriftbooks.com/api/list/get/{idList}/?sorting=3&pageNum={n}&itemsPerPage=25
```

- Returns `{ "ListItems": RawListItem[], "PageNum": number }` (PascalCase, .NET style).
- **`itemsPerPage` is capped at 25 server-side** (requesting 500 still returns 25) → must paginate: fetch `pageNum=1,2,…` until a page returns `< 25` items.
- `sorting=3` is the default (Date Added, newest). We sort client-side anyway, so any stable value works.
- Must be called **same-origin with cookies** (`credentials:'include'`). → the **content script** is the fetcher (a service-worker fetch from `chrome-extension://` would need CORS the API doesn't grant). Background sync therefore needs a thriftbooks tab/offscreen context (see Architecture).

## List enumeration

Every list-view page embeds a hydration script:

```js
ReactDOM.hydrate(React.createElement(DesktopWishList.Index, { idList, listItems, otherLists, … }))
```

Parse the object literal after `DesktopWishList.Index, ` (string-aware brace match). Top-level keys:
`idList, listItems, otherLists, sharedWithMeLists, listSettings, shareUrl, sort, totalPages, currentPage, totalItems, itemsPerPage, userIsLoggedIn`.

- **`otherLists[]`** = every list the user owns: `{ IdList, ListName, IsDefault, IdPrivacy, CreatedDate }`.
- **`sharedWithMeLists[]`** = lists shared with the user (same idea).
- `totalItems` / `totalPages` give the per-list count (the `/api/list/get` response itself does NOT include a total — page until short, or read these).
- `listSettings.ListName`, `.IsDefault`, owner name, etc.

So: fetch one list-view HTML once → enumerate all list ids → hit `/api/list/get/{id}/` per list.

Paul's lists (snapshot): `9007850 "Wish List"` (default, **empty**), `12047607 Ballard`, `12047603 Dalkey Archives`, `12048063 Genre`, `12071856 Ideas`, `12047615 "It's Lit"`, `12048052 New Directions`, `12047595 Verso`. Plus system lists at `/list/want-to-read/` and `/list/already-read/` (slug URLs, not in `otherLists` — handle separately later).

## RawListItem shape (per item)

```jsonc
{
  "IdListItem": 117692491,        // unique row id within the list
  "IdWork": 701820,               // product/work id → /w/{CleanUrl}/{IdWork}/
  "Isbn": "0007272340",           // ISBN-10
  "Isbn13": "9780007272341",
  "CleanUrl": "miracles-of-life_jg-ballard",
  "WorkUrl": "…",                 // full product URL
  "Title": "MIRACLES OF LIFE PB", // NOTE: list titles are UPPERCASE + format suffix (PB/HC)
  "Format": "Paperback",
  "ImageUrl": "https://i.thriftbooks.com/api/imagehandler/…",
  "HasAddToCart": true,           // ← AVAILABILITY (true = in stock)
  "AddToCartPrice": 11.39,        // ← PRICE in DOLLARS (float); 0 when OOS  → ×100 = cents
  "AddToCartQuantityAvailable": 2,// stock count
  "AddToCartItemCondition": "Very Good",
  "AddToCartItemQuality": "Very Good",
  "AddToCartItemLanguage": "english",
  "AddToCartItemIsLP": false,     // large print
  "AddToCartItemIsExLib": false,
  "AddToCartItemIsMissingDustJacket": false,
  "BestValue": true,
  "DateAdded": "2026-06-18T13:44:17.79",   // ← native "recently added"
  "OthersWatching": 6,            // ← COMPETITION signal (esp. for OOS rare books)
  "CopiesPerMonth": 0,            // ← rarity/velocity (0 = very rare)
  "MaxPrice": null,               // (inside Filters) user's price-alert threshold
  "WantsInstantEmail": false,     // ← ThriftBooks' native per-item alert prefs
  "WantsWeeklyEmail": true,       //   (the "instant notifications" the user says don't work)
  "ReleaseDate": "4/10/2014 12:00:00 AM",
  "OnSaleDate": "0001-01-01T00:00:00",      // "0001-…" = none
  "IsBackorder": false, "IsUnreleased": false,
  "NumOtherMatchingIsbns": 0, "NumOtherNonMatchingIsbns": 2,
  "Filters": { "Isbn": "…", "Formats": [], "Conditions": [], "IsLargePrint": false, "MaxPrice": null },
  "Authors": [ { "IdAuthor": 1573755, "AuthorName": "J.G. Ballard", "AuthorCleanUrl": "jg-ballard", "AuthorSalesRank": … } ]
}
```

**Field → WishlistItem mapping:**
- `id` ← prefer `Isbn13`, else `IdWork` (string). Keep `IdWork` as `productId`, `IdListItem` for move/delete later.
- `availability` ← `HasAddToCart ? 'in_stock' : 'out_of_stock'`.
- `lowestPriceCents` ← `Math.round(AddToCartPrice * 100)` when in stock (ignore 0/OOS).
- `format` ← map `Format` ("Paperback"→paperback, etc.); `condition` ← `AddToCartItemCondition`.
- `author` ← `Authors[0].AuthorName`; `genres` ← none on the API (needs product page enrich — defer).
- `coverImageUrl` ← `ImageUrl`; `productUrl` ← `/w/{CleanUrl}/{IdWork}/`.
- `firstSeen`/recent ← `DateAdded` (no diffing needed for "recently added"!).
- Bonus fields to surface: `OthersWatching`, `CopiesPerMonth`, `AddToCartQuantityAvailable`, `MaxPrice`, `WantsInstantEmail/WeeklyEmail`.

## Pagination

Client-side; the app calls `/api/list/get/{id}/?...&pageNum=N`. URL/query on the page itself does NOT carry the page (`?page=2` etc. are ignored). The rendered pager is `.Pagination-bar` (arrows `.Pagination-link.is-right.is-link` + a `.Pagination-input`). For the adapter: just loop `pageNum` on the API until `< 25` returned.

## Native sort (baseline for "their sort is too limited")

Per-list dropdown offers: Author A-Z / Z-A, Date Added newest / oldest, Price low-high / high-low, Quality best / worst, Title A-Z / Z-A. Limitation = **per-list only, no cross-sub-list sort, no combining with filters.** Our first-class multi-key + cross-list sort is the fix.

## DOM fallback (if the API/hydrate shape ever changes)

Server-rendered list markup (hydrated client-side; may need a visible/idle tab to be present):
- Container: `.WishList-List`; each item = a child `div` containing `a[href*="/w/"]`.
- Title/author = the text `a` links (author link is `/a/{slug}/{idAuthor}/`).
- `span.bold` leaves: ISBN-10 (`/^\d{10}$/`), ISBN-13 (`/^\d{13}$/`).
- In stock: `div.price` (e.g. "11.39") preceded by `$` span; `Format:`/`Condition:` → `span.bold`; `<p>"N Available"`; `button.Button` "Add to Cart".
- OOS: `div.tb-BreadCrumbs` "Out of Stock" + "Others Watching This Item: N".
- Per-item notif toggles: `div.Checkbox-label.bold` "Weekly"/"Instant". Cover: `img.WishList-ItemImage`.

## Gotchas / notes

- The default **"Wish List" is empty**; the user's books live in the named/shared lists. Don't assume the default list.
- `/list/` and `/list/view/{id}/` also render a **"Based on Your Recent Browsing"** recommendations slider (`.BookSliderDesktop`, `.BookSlide-Title/.BookSlide-Author`) — **exclude it** (it is NOT wishlist data).
- Shared-list nav links on `/list/` use base64 share tokens, but the canonical view URL is `/list/view/{numericId}/` (ids come from `otherLists`).
- Images lazy-load (`img.lazyload`) — `ImageUrl` from the API is the reliable source.
- Item `Title` from the API/list is UPPERCASE with a format suffix (e.g. "MIRACLES OF LIFE PB"); the product slug `CleanUrl` is cleaner for display if desired.

## Architecture implication (confirms the plan)

The content script (same-origin, logged-in) is the only reliable fetcher of `/api/list/get`. For background sync without a visible tab, the service worker must use an **offscreen document** loading thriftbooks, or open a `/list/` tab (the opt-in background-tab sync). Genre enrichment + richer per-condition pricing still need the product page (`/w/.../{id}/`) — deferred lazy-enrich.
