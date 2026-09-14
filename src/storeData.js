const PNG_DATA_URL_PREFIX = 'data:image/png;base64,'

function asPngDataUrl(value) {
  if (!value) return ''
  const image = String(value)
  return image.startsWith('data:image/') ? image : `${PNG_DATA_URL_PREFIX}${image}`
}

export const starterStore = {
  name: 'Store',
  version: '0.0.0',
  description: '',
  author: '',
  apps: [],
}

export function createBlankApp(index = 1) {
  const id = `new-app-${index}`
  return {
    id,
    name: 'New App',
    description: '',
    category: '',
    image: '',
    tags: [],
    highlights: [],
    readme: '',
    links: {},
    deployments: [{ name: 'latest', version: 'latest', ports: [], volumes: [], environments: [] }],
  }
}

/**
 * Migrate legacy version arrays into version-named deployments. Versions are
 * now represented solely by deployment keys, so exported files never include
 * a separate `versions` property.
 */
export function normaliseStore(store) {
  const nextStore = store && typeof store === 'object' ? store : structuredClone(starterStore)
  nextStore.apps = Array.isArray(nextStore.apps) ? nextStore.apps : []
  for (const app of nextStore.apps) {
    if (app.logo && typeof app.logo === 'object') {
      for (const size of ['x32', 'x64', 'x128']) {
        if (app.logo[size]) app.logo[size] = asPngDataUrl(app.logo[size])
      }
    }
    const legacyDeployments = Array.isArray(app.deployments)
      ? app.deployments
      : Object.entries(app.deployments ?? {}).map(([name, deployment]) => ({ name, ...deployment }))
    app.deployments = legacyDeployments.map((deployment, index) => ({
      name: String(deployment?.name || `v${index + 1}`),
      version: String(deployment?.version || deployment?.name || `v${index + 1}`),
      ports: Array.isArray(deployment?.ports)
        ? deployment.ports.map(port => ({ ...port, protocol: ['tcp', 'udp', 'both'].includes(port?.protocol) ? port.protocol : 'tcp', editable: Boolean(port?.editable), required: Boolean(port?.required) }))
        : (typeof deployment?.ports === 'string' ? deployment.ports : []),
      volumes: Array.isArray(deployment?.volumes) ? deployment.volumes.map(volume => ({ ...volume, editable: Boolean(volume?.editable), required: Boolean(volume?.required) })) : (typeof deployment?.volumes === 'string' ? deployment.volumes : []),
      environments: Array.isArray(deployment?.environments) ? deployment.environments.map(environment => ({ ...environment, editable: Boolean(environment?.editable), required: Boolean(environment?.required) })) : (typeof deployment?.environments === 'string' ? deployment.environments : []),
    }))
    for (const version of Array.isArray(app.versions) ? app.versions : []) {
      const key = String(version?.tag || '').trim()
      if (key && !app.deployments.some(deployment => deployment.name === key)) {
        app.deployments.push({ name: key, version: key, ports: [], volumes: [], environments: [] })
      }
    }
    delete app.versions
  }
  return nextStore
}
