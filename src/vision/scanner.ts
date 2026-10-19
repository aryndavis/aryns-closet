import type { Detection, Rejection, ScanMessage, WorkerRequest } from './protocol'

export type ScanProgress = { stage: 'loading-model' | 'scanning'; percent: number | null }

let worker: Worker | null = null
let nextId = 1

/** True for the rejection of a scan that was cancelled through its AbortSignal. */
export const isScanCancelled = (error: unknown) => error instanceof DOMException && error.name === 'AbortError'

/**
 * Finds clothing in a photo, on this device. The model (~15 MB) downloads from this site the first time.
 * Aborting `signal` cancels the scan: the worker skips its remaining work and the promise rejects with an AbortError.
 */
export function scanOutfit(
  photo: Blob,
  onProgress: (progress: ScanProgress) => void,
  signal?: AbortSignal,
): Promise<{ detections: Detection[]; rejections: Rejection[] }> {
  if (signal?.aborted) return Promise.reject(new DOMException('Scan cancelled', 'AbortError'))
  worker ??= new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })
  const id = nextId++
  const active = worker
  const send = (request: WorkerRequest, transfer: Transferable[] = []) => active.postMessage(request, transfer)

  return new Promise((resolve, reject) => {
    let sent = false
    const stopListening = () => {
      active.removeEventListener('message', onMessage)
      active.removeEventListener('error', onError)
      signal?.removeEventListener('abort', onAbort)
    }
    const onMessage = (event: MessageEvent<ScanMessage>) => {
      const message = event.data
      if (message.id !== id) return
      if (message.type === 'progress') return onProgress({ stage: message.stage, percent: message.percent })
      stopListening()
      if (message.type === 'result') resolve({ detections: message.detections, rejections: message.rejections })
      else reject(new Error(message.message))
    }
    const onError = (event: ErrorEvent) => {
      stopListening()
      worker = null
      active.terminate()
      reject(new Error(event.message || 'The clothing scanner stopped unexpectedly.'))
    }
    const onAbort = () => {
      stopListening()
      if (sent) send({ type: 'cancel', id })
      reject(new DOMException('Scan cancelled', 'AbortError'))
    }
    active.addEventListener('message', onMessage)
    active.addEventListener('error', onError)
    signal?.addEventListener('abort', onAbort, { once: true })

    createImageBitmap(photo, { imageOrientation: 'from-image' })
      .then(
        (image) => {
          if (signal?.aborted) return image.close()
          send({ type: 'scan', id, image }, [image])
          sent = true
        },
        () => {
          throw new Error('That file couldn’t be read as a photo.')
        },
      )
      .catch((error: unknown) => {
        // No reply will come for this id, so don't leave its listeners on the shared worker.
        stopListening()
        reject(error instanceof Error ? error : new Error(String(error)))
      })
  })
}
