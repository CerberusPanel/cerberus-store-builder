// Stable app-document order for previews and exported release files. `logo`
// occupies the requested "log" position; it is the existing schema field.
export const APP_JSON_FIELD_ORDER = [
  'id',
  'name',
  'description',
  'category',
  'image',
  'readme',
  'logo',
  'links',
  'tags',
  'highlights',
  'deployments',
]

/** Return an app object in the documented JSON field order. */
export function orderAppJson(app = {}) {
  return Object.fromEntries(
    APP_JSON_FIELD_ORDER
      .filter(key => Object.hasOwn(app, key) && app[key] !== undefined)
      .map(key => [key, app[key]]),
  )
}

/** Return a store document with every app ordered for JSON serialization. */
export function orderStoreJson(store = {}) {
  return {
    ...store,
    apps: Array.isArray(store.apps) ? store.apps.map(orderAppJson) : [],
  }
}
