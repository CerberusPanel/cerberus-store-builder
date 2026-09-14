<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { mdiAlert, mdiChevronRight, mdiCircleSmall, mdiClose, mdiCog, mdiDelete, mdiFolderCogOutline, mdiKeyboardOutline, mdiPaletteOutline, mdiThemeLightDark, mdiWeatherNight, mdiWhiteBalanceSunny } from '@mdi/js'
import { createBlankApp, normaliseStore, starterStore } from './storeData'
import AppSidebar from './components/AppSidebar.vue'
import MdiIcon from './components/MdiIcon.vue'
import WorkspaceHeader from './components/WorkspaceHeader.vue'
import DeploymentsPage from './pages/DeploymentsPage.vue'
import JsonPreviewPage from './pages/JsonPreviewPage.vue'
import { readDraft, useDraftHistory } from './composables/useDraftHistory'
import { createLogoSet, fillMissingLogoResolutions, logoDataUrl, readFileAsDataUrl } from './services/logoProcessing'
import { cleanForExport, getNextVersion } from './utils/release'
import { orderAppJson, orderStoreJson } from './utils/jsonOrder'
import { cleanName, isHttpUrl, slugify } from './utils/text'
import { validateStore } from './utils/validation'

const THEME_KEY = 'cerberus-store-builder:theme'

const localDraft = readDraft()
const storeData = ref(normaliseStore(structuredClone(localDraft?.store ?? starterStore)))
const selectedId = ref(localDraft?.selectedId ?? storeData.value.apps[0]?.id ?? null)
const search = ref('')
const metadataOpen = ref(false)
const rawOpen = ref(false)
const clearOpen = ref(false)
const clearNudge = ref(false)
const issuesOpen = ref(false)
const settingsOpen = ref(false)
const aboutOpen = ref(false)
const deploymentsOpen = ref(false)
const activeDeploymentIndex = ref(null)
const hotkeyCapture = ref(null)
const searchInput = ref(null)
const toast = ref('')
const activeTab = ref(localDraft?.activeTab === 'json' ? 'json' : 'overview')
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
const draftHistory = useDraftHistory({ storeData, selectedId, activeTab, releaseChannel, lastSaveFilename })
const { autosaveState, undoStack, redoStack, lastSnapshot, persistDraft, undo, redo, resetHistory } = draftHistory
if (localDraft) autosaveState.value = 'Draft restored'

const selectedApp = computed(() =>
  storeData.value.apps.find(app => app.id === selectedId.value) ?? null,
)

function appSearchValues(app) {
  const ports = (app.deployments ?? []).flatMap(deployment => Array.isArray(deployment.ports)
    ? deployment.ports.flatMap(port => [port.host, port.container, port.label])
    : [deployment.ports],
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

const latestDeployment = computed(() => {
  const app = selectedApp.value
  if (!app) return null
  return app.deployments?.find(deployment => deployment.name === 'latest') ?? app.deployments?.[0] ?? null
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

function appIssue(app, field) {
  const issues = validationIssues.value
  return issues.find(issue => issue.appId === app?.id && issue.field === field)?.message ?? ''
}

function deploymentIssue(app, deploymentIndex, field, index = null) {
  return validationIssues.value.find(issue =>
    issue.appId === app?.id && issue.deploymentIndex === deploymentIndex && issue.field === field && issue.index === index
  )?.message ?? ''
}

function reviewIssue(issue) {
  issuesOpen.value = false
  if (!issue?.appId) {
    metadataOpen.value = true
    return
  }
  selectedId.value = issue.appId
  activeTab.value = 'overview'
  if (Number.isInteger(issue.deploymentIndex)) openDeployments(issue.deploymentIndex)
}

const validationIssues = computed(() => validateStore(storeData.value))

const hasErrors = computed(() => validationIssues.value.length > 0)

watch(selectedId, () => { logoImportUrl.value = selectedApp.value?.logo?.source_url ?? '' }, { immediate: true })

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
  // JSON cloning unwraps Vue's reactive proxy so duplicate always succeeds.
  const copy = JSON.parse(JSON.stringify(selectedApp.value))
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
function cleanListValue(field, index) {
  if (field === 'tags') selectedApp.value[field][index] = slugify(selectedApp.value[field][index])
  else selectedApp.value[field][index] = cleanName(selectedApp.value[field][index])
}

function addListItem(field) { selectedApp.value[field] ??= []; selectedApp.value[field].push('') }
function removeListItem(field, index) { selectedApp.value[field].splice(index, 1) }
function addDeployment() {
  let i = 1
  let key = `v${i}`
  while (selectedApp.value.deployments?.some(deployment => deployment.name === key)) key = `v${++i}`
  selectedApp.value.deployments ??= []
  selectedApp.value.deployments.push({ name: key, version: key, ports: [], volumes: [], environments: [] })
}

function openDeployments(index = null) {
  activeDeploymentIndex.value = index
  deploymentsOpen.value = true
}
function closeDeployments() {
  deploymentsOpen.value = false
  activeDeploymentIndex.value = null
}

function removeDeployment(index) {
  if (selectedApp.value.deployments?.length <= 1) { flash('Keep at least one deployment.'); return }
  selectedApp.value.deployments.splice(index, 1)
}
function addPort(deployment) { deployment.ports ??= []; deployment.ports.push({ host: 8080, container: 8080, protocol: 'tcp', label: 'Web UI', editable: false, required: false }) }
function addVolume(deployment) { deployment.volumes ??= []; deployment.volumes.push({ host: '', container: '', label: '', editable: false, required: false }) }
function addEnvironment(deployment) { deployment.environments ??= []; deployment.environments.push({ name: '', value: '', editable: false, required: false }) }
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

/** Generate all current logo sizes and retain the source URL when available. */
async function setLogoFromSource(source, sourceUrl = '') {
  if (!selectedApp.value) return
  logoBusy.value = true
  try {
    selectedApp.value.logo = {
      ...(sourceUrl ? { source_url: sourceUrl } : {}),
      ...await createLogoSet(source),
    }
    flash('Logo generated at 32px, 64px and 128px.')
  } catch (error) {
    flash(error.message || 'Could not process the logo.')
  } finally {
    logoBusy.value = false
  }
}

/** Fetch an image through the desktop bridge or web API and return a data URL. */
async function fetchLogoSource(url) {
  if (desktopApi) {
    const result = await desktopApi.importImage(url)
    if (!result?.ok) throw new Error(result?.error || 'Could not import that image URL.')
    return result.dataUrl
  }
  const response = await fetch('/api/image', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url }),
  })
  const result = await response.json()
  if (!response.ok || !result?.ok) throw new Error(result?.error || 'Could not import that image URL.')
  return result.dataUrl
}

/** Restore missing logo sizes when opening a draft or saved store document. */
async function populateMissingLogoResolutions() {
  let restored = 0
  for (const app of storeData.value.apps) {
    if (!app.logo) continue
    try {
      if (await fillMissingLogoResolutions(app.logo, fetchLogoSource)) restored++
    } catch {
      // Keep the app usable if its historical source URL is no longer reachable.
    }
  }
  if (restored) flash(`Restored missing logo resolution${restored === 1 ? '' : 's'}.`)
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
    const source = await fetchLogoSource(url)
    logoBusy.value = false
    await setLogoFromSource(source, url)
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
    storeData.value = normaliseStore(result.store)
    storeData.value.version = releaseBaseVersion(storeData.value.version)
    await populateMissingLogoResolutions()
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
  try {
    // JSON cloning unwraps Vue's reactive proxy before normalising the export.
    // This avoids DataCloneError while retaining the live editor state.
    const storeSnapshot = JSON.parse(JSON.stringify(storeData.value))
    const payload = cleanForExport(orderStoreJson(normaliseStore(storeSnapshot)))
    let result
    if (desktopApi) {
      result = await desktopApi.saveRelease({ store: payload, channel: releaseChannel.value })
    } else {
      const response = await fetch('/api/save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ store: payload, channel: releaseChannel.value }) })
      result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Save failed.')
    }
    if (!result.ok) throw new Error(result.error || 'Save failed.')
    storeData.value.version = releaseBaseVersion(result.version)
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
  await populateMissingLogoResolutions()
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKeyboard)
  window.matchMedia?.('(prefers-color-scheme: dark)').removeEventListener?.('change', handleSystemThemeChange)
  removeMenuListener?.()
  draftHistory.dispose()
  persistDraft()
})

function releaseBaseVersion(value) {
  const match = String(value ?? '').trim().match(/^\d+\.\d+\.\d+/)
  return match?.[0] ?? '0.0.0'
}
const baseStoreVersion = computed({
  get: () => releaseBaseVersion(storeData.value.version),
  set: value => { storeData.value.version = releaseBaseVersion(value) },
})
const nextReleaseVersion = computed(() => getNextVersion(baseStoreVersion.value, releaseChannel.value))
// The preview is an editor aid: show only the application currently in focus.
// Save Release still serialises the complete store document above.
// Preview the reactive editor model directly. Export-only cleanup belongs in
// saveRelease(), so this view always includes the user's current in-progress
// values rather than a cleaned or previously saved representation.
const prettyJson = computed(() => JSON.stringify(orderAppJson(selectedApp.value), null, 2))
const minifiedJson = computed(() => JSON.stringify(orderAppJson(selectedApp.value)))
</script>

<template>
  <div class="app-shell" :class="{ 'desktop-shell': isDesktop, [`platform-${desktopPlatform}`]: isDesktop }">
    <div v-if="isDesktop" class="desktop-titlebar">
      <div class="desktop-brand">
        <span class="desktop-mark"><img src="/logo.png" alt="Cerberus logo" /></span>
        <span>Cerberus Store Builder</span>
      </div>
      <div class="desktop-document">{{ lastSaveFilename || 'Unsaved store' }}</div>
    </div>
    <WorkspaceHeader
      :store-name="storeData.name"
      :undo-count="undoStack.length"
      :redo-count="redoStack.length"
      :has-unsaved-change="JSON.stringify(storeData) !== lastSnapshot"
      :hotkeys="hotkeys"
      :display-hotkey="displayHotkey"
      :saving="saving"
      :next-release-version="nextReleaseVersion"
      :has-errors="hasErrors"
      :issue-count="validationIssues.length"
      @undo="undo"
      @redo="redo"
      @open-metadata="metadataOpen = true"
      @open-issues="issuesOpen = true"
      @save="saveRelease"
    />

    <div class="workspace">
      <AppSidebar
        ref="searchInput"
        v-model:search="search"
        :apps="storeData.apps"
        :filtered-apps="filteredApps"
        :selected-id="selectedId"
        :search-match-count="searchMatchCount"
        :last-save-filename="lastSaveFilename"
        :is-desktop="isDesktop"
        @add-app="addApp"
        @select-app="selectedId = $event"
        @clear-draft="requestClear"
        @open-output-folder="openOutputFolder"
      />

      <main v-if="selectedApp" class="editor">
        <section class="editor-hero">
          <div>
            <span class="muted">Editing application</span>
            <h2>{{ selectedApp.name || 'Unnamed app' }}</h2>
            <div class="hero-meta">
              <code>{{ selectedApp.id }}</code>
              <MdiIcon :path="mdiCircleSmall" :size="12" />
              <span>{{ selectedApp.category || 'No category' }}</span>
              <MdiIcon :path="mdiCircleSmall" :size="12" />
              <span>{{ selectedApp.deployments?.length ?? 0 }} deployment(s)</span>
            </div>
          </div>
          <div class="hero-actions">
            <button class="button ghost" @click="duplicateApp">Duplicate</button>
            <button class="button ghost" @click="openDeployments()">Deployments</button>
            <button class="button danger" @click="deleteApp">Delete</button>
          </div>
        </section>

        <nav class="tabs">
          <button :class="{ active: activeTab === 'overview' }" @click="activeTab = 'overview'">Overview</button>
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
                    <input v-model.trim="logoImportUrl" type="url" placeholder="Original image URL (https://…)" :disabled="logoBusy" @keyup.enter="importLogoFromUrl" />
                    <button class="button ghost" :disabled="logoBusy || !logoImportUrl" @click="importLogoFromUrl">Save & import</button>
                  </div>
                </div>
                <p class="logo-help">The original URL is stored with the logo. Images are fitted without cropping onto transparent square canvases and saved as PNG data URLs at 32×32, 64×64 and 128×128.</p>
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
                <button class="remove" title="Remove tag" @click="removeListItem('tags', index)"><MdiIcon :path="mdiDelete" :size="15" /></button>
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
                <button class="remove" title="Remove highlight" @click="removeListItem('highlights', index)"><MdiIcon :path="mdiDelete" :size="15" /></button>
              </div>
              <p v-if="!selectedApp.highlights?.length" class="empty">No highlights yet.</p>
            </div>
          </section>

          <section class="panel">
            <div class="panel-title compact">
              <div><span class="muted">Release configuration</span><h3>Versions</h3></div>
              <button class="small-button" @click="addDeployment">Add version</button>
            </div>
            <div class="stack">
              <div v-for="(deployment, index) in selectedApp.deployments" :key="index" class="version-row">
                <input v-model.trim="deployment.name" placeholder="v1" />
                <button class="button ghost" @click="openDeployments(index)">Configure</button>
                <button class="remove" title="Remove version" @click="removeDeployment(index)"><MdiIcon :path="mdiDelete" :size="15" /></button>
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
                <button class="remove" title="Remove link" @click="removeLink(key)"><MdiIcon :path="mdiDelete" :size="15" /></button>
              </div>
              <p v-if="!Object.keys(selectedApp.links ?? {}).length" class="empty">No links yet.</p>
            </div>
          </section>
        </div>

        <JsonPreviewPage v-else :json="prettyJson" @view-minified="rawOpen = true" />
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
      <button class="status-settings" type="button" :title="`Settings (${displayHotkey(hotkeys.settings)})`" @click="settingsOpen = true"><MdiIcon :path="mdiCog" :size="14" /> Settings</button>
    </footer>

    <div v-if="deploymentsOpen && selectedApp" class="modal-backdrop" @click.self="closeDeployments">
      <section class="modal wide deployments-modal" role="dialog" aria-modal="true" aria-labelledby="deployments-title">
        <div class="modal-head">
          <div><span class="muted">{{ selectedApp.name || 'Application' }}</span><h2 id="deployments-title">Deployment configuration</h2></div>
          <button class="icon-button" title="Close" @click="closeDeployments"><MdiIcon :path="mdiClose" /></button>
        </div>
        <DeploymentsPage
          :app="selectedApp"
          :deployment-index="activeDeploymentIndex"
          :latest-deployment="latestDeployment"
          :deployment-issue="deploymentIssue"
          @remove="removeDeployment"
          @add-port="addPort"
          @add-volume="addVolume"
          @add-environment="addEnvironment"
          @remove-item="removeArrayItem"
        />
        <div class="modal-actions"><button class="button primary" @click="closeDeployments">Done</button></div>
      </section>
    </div>


    <div v-if="settingsOpen" class="modal-backdrop" @click.self="settingsOpen = false">
      <section class="modal settings-modal" role="dialog" aria-modal="true" aria-labelledby="settings-title">
        <div class="modal-head settings-head">
          <div><span class="muted">CERBERUS STORE BUILDER</span><h2 id="settings-title">Settings</h2><p>Shape your workspace, local release location, and keyboard workflow.</p></div>
          <button class="icon-button" title="Close" @click="settingsOpen = false"><MdiIcon :path="mdiClose" /></button>
        </div>

        <div class="settings-sections">
          <section class="settings-section">
            <div class="settings-section-copy">
              <div class="settings-section-title"><MdiIcon :path="mdiPaletteOutline" :size="19" /><h3>Appearance</h3></div>
              <p>Choose how Cerberus Store Builder should look. System follows your operating system and updates live.</p>
            </div>
            <div class="theme-switch settings-theme-switch" aria-label="Theme">
              <button :class="{ active: themeMode === 'light' }" @click="setTheme('light')"><MdiIcon :path="mdiWhiteBalanceSunny" :size="16" /> <span>Light</span></button>
              <button :class="{ active: themeMode === 'system' }" @click="setTheme('system')"><MdiIcon :path="mdiThemeLightDark" :size="16" /> <span>System</span></button>
              <button :class="{ active: themeMode === 'dark' }" @click="setTheme('dark')"><MdiIcon :path="mdiWeatherNight" :size="16" /> <span>Dark</span></button>
            </div>
          </section>

          <section class="settings-section">
            <div class="settings-section-copy">
              <div class="settings-section-title"><MdiIcon :path="mdiFolderCogOutline" :size="19" /><h3>Output folder</h3></div>
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
              <div class="settings-section-title"><MdiIcon :path="mdiKeyboardOutline" :size="19" /><h3>Keyboard shortcuts</h3></div>
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

        </div>

        <div class="settings-note">
          <strong>Drafts and releases are separate.</strong>
          <span>Autosave protects your current working draft. Only Save Release writes a versioned JSON file into the output folder.</span>
        </div>

        <div class="modal-actions">
          <button class="button ghost" type="button" @click="aboutOpen = true">About application</button>
          <button class="button primary" :disabled="hotkeyConflicts.size > 0" @click="settingsOpen = false">Done</button>
        </div>
      </section>
    </div>


    <div v-if="aboutOpen" class="modal-backdrop" @click.self="aboutOpen = false">
      <section class="modal about-modal" role="dialog" aria-modal="true" aria-labelledby="about-title">
        <div class="modal-head about-head">
          <div><span class="muted">CERBERUS STORE BUILDER</span><h2 id="about-title">About this application</h2><p>Release-file authoring for the Cerberus app store.</p></div>
          <button class="icon-button" title="Close" @click="aboutOpen = false"><MdiIcon :path="mdiClose" /></button>
        </div>
        <div class="about-hero about-card">
          <div class="about-logo"><img src="/logo.png" alt="Cerberus Store Builder logo" /></div>
          <div><h3>Cerberus Store Builder</h3><p>Build, validate, version, and export self-contained app-store releases.</p><span class="about-version">Version {{ appVersion || 'Development' }}</span></div>
        </div>
        <dl class="about-details about-card">
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
          <button class="icon-button" title="Close" @click="issuesOpen = false"><MdiIcon :path="mdiClose" /></button>
        </div>
        <p class="issues-intro">A release cannot be saved until these are resolved. Select an issue to jump to the relevant app or store settings.</p>
        <div class="issues-list">
          <button v-for="(issue, index) in validationIssues" :key="index" class="issue-row" type="button" @click="reviewIssue(issue)">
            <MdiIcon class="issue-symbol" :path="mdiAlert" :size="18" />
            <span class="issue-copy">
              <strong>{{ issue.appId ? (storeData.apps.find(app => app.id === issue.appId)?.name || issue.appId) : 'Store' }}</strong>
              <span>{{ issue.message }}</span>
            </span>
            <MdiIcon class="issue-jump" :path="mdiChevronRight" :size="18" />
          </button>
        </div>
        <div class="modal-actions">
          <button class="button ghost" @click="issuesOpen = false">Close</button>
        </div>
      </section>
    </div>

    <div v-if="metadataOpen" class="modal-backdrop" @click.self="metadataOpen = false">
      <section class="modal store-data-modal">
        <div class="modal-head">
          <div><span class="muted">Store release</span><h2>Store data</h2><p class="modal-subtitle">Configure release metadata before saving a versioned store file.</p></div>
          <button class="icon-button" title="Close" @click="metadataOpen = false"><MdiIcon :path="mdiClose" /></button>
        </div>
        <div class="form-grid">
          <label><span>Name</span><input v-model="storeData.name" @blur="storeData.name = cleanName(storeData.name)" /></label>
          <label><span>Release base version</span><input v-model="baseStoreVersion" inputmode="decimal" pattern="\d+\.\d+\.\d+" placeholder="0.0.0" /><small>Only the stable base is stored here.</small></label>
          <label><span>Author</span><input v-model="storeData.author" @blur="storeData.author = cleanName(storeData.author)" /></label>
          <label class="span-2"><span>Description</span><textarea v-model="storeData.description" rows="4"></textarea></label>
        </div>
        <div class="release-metadata">
          <label><span>Release channel</span><select v-model="releaseChannel"><option value="alpha">Alpha</option><option value="beta">Beta</option><option value="public">Public</option></select></label>
          <div class="release-next"><span>Calculated next release</span><strong>{{ nextReleaseVersion }}</strong><small>The channel suffix is calculated automatically.</small></div>
        </div>
        <div v-if="validationIssues.length" class="validation-summary">
          <strong>{{ validationIssues.length }} validation issue{{ validationIssues.length === 1 ? '' : 's' }}</strong>
          <ul><li v-for="(issue, index) in validationIssues.slice(0, 8)" :key="index">{{ issue.message }}</li></ul>
          <small v-if="validationIssues.length > 8">And {{ validationIssues.length - 8 }} more…</small>
        </div>
        <div class="modal-actions">
          <button class="button ghost" :disabled="saving" @click="loadLastSave">Load saved release</button>
          <button class="button primary" @click="metadataOpen = false">Done</button>
        </div>
      </section>
    </div>

    <div v-if="rawOpen" class="modal-backdrop" @click.self="rawOpen = false">
      <section class="modal wide">
        <div class="modal-head">
          <div><span class="muted">Backend save representation</span><h2>Minified JSON</h2></div>
          <button class="icon-button" title="Close" @click="rawOpen = false"><MdiIcon :path="mdiClose" /></button>
        </div>
        <pre class="raw-json">{{ minifiedJson }}</pre>
      </section>
    </div>

    <div v-if="clearOpen" class="modal-backdrop destructive-backdrop" @click.self="nudgeClearModal">
      <section class="modal confirm-modal" :class="{ 'modal-pulse': clearNudge }" role="alertdialog" aria-modal="true" aria-labelledby="clear-title">
        <div class="confirm-icon"><MdiIcon :path="mdiAlert" :size="28" /></div>
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
