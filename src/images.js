import { supabase } from './supabase.js'

const BUCKET = 'item-images'

export const imageUrl = (path) => (path ? supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl : null)

// Shrink a photo before uploading (phone photos are huge). Returns a JPEG Blob.
export async function resizeImage(file, maxSize = 1280, quality = 0.82) {
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
  const scale = Math.min(1, maxSize / Math.max(w, h))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(w * scale))
  canvas.height = Math.max(1, Math.round(h * scale))
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height)
  if (source.close) source.close()
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality))
  if (!blob) throw new Error('could not encode image')
  return blob
}

// Upload into the person's own folder; returns the stored path.
export async function uploadItemImage(userId, blob) {
  const path = `${userId}/${crypto.randomUUID()}.jpg`
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: 'image/jpeg', cacheControl: '31536000' })
  if (error) throw error
  return path
}

// Best effort: a leftover file is harmless, so failures are ignored.
export async function removeImages(paths) {
  const list = paths.filter(Boolean)
  if (!list.length) return
  try {
    await supabase.storage.from(BUCKET).remove(list)
  } catch {
    /* ignore */
  }
}