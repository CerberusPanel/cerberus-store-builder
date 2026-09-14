<script setup>
defineProps({
  path: { type: String, required: true },
  size: { type: [Number, String], default: 18 },
  title: { type: String, default: '' },
})
</script>

<template>
  <svg class="mdi-icon" :width="size" :height="size" viewBox="0 0 24 24" role="img" :aria-label="title || undefined" aria-hidden="title ? undefined : 'true'" focusable="false">
    <title v-if="title">{{ title }}</title>
    <path :d="path" fill="currentColor" />
  </svg>
</template>
