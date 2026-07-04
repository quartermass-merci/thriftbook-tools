# Thriftbook Tools

An **unofficial** Chrome extension (Manifest V3) that turns your
[ThriftBooks](https://www.thriftbooks.com) wishlist into a real book-hunting
dashboard — filters, price history, a free-book finder, a deals scanner, and
dedupe. Everything runs locally in your browser; nothing leaves your device.

> ⚠️ **Unofficial.** Not affiliated with, endorsed by, or sponsored by
> ThriftBooks. "ThriftBooks" is a trademark of its owner. Use at your own risk.

## Features
- **Dashboard** — every sub-list in one fast, sortable table or a cover gallery.
- **Filters & sort** — author, curated category, publisher, format, condition,
  language, availability, price; multi-key sort; per-column show/hide.
- **Price history** — sparklines + a Great / Typical / High read on each in-stock book.
- **Freshness** — "New" and "Back in stock" badges so you can pounce on rare titles.
- **Free-book finder** — in-stock books within your ReadingRewards credit, ranked by value.
- **Discover** — find books you don't own yet, by the authors, presses, and genres you collect.
- **Collection finder** — pull a whole publisher's or author's catalog (via Open Library) and see what's buyable on ThriftBooks.
- **Deals scanner** — surface ThriftBooks Deal (volume-discount) titles that match your taste.
- **Dedupe** — find and clean duplicate titles on your list.
- **Notifications** — optional back-in-stock / price-drop alerts.

## Privacy
Everything is stored locally via `chrome.storage.local` — no analytics, no tracking,
and it never sees your password. The only external requests are to ThriftBooks (your
own logged-in session) and, when you use the publisher/author finder, to Open Library
(only the name you type is sent). See **[PRIVACY.md](./PRIVACY.md)**.

## Tech
React 19 · Vite · TypeScript (strict) · Tailwind CSS 4 · `@crxjs/vite-plugin`.
Type: Libre Franklin (display) + EB Garamond (body) + DM Mono (numbers).

## Develop
```bash
npm install
npm run dev      # live-reload dev build into dist/
npm run build    # production build -> dist/
npm test         # unit tests
npm run icons    # regenerate toolbar icons from the logo
```

## Install from source
1. `npm install && npm run build`
2. Visit `chrome://extensions`, enable **Developer mode**, click **Load unpacked**, and select the `dist/` folder.
3. Open your ThriftBooks wishlist; the toolbar icon opens the dashboard.

## License
MIT
