import { cleanName, isHttpUrl, slugify } from './text.js'

function isValidPort(value) {
  return Number.isInteger(Number(value)) && Number(value) >= 1 && Number(value) <= 65535
}

/** Validate a complete store document and return UI-addressable issues. */
export function validateStore(store) {
  const issues = []
  const add = (message, extra = {}) => issues.push({ message, ...extra })

  if (!cleanName(store.name)) add('Store name is required.', { field: 'store-name' })
  if (!/^\d+\.\d+\.\d+(?:-(?:alpha|beta)-\d+)?$/i.test(String(store.version ?? ''))) {
    add('Store version must look like 0.0.0, 0.0.1-alpha-1 or 0.0.1-beta-1.', { field: 'store-version' })
  }
  if (!cleanName(store.author)) add('Store author is required.', { field: 'store-author' })

  const ids = new Set()
  for (const app of store.apps ?? []) {
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
    const deploymentNames = new Set()
    for (const [deploymentIndex, deployment] of (app.deployments ?? []).entries()) {
      const name = String(deployment?.name ?? '')
      if (!name || slugify(name) !== name) add(`${app.name}: deployment name “${name}” is invalid.`, { appId: app.id, deploymentIndex, field: 'name', index: null })
      if (deploymentNames.has(name)) add(`${app.name}: duplicate deployment name “${name}”.`, { appId: app.id, deploymentIndex, field: 'name', index: null })
      deploymentNames.add(name)
      if (!String(deployment?.version ?? '').trim()) add(`${app.name}/${name}: image version tag is required.`, { appId: app.id, deploymentIndex, field: 'version', index: null })
      for (const field of ['ports', 'volumes', 'environments']) {
        const value = deployment[field]
        if (!Array.isArray(value) && typeof value !== 'string') add(`${app.name}/${name}: ${field} must be an array or inherited version name.`, { appId: app.id, deploymentIndex, field, index: null })
        if (typeof value === 'string' && (!value || value === name || !app.deployments?.some(candidate => candidate.name === value))) add(`${app.name}/${name}: ${field} cannot inherit from “${value || 'an empty version'}”.`, { appId: app.id, deploymentIndex, field, index: null })
      }
      for (const [index, port] of (Array.isArray(deployment.ports) ? deployment.ports : []).entries()) {
        if (!isValidPort(port.host)) add(`${app.name}/${name}: host port must be 1–65535.`, { appId: app.id, deploymentIndex, field: 'host-port', index })
        if (!isValidPort(port.container)) add(`${app.name}/${name}: container port must be 1–65535.`, { appId: app.id, deploymentIndex, field: 'container-port', index })
        if (!['tcp', 'udp', 'both'].includes(port.protocol)) add(`${app.name}/${name}: port protocol must be TCP, UDP, or both.`, { appId: app.id, deploymentIndex, field: 'protocol', index })
      }
      for (const [index, volume] of (Array.isArray(deployment.volumes) ? deployment.volumes : []).entries()) {
        if (!String(volume.host ?? '').trim()) add(`${app.name}/${name}: volume host is required.`, { appId: app.id, deploymentIndex, field: 'volume-host', index })
        if (!String(volume.container ?? '').startsWith('/')) add(`${app.name}/${name}: container volume path must start with /.`, { appId: app.id, deploymentIndex, field: 'volume-container', index })
      }
    }
  }
  return issues
}
