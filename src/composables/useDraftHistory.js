import { ref, watch } from 'vue'

export const DRAFT_KEY = 'cerberus-store-builder:draft:v3'

/** Read a valid browser draft without allowing corrupt local data to block startup. */
export function readDraft() {
  try {
    const parsed = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null')
    if (parsed?.store && Array.isArray(parsed.store.apps)) return parsed
  } catch {
    // A corrupt browser draft should never prevent the editor from starting.
  }
  return null
}

/** Manage debounced draft persistence and undo/redo snapshots for a store ref. */
export function useDraftHistory({ storeData, selectedId, activeTab, releaseChannel, lastSaveFilename }) {
  const autosaveState = ref('Autosave ready')
  const undoStack = ref([])
  const redoStack = ref([])
  const lastSnapshot = ref(JSON.stringify(storeData.value))
  let historyTimer = null
  let autosaveTimer = null
  let suppressHistory = false

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
      if (current === lastSnapshot.value) return
      undoStack.value.push(lastSnapshot.value)
      if (undoStack.value.length > 100) undoStack.value.shift()
      lastSnapshot.value = current
      redoStack.value = []
    }, 350)
  }

  function applySnapshot(snapshot) {
    suppressHistory = true
    clearTimeout(historyTimer)
    storeData.value = JSON.parse(snapshot)
    lastSnapshot.value = snapshot
    if (!storeData.value.apps.some(app => app.id === selectedId.value)) selectedId.value = storeData.value.apps[0]?.id ?? null
    window.setTimeout(() => { suppressHistory = false }, 0)
    scheduleAutosave()
  }

  function undo() {
    clearTimeout(historyTimer)
    const current = JSON.stringify(storeData.value)
    if (current !== lastSnapshot.value) {
      redoStack.value.push(current)
      applySnapshot(lastSnapshot.value)
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
    lastSnapshot.value = JSON.stringify(storeData.value)
  }

  function dispose() {
    clearTimeout(historyTimer)
    clearTimeout(autosaveTimer)
  }

  watch(storeData, () => { scheduleHistorySnapshot(); scheduleAutosave() }, { deep: true, flush: 'post' })
  watch([selectedId, activeTab, releaseChannel, lastSaveFilename], scheduleAutosave)

  return { autosaveState, undoStack, redoStack, lastSnapshot, persistDraft, undo, redo, resetHistory, dispose }
}
