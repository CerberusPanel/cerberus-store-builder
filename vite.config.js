import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import fs from 'node:fs/promises'
import path from 'node:path'

const OUTPUT_DIR = path.resolve(process.cwd(), 'output')

function parseVersion(value = '0.0.0') {
  const normalized = String(value).trim().toLowerCase().replace(/-([a-z]+)\/(\d+)$/, '-$1-$2')
  const match = normalized.match(/^(\d+)\.(\d+)\.(\d+)(?:-(alpha|beta)-(\d+))?$/)

  if (!match) {
    return { major: 0, minor: 0, patch: 0, channel: null, channelVersion: 0 }
  }

  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    channel: match[4] ?? null,
    channelVersion: Number(match[5] ?? 0),
  }
}

function nextVersion(currentVersion, requestedChannel, existingVersions = []) {
  const current = parseVersion(currentVersion)
  const base = `${current.major}.${current.minor}.${current.patch}`

  if (requestedChannel === 'public') {
    let patch = current.patch + 1
    const existing = new Set(existingVersions.map(value => String(value).toLowerCase()))
    while (existing.has(`${current.major}.${current.minor}.${patch}`)) patch += 1
    return `${current.major}.${current.minor}.${patch}`
  }

  let highestChannelVersion = current.channel === requestedChannel ? current.channelVersion : 0
  for (const version of existingVersions) {
    const parsed = parseVersion(version)
    if (
      parsed.major === current.major &&
      parsed.minor === current.minor &&
      parsed.patch === current.patch &&
      parsed.channel === requestedChannel
    ) {
      highestChannelVersion = Math.max(highestChannelVersion, parsed.channelVersion)
    }
  }

  return `${base}-${requestedChannel}-${highestChannelVersion + 1}`
}

function safeName(value = 'store') {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'store'
}

async function readJsonBody(req) {
  let body = ''
  for await (const chunk of req) body += chunk
  return JSON.parse(body)
}

async function findLatestStore() {
  await fs.mkdir(OUTPUT_DIR, { recursive: true })
  const entries = await fs.readdir(OUTPUT_DIR, { withFileTypes: true })
  const candidates = []

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.toLowerCase().endsWith('.json')) continue
    const fullPath = path.join(OUTPUT_DIR, entry.name)
    const stat = await fs.stat(fullPath)
    candidates.push({ name: entry.name, fullPath, mtimeMs: stat.mtimeMs })
  }

  candidates.sort((a, b) => b.mtimeMs - a.mtimeMs)

  for (const candidate of candidates) {
    try {
      const contents = await fs.readFile(candidate.fullPath, 'utf8')
      const store = JSON.parse(contents)
      if (!store || !Array.isArray(store.apps)) continue
      return { ...candidate, store }
    } catch {
      // Skip malformed JSON files and continue to the next newest candidate.
    }
  }

  return null
}

async function getExistingVersions() {
  await fs.mkdir(OUTPUT_DIR, { recursive: true })
  const entries = await fs.readdir(OUTPUT_DIR, { withFileTypes: true })
  const versions = []

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.toLowerCase().endsWith('.json')) continue
    try {
      const contents = await fs.readFile(path.join(OUTPUT_DIR, entry.name), 'utf8')
      const parsed = JSON.parse(contents)
      if (parsed?.version) versions.push(parsed.version)
    } catch {
      // Ignore malformed history files when calculating the next version.
    }
  }

  return versions
}


function validateStore(store) {
  const errors = []
  const slug = value => String(value ?? '').trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9._-]+/g, '-').replace(/-+/g, '-').replace(/^[._-]+|[._-]+$/g, '')
  const validUrl = value => {
    if (!value) return true
    try { const url = new URL(String(value)); return url.protocol === 'http:' || url.protocol === 'https:' } catch { return false }
  }
  const validPort = value => Number.isInteger(Number(value)) && Number(value) >= 1 && Number(value) <= 65535

  if (!String(store?.name ?? '').trim()) errors.push('Store name is required.')
  if (!/^\d+\.\d+\.\d+(?:-(?:alpha|beta)-\d+)?$/i.test(String(store?.version ?? ''))) errors.push('Invalid store version.')
  if (!String(store?.author ?? '').trim()) errors.push('Store author is required.')
  if (!Array.isArray(store?.apps)) errors.push('apps must be an array.')

  const ids = new Set()
  for (const app of store?.apps ?? []) {
    if (!String(app.name ?? '').trim()) errors.push('Every app needs a name.')
    if (!app.id || !/^[a-z0-9][a-z0-9._-]*$/.test(app.id)) errors.push(`${app.name || 'App'} has an invalid ID.`)
    if (ids.has(app.id)) errors.push(`Duplicate app ID: ${app.id}.`)
    ids.add(app.id)
    if (app.category && slug(app.category) !== app.category) errors.push(`${app.name}: invalid category slug.`)
    if (!app.image || /\s/.test(app.image)) errors.push(`${app.name}: invalid Docker image.`)
    if (app.readme && !validUrl(app.readme)) errors.push(`${app.name}: invalid README URL.`)
    for (const [key, url] of Object.entries(app.links ?? {})) if (url && !validUrl(url)) errors.push(`${app.name}: invalid ${key} URL.`)
    for (const [key, deployment] of Object.entries(app.deployments ?? {})) {
      if (slug(key) !== key) errors.push(`${app.name}: invalid deployment key ${key}.`)
      if (!deployment.container_name || !/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(deployment.container_name)) errors.push(`${app.name}/${key}: invalid container name.`)
      if (!deployment.image || /\s/.test(deployment.image)) errors.push(`${app.name}/${key}: invalid Docker image.`)
      for (const port of deployment.ports ?? []) {
        if (!validPort(port.host) || !validPort(port.container)) errors.push(`${app.name}/${key}: ports must be between 1 and 65535.`)
      }
      for (const volume of deployment.volumes ?? []) {
        if (!String(volume.host ?? '').trim()) errors.push(`${app.name}/${key}: volume host is required.`)
        if (!String(volume.container ?? '').startsWith('/')) errors.push(`${app.name}/${key}: container volume path must start with /.`)
      }
    }
  }
  return errors
}

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(payload))
}

function createApiMiddleware() {
  return async (req, res, next) => {
    const pathname = new URL(req.url, 'http://localhost').pathname

    if (pathname === '/api/latest' && req.method === 'GET') {
      try {
        const latest = await findLatestStore()
        if (!latest) {
          sendJson(res, 404, { ok: false, error: 'No saved store JSON files found in output/.' })
          return
        }

        sendJson(res, 200, {
          ok: true,
          filename: latest.name,
          modified: new Date(latest.mtimeMs).toISOString(),
          store: latest.store,
        })
      } catch (error) {
        sendJson(res, 500, { ok: false, error: error.message })
      }
      return
    }

    if (pathname === '/api/image' && req.method === 'POST') {
      try {
        const body = await readJsonBody(req)
        let imageUrl
        try {
          imageUrl = new URL(String(body.url ?? ''))
        } catch {
          sendJson(res, 400, { ok: false, error: 'Enter a valid image URL.' })
          return
        }

        if (!['http:', 'https:'].includes(imageUrl.protocol)) {
          sendJson(res, 400, { ok: false, error: 'Image URL must use http or https.' })
          return
        }

        const response = await fetch(imageUrl, {
          redirect: 'follow',
          signal: AbortSignal.timeout(15000),
          headers: { 'User-Agent': 'Cerberus-Store-Builder/1.0' },
        })
        if (!response.ok) {
          sendJson(res, 400, { ok: false, error: `Image server returned HTTP ${response.status}.` })
          return
        }

        const contentType = String(response.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase()
        if (!contentType.startsWith('image/')) {
          sendJson(res, 400, { ok: false, error: 'That URL did not return an image.' })
          return
        }

        const declaredLength = Number(response.headers.get('content-length') || 0)
        if (declaredLength > 10 * 1024 * 1024) {
          sendJson(res, 413, { ok: false, error: 'Remote logo images must be 10 MB or smaller.' })
          return
        }

        const buffer = Buffer.from(await response.arrayBuffer())
        if (buffer.length > 10 * 1024 * 1024) {
          sendJson(res, 413, { ok: false, error: 'Remote logo images must be 10 MB or smaller.' })
          return
        }

        sendJson(res, 200, {
          ok: true,
          dataUrl: `data:${contentType};base64,${buffer.toString('base64')}`,
        })
      } catch (error) {
        sendJson(res, 400, { ok: false, error: error.name === 'TimeoutError' ? 'Image download timed out.' : error.message })
      }
      return
    }

    if (pathname === '/api/save' && req.method === 'POST') {
      try {
        const body = await readJsonBody(req)
        const store = body.store
        const channel = String(body.channel ?? '').toLowerCase()

        if (!store || !Array.isArray(store.apps)) {
          sendJson(res, 400, { ok: false, error: 'Invalid store payload: apps must be an array.' })
          return
        }

        const validationErrors = validateStore(store)
        if (validationErrors.length) {
          sendJson(res, 400, { ok: false, error: validationErrors[0], errors: validationErrors })
          return
        }

        if (!['alpha', 'beta', 'public'].includes(channel)) {
          sendJson(res, 400, { ok: false, error: 'Release channel must be alpha, beta, or public.' })
          return
        }

        const existingVersions = await getExistingVersions()
        const version = nextVersion(store.version, channel, existingVersions)
        const output = structuredClone(store)
        output.version = version

        await fs.mkdir(OUTPUT_DIR, { recursive: true })
        const filename = `${safeName(output.name)}-${version}.json`
        const outputFile = path.join(OUTPUT_DIR, filename)

        try {
          await fs.writeFile(outputFile, JSON.stringify(output), { encoding: 'utf8', flag: 'wx' })
        } catch (error) {
          if (error.code === 'EEXIST') {
            sendJson(res, 409, {
              ok: false,
              error: `${filename} already exists. Load the latest save before creating another release.`,
            })
            return
          }
          throw error
        }

        sendJson(res, 200, {
          ok: true,
          version,
          filename,
          path: `output/${filename}`,
        })
      } catch (error) {
        sendJson(res, 400, { ok: false, error: error.message })
      }
      return
    }

    next()
  }
}

function cerberusStorePlugin() {
  return {
    name: 'cerberus-store-backend',
    configureServer(server) {
      server.middlewares.use(createApiMiddleware())
    },
    configurePreviewServer(server) {
      server.middlewares.use(createApiMiddleware())
    },
  }
}

export default defineConfig({
  base: './',
  plugins: [vue(), cerberusStorePlugin()],
})
