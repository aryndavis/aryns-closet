import type { Detection, Rejection, ScanMessage } from './protocol'

export type ScanProgress = { stage: 'loading-model' | 'scanning'; percent: number | null }

let worker: Worker | null = null
let nextId = 1

/** Finds clothing in a photo, on this device. The model (~15 MB) downloads from this site the first time. */
export function scanOutfit(photo: Blob, onProgress: (progress: ScanProgress) => void): Promise<{ detections: Detection[]; rejections: Rejection[] }> {
  worker ??= new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })
  const id = nextId++
  const active = worker

  return new Promise((resolve, reject) => {
    const onMessage = (event: MessageEvent<ScanMessage>) => {
      const message = event.data
      if (message.id !== id) return
      if (message.type === 'progress') return onProgress({ stage: message.stage, percent: message.percent })
      active.removeEventListener('message', onMessage)
      active.removeEventListener('error', onError)
      if (message.type === 'result') resolve({ detections: message.detections, rejections: message.rejections })
      else reject(new Error(message.message))
    }
    const onError = (event: ErrorEvent) => {
      active.removeEventListener('message', onMessage)
      active.removeEventListener('error', onError)
      worker = null
      active.terminate()
      reject(new Error(event.message || 'The clothing scanner stopped unexpectedly.'))
    }
    active.addEventListener('message', onMessage)
    active.addEventListener('error', onError)

    createImageBitmap(photo, { imageOrientation: 'from-image' })
      .then((image) => active.postMessage({ id, image }, [image]))
      .catch(() => reject(new Error('That file couldn’t be read as a photo.')))
  })
}
