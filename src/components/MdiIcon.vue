<script setup>
defineProps({ path: { type: String, required: true }, size: { type: [Number, String], default: 18 } })
</script>

<template>
  <svg class="mdi-icon" :width="size" :height="size" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path :d="path" /></svg>
</template>
