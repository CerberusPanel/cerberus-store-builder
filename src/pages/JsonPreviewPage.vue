<script setup>
defineProps({ json: { type: String, required: true } })
defineEmits(['view-minified'])
</script>

<template>
  <section class="panel json-panel">
    <div class="panel-title">
      <div><span class="muted">Selected application</span><h3>Readable JSON</h3></div>
      <button class="button ghost" @click="$emit('view-minified')">View minified</button>
    </div>
    <pre>{{ json }}</pre>
  </section>
</template>
