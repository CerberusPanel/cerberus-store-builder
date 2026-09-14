/** Normalise user-facing names without changing their wording. */
export function cleanName(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

/** Convert a value into an ID/key-safe lowercase slug. */
export function slugify(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[._-]+|[._-]+$/g, '')
}

/** Return true for optional HTTP(S) links and false for malformed links. */
export function isHttpUrl(value) {
  if (!value) return true
  try {
    const url = new URL(String(value))
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}
