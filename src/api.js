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
      .select('*, list_items(id, title, position), list_likes(user_id), list_favorites(user_id)')
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

export const createList = async ({ ownerId, title, icon, icon_path = null, color, visibility, position }) =>
  unwrap(
    await supabase
      .from('lists')
      .insert({ owner_id: ownerId, title, icon, icon_path, color, visibility, position })
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
      .select('user_id, created_at, profile:profiles!list_likes_user_id_fkey(id, username, display_name, avatar_path)')
      .eq('list_id', listId)
      .order('created_at', { ascending: false }),
  )

export const likeList = async (listId, userId) =>
  unwrap(await supabase.from('list_likes').insert({ list_id: listId, user_id: userId }))

export const unlikeList = async (listId, userId) =>
  unwrap(await supabase.from('list_likes').delete().eq('list_id', listId).eq('user_id', userId))

// ---------- Favorites (one favorite list per friend) ----------

// My current favorite among one friend's lists, or null.
export const getMyFavorite = async (ownerId, myId) =>
  unwrap(
    await supabase
      .from('list_favorites')
      .select('list_id, list:lists!list_favorites_list_id_fkey(id, title)')
      .eq('user_id', myId)
      .eq('owner_id', ownerId)
      .maybeSingle(),
  )

export const getFavoriters = async (listId) =>
  unwrap(
    await supabase
      .from('list_favorites')
      .select('user_id, created_at, profile:profiles!list_favorites_user_id_fkey(id, username, display_name, avatar_path)')
      .eq('list_id', listId)
      .order('created_at', { ascending: false }),
  )

export const setFavorite = async (listId) => unwrap(await supabase.rpc('set_favorite', { p_list_id: listId }))
export const clearFavorite = async (listId) => unwrap(await supabase.rpc('clear_favorite', { p_list_id: listId }))

// ---------- Reactions ----------

export const getReactions = async (listId) =>
  unwrap(await supabase.from('item_reactions').select('item_id, user_id, emoji').eq('list_id', listId))

export const getReactors = async (itemId) =>
  unwrap(
    await supabase
      .from('item_reactions')
      .select('user_id, emoji, created_at, profile:profiles!item_reactions_user_id_fkey(id, username, display_name, avatar_path)')
      .eq('item_id', itemId)
      .order('created_at', { ascending: false }),
  )

export const reactToItem = async (itemId, emoji) => unwrap(await supabase.rpc('react_to_item', { p_item_id: itemId, p_emoji: emoji }))

// ---------- Notifications ----------

export const getNotifications = async (limit = 100) =>
  unwrap(
    await supabase
      .from('notifications')
      .select('id, type, list_id, item_id, list_title, item_title, emoji, created_at, read_at, actor:profiles!notifications_actor_id_fkey(id, username, display_name, avatar_path)')
      .order('created_at', { ascending: false })
      .limit(limit),
  )

export const getUnreadCount = async () => {
  const { count, error } = await supabase.from('notifications').select('id', { count: 'exact', head: true }).is('read_at', null)
  if (error) throw error
  return count ?? 0
}

export const markNotificationRead = async (id) =>
  unwrap(await supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', id).is('read_at', null))

export const markAllNotificationsRead = async () =>
  unwrap(await supabase.from('notifications').update({ read_at: new Date().toISOString() }).is('read_at', null).neq('type', 'friend_request'))

export const deleteNotification = async (id) => unwrap(await supabase.from('notifications').delete().eq('id', id))

export const clearNotifications = async (myId) => unwrap(await supabase.from('notifications').delete().eq('recipient_id', myId))

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
      .select('id, username, display_name, avatar_path')
      .or(`username.ilike.%${q}%,display_name.ilike.%${q}%`)
      .neq('id', myId)
      .limit(10),
  )
  return data
}

// ---------- Friends ----------

const PROFILE_FIELDS = 'id, username, display_name, avatar_path'

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

// ---------- Phone push notifications ----------

export const savePushSubscription = async (endpoint, p256dh, auth) =>
  unwrap(await supabase.rpc('save_push_subscription', { p_endpoint: endpoint, p_p256dh: p256dh, p_auth: auth }))

export const deletePushSubscription = async (endpoint) =>
  unwrap(await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint))