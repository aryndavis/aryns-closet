// Reading the day a photo was taken: every format the closet accepts, both byte orders, and files that
// lie, are cut short, or have no date at all (which must give null, never an error).
import { describe, expect, it } from 'vitest'
import { photoTakenOn } from './photoDate'

const TODAY = '2026-10-21'

/** A TIFF block with ASCII date tags in IFD0 and (optionally) an Exif sub-directory. */
function tiff({ little = true, ifd0 = {}, exif }: { little?: boolean; ifd0?: Record<number, string>; exif?: Record<number, string> }) {
  const bytes: number[] = []
  const u16 = (n: number) => (little ? [n & 255, n >> 8] : [n >> 8, n & 255])
  const u32 = (n: number) => (little ? [n & 255, (n >> 8) & 255, (n >> 16) & 255, n >>> 24] : [n >>> 24, (n >> 16) & 255, (n >> 8) & 255, n & 255])
  const ifd0Tags = Object.entries(ifd0).map(([tag, value]) => [Number(tag), value] as const)
  const exifTags = Object.entries(exif ?? {}).map(([tag, value]) => [Number(tag), value] as const)
  const ifd0Count = ifd0Tags.length + (exif ? 1 : 0)
  const ifd0Size = 2 + ifd0Count * 12 + 4
  const exifStart = 8 + ifd0Size
  const exifSize = exif ? 2 + exifTags.length * 12 + 4 : 0
  let data = exifStart + exifSize // where string values go
  const values: number[] = []
  const entry = (tag: number, value: string) => {
    const ascii = [...`${value}\0`].map((c) => c.charCodeAt(0))
    const at = data + values.length
    values.push(...ascii)
    return [...u16(tag), ...u16(2), ...u32(ascii.length), ...u32(at)]
  }
  bytes.push(...(little ? [0x49, 0x49] : [0x4d, 0x4d]), ...u16(42), ...u32(8))
  bytes.push(...u16(ifd0Count))
  for (const [tag, value] of ifd0Tags) bytes.push(...entry(tag, value))
  if (exif) bytes.push(...u16(0x8769), ...u16(4), ...u32(1), ...u32(exifStart))
  bytes.push(...u32(0))
  if (exif) {
    bytes.push(...u16(exifTags.length))
    for (const [tag, value] of exifTags) bytes.push(...entry(tag, value))
    bytes.push(...u32(0))
  }
  data = bytes.length
  return new Uint8Array([...bytes, ...values])
}

const be32 = (n: number) => [n >>> 24, (n >> 16) & 255, (n >> 8) & 255, n & 255]
const le32 = (n: number) => [n & 255, (n >> 8) & 255, (n >> 16) & 255, n >>> 24]
const text = (s: string) => [...s].map((c) => c.charCodeAt(0))

const jpeg = (block: Uint8Array) => {
  const app1 = [...text('Exif\0\0'), ...block]
  const length = app1.length + 2
  // SOI, an APP0 segment first (like real cameras), then APP1 Exif, then start of scan.
  return new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 4, 0, 0, 0xff, 0xe1, length >> 8, length & 255, ...app1, 0xff, 0xda])], { type: 'image/jpeg' })
}
const png = (block: Uint8Array) =>
  new Blob(
    [new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...be32(0), ...text('IHDR'), ...be32(0), ...be32(block.length), ...text('eXIf'), ...block, ...be32(0)])],
    { type: 'image/png' },
  )
const webp = (block: Uint8Array, prefixed = false) => {
  const payload = prefixed ? [...text('Exif\0\0'), ...block] : [...block]
  const pad = payload.length % 2 ? [0] : []
  const body = [...text('WEBP'), ...text('VP8 '), ...le32(0), ...text('EXIF'), ...le32(payload.length), ...payload, ...pad]
  return new Blob([new Uint8Array([...text('RIFF'), ...le32(body.length), ...body])], { type: 'image/webp' })
}

const ORIGINAL = { 0x9003: '2026:10:17 14:05:09' }

describe('photoTakenOn', () => {
  it.each([
    ['a JPEG (little-endian, like iPhone)', jpeg(tiff({ exif: ORIGINAL }))],
    ['a JPEG (big-endian, like many cameras)', jpeg(tiff({ little: false, exif: ORIGINAL }))],
    ['a PNG with an eXIf chunk', png(tiff({ exif: ORIGINAL }))],
    ['a WebP with an EXIF chunk', webp(tiff({ exif: ORIGINAL }))],
    ['a WebP whose EXIF starts with "Exif\\0\\0"', webp(tiff({ exif: ORIGINAL }), true)],
  ])('reads the date taken from %s', async (_name, file) => {
    expect(await photoTakenOn(file, TODAY)).toBe('2026-10-17')
  })

  it('prefers when the photo was taken over when the file was last edited', async () => {
    const file = jpeg(tiff({ ifd0: { 0x0132: '2026:10:20 09:00:00' }, exif: { 0x9003: '2026:10:17 14:05:09', 0x9004: '2026:10:18 10:00:00' } }))
    expect(await photoTakenOn(file, TODAY)).toBe('2026-10-17')
  })

  it('falls back to the digitized date, then the file date', async () => {
    expect(await photoTakenOn(jpeg(tiff({ exif: { 0x9004: '2026:10:18 10:00:00' } })), TODAY)).toBe('2026-10-18')
    expect(await photoTakenOn(jpeg(tiff({ ifd0: { 0x0132: '2026:10:19 09:00:00' } })), TODAY)).toBe('2026-10-19')
  })

  it.each([
    ['in the future', '2026:12:25 10:00:00'],
    ['blank', '0000:00:00 00:00:00'],
    ['not a real day', '2026:02:30 10:00:00'],
    ['from before digital cameras', '1970:01:01 00:00:00'],
    ['not a date at all', 'yesterday-ish ok'],
  ])('ignores a date that is %s', async (_name, value) => {
    expect(await photoTakenOn(jpeg(tiff({ exif: { 0x9003: value } })), TODAY)).toBeNull()
  })

  it('accepts a photo taken today', async () => {
    expect(await photoTakenOn(jpeg(tiff({ exif: { 0x9003: '2026:10:21 23:59:59' } })), TODAY)).toBe('2026-10-21')
  })

  it.each([
    ['a JPEG without EXIF', new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xda, 0, 2])], { type: 'image/jpeg' })],
    ['an empty file', new Blob([], { type: 'image/jpeg' })],
    ['a file that is not an image', new Blob([new Uint8Array(text('hello, not a photo'))], { type: 'image/png' })],
    ['EXIF without any date', jpeg(tiff({ ifd0: { 0x010f: 'Apple' } }))],
  ])('returns null for %s', async (_name, file) => {
    expect(await photoTakenOn(file, TODAY)).toBeNull()
  })

  it('never throws on a file that lies about its own structure', async () => {
    const block = tiff({ exif: ORIGINAL })
    const broken = [
      jpeg(block.slice(0, 12)), // cut off mid-directory
      jpeg(Object.assign(block.slice(), { 4: 0xff, 5: 0xff, 6: 0xff, 7: 0x7f })), // IFD offset far past the end
      jpeg(Object.assign(block.slice(), { 2: 7 })), // not TIFF's magic number
      new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 0xff, 0xff, 1, 2, 3])], { type: 'image/jpeg' }), // segment longer than the file
      png(block.slice(0, 5)),
      webp(block.slice(0, 3)),
    ]
    for (const file of broken) await expect(photoTakenOn(file, TODAY)).resolves.toBeNull()
  })
})
