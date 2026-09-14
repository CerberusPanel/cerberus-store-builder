<script setup>
import { mdiRedo, mdiUndo } from '@mdi/js'
import MdiIcon from './MdiIcon.vue'
const props = defineProps({
  storeName: { type: String, default: '' },
  undoCount: { type: Number, required: true },
  redoCount: { type: Number, required: true },
  hasUnsavedChange: Boolean,
  hotkeys: { type: Object, required: true },
  displayHotkey: { type: Function, required: true },
  saving: Boolean,
  nextReleaseVersion: { type: String, required: true },
  hasErrors: Boolean,
  issueCount: { type: Number, required: true },
})
const emit = defineEmits(['undo', 'redo', 'open-metadata', 'open-issues', 'save'])
</script>

<template>
  <header class="topbar">
    <div class="workspace-title">
      <div class="workspace-title-icon"><img src="/logo-transparent.png" alt="Cerberus logo" /></div>
      <div><div class="eyebrow">STORE WORKSPACE</div><h1>{{ props.storeName || 'Untitled Store' }}</h1></div>
    </div>
    <div class="topbar-release"><span>Next release</span><strong>{{ props.nextReleaseVersion }}</strong></div>
    <div class="top-actions">
      <div class="toolbar-group draft-tools" aria-label="Draft controls">
        <div class="history-actions">
          <button class="button ghost compact-button icon-text-button" :disabled="!props.undoCount && !props.hasUnsavedChange" :title="`Undo (${props.displayHotkey(props.hotkeys.undo)})`" @click="emit('undo')"><MdiIcon :path="mdiUndo" :size="16" /><span class="button-label">Undo</span></button>
          <button class="button ghost compact-button icon-text-button" :disabled="!props.redoCount" :title="`Redo (${props.displayHotkey(props.hotkeys.redo)})`" @click="emit('redo')"><MdiIcon :path="mdiRedo" :size="16" /><span class="button-label">Redo</span></button>
        </div>
      </div>
      <div class="toolbar-group store-tools" aria-label="Store controls">
        <button class="button ghost compact-button" @click="emit('open-metadata')">Store data</button>
      </div>
      <div class="toolbar-group release-tools" aria-label="Release controls">
        <div class="save-area">
          <button v-if="props.hasErrors" class="error-count issue-button" type="button" title="Review validation issues" @click="emit('open-issues')">{{ props.issueCount }} issue{{ props.issueCount === 1 ? '' : 's' }}</button>
          <button class="button primary compact-button save-button" :disabled="props.saving || props.hasErrors" @click="emit('save')">{{ props.saving ? 'Working…' : 'Save' }}</button>
        </div>
      </div>
    </div>
  </header>
</template>
