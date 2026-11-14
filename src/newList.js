// Remembers the list you just made, so that when you leave it the app can take you to "Rank lists"
// with that list highlighted, ready to drop into place among your other lists.

const KEY = 'rankr:new-list'

export function markNewList(id) {
  try {
    sessionStorage.setItem(KEY, id)
  } catch {
    /* private mode etc.: the feature just doesn't kick in */
  }
}

export function pendingNewList() {
  try {
    return sessionStorage.getItem(KEY)
  } catch {
    return null
  }
}

export function clearNewList() {
  try {
    sessionStorage.removeItem(KEY)
  } catch {
    /* ignore */
  }
}
