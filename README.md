# ThriftBooks Wishlist Enhancer

A local-only Chrome extension (Manifest V3) that augments the
[ThriftBooks](https://www.thriftbooks.com/list/) wishlist with the things the
native feature lacks:

1. Useful, visible **notifications** (best-effort, local).
2. **New vs. old** detection — newly-available + recently-added badges.
3. A unified **buyable** view across all sub-lists.
4. **Recent additions** browsing.
5. **Filter & sort** by genre / author / format (first-class, persistent).
6. **Price history** — is this price low or high?
7. **Free-Book Finder** — which wishlist books you can claim with your
   ReadingRewards free-book credit (≤ ~$7, configurable).

## Stack

React 19 · Vite 8 · TypeScript (strict) · Tailwind 4 · `@crxjs/vite-plugin`
(MV3) · uPlot (charts) · IndexedDB via `idb` (price time-series).

## Develop

```bash
npm install
npm run icons      # generate placeholder icons into public/icons/
npm run dev        # vite + crxjs (HMR)
# then: chrome://extensions → Developer mode → Load unpacked → select dist/
```

## Build

```bash
npm run build      # tsc && vite build  ->  dist/ (load unpacked, or zip for Web Store)
```

## Architecture

Three runtimes talk only through a typed message bus; a single `repo` is the
read/write API over storage.

- **Service worker** (`src/background/`) — owns `chrome.alarms` +
  `chrome.notifications` + orchestration. No DOM, no authenticated fetches.
- **Content script** (`src/content/`) — runs same-origin as the logged-in user;
  the only component that reads wishlist data (via a `DataSource` adapter:
  API-first, DOM fallback). Also mounts the in-page UI in a Shadow DOM.
- **UI surfaces** (`src/dashboard/`, `src/popup/`, `src/options/`) — React apps
  that read enriched data from the repo via the bus.

See the implementation plan for full detail. Selectors/endpoints for the
ThriftBooks site are centralized (and remotely overridable) so site changes are
quick to patch.

## Status

Scaffold (M0). Data layer and features land in M1–M6.
