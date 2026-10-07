import { supabase } from './supabase.js'

const unwrap = ({ data, error }) => {
  if (error) throw error
  return data
}

// ---------- Lists ----------

// Lists owned by someone (row-level security only returns what the viewer may see).
export const getListsByOwner = async (ownerId) =>
  unwrap(
    await supabase
      .from('lists')
      .select('*, list_items(id, title, position), list_likes(user_id)')
      .eq('owner_id', ownerId)
      .order('position', { ascending: true, nullsFirst: false })
      .order('updated_at', { ascending: false }),
  )

export const topItems = (list, n = 3) =>
  [...(list.list_items || [])].sort((a, b) => a.position - b.position).slice(0, n)

export const getList = async (id) =>
  unwrap(
    await supabase
      .from('lists')
      .select('*, owner:profiles!lists_owner_id_fkey(id, username, display_name)')
      .eq('id', id)
      .maybeSingle(),
  )

export const createList = async ({ ownerId, title, icon, color, visibility, position }) =>
  unwrap(
    await supabase
      .from('lists')
      .insert({ owner_id: ownerId, title, icon, color, visibility, position })
      .select()
      .single(),
  )

export const updateList = async (id, patch) =>
  unwrap(await supabase.from('lists').update(patch).eq('id', id).select().single())

// ---------- Likes ----------

export const getLikes = async (listId) =>
  unwrap(await supabase.from('list_likes').select('user_id, created_at').eq('list_id', listId))

export const getLikers = async (listId) =>
  unwrap(
    await supabase
      .from('list_likes')
      .select('user_id, created_at, profile:profiles!list_likes_user_id_fkey(id, username, display_name)')
      .eq('list_id', listId)
      .order('created_at', { ascending: false }),
  )

export const likeList = async (listId, userId) =>
  unwrap(await supabase.from('list_likes').insert({ list_id: listId, user_id: userId }))

export const unlikeList = async (listId, userId) =>
  unwrap(await supabase.from('list_likes').delete().eq('list_id', listId).eq('user_id', userId))

// Save a new order for the person's lists (best first).
export const reorderLists = async (orderedIds) => {
  const results = await Promise.all(orderedIds.map((id, i) => supabase.from('lists').update({ position: i }).eq('id', id)))
  const failed = results.find((r) => r.error)
  if (failed) throw failed.error
}

export const deleteList = async (id) => unwrap(await supabase.from('lists').delete().eq('id', id))

// ---------- Items ----------

export const getItems = async (listId) =>
  unwrap(await supabase.from('list_items').select('*').eq('list_id', listId).order('position'))

export const addItems = async (listId, titles, startPosition) => {
  const rows = titles.map((title, i) => ({ list_id: listId, title, position: startPosition + i }))
  const data = unwrap(await supabase.from('list_items').insert(rows).select())
  return data.sort((a, b) => a.position - b.position)
}

// Copy items (title + note, in order) into a list, e.g. when copying a friend's list.
export const copyItems = async (listId, items) => {
  const rows = items.map((it, i) => ({ list_id: listId, title: it.title, note: it.note || '', position: i }))
  if (rows.length === 0) return []
  return unwrap(await supabase.from('list_items').insert(rows).select())
}

export const updateItem = async (id, patch) =>
  unwrap(await supabase.from('list_items').update(patch).eq('id', id).select().single())

export const deleteItem = async (id) => unwrap(await supabase.from('list_items').delete().eq('id', id))

export const reorderItems = async (listId, orderedIds) =>
  unwrap(await supabase.rpc('reorder_list_items', { p_list_id: listId, p_item_ids: orderedIds }))

// ---------- Profiles ----------

export const getProfile = async (id) =>
  unwrap(await supabase.from('profiles').select('*').eq('id', id).maybeSingle())

export const updateProfile = async (id, patch) =>
  unwrap(await supabase.from('profiles').update(patch).eq('id', id).select().single())

export const usernameAvailable = async (username) =>
  unwrap(await supabase.rpc('username_available', { u: username }))

export const searchProfiles = async (query, myId) => {
  const q = query.trim().toLowerCase().replace(/[%,()*\\]/g, '')
  if (q.length < 2) return []
  const data = unwrap(
    await supabase
      .from('profiles')
      .select('id, username, display_name')
      .or(`username.ilike.%${q}%,display_name.ilike.%${q}%`)
      .neq('id', myId)
      .limit(10),
  )
  return data
}

// ---------- Friends ----------

const PROFILE_FIELDS = 'id, username, display_name'

export const getFriendships = async (myId) =>
  unwrap(
    await supabase
      .from('friendships')
      .select(
        `id, status, requester_id, addressee_id, created_at,
         requester:profiles!friendships_requester_id_fkey(${PROFILE_FIELDS}),
         addressee:profiles!friendships_addressee_id_fkey(${PROFILE_FIELDS})`,
      )
      .or(`requester_id.eq.${myId},addressee_id.eq.${myId}`)
      .order('created_at', { ascending: false }),
  )

export const sendFriendRequest = async (myId, otherId) =>
  unwrap(await supabase.from('friendships').insert({ requester_id: myId, addressee_id: otherId }))

export const acceptFriendRequest = async (friendshipId) =>
  unwrap(await supabase.rpc('accept_friend_request', { p_id: friendshipId }))

export const removeFriendship = async (friendshipId) =>
  unwrap(await supabase.from('friendships').delete().eq('id', friendshipId))