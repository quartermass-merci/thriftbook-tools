// Generates placeholder extension icons (16/32/48/128) as solid PNGs with a
// simple "book + bookmark" motif. No external deps — pure Node builtins.
// Replace with real artwork in M6.
import { deflateSync } from 'node:zlib'
import { writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const outDir = join(projectRoot, 'public', 'icons')

const crcTable = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

function crc32(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii')
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const crcBuf = Buffer.alloc(4)
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0)
  return Buffer.concat([len, typeBuf, data, crcBuf])
}

function png(size) {
  const w = size
  const h = size
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0)
  ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // color type: RGBA
  const bg = [0x21, 0x2b, 0x4f] // deep indigo
  const fg = [0xf2, 0xe9, 0xd8] // cream "pages"
  const accent = [0xd9, 0x3e, 0x36] // red bookmark
  const raw = Buffer.alloc((w * 4 + 1) * h)
  let o = 0
  for (let y = 0; y < h; y++) {
    raw[o++] = 0 // filter: none
    for (let x = 0; x < w; x++) {
      const inBook = x > w * 0.22 && x < w * 0.78 && y > h * 0.18 && y < h * 0.82
      const inMark = x > w * 0.6 && x < w * 0.7 && y > h * 0.18 && y < h * 0.55
      let c = bg
      if (inBook) c = fg
      if (inMark) c = accent
      raw[o++] = c[0]
      raw[o++] = c[1]
      raw[o++] = c[2]
      raw[o++] = 255
    }
  }
  const idat = deflateSync(raw)
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))])
}

mkdirSync(outDir, { recursive: true })
for (const s of [16, 32, 48, 128]) {
  writeFileSync(join(outDir, `icon-${s}.png`), png(s))
  console.log(`wrote public/icons/icon-${s}.png`)
}
