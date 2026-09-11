/**
 * Serveur HTTP local pour les E2E PWA.
 * Sert dist/ + un dataset miniature sous /data/.
 * Les endpoints /__test__/* n'existent jamais dans le bundle de production.
 */
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs'
import http from 'node:http'
import { extname, join, normalize, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { generateFixtures } from './generate-fixtures.mjs'

const HOST = process.env.E2E_HOST || '127.0.0.1'
const PORT = Number(process.env.E2E_PORT || 4177)
const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)))
const DIST = resolve(process.env.E2E_DIST || join(ROOT, 'dist'))
const FIXTURES_DIR = resolve(join(ROOT, 'e2e', 'fixtures', 'generated'))
const SLOW_DELAY_MS = Number(process.env.E2E_SLOW_MS || 3000)

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json',
  '.map': 'application/json',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
}

const DATASETS = new Set([
  'a',
  'b',
  'invalid-manifest',
  'unavailable',
  'corrupt-b',
  'corrupt-coverage-b',
  'slow-b',
  'slow-region',
])

/** @type {{ dataset: string, requests: { method: string, path: string, at: string }[] }} */
const state = {
  dataset: 'a',
  requests: [],
}

let fixtures = generateFixtures(FIXTURES_DIR)

function json(res, status, body) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  })
  res.end(JSON.stringify(body))
}

function sendBuffer(res, status, body, contentType = 'application/json; charset=utf-8') {
  const buffer = Buffer.isBuffer(body) ? body : Buffer.from(body)
  res.writeHead(status, {
    'Content-Type': contentType,
    'Cache-Control': 'no-store',
    'Content-Length': buffer.length,
  })
  res.end(buffer)
}

function resetState() {
  state.dataset = 'a'
  state.requests = []
}

function currentVersionDir() {
  if (
    state.dataset === 'b' ||
    state.dataset === 'slow-b' ||
    state.dataset === 'corrupt-b' ||
    state.dataset === 'corrupt-coverage-b'
  ) {
    return join(FIXTURES_DIR, 'b')
  }
  return join(FIXTURES_DIR, 'a')
}

function currentManifest() {
  if (
    state.dataset === 'b' ||
    state.dataset === 'slow-b' ||
    state.dataset === 'corrupt-b' ||
    state.dataset === 'corrupt-coverage-b'
  ) {
    return fixtures.b
  }
  return fixtures.a
}

function shouldDelay(fileName) {
  if (state.dataset === 'slow-b' && fileName === fixtures.b.files.statusDefinitions.file) {
    return true
  }
  if (state.dataset === 'slow-region' && fileName === fixtures.a.files.statusLinks.fauna.NAQ.file) {
    return true
  }
  return false
}

function isCorruptFile(fileName) {
  if (state.dataset === 'corrupt-b' && fileName === fixtures.b.files.statusDefinitions.file) return true
  if (state.dataset === 'corrupt-coverage-b' && fileName === fixtures.b.files.sourceCoverage.file) return true
  return false
}

function safeDistPath(urlPath) {
  const decoded = decodeURIComponent(urlPath.split('?')[0])
  const relative = decoded.replace(/^\/+/, '')
  const candidate = resolve(join(DIST, relative))
  if (!candidate.startsWith(`${DIST}/`) && candidate !== DIST) return null
  return candidate
}

function serveStatic(req, res, urlPath) {
  let filePath = safeDistPath(urlPath === '/' ? '/index.html' : urlPath)
  if (!filePath) {
    res.writeHead(403)
    res.end('Forbidden')
    return
  }

  if (!existsSync(filePath) || statSync(filePath).isDirectory()) {
    if (req.headers.accept?.includes('text/html')) {
      filePath = join(DIST, 'index.html')
    } else {
      res.writeHead(404)
      res.end('Not found')
      return
    }
  }

  const type = MIME[extname(filePath)] || 'application/octet-stream'
  res.writeHead(200, { 'Content-Type': type })
  createReadStream(filePath).pipe(res)
}

function delay(ms, signal) {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms)
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer)
        resolve()
      },
      { once: true },
    )
  })
}

async function handleData(req, res, url) {
  const pathname = url.pathname
  state.requests.push({
    method: req.method || 'GET',
    path: pathname,
    at: new Date().toISOString(),
  })

  if (pathname === '/data/manifest.json') {
    if (state.dataset === 'unavailable') {
      sendBuffer(res, 503, 'Service unavailable', 'text/plain; charset=utf-8')
      return
    }
    if (state.dataset === 'invalid-manifest') {
      sendBuffer(res, 200, JSON.stringify({ schemaVersion: 1, official: false, note: 'invalid-e2e' }))
      return
    }
    sendBuffer(res, 200, JSON.stringify(currentManifest()))
    return
  }

  if (state.dataset === 'unavailable') {
    sendBuffer(res, 503, 'Service unavailable', 'text/plain; charset=utf-8')
    return
  }

  const fileName = pathname.slice('/data/'.length)
  if (!fileName || fileName.includes('..') || fileName.includes('/')) {
    res.writeHead(404)
    res.end('Not found')
    return
  }

  if (isCorruptFile(fileName)) {
    sendBuffer(res, 200, '[]')
    return
  }

  const fixturePath = join(currentVersionDir(), fileName)
  const fixtureNormalized = normalize(fixturePath)
  const fromFixture = fixtureNormalized.startsWith(currentVersionDir()) && existsSync(fixtureNormalized)
  const distFallback = safeDistPath(`/data/${fileName}`)
  const filePath = fromFixture ? fixtureNormalized : distFallback && existsSync(distFallback) ? distFallback : null
  if (!filePath) {
    res.writeHead(404)
    res.end('Not found')
    return
  }

  const abort = new AbortController()
  req.on('close', () => abort.abort())

  if (fromFixture && shouldDelay(fileName) && !abort.signal.aborted) {
    await delay(SLOW_DELAY_MS, abort.signal)
    if (abort.signal.aborted || res.writableEnded) return
  }

  sendBuffer(res, 200, readFileSync(filePath))
}

async function handleTest(req, res, url) {
  if (url.pathname === '/__test__/health') {
    json(res, 200, { ok: true, dataset: state.dataset, dist: existsSync(DIST) })
    return
  }

  if (url.pathname === '/__test__/reset' && req.method === 'POST') {
    resetState()
    json(res, 200, { ok: true, dataset: state.dataset })
    return
  }

  if (url.pathname === '/__test__/state' && req.method === 'POST') {
    const chunks = []
    for await (const chunk of req) chunks.push(chunk)
    let body = {}
    try {
      body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')
    } catch {
      json(res, 400, { error: 'JSON invalide' })
      return
    }
    if (!DATASETS.has(body.dataset)) {
      json(res, 400, { error: `dataset inconnu: ${body.dataset}` })
      return
    }
    state.dataset = body.dataset
    json(res, 200, { ok: true, dataset: state.dataset })
    return
  }

  if (url.pathname === '/__test__/requests') {
    json(res, 200, { requests: state.requests })
    return
  }

  if (url.pathname === '/__test__/clear-requests' && req.method === 'POST') {
    state.requests = []
    json(res, 200, { ok: true })
    return
  }

  res.writeHead(404)
  res.end('Not found')
}

if (!existsSync(join(DIST, 'index.html')) || !existsSync(join(DIST, 'sw.js'))) {
  console.error('dist/ de production introuvable. Exécutez `npm run build` avant les E2E.')
  process.exit(1)
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url || '/', `http://${HOST}:${PORT}`)

  if (url.pathname.startsWith('/__test__/')) {
    void handleTest(req, res, url)
    return
  }

  if (url.pathname === '/data' || url.pathname.startsWith('/data/')) {
    void handleData(req, res, url)
    return
  }

  serveStatic(req, res, url.pathname)
})

server.listen(PORT, HOST, () => {
  console.log(`E2E server http://${HOST}:${PORT} (dist=${DIST})`)
})
