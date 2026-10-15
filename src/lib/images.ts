/** Largest side of a stored outfit photo. Phone photos are often 4000px+; this keeps uploads quick. */
const MAX_SIDE = 1600

export const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp']
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024

/**
 * Re-encodes a photo as a JPEG no larger than 1600px. Redrawing it also strips EXIF metadata,
 * including the GPS location phones embed in photos, so it never gets stored or shared.
 */
export async function preparePhoto(file: Blob): Promise<Blob> {
  if (!ACCEPTED_TYPES.includes(file.type)) throw new Error('Please choose a JPEG, PNG, or WebP photo. (iPhone HEIC photos can be shared as JPEG.)')
  if (file.size > MAX_UPLOAD_BYTES) throw new Error('That photo is over 25 MB. Try a smaller one.')
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' }).catch(() => {
    throw new Error('That file couldn’t be opened as a photo.')
  })
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Couldn’t process that photo.'))), 'image/jpeg', 0.86),
  )
}
