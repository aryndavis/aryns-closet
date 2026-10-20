import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  // The app may only talk to itself and your Supabase project. The clothing model runs locally.
  const supabaseOrigin = env.VITE_SUPABASE_URL?.startsWith('https://') ? new URL(env.VITE_SUPABASE_URL).origin : ''

  const csp = [
    "default-src 'self'",
    // 'wasm-unsafe-eval' lets the browser compile the clothing model's WebAssembly runtime (no JS eval).
    "script-src 'self' 'wasm-unsafe-eval'",
    "worker-src 'self'",
    "style-src 'self'",
    // blob: shows photos you've just picked or stored in demo mode; Supabase serves signed photo URLs.
    `img-src 'self' blob: ${supabaseOrigin}`.trim(),
    "font-src 'self'",
    `connect-src 'self' ${supabaseOrigin}`.trim(),
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ')

  const securityHeaders: Record<string, string> = {
    'Content-Security-Policy': csp,
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
    'X-Frame-Options': 'DENY',
    'Cross-Origin-Opener-Policy': 'same-origin',
    'X-Robots-Tag': 'noindex',
  }

  // Writes dist/_headers so hosts like Cloudflare Pages and Netlify send the same headers in production.
  const headersFile: Plugin = {
    name: 'security-headers-file',
    apply: 'build',
    generateBundle() {
      const lines = Object.entries({ ...securityHeaders, 'Strict-Transport-Security': 'max-age=31536000' }).map(([k, v]) => `  ${k}: ${v}`)
      this.emitFile({ type: 'asset', fileName: '_headers', source: `/*\n${lines.join('\n')}\n` })
    },
  }

  const devHeaders = {
    ...securityHeaders,
    'Content-Security-Policy': csp
      .replace("script-src 'self'", "script-src 'self' 'unsafe-inline'")
      .replace("style-src 'self'", "style-src 'self' 'unsafe-inline'")
      .replace("connect-src 'self'", "connect-src 'self' ws://localhost:5174 ws://127.0.0.1:5174"),
  }

  return {
    plugins: [react(), headersFile],
    resolve: {
      // Use ONNX Runtime's WebAssembly-only build instead of the WebGPU one: its runtime file is 14 MB
      // instead of 28 MB (over Cloudflare Pages' 25 MiB limit), and it loads that file from public/ort/
      // rather than bundling it. The model runs on the CPU either way.
      alias: { 'onnxruntime-web/webgpu': fileURLToPath(new URL('./node_modules/onnxruntime-web/dist/ort.wasm.min.mjs', import.meta.url)) },
    },
    optimizeDeps: { exclude: ['@huggingface/transformers'] },
    worker: { format: 'es' },
    build: { assetsInlineLimit: 0 },
    server: { port: 5174, strictPort: true, headers: devHeaders },
    preview: { port: 4174, headers: securityHeaders },
  }
})
