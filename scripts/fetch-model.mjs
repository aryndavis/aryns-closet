// Prepares the on-device clothing scanner. Runs automatically before `npm run dev` and `npm run build`.
// 1. Downloads the segmentation model from Hugging Face at a pinned revision and checks each file's SHA-256.
// 2. Copies the ONNX Runtime WebAssembly files from node_modules, so nothing is loaded from a CDN at runtime.
import { createHash } from 'node:crypto'
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const MODEL = 'Xenova/segformer_b0_clothes'
const REVISION = 'a2489ea8e7ec1ee912190546bad31a4906ccca76'
const FILES = {
  'config.json': '627e2743a73957d0445b5796c4c533435d5d5b049218580909aa3c4a13997cd0',
  'preprocessor_config.json': 'e5a25d8fc054bf780be930e161b47d188bec1b0bf0a44fd5fdfb3f3312c0be0b',
  'onnx/model.onnx': '02e6f1545475bc549184b6710487555b4b73eb08354cc3a480fb4fab1473a9d3',
}
const ORT_FILES = ['ort-wasm-simd-threaded.mjs', 'ort-wasm-simd-threaded.wasm']

const sha256 = (buffer) => createHash('sha256').update(buffer).digest('hex')

async function hasValidFile(path, expected) {
  try {
    return sha256(await readFile(path)) === expected
  } catch {
    return false
  }
}

for (const [file, expected] of Object.entries(FILES)) {
  const target = join(root, 'public/models', MODEL, file)
  if (await hasValidFile(target, expected)) continue
  const url = `https://huggingface.co/${MODEL}/resolve/${REVISION}/${file}`
  process.stdout.write(`Downloading ${MODEL}/${file}… `)
  const response = await fetch(url)
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
