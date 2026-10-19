// Prepares the on-device clothing scanner. Runs automatically before `npm run dev` and `npm run build`.
// 1. Downloads the segmentation model from Hugging Face at a pinned revision and checks each file's SHA-256.
// 2. Copies the ONNX Runtime WebAssembly files from node_modules, so nothing is loaded from a CDN at runtime.
// The model, revision, and hashes live in src/vision/model.json, which the scanner reads too.
// Files go under public/models/<revision>/ so a new revision never collides with a browser's cached copy.
import { createHash } from 'node:crypto'
import { copyFile, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const config = JSON.parse(await readFile(join(root, 'src/vision/model.json'), 'utf8'))
const { model: MODEL, revision: REVISION, files: FILES, ortFiles: ORT_FILES } = config
const modelsDir = join(root, 'public/models')

// Remove downloads from other (older) revisions.
await mkdir(modelsDir, { recursive: true })
for (const entry of await readdir(modelsDir)) {
  if (entry !== REVISION) await rm(join(modelsDir, entry), { recursive: true, force: true })
}

const sha256 = (buffer) => createHash('sha256').update(buffer).digest('hex')

async function hasValidFile(path, expected) {
  try {
    return sha256(await readFile(path)) === expected
  } catch {
    return false
  }
}

for (const [file, expected] of Object.entries(FILES)) {
  const target = join(modelsDir, REVISION, MODEL, file)
  if (await hasValidFile(target, expected)) continue
  const url = `https://huggingface.co/${MODEL}/resolve/${REVISION}/${file}`
  process.stdout.write(`Downloading ${MODEL}/${file}… `)
  // Give up on a stalled download instead of hanging `npm run dev` / `npm run build` forever.
  const response = await fetch(url, { signal: AbortSignal.timeout(10 * 60 * 1000) })
  if (!response.ok) throw new Error(`Download failed (${response.status}) for ${url}`)
  const buffer = Buffer.from(await response.arrayBuffer())
  if (sha256(buffer) !== expected) throw new Error(`Checksum mismatch for ${file}; refusing to use it.`)
  await mkdir(dirname(target), { recursive: true })
  await writeFile(target, buffer)
  console.log(`ok (${(buffer.length / 1e6).toFixed(1)} MB)`)
}

await mkdir(join(root, 'public/ort'), { recursive: true })
for (const file of ORT_FILES) {
  await copyFile(join(root, 'node_modules/onnxruntime-web/dist', file), join(root, 'public/ort', file))
}
