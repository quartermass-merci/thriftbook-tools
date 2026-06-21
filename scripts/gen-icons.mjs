// Generates the extension icons (16/32/48/128) by cropping the books+gears mark
// out of the "thriftbook tools" logo SVG and rasterizing it (transparent bg).
import { Resvg } from '@resvg/resvg-js'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const SRC = '/Users/smadmin/Downloads/Franklin Gothic (500 x 200 px)/1.svg'
const outDir = join(root, 'public', 'icons')
mkdirSync(outDir, { recursive: true })

// Square crop around the mark, in the logo's 0 0 375 150 user units (x y w h).
const CROP = '-10 22 120 120'
let svg = readFileSync(SRC, 'utf8')
svg = svg
  .replace(/viewBox="[^"]*"/, `viewBox="${CROP}"`)
  .replace(/width="[^"]*"/, 'width="120"')
  .replace(/height="[^"]*"/, 'height="120"')

for (const size of [16, 32, 48, 128]) {
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: size } }).render().asPng()
  writeFileSync(join(outDir, `icon-${size}.png`), png)
}
console.log('wrote icons 16/32/48/128 from logo mark')
