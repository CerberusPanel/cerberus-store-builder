const PNG_DATA_URL_PREFIX = 'data:image/png;base64,'

/** Produce a browser-ready data URL from legacy base64 logo data. */
export function logoDataUrl(value) {
  if (!value) return ''
  return String(value).startsWith('data:image/') ? String(value) : `${PNG_DATA_URL_PREFIX}${value}`
}

/** Read a selected local image as a data URL. */
export function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(new Error('Could not read the selected image.'))
    reader.readAsDataURL(file)
  })
}

/** Decode an image source for canvas processing. */
export function loadImage(source) {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('The image could not be decoded.'))
    image.src = source
  })
}

/** Render one fitted, transparent PNG logo size as a data URL. */
export function renderLogoSize(image, size) {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Canvas image processing is unavailable in this browser.')

  const sourceWidth = image.naturalWidth || image.width
  const sourceHeight = image.naturalHeight || image.height
  const scale = Math.min(size / sourceWidth, size / sourceHeight)
  const width = Math.max(1, Math.round(sourceWidth * scale))
  const height = Math.max(1, Math.round(sourceHeight * scale))
  context.clearRect(0, 0, size, size)
  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'
  context.drawImage(image, Math.round((size - width) / 2), Math.round((size - height) / 2), width, height)
  return canvas.toDataURL('image/png')
}

/** Generate all storefront logo sizes from a source image. */
export async function createLogoSet(source) {
  const image = await loadImage(source)
  if (!(image.naturalWidth || image.width) || !(image.naturalHeight || image.height)) throw new Error('The selected image has invalid dimensions.')
  return { x32: renderLogoSize(image, 32), x64: renderLogoSize(image, 64), x128: renderLogoSize(image, 128) }
}

/** Fill only missing logo sizes, retaining any existing generated PNGs. */
export async function fillMissingLogoResolutions(logo, sourceLoader) {
  const missing = ['x32', 'x64', 'x128'].filter(size => !logo?.[size])
  if (!missing.length) return false

  const existingImage = ['x128', 'x64', 'x32'].map(size => logo?.[size]).find(Boolean)
  const source = existingImage || (logo?.source_url ? await sourceLoader(logo.source_url) : '')
  if (!source) return false

  const generated = await createLogoSet(source)
  for (const size of missing) logo[size] = generated[size]
  return true
}
