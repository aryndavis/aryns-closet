import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ScanMessage, WorkerRequest } from './protocol'

/** Stands in for the scanner's Web Worker: records what the page sends and lets a test reply. */
class FakeWorker {
  static instances: FakeWorker[] = []
  sent: { request: WorkerRequest; transfer: Transferable[] }[] = []
  terminated = false
  private listeners = { message: new Set<(e: MessageEvent<ScanMessage>) => void>(), error: new Set<(e: ErrorEvent) => void>() }
  constructor() {
    FakeWorker.instances.push(this)
  }
  postMessage(request: WorkerRequest, transfer: Transferable[] = []) {
    this.sent.push({ request, transfer })
  }
  addEventListener(type: 'message' | 'error', listener: never) {
    this.listeners[type].add(listener)
  }
  removeEventListener(type: 'message' | 'error', listener: never) {
    this.listeners[type].delete(listener)
  }
  terminate() {
    this.terminated = true
  }
  reply(message: ScanMessage) {
    for (const listener of [...this.listeners.message]) listener({ data: message } as MessageEvent<ScanMessage>)
  }
  crash(message: string) {
    for (const listener of [...this.listeners.error]) listener({ message } as ErrorEvent)
  }
  get listenerCount() {
    return this.listeners.message.size + this.listeners.error.size
  }
}

const photo = new Blob(['jpeg'], { type: 'image/jpeg' })
let bitmap: { close: ReturnType<typeof vi.fn> }
const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

async function loadScanner() {
  vi.resetModules() // the scanner keeps one worker per page; start each test with none
  return import('./scanner')
}

beforeEach(() => {
  FakeWorker.instances = []
  bitmap = { close: vi.fn() }
  vi.stubGlobal('Worker', FakeWorker)
  vi.stubGlobal('createImageBitmap', vi.fn(async () => bitmap))
})
afterEach(() => vi.unstubAllGlobals())

describe('scanOutfit: the happy path', () => {
  it('sends the decoded photo to the worker, reports progress, and resolves with the result', async () => {
    // Arrange
    const { scanOutfit } = await loadScanner()
    const progress = vi.fn()

    // Act
    const scan = scanOutfit(photo, progress)
    await flush()
    const worker = FakeWorker.instances[0]
    const { request, transfer } = worker.sent[0]
    worker.reply({ id: request.id, type: 'progress', stage: 'loading-model', percent: 40 })
    worker.reply({ id: request.id, type: 'result', detections: [], rejections: [{ kind: 'hat', reason: 'too small' }] })

    // Assert
    await expect(scan).resolves.toEqual({ detections: [], rejections: [{ kind: 'hat', reason: 'too small' }] })
    expect(request).toMatchObject({ type: 'scan', image: bitmap })
    expect(transfer).toEqual([bitmap]) // transferred, not copied
    expect(progress).toHaveBeenCalledWith({ stage: 'loading-model', percent: 40 })
    expect(worker.listenerCount).toBe(0) // cleaned up
  })

  it('reuses one worker and ignores replies meant for other scans', async () => {
    const { scanOutfit } = await loadScanner()
    const first = scanOutfit(photo, () => {})
    const second = scanOutfit(photo, () => {})
    await flush()
    const worker = FakeWorker.instances[0]
    const [a, b] = worker.sent.map((s) => s.request.id)
    expect(FakeWorker.instances).toHaveLength(1)
    expect(a).not.toBe(b)

    worker.reply({ id: b, type: 'result', detections: [], rejections: [] })
    worker.reply({ id: a, type: 'error', message: 'nope' })

    await expect(second).resolves.toEqual({ detections: [], rejections: [] })
    await expect(first).rejects.toThrow('nope')
  })
})

describe('scanOutfit: when things go wrong', () => {
  it('rejects with the worker’s error message', async () => {
    const { scanOutfit } = await loadScanner()
    const scan = scanOutfit(photo, () => {})
    await flush()
    const worker = FakeWorker.instances[0]
    worker.reply({ id: worker.sent[0].request.id, type: 'error', message: 'The clothing scanner hit a snag' })
    await expect(scan).rejects.toThrow('The clothing scanner hit a snag')
    expect(worker.listenerCount).toBe(0)
  })

  it('throws away a crashed worker and starts a fresh one for the next scan', async () => {
    const { scanOutfit } = await loadScanner()
    const scan = scanOutfit(photo, () => {})
    await flush()
    FakeWorker.instances[0].crash('')

    await expect(scan).rejects.toThrow('The clothing scanner stopped unexpectedly.')
    expect(FakeWorker.instances[0].terminated).toBe(true)

    scanOutfit(photo, () => {})
    await flush()
    expect(FakeWorker.instances).toHaveLength(2)
  })

  it('explains a file that is not a readable photo, and never bothers the worker', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn(async () => Promise.reject(new DOMException('bad', 'InvalidStateError'))))
    const { scanOutfit } = await loadScanner()
    await expect(scanOutfit(photo, () => {})).rejects.toThrow('That file couldn’t be read as a photo.')
    expect(FakeWorker.instances[0].sent).toEqual([])
    expect(FakeWorker.instances[0].listenerCount).toBe(0)
  })
})

describe('scanOutfit: cancelling', () => {
  it('rejects right away if already cancelled, without starting a worker', async () => {
    const { scanOutfit, isScanCancelled } = await loadScanner()
    const controller = new AbortController()
    controller.abort()
    const error = await scanOutfit(photo, () => {}, controller.signal).catch((e) => e)
    expect(isScanCancelled(error)).toBe(true)
    expect(FakeWorker.instances).toHaveLength(0)
  })

  it('tells the worker to stop when cancelled mid-scan, and ignores its late result', async () => {
    const { scanOutfit, isScanCancelled } = await loadScanner()
    const controller = new AbortController()
    const outcome = scanOutfit(photo, () => {}, controller.signal).catch((e) => e)
    await flush()
    const worker = FakeWorker.instances[0]
    const id = worker.sent[0].request.id

    controller.abort()
    worker.reply({ id, type: 'result', detections: [], rejections: [] })

    expect(isScanCancelled(await outcome)).toBe(true)
    expect(worker.sent[1].request).toEqual({ type: 'cancel', id })
    expect(worker.listenerCount).toBe(0)
  })

  it('releases the decoded photo if cancelled while it was still decoding', async () => {
    let finishDecoding!: (value: unknown) => void
    vi.stubGlobal('createImageBitmap', vi.fn(() => new Promise((resolve) => (finishDecoding = resolve))))
    const { scanOutfit, isScanCancelled } = await loadScanner()
    const controller = new AbortController()
    const outcome = scanOutfit(photo, () => {}, controller.signal).catch((e) => e)

    controller.abort()
    finishDecoding(bitmap)
    await flush()

    expect(isScanCancelled(await outcome)).toBe(true)
    expect(bitmap.close).toHaveBeenCalled()
    expect(FakeWorker.instances[0].sent).toEqual([]) // nothing to cancel: the scan never started
  })
})
