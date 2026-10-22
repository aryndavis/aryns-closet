// Reads the day a photo was taken from its EXIF metadata, so a new outfit can default to that date.
// Only the date is read. preparePhoto() then redraws the image, which drops all metadata (GPS included),
// so nothing else from the original file is ever kept.

/** EXIF tags, by number. */
const TAG = { exifIfd: 0x8769, dateTime: 0x0132, dateTimeOriginal: 0x9003, dateTimeDigitized: 0x9004 } as const

/** JPEG keeps EXIF near the start; this is plenty and avoids reading a 25 MB file just for a date. */
const JPEG_HEAD_BYTES = 256 * 1024

/**
 * The day the photo was taken, as 'YYYY-MM-DD', or null if it doesn't say (or says something impossible).
 * The date is the camera's local date, which is the day the outfit was worn. Never throws.
 */
export async function photoTakenOn(file: Blob, today: string): Promise<string | null> {
  try {
    const head = new DataView(await file.slice(0, JPEG_HEAD_BYTES).arrayBuffer())
    let tiff: DataView | null = null
    if (head.byteLength >= 2 && head.getUint16(0) === 0xffd8) tiff = jpegExif(head)
    else if (isPng(head)) tiff = pngExif(new DataView(await file.arrayBuffer()))
    else if (isWebp(head)) tiff = webpExif(new DataView(await file.arrayBuffer()))
    const taken = tiff && takenDate(tiff)
    return taken && isPlausible(taken, today) ? taken : null
  } catch {
    return null
  }
}

const ascii = (view: DataView, offset: number, length: number) =>
  String.fromCharCode(...Array.from({ length }, (_, i) => view.getUint8(offset + i)))

const sub = (view: DataView, offset: number, length: number) => new DataView(view.buffer, view.byteOffset + offset, length)

/** The TIFF block inside a JPEG's APP1 "Exif" segment. */
function jpegExif(view: DataView): DataView | null {
  let offset = 2
  while (offset + 4 <= view.byteLength) {
    if (view.getUint8(offset) !== 0xff) return null
    const marker = view.getUint8(offset + 1)
    if (marker === 0xda || marker === 0xd9) return null // image data starts: no EXIF before it
    const length = view.getUint16(offset + 2)
    if (length < 2 || offset + 2 + length > view.byteLength) return null
    if (marker === 0xe1 && length >= 8 && ascii(view, offset + 4, 6) === 'Exif\0\0') return sub(view, offset + 10, length - 8)
    offset += 2 + length
  }
  return null
}

const isPng = (view: DataView) => view.byteLength >= 8 && view.getUint32(0) === 0x89504e47 && view.getUint32(4) === 0x0d0a1a0a

/** PNG's eXIf chunk holds a bare TIFF block. */
function pngExif(view: DataView): DataView | null {
  let offset = 8
  while (offset + 8 <= view.byteLength) {
    const length = view.getUint32(offset)
    const type = ascii(view, offset + 4, 4)
    if (offset + 12 + length > view.byteLength) return null
    if (type === 'eXIf') return sub(view, offset + 8, length)
    if (type === 'IDAT' || type === 'IEND') return null // EXIF must come before the image data
    offset += 12 + length
  }
  return null
}

const isWebp = (view: DataView) => view.byteLength >= 12 && ascii(view, 0, 4) === 'RIFF' && ascii(view, 8, 4) === 'WEBP'

/** WebP's EXIF chunk holds a TIFF block, sometimes with JPEG's "Exif\0\0" prefix. */
function webpExif(view: DataView): DataView | null {
  let offset = 12
  while (offset + 8 <= view.byteLength) {
    const type = ascii(view, offset, 4)
    const length = view.getUint32(offset + 4, true)
    if (offset + 8 + length > view.byteLength) return null
    if (type === 'EXIF') {
      const prefixed = length >= 6 && ascii(view, offset + 8, 6) === 'Exif\0\0'
      return prefixed ? sub(view, offset + 14, length - 6) : sub(view, offset + 8, length)
    }
    offset += 8 + length + (length % 2) // chunks are padded to an even length
  }
  return null
}

/** DateTimeOriginal, then DateTimeDigitized, then the file's DateTime, as 'YYYY-MM-DD'. */
function takenDate(tiff: DataView): string | null {
  if (tiff.byteLength < 8) return null
  const order = ascii(tiff, 0, 2)
  if (order !== 'II' && order !== 'MM') return null
  const little = order === 'II'
  const u16 = (offset: number) => tiff.getUint16(offset, little)
  const u32 = (offset: number) => tiff.getUint32(offset, little)
  if (u16(2) !== 42) return null

  /** A directory's entries as tag → [type, count, offset of the value or its pointer]. */
  const entries = (dir: number) => {
    const found = new Map<number, { type: number; count: number; at: number }>()
    if (dir + 2 > tiff.byteLength) return found
    const total = u16(dir)
    for (let i = 0; i < total && dir + 2 + i * 12 + 12 <= tiff.byteLength; i++) {
      const at = dir + 2 + i * 12
      found.set(u16(at), { type: u16(at + 2), count: u32(at + 4), at: at + 8 })
    }
    return found
  }
  const text = (entry?: { type: number; count: number; at: number }) => {
    if (!entry || entry.type !== 2 || entry.count < 10) return null // ASCII, at least 'YYYY:MM:DD'
    const start = entry.count > 4 ? u32(entry.at) : entry.at
    if (start + entry.count > tiff.byteLength) return null
    const match = /^(\d{4}):(\d{2}):(\d{2})/.exec(ascii(tiff, start, Math.min(entry.count, 19)))
    return match ? `${match[1]}-${match[2]}-${match[3]}` : null
  }

  const ifd0 = entries(u32(4))
  const exifPointer = ifd0.get(TAG.exifIfd)
  const exif = exifPointer ? entries(u32(exifPointer.at)) : new Map()
  return text(exif.get(TAG.dateTimeOriginal)) ?? text(exif.get(TAG.dateTimeDigitized)) ?? text(ifd0.get(TAG.dateTime))
}

/** A real calendar date, not in the future, and not from before digital cameras (or a blank '0000:00:00'). */
function isPlausible(date: string, today: string) {
  const [year, month, day] = date.split('-').map(Number)
  const parsed = new Date(Date.UTC(year, month - 1, day))
  const real = parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day
  return real && year >= 1990 && date <= today
}
