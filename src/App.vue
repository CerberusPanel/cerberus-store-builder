<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { createBlankApp, starterStore } from './storeData'

const DRAFT_KEY = 'cerberus-store-builder:draft:v3'
const THEME_KEY = 'cerberus-store-builder:theme'
const MAX_HISTORY = 100

function readDraft() {
  try {
    const parsed = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null')
    if (parsed?.store && Array.isArray(parsed.store.apps)) return parsed
  } catch {
    // A corrupt browser draft should never prevent the editor from starting.
  }
  return null
}

const localDraft = readDraft()
const storeData = ref(structuredClone(localDraft?.store ?? starterStore))
const selectedId = ref(localDraft?.selectedId ?? storeData.value.apps[0]?.id ?? null)
const search = ref('')
const metadataOpen = ref(false)
const rawOpen = ref(false)
const clearOpen = ref(false)
const clearNudge = ref(false)
const issuesOpen = ref(false)
const settingsOpen = ref(false)
const aboutOpen = ref(false)
const hotkeyCapture = ref(null)
const searchInput = ref(null)
const toast = ref('')
const activeTab = ref(localDraft?.activeTab ?? 'overview')
const releaseChannel = ref(localDraft?.releaseChannel ?? 'alpha')
const lastSaveFilename = ref(localDraft?.lastSaveFilename ?? '')
const saving = ref(false)
const logoImportUrl = ref('')
const logoBusy = ref(false)
const desktopApi = window.cerberusDesktop ?? null
const isDesktop = Boolean(desktopApi?.isDesktop)
const desktopPlatform = ref(desktopApi?.platform ?? 'web')
const outputLocation = ref(isDesktop ? 'Loading output folder…' : 'Project output/')
const defaultOutputLocation = ref('')
const appVersion = ref('')
const settingsLocation = ref('')
const electronVersion = ref('')
const chromeVersion = ref('')
const nodeVersion = ref('')
const desktopArch = ref('')
const DEFAULT_HOTKEYS = { undo: 'Mod+Z', redo: 'Mod+Shift+Z', load: 'Mod+O', save: 'Mod+S', settings: 'Mod+,', about: 'F1', search: 'Mod+F', addApp: 'Mod+N', storeData: 'Mod+Shift+,' }
const hotkeys = ref({ ...DEFAULT_HOTKEYS })
const defaultHotkeys = ref({ ...DEFAULT_HOTKEYS })
let removeMenuListener = null
const storedTheme = localStorage.getItem(THEME_KEY)
const themeMode = ref(['light', 'system', 'dark'].includes(storedTheme) ? storedTheme : 'system')
const autosaveState = ref(localDraft ? 'Draft restored' : 'Autosave ready')
const undoStack = ref([])
const redoStack = ref([])
let lastSnapshot = JSON.stringify(storeData.value)
let historyTimer = null
let autosaveTimer = null
let suppressHistory = false

const selectedApp = computed(() =>
  storeData.value.apps.find(app => app.id === selectedId.value) ?? null,
)

function appSearchValues(app) {
  const ports = Object.values(app.deployments ?? {}).flatMap(deployment =>
    (deployment.ports ?? []).flatMap(port => [port.host, port.container, port.label]),
  )

  return [
    app.name,
    app.id,
    app.category,
    app.description,
    ...ports,
  ].filter(value => value !== undefined && value !== null && value !== '')
}

function appMatchesSearch(app, query = search.value) {
  const normalized = String(query ?? '').trim().toLowerCase()
  if (!normalized) return true
  return appSearchValues(app).some(value => String(value).toLowerCase().includes(normalized))
}

const filteredApps = computed(() => {
  const query = search.value.trim()
  if (!query) return storeData.value.apps.map(app => ({ app, matches: true }))

  const matching = storeData.value.apps
    .filter(app => appMatchesSearch(app, query))
    .map(app => ({ app, matches: true }))

  const selected = selectedApp.value
  if (selected && !matching.some(item => item.app === selected)) {
    matching.unshift({ app: selected, matches: false })
  }

  return matching
})

const searchMatchCount = computed(() => {
  const query = search.value.trim()
  if (!query) return storeData.value.apps.length
  return storeData.value.apps.filter(app => appMatchesSearch(app, query)).length
})

const latestVersion = computed(() => {
  const app = selectedApp.value
  if (!app) return null
  return app.versions?.find(version => version.tag === 'latest') ?? app.versions?.[0] ?? null
})

const latestDeployment = computed(() => {
  const app = selectedApp.value
  if (!app) return null
  return app.deployments?.latest ?? Object.values(app.deployments ?? {})[0] ?? null
})

function systemPrefersDark() {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? true
}

function applyTheme() {
  const effective = themeMode.value === 'system'
    ? (systemPrefersDark() ? 'dark' : 'light')
    : themeMode.value
  document.documentElement.dataset.theme = effective
  document.documentElement.style.colorScheme = effective
  localStorage.setItem(THEME_KEY, themeMode.value)
  desktopApi?.setTitlebarTheme?.(effective)
}

function setTheme(mode) {
  themeMode.value = mode
  applyTheme()
}

function handleSystemThemeChange() {
  if (themeMode.value === 'system') applyTheme()
}

function flash(message) {
  toast.value = message
  window.setTimeout(() => {
    if (toast.value === message) toast.value = ''
  }, 3000)
}

function slugify(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[._-]+|[._-]+$/g, '')
}

function cleanName(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

function isHttpUrl(value) {
  if (!value) return true
  try {
    const url = new URL(String(value))
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

function isValidPort(value) {
  return Number.isInteger(Number(value)) && Number(value) >= 1 && Number(value) <= 65535
}

function appIssue(app, field) {
  const issues = validationIssues.value
  return issues.find(issue => issue.appId === app?.id && issue.field === field)?.message ?? ''
}

function deploymentIssue(app, key, field, index = null) {
  return validationIssues.value.find(issue =>
    issue.appId === app?.id && issue.deployment === key && issue.field === field && issue.index === index
  )?.message ?? ''
}

function reviewIssue(issue) {
  issuesOpen.value = false
  if (!issue?.appId) {
    metadataOpen.value = true
    return
  }
  selectedId.value = issue.appId
  activeTab.value = issue.deployment ? 'builds' : 'overview'
}

const validationIssues = computed(() => {
  const issues = []
  const add = (message, extra = {}) => issues.push({ message, ...extra })

  if (!cleanName(storeData.value.name)) add('Store name is required.', { field: 'store-name' })
  if (!/^\d+\.\d+\.\d+(?:-(?:alpha|beta)-\d+)?$/i.test(String(storeData.value.version ?? ''))) {
    add('Store version must look like 0.0.0, 0.0.1-alpha-1 or 0.0.1-beta-1.', { field: 'store-version' })
  }
  if (!cleanName(storeData.value.author)) add('Store author is required.', { field: 'store-author' })

  const ids = new Set()
  for (const app of storeData.value.apps) {
    if (!cleanName(app.name)) add(`App ${app.id || '(missing ID)'} needs a name.`, { appId: app.id, field: 'name' })
    if (!app.id || !/^[a-z0-9][a-z0-9._-]*$/.test(app.id)) add(`${app.name || 'App'} has an invalid ID.`, { appId: app.id, field: 'id' })
    if (ids.has(app.id)) add(`Duplicate app ID: ${app.id}.`, { appId: app.id, field: 'id' })
    ids.add(app.id)
    if (app.category && slugify(app.category) !== app.category) add(`${app.name}: category must be a slug.`, { appId: app.id, field: 'category' })
    if (!app.image || /\s/.test(app.image)) add(`${app.name}: base Docker image is required and cannot contain spaces.`, { appId: app.id, field: 'image' })
    if (app.readme && !isHttpUrl(app.readme)) add(`${app.name}: README must be an http(s) URL.`, { appId: app.id, field: 'readme' })

    for (const [key, url] of Object.entries(app.links ?? {})) {
      if (url && !isHttpUrl(url)) add(`${app.name}: link “${key}” is not a valid http(s) URL.`, { appId: app.id, field: `link:${key}` })
    }

    for (const [key, deployment] of Object.entries(app.deployments ?? {})) {
      if (!key || slugify(key) !== key) add(`${app.name}: deployment key “${key}” is invalid.`, { appId: app.id, deployment: key, field: 'key', index: null })
      if (!deployment.container_name || !/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(deployment.container_name)) {
        add(`${app.name}/${key}: invalid container name.`, { appId: app.id, deployment: key, field: 'container_name', index: null })
      }
      if (!deployment.image || /\s/.test(deployment.image)) add(`${app.name}/${key}: Docker image is required and cannot contain spaces.`, { appId: app.id, deployment: key, field: 'image', index: null })
      for (const [index, port] of (deployment.ports ?? []).entries()) {
        if (!isValidPort(port.host)) add(`${app.name}/${key}: host port must be 1–65535.`, { appId: app.id, deployment: key, field: 'host-port', index })
        if (!isValidPort(port.container)) add(`${app.name}/${key}: container port must be 1–65535.`, { appId: app.id, deployment: key, field: 'container-port', index })
      }
      for (const [index, volume] of (deployment.volumes ?? []).entries()) {
        if (!String(volume.host ?? '').trim()) add(`${app.name}/${key}: volume host is required.`, { appId: app.id, deployment: key, field: 'volume-host', index })
        if (!String(volume.container ?? '').startsWith('/')) add(`${app.name}/${key}: container volume path must start with /.`, { appId: app.id, deployment: key, field: 'volume-container', index })
      }
    }
  }
  return issues
})

const hasErrors = computed(() => validationIssues.value.length > 0)

function persistDraft() {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify({
      store: storeData.value,
      selectedId: selectedId.value,
      activeTab: activeTab.value,
      releaseChannel: releaseChannel.value,
      lastSaveFilename: lastSaveFilename.value,
      savedAt: new Date().toISOString(),
    }))
    autosaveState.value = 'Autosaved'
  } catch {
    autosaveState.value = 'Autosave failed'
  }
}

function scheduleAutosave() {
  autosaveState.value = 'Saving draft…'
  clearTimeout(autosaveTimer)
  autosaveTimer = window.setTimeout(persistDraft, 250)
}

function scheduleHistorySnapshot() {
  if (suppressHistory) return
  clearTimeout(historyTimer)
  historyTimer = window.setTimeout(() => {
    const current = JSON.stringify(storeData.value)
    if (current === lastSnapshot) return
    undoStack.value.push(lastSnapshot)
    if (undoStack.value.length > MAX_HISTORY) undoStack.value.shift()
    lastSnapshot = current
    redoStack.value = []
  }, 350)
}

function applySnapshot(snapshot) {
  suppressHistory = true
  clearTimeout(historyTimer)
  storeData.value = JSON.parse(snapshot)
  lastSnapshot = snapshot
  if (!storeData.value.apps.some(app => app.id === selectedId.value)) {
    selectedId.value = storeData.value.apps[0]?.id ?? null
  }
  window.setTimeout(() => { suppressHistory = false }, 0)
  scheduleAutosave()
}

function undo() {
  clearTimeout(historyTimer)
  const current = JSON.stringify(storeData.value)
  if (current !== lastSnapshot) {
    redoStack.value.push(current)
    applySnapshot(lastSnapshot)
    return
  }
  const previous = undoStack.value.pop()
  if (!previous) return
  redoStack.value.push(current)
  applySnapshot(previous)
}

function redo() {
  clearTimeout(historyTimer)
  const next = redoStack.value.pop()
  if (!next) return
  const current = JSON.stringify(storeData.value)
  undoStack.value.push(current)
  applySnapshot(next)
}

function resetHistory() {
  clearTimeout(historyTimer)
  undoStack.value = []
  redoStack.value = []
  lastSnapshot = JSON.stringify(storeData.value)
}

watch(storeData, () => {
  scheduleHistorySnapshot()
  scheduleAutosave()
}, { deep: true, flush: 'post' })

watch([selectedId, activeTab, releaseChannel, lastSaveFilename], scheduleAutosave)
watch(selectedId, () => { logoImportUrl.value = '' })

function addApp() {
  let i = storeData.value.apps.length + 1
  let app = createBlankApp(i)
  while (storeData.value.apps.some(existing => existing.id === app.id)) app = createBlankApp(++i)
  storeData.value.apps.push(app)
  selectedId.value = app.id
  activeTab.value = 'overview'
}

function duplicateApp() {
  if (!selectedApp.value) return
  const copy = structuredClone(selectedApp.value)
  const base = `${copy.id}-copy`
  let id = base
  let i = 2
  while (storeData.value.apps.some(app => app.id === id)) id = `${base}-${i++}`
  copy.id = id
  copy.name = `${copy.name} Copy`
  storeData.value.apps.push(copy)
  selectedId.value = id
}

function deleteApp() {
  if (!selectedApp.value) return
  const name = selectedApp.value.name
  if (!window.confirm(`Delete ${name}?`)) return
  const index = storeData.value.apps.findIndex(app => app.id === selectedId.value)
  storeData.value.apps.splice(index, 1)
  selectedId.value = storeData.value.apps[Math.max(0, index - 1)]?.id ?? null
}

function changeAppId(rawId) {
  const app = selectedApp.value
  if (!app) return
  const nextId = slugify(rawId)
  if (!nextId) { flash('App ID cannot be empty.'); return }
  if (storeData.value.apps.some(candidate => candidate !== app && candidate.id === nextId)) {
    flash(`An app with ID ${nextId} already exists.`)
    return
  }
  app.id = nextId
  selectedId.value = nextId
}

function cleanAppName(app) { app.name = cleanName(app.name) }
function cleanCategory(app) { app.category = slugify(app.category) }
function cleanContainerName(deployment) {
  deployment.container_name = String(deployment.container_name ?? '').trim().replace(/\s+/g, '-').replace(/[^a-zA-Z0-9_.-]/g, '')
}
function cleanListValue(field, index) {
  if (field === 'tags') selectedApp.value[field][index] = slugify(selectedApp.value[field][index])
  else selectedApp.value[field][index] = cleanName(selectedApp.value[field][index])
}

function addListItem(field) { selectedApp.value[field] ??= []; selectedApp.value[field].push('') }
function removeListItem(field, index) { selectedApp.value[field].splice(index, 1) }
function addVersion() { selectedApp.value.versions ??= []; selectedApp.value.versions.push({ tag: `v${selectedApp.value.versions.length + 1}`, label: 'Version' }) }
function removeVersion(index) { selectedApp.value.versions.splice(index, 1) }

function renameDeployment(oldKey, newKey) {
  const trimmed = slugify(newKey)
  if (!trimmed || trimmed === oldKey || selectedApp.value.deployments[trimmed]) return
  selectedApp.value.deployments[trimmed] = selectedApp.value.deployments[oldKey]
  delete selectedApp.value.deployments[oldKey]
}

function addDeployment() {
  let i = 1
  let key = `build-${i}`
  while (selectedApp.value.deployments?.[key]) key = `build-${++i}`
  selectedApp.value.deployments ??= {}
  selectedApp.value.deployments[key] = { container_name: selectedApp.value.id, image: selectedApp.value.image || '', ports: [], volumes: [] }
}

function removeDeployment(key) {
  if (Object.keys(selectedApp.value.deployments ?? {}).length <= 1) { flash('Keep at least one deployment build.'); return }
  delete selectedApp.value.deployments[key]
}
function addPort(deployment) { deployment.ports ??= []; deployment.ports.push({ host: 8080, container: 8080, label: 'Web UI' }) }
function addVolume(deployment) { deployment.volumes ??= []; deployment.volumes.push({ host: '', container: '', label: '' }) }
function removeArrayItem(array, index) { array.splice(index, 1) }

function addLink() {
  selectedApp.value.links ??= {}
  let i = 1; let key = 'website'
  while (key in selectedApp.value.links) key = `website${++i}`
  selectedApp.value.links[key] = ''
}
function renameLink(oldKey, newKey) {
  const trimmed = slugify(newKey)
  if (!trimmed || trimmed === oldKey || trimmed in selectedApp.value.links) return
  selectedApp.value.links[trimmed] = selectedApp.value.links[oldKey]
  delete selectedApp.value.links[oldKey]
}
function removeLink(key) { delete selectedApp.value.links[key] }

function logoDataUrl(base64) {
  return base64 ? `data:image/png;base64,${base64}` : ''
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(new Error('Could not read the selected image.'))
    reader.readAsDataURL(file)
  })
}

function loadImage(source) {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('The image could not be decoded.'))
    image.src = source
  })
}

function renderLogoSize(image, size) {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Canvas image processing is unavailable in this browser.')

  context.clearRect(0, 0, size, size)
  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'

  const sourceWidth = image.naturalWidth || image.width
  const sourceHeight = image.naturalHeight || image.height
  const scale = Math.min(size / sourceWidth, size / sourceHeight)
  const width = Math.max(1, Math.round(sourceWidth * scale))
  const height = Math.max(1, Math.round(sourceHeight * scale))
  const x = Math.round((size - width) / 2)
  const y = Math.round((size - height) / 2)
  context.drawImage(image, x, y, width, height)

  return canvas.toDataURL('image/png').replace(/^data:image\/png;base64,/, '')
}

async function setLogoFromSource(source) {
  if (!selectedApp.value) return
  logoBusy.value = true
  try {
    const image = await loadImage(source)
    if (!(image.naturalWidth || image.width) || !(image.naturalHeight || image.height)) {
      throw new Error('The selected image has invalid dimensions.')
    }

    selectedApp.value.logo = {
      x32: renderLogoSize(image, 32),
      x64: renderLogoSize(image, 64),
      x128: renderLogoSize(image, 128),
    }
    flash('Logo generated at 32px, 64px and 128px.')
  } catch (error) {
    flash(error.message || 'Could not process the logo.')
  } finally {
    logoBusy.value = false
  }
}

async function handleLogoUpload(event) {
  const input = event.target
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  if (!file.type.startsWith('image/')) {
    flash('Please select an image file.')
    return
  }
  if (file.size > 10 * 1024 * 1024) {
    flash('Logo images must be 10 MB or smaller.')
    return
  }

  try {
    await setLogoFromSource(await readFileAsDataUrl(file))
  } catch (error) {
    flash(error.message || 'Could not read the selected image.')
  }
}

async function importLogoFromUrl() {
  if (!selectedApp.value || logoBusy.value) return
  const url = logoImportUrl.value.trim()
  if (!isHttpUrl(url) || !url) {
    flash('Enter a valid http(s) image URL.')
    return
  }

  logoBusy.value = true
  try {
    let result
    if (desktopApi) {
      result = await desktopApi.importImage(url)
    } else {
      const response = await fetch('/api/image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      })
      result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Could not import that image URL.')
    }
    if (!result.ok) throw new Error(result.error || 'Could not import that image URL.')
    logoBusy.value = false
    await setLogoFromSource(result.dataUrl)
  } catch (error) {
    logoBusy.value = false
    flash(error.message || 'Could not import that image URL.')
  }
}

function removeLogo() {
  if (!selectedApp.value?.logo) return
  delete selectedApp.value.logo
  logoImportUrl.value = ''
  flash('Logo removed.')
}

function cleanForExport(value) {
  if (Array.isArray(value)) return value.map(cleanForExport)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined && v !== null && v !== '').map(([k, v]) => [k, cleanForExport(v)]))
  }
  return value
}

function parseVersion(value = '0.0.0') {
  const normalized = String(value).trim().toLowerCase().replace(/-([a-z]+)\/(\d+)$/, '-$1-$2')
  const match = normalized.match(/^(\d+)\.(\d+)\.(\d+)(?:-(alpha|beta)-(\d+))?$/)
  if (!match) return { major: 0, minor: 0, patch: 0, channel: null, channelVersion: 0 }
  return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]), channel: match[4] ?? null, channelVersion: Number(match[5] ?? 0) }
}
function getNextVersion(currentVersion, channel) {
  const current = parseVersion(currentVersion)
  const base = `${current.major}.${current.minor}.${current.patch}`
  if (channel === 'public') return `${current.major}.${current.minor}.${current.patch + 1}`
  const channelVersion = current.channel === channel ? current.channelVersion + 1 : 1
  return `${base}-${channel}-${channelVersion}`
}

async function loadLastSave() {
  saving.value = true
  try {
    let result
    if (desktopApi) {
      result = await desktopApi.loadLatest()
    } else {
      const response = await fetch('/api/latest')
      result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Could not load the latest save.')
    }
    if (!result.ok) throw new Error(result.error || 'Could not load the latest save.')
    storeData.value = result.store
    selectedId.value = storeData.value.apps[0]?.id ?? null
    lastSaveFilename.value = result.filename
    resetHistory()
    persistDraft()
    flash(`Loaded ${result.filename} — local autosave is now tracking it.`)
  } catch (error) { flash(error.message) }
  finally { saving.value = false }
}

async function saveRelease() {
  if (hasErrors.value) {
    flash(`Cannot save: ${validationIssues.value[0].message}`)
    return
  }
  saving.value = true
  const payload = cleanForExport(storeData.value)
  try {
    let result
    if (desktopApi) {
      result = await desktopApi.saveRelease({ store: payload, channel: releaseChannel.value })
    } else {
      const response = await fetch('/api/save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ store: payload, channel: releaseChannel.value }) })
      result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Save failed.')
    }
    if (!result.ok) throw new Error(result.error || 'Save failed.')
    storeData.value.version = result.version
    lastSaveFilename.value = result.filename
    persistDraft()
    flash(`Saved ${result.filename}`)
  } catch (error) { flash(error.message) }
  finally { saving.value = false }
}

async function openOutputFolder() {
  if (!desktopApi) return
  const error = await desktopApi.openOutputFolder()
  if (error) flash(error)
}

async function chooseOutputFolder() {
  if (!desktopApi?.chooseOutputFolder) return
  try {
    const result = await desktopApi.chooseOutputFolder()
    if (result?.ok) {
      outputLocation.value = result.outputDir
      flash('Output folder updated.')
    }
  } catch (error) {
    flash(error.message || 'Could not change the output folder.')
  }
}

async function resetOutputFolder() {
  if (!desktopApi?.resetOutputFolder) return
  try {
    const result = await desktopApi.resetOutputFolder()
    if (result?.ok) {
      outputLocation.value = result.outputDir
      flash('Output folder reset to the default location.')
    }
  } catch (error) {
    flash(error.message || 'Could not reset the output folder.')
  }
}

function requestClear() {
  clearOpen.value = true
  clearNudge.value = false
}

function nudgeClearModal() {
  clearNudge.value = false
  window.requestAnimationFrame(() => {
    clearNudge.value = true
    window.setTimeout(() => { clearNudge.value = false }, 420)
  })
}

function cancelClear() {
  clearOpen.value = false
  clearNudge.value = false
}

function confirmClear() {
  storeData.value = structuredClone(starterStore)
  selectedId.value = null
  activeTab.value = 'overview'
  lastSaveFilename.value = ''
  clearOpen.value = false
  clearNudge.value = false
  resetHistory()
  persistDraft()
  flash('Draft cleared.')
}

const HOTKEY_ACTIONS = [
  { key: 'undo', label: 'Undo', description: 'Undo the most recent editor change.' },
  { key: 'redo', label: 'Redo', description: 'Redo the most recently undone change.' },
  { key: 'load', label: 'Load last save', description: 'Load the newest valid store file from the output folder.' },
  { key: 'save', label: 'Save release', description: 'Save the next versioned store release.' },
  { key: 'search', label: 'Search applications', description: 'Focus the application search box.' },
  { key: 'addApp', label: 'Add application', description: 'Create a new blank application.' },
  { key: 'storeData', label: 'Store data', description: 'Open the store metadata editor.' },
  { key: 'settings', label: 'Settings', description: 'Open application settings.' },
  { key: 'about', label: 'About', description: 'Open application information.' },
]

function normalizedEventKey(event) {
  const key = event.key
  if (key === ' ') return 'Space'
  if (key === 'Escape') return 'Escape'
  if (key.length === 1) return key.toUpperCase()
  const aliases = { ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right' }
  return aliases[key] || key
}

function eventToHotkey(event) {
  const key = normalizedEventKey(event)
  if (['Control', 'Meta', 'Alt', 'Shift', 'AltGraph'].includes(key)) return null
  const parts = []
  if (event.ctrlKey || event.metaKey) parts.push('Mod')
  if (event.altKey) parts.push('Alt')
  if (event.shiftKey && key !== 'Shift') parts.push('Shift')
  parts.push(key)
  return parts.join('+')
}

function hotkeyMatches(event, shortcut) {
  const parts = String(shortcut || '').split('+').filter(Boolean)
  if (!parts.length) return false
  const wantsMod = parts.includes('Mod')
  const wantsAlt = parts.includes('Alt')
  const wantsShift = parts.includes('Shift')
  if ((event.ctrlKey || event.metaKey) !== wantsMod) return false
  if (event.altKey !== wantsAlt) return false
  if (event.shiftKey !== wantsShift) return false
  const wantedKey = parts.find(part => !['Mod', 'Alt', 'Shift'].includes(part))
  return normalizedEventKey(event).toLowerCase() === String(wantedKey || '').toLowerCase()
}

function displayHotkey(shortcut) {
  return String(shortcut || '').replace('Mod', desktopPlatform.value === 'darwin' ? 'Cmd' : 'Ctrl')
}

const hotkeyConflicts = computed(() => {
  const seen = new Map()
  const conflicts = new Set()
  for (const [action, shortcut] of Object.entries(hotkeys.value)) {
    const normalized = String(shortcut || '').toLowerCase()
    if (!normalized) continue
    if (seen.has(normalized)) { conflicts.add(action); conflicts.add(seen.get(normalized)) }
    else seen.set(normalized, action)
  }
  return conflicts
})

async function persistHotkeys() {
  if (hotkeyConflicts.value.size) return
  try {
    if (desktopApi?.setHotkeys) {
      const result = await desktopApi.setHotkeys(hotkeys.value)
      if (result?.ok) hotkeys.value = { ...result.hotkeys }
    } else {
      localStorage.setItem('cerberus-store-builder:hotkeys', JSON.stringify(hotkeys.value))
    }
  } catch (error) {
    flash(error.message || 'Could not save keyboard shortcuts.')
  }
}

function beginHotkeyCapture(action) {
  hotkeyCapture.value = action
  desktopApi?.setShortcutCapture?.(true)
}

async function captureHotkey(event, action) {
  event.preventDefault()
  event.stopPropagation()
  if (event.key === 'Escape') { hotkeyCapture.value = null; desktopApi?.setShortcutCapture?.(false); return }
  const shortcut = eventToHotkey(event)
  if (!shortcut) return
  hotkeys.value = { ...hotkeys.value, [action]: shortcut }
  hotkeyCapture.value = null
  desktopApi?.setShortcutCapture?.(false)
  if (!hotkeyConflicts.value.size) {
    await persistHotkeys()
    flash(`${HOTKEY_ACTIONS.find(item => item.key === action)?.label || action} shortcut updated.`)
  }
}

async function resetHotkeys() {
  try {
    if (desktopApi?.resetHotkeys) {
      const result = await desktopApi.resetHotkeys()
      if (result?.ok) hotkeys.value = { ...result.hotkeys }
    } else {
      hotkeys.value = { ...defaultHotkeys.value }
      localStorage.setItem('cerberus-store-builder:hotkeys', JSON.stringify(hotkeys.value))
    }
    hotkeyCapture.value = null
    desktopApi?.setShortcutCapture?.(false)
    flash('Keyboard shortcuts reset.')
  } catch (error) {
    flash(error.message || 'Could not reset keyboard shortcuts.')
  }
}

function runHotkeyAction(action) {
  if (action === 'undo') undo()
  else if (action === 'redo') redo()
  else if (action === 'load') loadLastSave()
  else if (action === 'save') saveRelease()
  else if (action === 'settings') settingsOpen.value = true
  else if (action === 'about') aboutOpen.value = true
  else if (action === 'search') { searchInput.value?.focus(); searchInput.value?.select?.() }
  else if (action === 'addApp') addApp()
  else if (action === 'storeData') metadataOpen.value = true
}

function handleKeyboard(event) {
  if (hotkeyCapture.value) return
  if (isDesktop) return // Electron's native menu accelerators dispatch desktop shortcuts.
  for (const item of HOTKEY_ACTIONS) {
    if (hotkeyMatches(event, hotkeys.value[item.key])) {
      event.preventDefault()
      runHotkeyAction(item.key)
      return
    }
  }
}

watch(settingsOpen, open => {
  if (!open && hotkeyCapture.value) {
    hotkeyCapture.value = null
    desktopApi?.setShortcutCapture?.(false)
  }
})

onMounted(async () => {
  applyTheme()
  window.addEventListener('keydown', handleKeyboard)
  window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener?.('change', handleSystemThemeChange)
  if (desktopApi) {
    const info = await desktopApi.getInfo()
    desktopPlatform.value = info.platform
    outputLocation.value = info.outputDir
    defaultOutputLocation.value = info.defaultOutputDir || info.outputDir
    appVersion.value = info.version || ''
    settingsLocation.value = info.settingsFile || ''
    electronVersion.value = info.electronVersion || ''
    chromeVersion.value = info.chromeVersion || ''
    nodeVersion.value = info.nodeVersion || ''
    desktopArch.value = info.arch || ''
    hotkeys.value = { ...DEFAULT_HOTKEYS, ...(info.hotkeys || {}) }
    defaultHotkeys.value = { ...DEFAULT_HOTKEYS, ...(info.defaultHotkeys || {}) }
    removeMenuListener = desktopApi.onMenuAction(action => {
      if (action === 'load') loadLastSave()
      if (action === 'save') saveRelease()
      if (action === 'settings') settingsOpen.value = true
      if (action === 'about') aboutOpen.value = true
      if (action === 'undo') undo()
      if (action === 'redo') redo()
      if (action === 'search') { searchInput.value?.focus(); searchInput.value?.select?.() }
      if (action === 'addApp') addApp()
      if (action === 'storeData') metadataOpen.value = true
    })
  } else {
    try { hotkeys.value = { ...DEFAULT_HOTKEYS, ...JSON.parse(localStorage.getItem('cerberus-store-builder:hotkeys') || '{}') } } catch {}
  }
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKeyboard)
  window.matchMedia?.('(prefers-color-scheme: dark)').removeEventListener?.('change', handleSystemThemeChange)
  removeMenuListener?.()
  clearTimeout(historyTimer)
  clearTimeout(autosaveTimer)
  persistDraft()
})

const nextReleaseVersion = computed(() => getNextVersion(storeData.value.version, releaseChannel.value))
const prettyJson = computed(() => JSON.stringify(storeData.value, null, 2))
const minifiedJson = computed(() => JSON.stringify(cleanForExport(storeData.value)))
</script>

<template>
  <div class="app-shell" :class="{ 'desktop-shell': isDesktop, [`platform-${desktopPlatform}`]: isDesktop }">
    <div v-if="isDesktop" class="desktop-titlebar">
      <div class="desktop-brand">
        <span class="desktop-mark"><img src="/logo-transparent.png" alt="Cerberus logo" /></span>
        <span>Cerberus Store Builder</span>
      </div>
      <div class="desktop-document">{{ lastSaveFilename || 'Unsaved store' }}</div>
    </div>
    <header class="topbar">
      <div class="workspace-title">
        <div class="workspace-title-icon"><img src="/logo-transparent.png" alt="Cerberus logo" /></div>
        <div>
          <div class="eyebrow">STORE WORKSPACE</div>
          <h1>{{ storeData.name || 'Untitled Store' }}</h1>
        </div>
      </div>
      <div class="top-actions">
        <div class="toolbar-group draft-tools" aria-label="Draft controls">
          <div class="autosave-indicator" title="Local draft status"><span class="autosave-dot"></span>{{ autosaveState }}</div>
          <div class="history-actions">
            <button class="button ghost compact-button icon-text-button" :disabled="!undoStack.length && JSON.stringify(storeData) === lastSnapshot"  :title="`Undo (${displayHotkey(hotkeys.undo)})`" @click="undo"><span>↶</span><span class="button-label">Undo</span></button>
            <button class="button ghost compact-button icon-text-button" :disabled="!redoStack.length"  :title="`Redo (${displayHotkey(hotkeys.redo)})`" @click="redo"><span>↷</span><span class="button-label">Redo</span></button>
          </div>
        </div>

        <div class="toolbar-group store-tools" aria-label="Store controls">
          <button class="button ghost compact-button" :disabled="saving" @click="loadLastSave">Load save</button>
          <button class="button ghost compact-button" @click="metadataOpen = true">Store data</button>
        </div>

        <div class="toolbar-group release-tools" aria-label="Release controls">
          <label class="release-channel">
            <span>Channel</span>
            <select v-model="releaseChannel">
              <option value="alpha">Alpha</option>
              <option value="beta">Beta</option>
              <option value="public">Public</option>
            </select>
          </label>
          <div class="release-preview">
            <span>Next release</span>
            <strong>{{ nextReleaseVersion }}</strong>
          </div>
          <div class="save-area">
            <button v-if="hasErrors" class="error-count issue-button" type="button" title="Review validation issues" @click="issuesOpen = true">{{ validationIssues.length }} issue{{ validationIssues.length === 1 ? '' : 's' }}</button>
            <button class="button primary compact-button save-button" :disabled="saving || hasErrors" @click="saveRelease">
              {{ saving ? 'Working…' : 'Save' }}
            </button>
          </div>
        </div>

        <div class="toolbar-group appearance-tools" aria-label="Application settings">
          <button class="button ghost compact-button settings-button"  :title="`Settings (${displayHotkey(hotkeys.settings)})`" @click="settingsOpen = true">
            <span aria-hidden="true">⚙</span><span class="button-label">Settings</span>
          </button>
        </div>
      </div>
    </header>

    <div class="workspace">
      <aside class="sidebar">
        <div class="sidebar-head">
          <div>
            <span class="muted">Applications</span>
            <strong>{{ storeData.apps.length }}</strong>
          </div>
          <button class="icon-button" title="Add app" @click="addApp">+</button>
        </div>

        <div class="sidebar-search">
          <div class="search-box">
            <span class="search-icon">⌕</span>
            <input ref="searchInput" v-model="search" class="search" placeholder="Search apps…" aria-label="Search applications" />
            <button v-if="search" class="search-clear" title="Clear search" @click="search = ''">×</button>
          </div>
          <span v-if="search" class="search-count">{{ searchMatchCount }} match{{ searchMatchCount === 1 ? '' : 'es' }}</span>
        </div>

        <div class="app-list">
          <button
            v-for="item in filteredApps"
            :key="item.app.id"
            class="app-row"
            :class="{ selected: item.app.id === selectedId, 'search-miss': !item.matches }"
            :title="!item.matches ? 'Currently open — does not match this search' : ''"
            @click="item.matches && (selectedId = item.app.id)"
          >
            <div class="app-avatar">
              <img v-if="item.app.logo?.x32" :src="logoDataUrl(item.app.logo.x32)" :alt="`${item.app.name || item.app.id} logo`" />
              <span v-else>{{ (item.app.name || item.app.id || '?').slice(0, 1).toUpperCase() }}</span>
            </div>
            <div class="app-row-text">
              <strong>{{ item.app.name || 'Unnamed app' }}</strong>
              <span>{{ item.app.id || 'missing-id' }}</span>
            </div>
            <span class="category-pill">{{ item.app.category || 'uncategorised' }}</span>
          </button>
          <div v-if="search && searchMatchCount === 0 && !selectedApp" class="sidebar-empty">No applications match this search.</div>
        </div>

        <div class="sidebar-footer">
          <div class="sidebar-footer-row">
            <button class="text-button danger-text" @click="requestClear">Clear</button>
            <button v-if="isDesktop" class="text-button" title="Open output folder" @click="openOutputFolder">Output folder ↗</button>
          </div>
          <span>{{ lastSaveFilename || 'No save loaded' }}</span>
        </div>
      </aside>

      <main v-if="selectedApp" class="editor">
        <section class="editor-hero">
          <div>
            <span class="muted">Editing application</span>
            <h2>{{ selectedApp.name || 'Unnamed app' }}</h2>
            <div class="hero-meta">
              <code>{{ selectedApp.id }}</code>
              <span>•</span>
              <span>{{ selectedApp.category || 'No category' }}</span>
              <span>•</span>
              <span>{{ Object.keys(selectedApp.deployments ?? {}).length }} build(s)</span>
            </div>
          </div>
          <div class="hero-actions">
            <button class="button ghost" @click="duplicateApp">Duplicate</button>
            <button class="button danger" @click="deleteApp">Delete</button>
          </div>
        </section>

        <nav class="tabs">
          <button :class="{ active: activeTab === 'overview' }" @click="activeTab = 'overview'">Overview</button>
          <button :class="{ active: activeTab === 'builds' }" @click="activeTab = 'builds'">Builds</button>
          <button :class="{ active: activeTab === 'json' }" @click="activeTab = 'json'">JSON preview</button>
        </nav>

        <div v-if="activeTab === 'overview'" class="content-grid">
          <section class="panel span-2">
            <div class="panel-title">
              <div>
                <span class="muted">Application</span>
                <h3>Core details</h3>
              </div>
            </div>
            <div class="form-grid">
              <label>
                <span>Name</span>
                <input v-model="selectedApp.name" :class="{ invalid: appIssue(selectedApp, 'name') }" @blur="cleanAppName(selectedApp)" />
                <small v-if="appIssue(selectedApp, 'name')" class="field-error">{{ appIssue(selectedApp, 'name') }}</small>
              </label>
              <label>
                <span>ID</span>
                <input :value="selectedApp.id" :class="{ invalid: appIssue(selectedApp, 'id') }" @change="changeAppId($event.target.value)" />
                <small>ID is automatically converted to a lowercase slug.</small>
              </label>
              <label>
                <span>Category</span>
                <input v-model="selectedApp.category" placeholder="observability" @blur="cleanCategory(selectedApp)" />
              </label>
              <label>
                <span>Base image</span>
                <input v-model.trim="selectedApp.image" :class="{ invalid: appIssue(selectedApp, 'image') }" placeholder="vendor/image" />
                <small v-if="appIssue(selectedApp, 'image')" class="field-error">{{ appIssue(selectedApp, 'image') }}</small>
              </label>
              <label class="span-2">
                <span>Description</span>
                <textarea v-model="selectedApp.description" rows="3"></textarea>
              </label>
              <label class="span-2">
                <span>README URL</span>
                <input v-model.trim="selectedApp.readme" :class="{ invalid: appIssue(selectedApp, 'readme') }" type="url" placeholder="https://…/README.md" />
                <small v-if="appIssue(selectedApp, 'readme')" class="field-error">{{ appIssue(selectedApp, 'readme') }}</small>
              </label>
            </div>
          </section>

          <section class="panel span-2 logo-panel">
            <div class="panel-title">
              <div>
                <span class="muted">Storefront asset</span>
                <h3>App logo</h3>
              </div>
              <button v-if="selectedApp.logo?.x32" class="button danger subtle" @click="removeLogo">Remove logo</button>
            </div>

            <div class="logo-editor">
              <div class="logo-preview">
                <img v-if="selectedApp.logo?.x128" :src="logoDataUrl(selectedApp.logo.x128)" :alt="`${selectedApp.name} logo preview`" />
                <span v-else>{{ (selectedApp.name || selectedApp.id || '?').slice(0, 1).toUpperCase() }}</span>
              </div>

              <div class="logo-controls">
                <div class="logo-input-row">
                  <label class="button ghost file-button logo-upload-button">
                    {{ logoBusy ? 'Processing…' : 'Upload image' }}
                    <input type="file" accept="image/*" :disabled="logoBusy" @change="handleLogoUpload" />
                  </label>
                  <span class="logo-or">or</span>
                  <div class="logo-url-row">
                    <input v-model.trim="logoImportUrl" type="url" placeholder="https://example.com/logo.png" :disabled="logoBusy" @keyup.enter="importLogoFromUrl" />
                    <button class="button ghost" :disabled="logoBusy || !logoImportUrl" @click="importLogoFromUrl">Import URL</button>
                  </div>
                </div>
                <p class="logo-help">Images are fitted without cropping onto transparent square canvases and stored as Base64 PNG at 32×32, 64×64 and 128×128.</p>
                <div v-if="selectedApp.logo?.x32" class="logo-resolution-preview">
                  <div><img :src="logoDataUrl(selectedApp.logo.x32)" alt="32px preview" /><span>32</span></div>
                  <div><img :src="logoDataUrl(selectedApp.logo.x64)" alt="64px preview" /><span>64</span></div>
                  <div><img :src="logoDataUrl(selectedApp.logo.x128)" alt="128px preview" /><span>128</span></div>
                </div>
              </div>
            </div>
          </section>

          <section class="panel">
            <div class="panel-title compact">
              <div><span class="muted">Discovery</span><h3>Tags</h3></div>
              <button class="small-button" @click="addListItem('tags')">Add</button>
            </div>
            <div class="stack">
              <div v-for="(_, index) in selectedApp.tags" :key="index" class="inline-row">
                <input v-model="selectedApp.tags[index]" placeholder="docker" @blur="cleanListValue('tags', index)" />
                <button class="remove" @click="removeListItem('tags', index)">×</button>
              </div>
              <p v-if="!selectedApp.tags?.length" class="empty">No tags yet.</p>
            </div>
          </section>

          <section class="panel">
            <div class="panel-title compact">
              <div><span class="muted">Storefront</span><h3>Highlights</h3></div>
              <button class="small-button" @click="addListItem('highlights')">Add</button>
            </div>
            <div class="stack">
              <div v-for="(_, index) in selectedApp.highlights" :key="index" class="inline-row">
                <input v-model="selectedApp.highlights[index]" placeholder="Lightweight" @blur="cleanListValue('highlights', index)" />
                <button class="remove" @click="removeListItem('highlights', index)">×</button>
              </div>
              <p v-if="!selectedApp.highlights?.length" class="empty">No highlights yet.</p>
            </div>
          </section>

          <section class="panel">
            <div class="panel-title compact">
              <div><span class="muted">Release channels</span><h3>Versions</h3></div>
              <button class="small-button" @click="addVersion">Add</button>
            </div>
            <div class="stack">
              <div v-for="(version, index) in selectedApp.versions" :key="index" class="version-row">
                <input v-model="version.tag" placeholder="latest" />
                <input v-model="version.label" placeholder="Latest" />
                <button class="remove" @click="removeVersion(index)">×</button>
              </div>
            </div>
          </section>

          <section class="panel">
            <div class="panel-title compact">
              <div><span class="muted">External</span><h3>Links</h3></div>
              <button class="small-button" @click="addLink">Add</button>
            </div>
            <div class="stack">
              <div v-for="(url, key) in selectedApp.links" :key="key" class="link-row">
                <input :value="key" @change="renameLink(key, $event.target.value)" />
                <input v-model.trim="selectedApp.links[key]" :class="{ invalid: appIssue(selectedApp, `link:${key}`) }" type="url" placeholder="https://…" />
                <button class="remove" @click="removeLink(key)">×</button>
              </div>
              <p v-if="!Object.keys(selectedApp.links ?? {}).length" class="empty">No links yet.</p>
            </div>
          </section>
        </div>

        <div v-else-if="activeTab === 'builds'" class="build-layout">
          <section v-if="latestDeployment" class="latest-card">
            <div>
              <span class="eyebrow">LATEST BUILD</span>
              <h3>{{ latestVersion?.label || 'Latest' }}</h3>
              <p>{{ latestDeployment.image || 'No image configured' }}</p>
            </div>
            <div class="latest-stats">
              <div><strong>{{ latestDeployment.ports?.length ?? 0 }}</strong><span>Ports</span></div>
              <div><strong>{{ latestDeployment.volumes?.length ?? 0 }}</strong><span>Volumes</span></div>
            </div>
          </section>

          <section
            v-for="(deployment, key) in selectedApp.deployments"
            :key="key"
            class="panel deployment"
          >
            <div class="panel-title">
              <div>
                <span class="muted">Deployment key</span>
                <input class="build-key" :value="key" @change="renameDeployment(key, $event.target.value)" />
              </div>
              <button class="button danger subtle" @click="removeDeployment(key)">Remove build</button>
            </div>

            <div class="form-grid">
              <label>
                <span>Container name</span>
                <input v-model="deployment.container_name" :class="{ invalid: deploymentIssue(selectedApp, key, 'container_name') }" @blur="cleanContainerName(deployment)" />
              </label>
              <label>
                <span>Docker image</span>
                <input v-model.trim="deployment.image" :class="{ invalid: deploymentIssue(selectedApp, key, 'image') }" placeholder="vendor/image:tag" />
              </label>
            </div>

            <div class="subsection">
              <div class="subsection-title">
                <h4>Ports</h4>
                <button class="small-button" @click="addPort(deployment)">Add port</button>
              </div>
              <div class="table-row header"><span>Host</span><span>Container</span><span>Label</span><span></span></div>
              <div v-for="(port, index) in deployment.ports" :key="index" class="table-row">
                <input v-model.number="port.host" :class="{ invalid: deploymentIssue(selectedApp, key, 'host-port', index) }" type="number" min="1" max="65535" />
                <input v-model.number="port.container" :class="{ invalid: deploymentIssue(selectedApp, key, 'container-port', index) }" type="number" min="1" max="65535" />
                <input v-model="port.label" />
                <button class="remove" @click="removeArrayItem(deployment.ports, index)">×</button>
              </div>
              <p v-if="!deployment.ports?.length" class="empty">No published ports.</p>
            </div>

            <div class="subsection">
              <div class="subsection-title">
                <h4>Volumes</h4>
                <button class="small-button" @click="addVolume(deployment)">Add volume</button>
              </div>
              <div class="table-row volume header"><span>Host</span><span>Container</span><span>Label</span><span></span></div>
              <div v-for="(volume, index) in deployment.volumes" :key="index" class="table-row volume">
                <input v-model.trim="volume.host" :class="{ invalid: deploymentIssue(selectedApp, key, 'volume-host', index) }" />
                <input v-model.trim="volume.container" :class="{ invalid: deploymentIssue(selectedApp, key, 'volume-container', index) }" />
                <input v-model="volume.label" />
                <button class="remove" @click="removeArrayItem(deployment.volumes, index)">×</button>
              </div>
              <p v-if="!deployment.volumes?.length" class="empty">No mounted volumes.</p>
            </div>
          </section>

          <button class="add-build" @click="addDeployment">+ Add another build</button>
        </div>

        <section v-else class="panel json-panel">
          <div class="panel-title">
            <div><span class="muted">Live document</span><h3>Readable JSON</h3></div>
            <button class="button ghost" @click="rawOpen = true">View minified</button>
          </div>
          <pre>{{ prettyJson }}</pre>
        </section>
      </main>

      <main v-else class="empty-editor">
        <div>
          <h2>No applications</h2>
          <p>Add your first app to start building the store.</p>
          <button class="button primary" @click="addApp">Add app</button>
        </div>
      </main>
    </div>

    <footer v-if="isDesktop" class="desktop-statusbar">
      <div><span class="status-dot"></span>{{ autosaveState }}</div>
      <div class="status-path" :title="outputLocation">Output: {{ outputLocation }}</div>
      <div>{{ storeData.apps.length }} app{{ storeData.apps.length === 1 ? '' : 's' }}</div>
      <button v-if="hasErrors" class="status-issues" type="button" @click="issuesOpen = true">{{ validationIssues.length }} issue{{ validationIssues.length === 1 ? '' : 's' }}</button><div v-else>Ready</div>
    </footer>


    <div v-if="settingsOpen" class="modal-backdrop" @click.self="settingsOpen = false">
      <section class="modal settings-modal" role="dialog" aria-modal="true" aria-labelledby="settings-title">
        <div class="modal-head">
          <div><span class="muted">Application</span><h2 id="settings-title">Settings</h2></div>
          <button class="icon-button" @click="settingsOpen = false">×</button>
        </div>

        <div class="settings-sections">
          <section class="settings-section">
            <div class="settings-section-copy">
              <h3>Appearance</h3>
              <p>Choose how Cerberus Store Builder should look. System follows your operating system and updates live.</p>
            </div>
            <div class="theme-switch settings-theme-switch" aria-label="Theme">
              <button :class="{ active: themeMode === 'light' }" @click="setTheme('light')">☀ <span>Light</span></button>
              <button :class="{ active: themeMode === 'system' }" @click="setTheme('system')">◐ <span>System</span></button>
              <button :class="{ active: themeMode === 'dark' }" @click="setTheme('dark')">☾ <span>Dark</span></button>
            </div>
          </section>

          <section class="settings-section">
            <div class="settings-section-copy">
              <h3>Output folder</h3>
              <p>Saved releases and version history are written here. Changing this does not move existing files.</p>
            </div>
            <div class="settings-path-card">
              <code :title="outputLocation">{{ outputLocation }}</code>
              <div class="settings-actions">
                <button class="button ghost" :disabled="!isDesktop" @click="chooseOutputFolder">Choose folder…</button>
                <button class="button ghost" :disabled="!isDesktop" @click="openOutputFolder">Open folder</button>
                <button class="button ghost" :disabled="!isDesktop || outputLocation === defaultOutputLocation" @click="resetOutputFolder">Use default</button>
              </div>
              <small v-if="defaultOutputLocation">Default: {{ defaultOutputLocation }}</small>
            </div>
          </section>


          <section class="settings-section settings-shortcuts-section">
            <div class="settings-section-copy">
              <h3>Keyboard shortcuts</h3>
              <p>Click a shortcut and press the new key combination. Changes are saved immediately and update the desktop menus.</p>
            </div>
            <div class="hotkey-list">
              <div v-for="item in HOTKEY_ACTIONS" :key="item.key" class="hotkey-row" :class="{ conflict: hotkeyConflicts.has(item.key) }">
                <div class="hotkey-copy"><strong>{{ item.label }}</strong><span>{{ item.description }}</span></div>
                <button class="hotkey-capture" type="button" :class="{ recording: hotkeyCapture === item.key }" @click="beginHotkeyCapture(item.key)" @keydown="captureHotkey($event, item.key)">
                  {{ hotkeyCapture === item.key ? 'Press shortcut…' : displayHotkey(hotkeys[item.key]) }}
                </button>
              </div>
              <div v-if="hotkeyConflicts.size" class="hotkey-warning">Two actions cannot use the same shortcut. Change one of the highlighted shortcuts before closing Settings.</div>
              <div class="hotkey-footer"><button class="button ghost" type="button" @click="resetHotkeys">Reset shortcuts</button></div>
            </div>
          </section>

          <section class="settings-section settings-info-section">
            <div class="settings-section-copy">
              <h3>Application information</h3>
              <p>Useful details about this installation and where its local state is stored.</p>
            </div>
            <dl class="settings-info-grid">
              <div><dt>Version</dt><dd>{{ appVersion || 'Development' }}</dd></div>
              <div><dt>Platform</dt><dd>{{ desktopPlatform }}</dd></div>
              <div><dt>Draft autosave</dt><dd>Local application profile</dd></div>
              <div><dt>Release format</dt><dd>Minified JSON</dd></div>
              <div v-if="settingsLocation" class="settings-info-wide"><dt>Native settings</dt><dd :title="settingsLocation">{{ settingsLocation }}</dd></div>
            </dl>
            <div class="settings-about-action"><button class="button ghost" type="button" @click="aboutOpen = true">About Cerberus Store Builder…</button></div>
          </section>
        </div>

        <div class="settings-note">
          <strong>Drafts and releases are separate.</strong>
          <span>Autosave protects your current working draft. Only Save Release writes a versioned JSON file into the output folder.</span>
        </div>

        <div class="modal-actions">
          <button class="button primary" :disabled="hotkeyConflicts.size > 0" @click="settingsOpen = false">Done</button>
        </div>
      </section>
    </div>


    <div v-if="aboutOpen" class="modal-backdrop" @click.self="aboutOpen = false">
      <section class="modal about-modal" role="dialog" aria-modal="true" aria-labelledby="about-title">
        <div class="modal-head">
          <div><span class="muted">Application</span><h2 id="about-title">About</h2></div>
          <button class="icon-button" @click="aboutOpen = false">×</button>
        </div>
        <div class="about-hero">
          <div class="about-logo"><img src="/logo-transparent.png" alt="Cerberus Store Builder logo" /></div>
          <div><h3>Cerberus Store Builder</h3><p>Build, validate, version and export self-contained Cerberus app store release files.</p><span class="about-version">Version {{ appVersion || 'Development' }}</span></div>
        </div>
        <dl class="about-details">
          <div><dt>Platform</dt><dd>{{ desktopPlatform }}{{ desktopArch ? ` · ${desktopArch}` : '' }}</dd></div>
          <div v-if="electronVersion"><dt>Electron</dt><dd>{{ electronVersion }}</dd></div>
          <div v-if="chromeVersion"><dt>Chromium</dt><dd>{{ chromeVersion }}</dd></div>
          <div v-if="nodeVersion"><dt>Node.js</dt><dd>{{ nodeVersion }}</dd></div>
          <div><dt>Release format</dt><dd>Minified JSON</dd></div>
          <div><dt>Output folder</dt><dd :title="outputLocation">{{ outputLocation }}</dd></div>
        </dl>
        <div class="about-note">Your working draft is autosaved locally. Versioned releases are only created when you explicitly use <strong>Save Release</strong>.</div>
        <div class="modal-actions"><button class="button primary" @click="aboutOpen = false">Close</button></div>
      </section>
    </div>

    <div v-if="issuesOpen" class="modal-backdrop" @click.self="issuesOpen = false">
      <section class="modal issues-modal" role="dialog" aria-modal="true" aria-labelledby="issues-title">
        <div class="modal-head">
          <div><span class="muted">Validation</span><h2 id="issues-title">{{ validationIssues.length }} issue{{ validationIssues.length === 1 ? '' : 's' }} to fix</h2></div>
          <button class="icon-button" @click="issuesOpen = false">×</button>
        </div>
        <p class="issues-intro">A release cannot be saved until these are resolved. Select an issue to jump to the relevant app or store settings.</p>
        <div class="issues-list">
          <button v-for="(issue, index) in validationIssues" :key="index" class="issue-row" type="button" @click="reviewIssue(issue)">
            <span class="issue-symbol">!</span>
            <span class="issue-copy">
              <strong>{{ issue.appId ? (storeData.apps.find(app => app.id === issue.appId)?.name || issue.appId) : 'Store' }}</strong>
              <span>{{ issue.message }}</span>
            </span>
            <span class="issue-jump">›</span>
          </button>
        </div>
        <div class="modal-actions">
          <button class="button ghost" @click="issuesOpen = false">Close</button>
        </div>
      </section>
    </div>

    <div v-if="metadataOpen" class="modal-backdrop" @click.self="metadataOpen = false">
      <section class="modal">
        <div class="modal-head">
          <div><span class="muted">Store file</span><h2>Package metadata</h2></div>
          <button class="icon-button" @click="metadataOpen = false">×</button>
        </div>
        <div class="form-grid">
          <label><span>Name</span><input v-model="storeData.name" @blur="storeData.name = cleanName(storeData.name)" /></label>
          <label><span>Current version</span><input v-model="storeData.version" /><small>Used as the base for the next automatic release.</small></label>
          <label><span>Author</span><input v-model="storeData.author" @blur="storeData.author = cleanName(storeData.author)" /></label>
          <label class="span-2"><span>Description</span><textarea v-model="storeData.description" rows="4"></textarea></label>
        </div>
        <div v-if="validationIssues.length" class="validation-summary">
          <strong>{{ validationIssues.length }} validation issue{{ validationIssues.length === 1 ? '' : 's' }}</strong>
          <ul><li v-for="(issue, index) in validationIssues.slice(0, 8)" :key="index">{{ issue.message }}</li></ul>
          <small v-if="validationIssues.length > 8">And {{ validationIssues.length - 8 }} more…</small>
        </div>
        <div class="modal-actions">
          <button class="button primary" @click="metadataOpen = false">Done</button>
        </div>
      </section>
    </div>

    <div v-if="rawOpen" class="modal-backdrop" @click.self="rawOpen = false">
      <section class="modal wide">
        <div class="modal-head">
          <div><span class="muted">Backend save representation</span><h2>Minified JSON</h2></div>
          <button class="icon-button" @click="rawOpen = false">×</button>
        </div>
        <pre class="raw-json">{{ minifiedJson }}</pre>
      </section>
    </div>

    <div v-if="clearOpen" class="modal-backdrop destructive-backdrop" @click.self="nudgeClearModal">
      <section class="modal confirm-modal" :class="{ 'modal-pulse': clearNudge }" role="alertdialog" aria-modal="true" aria-labelledby="clear-title">
        <div class="confirm-icon">!</div>
        <div class="confirm-copy">
          <span class="eyebrow">CLEAR DRAFT</span>
          <h2 id="clear-title">Clear the current store?</h2>
          <p>This replaces the current local draft with a new empty generic store. Your saved release files in <code>output/</code> are not deleted.</p>
        </div>
        <div class="confirm-actions">
          <button class="button ghost" @click="cancelClear">Go back</button>
          <button class="button danger confirm-danger" @click="confirmClear">Confirm clear</button>
        </div>
      </section>
    </div>

    <div v-if="toast" class="toast">{{ toast }}</div>
  </div>
</template>
