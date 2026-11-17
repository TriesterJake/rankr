import { supabase } from './supabase.js'

const BUCKET = 'item-images'

export const imageUrl = (path) => (path ? supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl : null)

// Photos uploaded since thumbnails were added come in pairs: "<id>.f.jpg" (full size) and "<id>.t.jpg" (small).
// The name says whether a small one exists, so older photos (plain "<id>.jpg") just keep using the full image.
const thumbPathOf = (path) => (path && path.endsWith('.f.jpg') ? path.slice(0, -'.f.jpg'.length) + '.t.jpg' : null)

// For the small spots (row pictures, list icons, profile circles). Tapping to zoom still uses imageUrl().
export const thumbUrl = (path) => imageUrl(thumbPathOf(path) || path)

// Shrink a photo before uploading (phone photos are huge). Returns a JPEG Blob.
export async function resizeImage(file, maxSize = 1280, quality = 0.82, square = false) {
  let source
  try {
    source = await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch {
    source = await new Promise((resolve, reject) => {
      const img = new Image()
      const url = URL.createObjectURL(file)
      img.onload = () => {
        URL.revokeObjectURL(url)
        resolve(img)
      }
      img.onerror = () => {
        URL.revokeObjectURL(url)
        reject(new Error('unreadable image'))
      }
      img.src = url
    })
  }
  const w = source.width || source.naturalWidth
  const h = source.height || source.naturalHeight
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#ffffff'
  if (square) {
    // crop the middle square, then shrink it
    const side = Math.min(w, h)
    const out = Math.min(maxSize, side)
    canvas.width = out
    canvas.height = out
    ctx.fillRect(0, 0, out, out)
    ctx.drawImage(source, (w - side) / 2, (h - side) / 2, side, side, 0, 0, out, out)
  } else {
    const scale = Math.min(1, maxSize / Math.max(w, h))
    canvas.width = Math.max(1, Math.round(w * scale))
    canvas.height = Math.max(1, Math.round(h * scale))
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(source, 0, 0, canvas.width, canvas.height)
  }
  if (source.close) source.close()
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality))
  if (!blob) throw new Error('could not encode image')
  return blob
}

const THUMB_SIZE = 256 // the biggest small spot is 64 points, which is 192 pixels on an iPhone screen

const put = (path, blob) => supabase.storage.from(BUCKET).upload(path, blob, { contentType: 'image/jpeg', cacheControl: '31536000' })

// Upload into the person's own folder, with a small copy next to it; returns the stored path (of the full one).
export async function uploadItemImage(userId, blob) {
  const id = `${userId}/${crypto.randomUUID()}`
  let thumb = null
  try {
    thumb = await resizeImage(blob, THUMB_SIZE, 0.78)
  } catch {
    /* no small copy: upload the full one the old way */
  }
  if (!thumb) {
    const { error } = await put(`${id}.jpg`, blob)
    if (error) throw error
    return `${id}.jpg`
  }
  // small copy first, so a full photo never exists without it
  const t = await put(`${id}.t.jpg`, thumb)
  if (t.error) {
    const { error } = await put(`${id}.jpg`, blob)
    if (error) throw error
    return `${id}.jpg`
  }
  const { error } = await put(`${id}.f.jpg`, blob)
  if (error) {
    removeImages([`${id}.t.jpg`])
    throw error
  }
  return `${id}.f.jpg`
}

// Best effort: a leftover file is harmless, so failures are ignored.
export async function removeImages(paths) {
  const list = paths.filter(Boolean).flatMap((p) => [p, thumbPathOf(p)].filter(Boolean)) // a photo's small copy goes too
  if (!list.length) return
  try {
    await supabase.storage.from(BUCKET).remove(list)
  } catch {
    /* ignore */
  }
}
// Voice memos live in the same bucket and folder as photos. Returns the stored path.
export async function uploadAudio(userId, blob, { type, ext }) {
  const path = `${userId}/${crypto.randomUUID()}.${ext}`
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: type, cacheControl: '31536000' })
  if (error) throw error
  return path
}
