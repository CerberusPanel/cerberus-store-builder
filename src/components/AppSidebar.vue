<script setup>
import { ref } from 'vue'
import { mdiClose, mdiFolderOpen, mdiMagnify, mdiPlus } from '@mdi/js'
import MdiIcon from './MdiIcon.vue'
import { logoDataUrl } from '../services/logoProcessing'

const props = defineProps({
  apps: { type: Array, required: true },
  filteredApps: { type: Array, required: true },
  selectedId: { type: String, default: null },
  search: { type: String, default: '' },
  searchMatchCount: { type: Number, required: true },
  lastSaveFilename: { type: String, default: '' },
  isDesktop: Boolean,
})
const emit = defineEmits(['add-app', 'select-app', 'update:search', 'clear-draft', 'open-output-folder'])
const searchInput = ref(null)

function focusSearch() {
  searchInput.value?.focus()
  searchInput.value?.select()
}

defineExpose({ focus: focusSearch, select: () => searchInput.value?.select() })
</script>

<template>
  <aside class="sidebar">
    <div class="sidebar-head">
      <div><span class="muted">Applications</span><strong>{{ props.apps.length }}</strong></div>
      <button class="icon-button" title="Add app" @click="emit('add-app')"><MdiIcon :path="mdiPlus" /></button>
    </div>

    <div class="sidebar-search">
      <div class="search-box">
        <span class="search-icon"><MdiIcon :path="mdiMagnify" :size="16" /></span>
        <input ref="searchInput" :value="props.search" class="search" placeholder="Search apps…" aria-label="Search applications" @input="emit('update:search', $event.target.value)" />
        <button v-if="props.search" class="search-clear" title="Clear search" @click="emit('update:search', '')"><MdiIcon :path="mdiClose" :size="14" /></button>
      </div>
      <span v-if="props.search" class="search-count">{{ props.searchMatchCount }} match{{ props.searchMatchCount === 1 ? '' : 'es' }}</span>
    </div>

    <div class="app-list">
      <button v-for="item in props.filteredApps" :key="item.app.id" class="app-row" :class="{ selected: item.app.id === props.selectedId, 'search-miss': !item.matches }" :title="!item.matches ? 'Currently open — does not match this search' : ''" @click="item.matches && emit('select-app', item.app.id)">
        <div class="app-avatar">
          <img v-if="item.app.logo?.x32" :src="logoDataUrl(item.app.logo.x32)" :alt="`${item.app.name || item.app.id} logo`" />
          <span v-else>{{ (item.app.name || item.app.id || '?').slice(0, 1).toUpperCase() }}</span>
        </div>
        <div class="app-row-text"><strong>{{ item.app.name || 'Unnamed app' }}</strong><span>{{ item.app.id || 'missing-id' }}</span></div>
        <span class="category-pill">{{ item.app.category || 'uncategorised' }}</span>
      </button>
      <div v-if="props.search && props.searchMatchCount === 0" class="sidebar-empty">No applications match this search.</div>
    </div>

    <div class="sidebar-footer">
      <div class="sidebar-footer-row">
        <button class="text-button danger-text" @click="emit('clear-draft')">Clear</button>
        <button v-if="props.isDesktop" class="text-button" title="Open output folder" @click="emit('open-output-folder')">Output folder <MdiIcon :path="mdiFolderOpen" :size="14" /></button>
      </div>
      <span>{{ props.lastSaveFilename || 'No save loaded' }}</span>
    </div>
  </aside>
</template>
