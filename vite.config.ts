import { defineConfig, loadEnv } from 'vite'
import path from 'path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import nerdvanaAnswerHandler from './api/nerdvana-answer'
import searchHandler from './api/search'
import visualLookupHandler from './api/visual-lookup'

export default defineConfig(({ mode }) => {
  const frontendEnv = loadEnv(mode, process.cwd(), '')
  const rootEnv = loadEnv(mode, path.resolve(__dirname, '..'), '')
  const mergedEnv = { ...rootEnv, ...frontendEnv }

  if (!process.env.GEMINI_API_KEY && mergedEnv.GEMINI_API_KEY) {
    process.env.GEMINI_API_KEY = mergedEnv.GEMINI_API_KEY
  }
  if (!process.env.GEMINI_API_KEY && mergedEnv.VITE_GEMINI_API_KEY) {
    process.env.GEMINI_API_KEY = mergedEnv.VITE_GEMINI_API_KEY
  }
  if (!process.env.SERPER_API_KEY && mergedEnv.SERPER_API_KEY) {
    process.env.SERPER_API_KEY = mergedEnv.SERPER_API_KEY
  }

  return {
    plugins: [
      react(),
      tailwindcss(),
      {
        name: 'nerdvana-api-dev-bridge',
        configureServer(server) {
          server.middlewares.use(async (req, res, next) => {
            if (!req.url) {
              next()
              return
            }

            if (
              !req.url.startsWith('/api/nerdvana-answer') &&
              !req.url.startsWith('/api/search') &&
              !req.url.startsWith('/api/visual-lookup')
            ) {
              next()
              return
            }

            try {
              const bodyChunks: Buffer[] = []
              await new Promise<void>((resolve, reject) => {
                req.on('data', (chunk) =>
                  bodyChunks.push(Buffer.from(chunk)),
                )
                req.on('end', () => resolve())
                req.on('error', reject)
              })

              const headers = new Headers()
              for (const [key, value] of Object.entries(req.headers)) {
                if (Array.isArray(value)) {
                  headers.set(key, value.join(', '))
                } else if (value !== undefined) {
                  headers.set(key, value)
                }
              }

              const protocol = 'http'
              const host = req.headers.host ?? 'localhost:5173'

              const request = new Request(`${protocol}://${host}${req.url}`, {
                method: req.method ?? 'GET',
                headers,
                body:
                  req.method &&
                  req.method !== 'GET' &&
                  req.method !== 'HEAD'
                    ? Buffer.concat(bodyChunks)
                    : undefined,
              })

              let response

              if (req.url.startsWith('/api/search')) {
                response = await searchHandler(request)
              } else if (req.url.startsWith('/api/visual-lookup')) {
                response = await visualLookupHandler(request)
              } else {
                response = await nerdvanaAnswerHandler(request)
              }

              res.statusCode = response.status
              response.headers.forEach((value, key) => {
                res.setHeader(key, value)
              })

              const output = Buffer.from(await response.arrayBuffer())
              res.end(output)
            } catch (error) {
              res.statusCode = 500
              res.setHeader('Content-Type', 'application/json')
              res.end(
                JSON.stringify({
                  error: 'Local API bridge failed',
                  details:
                    error instanceof Error ? error.message : String(error),
                }),
              )
            }
          })
        },
      },
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      proxy: {},
    },
    assetsInclude: ['**/*.svg', '**/*.csv'],
  }
})