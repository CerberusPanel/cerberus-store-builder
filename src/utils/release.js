/** Remove empty optional values before serialising a release file. */
export function cleanForExport(value) {
  if (Array.isArray(value)) return value.map(cleanForExport)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, item]) => item !== undefined && item !== null && item !== '')
        .map(([key, item]) => [key, cleanForExport(item)]),
    )
  }
  return value
}

/** Parse a supported Cerberus store release version. */
export function parseVersion(value = '0.0.0') {
  const normalized = String(value).trim().toLowerCase().replace(/-([a-z]+)\/(\d+)$/, '-$1-$2')
  const match = normalized.match(/^(\d+)\.(\d+)\.(\d+)(?:-(alpha|beta)-(\d+))?$/)
  if (!match) return { major: 0, minor: 0, patch: 0, channel: null, channelVersion: 0 }
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    channel: match[4] ?? null,
    channelVersion: Number(match[5] ?? 0),
  }
}

/** Calculate the next alpha, beta, or public version from the current version. */
export function getNextVersion(currentVersion, channel) {
  const current = parseVersion(currentVersion)
  const base = `${current.major}.${current.minor}.${current.patch}`
  if (channel === 'public') return `${current.major}.${current.minor}.${current.patch + 1}`
  const channelVersion = current.channel === channel ? current.channelVersion + 1 : 1
  return `${base}-${channel}-${channelVersion}`
}
