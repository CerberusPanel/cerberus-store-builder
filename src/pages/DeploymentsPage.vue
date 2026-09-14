<script setup>
import { computed } from 'vue'
import { mdiDelete } from '@mdi/js'
import MdiIcon from '../components/MdiIcon.vue'

const props = defineProps({
  app: { type: Object, required: true },
  deploymentIndex: { type: Number, default: null },
  latestDeployment: { type: Object, default: null },
  deploymentIssue: { type: Function, required: true },
})
const emit = defineEmits(['remove', 'add-port', 'add-volume', 'add-environment', 'remove-item'])
const showLatest = computed(() => props.deploymentIndex === null || props.app.deployments?.[props.deploymentIndex] === props.latestDeployment)

function entryCount(value) { return Array.isArray(value) ? value.length : 0 }
function isInherited(deployment, field) { return typeof deployment[field] === 'string' }
function inheritedVersion(deployment, field) { return isInherited(deployment, field) ? deployment[field] : '' }
function hasLocalData(deployment, field) { return Array.isArray(deployment[field]) && deployment[field].length > 0 }
function canChooseInheritance(deployment, field) { return isInherited(deployment, field) || !hasLocalData(deployment, field) }
function setInheritance(deployment, field, version) {
  if (!canChooseInheritance(deployment, field)) return
  deployment[field] = version || []
}
function availableVersions(index) { return props.app.deployments.filter((_, candidateIndex) => candidateIndex !== index) }
</script>

<template>
  <div class="build-layout">
    <section v-if="props.latestDeployment && showLatest" class="latest-card">
      <div><span class="eyebrow">LATEST DEPLOYMENT</span><h3>{{ props.latestDeployment.name }}</h3><p>{{ props.app.image }}:{{ props.latestDeployment.version }}</p></div>
      <div class="latest-stats">
        <div><strong>{{ entryCount(props.latestDeployment.ports) }}</strong><span>Ports</span></div>
        <div><strong>{{ entryCount(props.latestDeployment.volumes) }}</strong><span>Volumes</span></div>
      </div>
    </section>

    <section v-for="(deployment, deploymentIndex) in props.app.deployments" v-show="props.deploymentIndex === null || props.deploymentIndex === deploymentIndex" :key="deploymentIndex" class="panel deployment">
      <div class="panel-title">
        <div><span class="muted">Deployment</span><strong>{{ deployment.name || 'Unnamed deployment' }}</strong></div>
        <button class="button danger subtle" @click="emit('remove', deploymentIndex)">Remove deployment</button>
      </div>
      <div class="form-grid">
        <label><span>Name</span><input v-model.trim="deployment.name" :class="{ invalid: props.deploymentIssue(props.app, deploymentIndex, 'name') }" placeholder="latest" /></label>
        <label><span>Image version tag</span><div class="image-tag-field" :class="{ invalid: props.deploymentIssue(props.app, deploymentIndex, 'version') }"><span class="image-tag-prefix">{{ props.app.image || 'Set a base image first' }}:</span><input v-model.trim="deployment.version" placeholder="latest" aria-label="Deployment image tag" /></div></label>
      </div>

      <div class="subsection">
        <div class="subsection-title"><h4>Ports</h4><div class="inherit-control"><label v-if="props.app.deployments.length > 1">Inherit from<select :value="inheritedVersion(deployment, 'ports')" :disabled="!canChooseInheritance(deployment, 'ports')" :title="hasLocalData(deployment, 'ports') ? 'Remove local port rows before inheriting.' : ''" @change="setInheritance(deployment, 'ports', $event.target.value)"><option value="">This version</option><option v-for="candidate in availableVersions(deploymentIndex)" :key="candidate.name" :value="candidate.name">{{ candidate.name }}</option></select></label><button v-if="!isInherited(deployment, 'ports')" class="small-button" @click="emit('add-port', deployment)">Add port</button></div></div>
        <p v-if="isInherited(deployment, 'ports')" class="empty inherited-note">Inherits ports from version <strong>{{ deployment.ports }}</strong>.</p>
        <template v-else><div class="table-row port-row header"><span>Host</span><span>Container</span><span>Protocol</span><span>Label</span><span>Editable</span><span>Required</span><span></span></div>
        <div v-for="(port, index) in deployment.ports" :key="index" class="table-row port-row">
          <input v-model.number="port.host" :class="{ invalid: props.deploymentIssue(props.app, deploymentIndex, 'host-port', index) }" type="number" min="1" max="65535" />
          <input v-model.number="port.container" :class="{ invalid: props.deploymentIssue(props.app, deploymentIndex, 'container-port', index) }" type="number" min="1" max="65535" />
          <select v-model="port.protocol" :class="{ invalid: props.deploymentIssue(props.app, deploymentIndex, 'protocol', index) }" aria-label="Port protocol"><option value="tcp">TCP</option><option value="udp">UDP</option><option value="both">TCP/UDP</option></select>
          <input v-model="port.label" />
          <label class="table-check" title="Allow this port to be edited"><input v-model="port.editable" type="checkbox" /><span class="sr-only">Editable</span></label>
          <label class="table-check" title="Require this port"><input v-model="port.required" type="checkbox" /><span class="sr-only">Required</span></label>
          <button class="remove" title="Remove port" @click="emit('remove-item', deployment.ports, index)"><MdiIcon :path="mdiDelete" :size="15" /></button>
        </div>
        <p v-if="!deployment.ports?.length" class="empty">No published ports.</p></template>
      </div>

      <div class="subsection">
        <div class="subsection-title"><h4>Volumes</h4><div class="inherit-control"><label v-if="props.app.deployments.length > 1">Inherit from<select :value="inheritedVersion(deployment, 'volumes')" :disabled="!canChooseInheritance(deployment, 'volumes')" :title="hasLocalData(deployment, 'volumes') ? 'Remove local volume rows before inheriting.' : ''" @change="setInheritance(deployment, 'volumes', $event.target.value)"><option value="">This version</option><option v-for="candidate in availableVersions(deploymentIndex)" :key="candidate.name" :value="candidate.name">{{ candidate.name }}</option></select></label><button v-if="!isInherited(deployment, 'volumes')" class="small-button" @click="emit('add-volume', deployment)">Add volume</button></div></div>
        <p v-if="isInherited(deployment, 'volumes')" class="empty inherited-note">Inherits volumes from version <strong>{{ deployment.volumes }}</strong>.</p>
        <template v-else><div class="table-row volume config-row header"><span>Host</span><span>Container</span><span>Label</span><span>Editable</span><span>Required</span><span></span></div>
        <div v-for="(volume, index) in deployment.volumes" :key="index" class="table-row volume config-row">
          <input v-model.trim="volume.host" :class="{ invalid: props.deploymentIssue(props.app, deploymentIndex, 'volume-host', index) }" />
          <input v-model.trim="volume.container" :class="{ invalid: props.deploymentIssue(props.app, deploymentIndex, 'volume-container', index) }" />
          <input v-model="volume.label" />
          <label class="table-check" title="Allow this volume to be edited"><input v-model="volume.editable" type="checkbox" /><span class="sr-only">Editable</span></label>
          <label class="table-check" title="Require this volume"><input v-model="volume.required" type="checkbox" /><span class="sr-only">Required</span></label>
          <button class="remove" title="Remove volume" @click="emit('remove-item', deployment.volumes, index)"><MdiIcon :path="mdiDelete" :size="15" /></button>
        </div>
        <p v-if="!deployment.volumes?.length" class="empty">No mounted volumes.</p></template>
      </div>
      <div class="subsection">
        <div class="subsection-title"><h4>Environment variables</h4><div class="inherit-control"><label v-if="props.app.deployments.length > 1">Inherit from<select :value="inheritedVersion(deployment, 'environments')" :disabled="!canChooseInheritance(deployment, 'environments')" :title="hasLocalData(deployment, 'environments') ? 'Remove local environment rows before inheriting.' : ''" @change="setInheritance(deployment, 'environments', $event.target.value)"><option value="">This version</option><option v-for="candidate in availableVersions(deploymentIndex)" :key="candidate.name" :value="candidate.name">{{ candidate.name }}</option></select></label><button v-if="!isInherited(deployment, 'environments')" class="small-button" @click="emit('add-environment', deployment)">Add variable</button></div></div>
        <p v-if="isInherited(deployment, 'environments')" class="empty inherited-note">Inherits environment variables from version <strong>{{ deployment.environments }}</strong>.</p>
        <template v-else><div class="table-row volume config-row header"><span>Name</span><span>Value</span><span>Label</span><span>Editable</span><span>Required</span><span></span></div>
        <div v-for="(environment, index) in deployment.environments" :key="index" class="table-row volume config-row"><input v-model.trim="environment.name" placeholder="TZ" /><input v-model="environment.value" placeholder="Europe/London" /><input v-model="environment.label" placeholder="Timezone" /><label class="table-check" title="Allow this variable to be edited"><input v-model="environment.editable" type="checkbox" /><span class="sr-only">Editable</span></label><label class="table-check" title="Require this variable"><input v-model="environment.required" type="checkbox" /><span class="sr-only">Required</span></label><button class="remove" title="Remove environment variable" @click="emit('remove-item', deployment.environments, index)"><MdiIcon :path="mdiDelete" :size="15" /></button></div>
        <p v-if="!deployment.environments?.length" class="empty">No environment variables.</p></template>
      </div>
    </section>
  </div>
</template>
