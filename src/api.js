import { supabase } from './supabase.js'

const unwrap = ({ data, error }) => {
  if (error) throw error
  return data
}

// Every request to Supabase shows up in its logs, so repeated reads within a short time are answered from memory.
// Anything the app writes clears this memory, so you always see your own changes straight away.
const memory = new Map()
export const bustCache = () => memory.clear()
const remember = (key, ms, fetcher, fresh = false) => {
  const hit = memory.get(key)
  if (!fresh && hit && Date.now() - hit.at < ms) return hit.promise.then((d) => structuredClone(d))
  const promise = fetcher()
  memory.set(key, { at: Date.now(), promise })
  promise.catch(() => memory.delete(key))
  return promise.then((d) => structuredClone(d))
}
// like unwrap, but for requests that change data
const unwrapW = (result) => {
  bustCache()
  return unwrap(result)
}

// ---------- Lists ----------

// Lists owned by someone (row-level security only returns what the viewer may see).
export const getListsByOwner = async (ownerId, fresh = false) =>
  remember(`lists:${ownerId}`, 30000, async () =>
  unwrap(
    await supabase
      .from('lists')
      .select('*, list_items(id, title, position), list_likes(user_id), list_favorites(user_id)')
      .eq('owner_id', ownerId)
      .order('position', { ascending: true, nullsFirst: false })
      .order('updated_at', { ascending: false }),
  ), fresh)

export const topItems = (list, n = 3) =>
  [...(list.list_items || [])].sort((a, b) => a.position - b.position).slice(0, n)

export const getList = async (id) =>
  unwrap(
    await supabase
      .from('lists')
      .select('*, owner:profiles!lists_owner_id_fkey(id, username, display_name, avatar_path)')
      .eq('id', id)
      .maybeSingle(),
  )

export const createList = async ({ ownerId, title, icon, icon_path = null, color, visibility, position }) =>
  unwrapW(
    await supabase
      .from('lists')
      .insert({ owner_id: ownerId, title, icon, icon_path, color, visibility, position })
      .select()
      .single(),
  )

export const updateList = async (id, patch) =>
  unwrapW(await supabase.from('lists').update(patch).eq('id', id).select().single())

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
  unwrapW(await supabase.from('list_likes').insert({ list_id: listId, user_id: userId }))

export const unlikeList = async (listId, userId) =>
  unwrapW(await supabase.from('list_likes').delete().eq('list_id', listId).eq('user_id', userId))

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

export const setFavorite = async (listId) => unwrapW(await supabase.rpc('set_favorite', { p_list_id: listId }))
export const clearFavorite = async (listId) => unwrapW(await supabase.rpc('clear_favorite', { p_list_id: listId }))

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

export const reactToItem = async (itemId, emoji) => unwrapW(await supabase.rpc('react_to_item', { p_item_id: itemId, p_emoji: emoji }))

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

// Friend requests are left alone: they stay "unread" (and counted in the red number) until you accept or decline.
export const markAllNotificationsRead = async () =>
  unwrap(await supabase.from('notifications').update({ read_at: new Date().toISOString() }).is('read_at', null).neq('type', 'friend_request'))

export const deleteNotification = async (id) => unwrap(await supabase.from('notifications').delete().eq('id', id))

export const clearNotifications = async (myId) => unwrap(await supabase.from('notifications').delete().eq('recipient_id', myId))

// Save a new order for the person's lists (best first).
export const reorderLists = async (orderedIds) => unwrapW(await supabase.rpc('reorder_lists', { p_ids: orderedIds }))

export const deleteList = async (id) => unwrapW(await supabase.from('lists').delete().eq('id', id))

// ---------- Items ----------

export const getItems = async (listId) =>
  unwrap(await supabase.from('list_items').select('*').eq('list_id', listId).order('position'))

export const addItems = async (listId, titles, startPosition) => {
  const rows = titles.map((title, i) => ({ list_id: listId, title, position: startPosition + i }))
  const data = unwrapW(await supabase.from('list_items').insert(rows).select())
  return data.sort((a, b) => a.position - b.position)
}

// Copy items (title + note, in order) into a list, e.g. when copying a friend's list.
export const copyItems = async (listId, items) => {
  const rows = items.map((it, i) => ({ list_id: listId, title: it.title, note: it.note || '', position: i }))
  if (rows.length === 0) return []
  return unwrapW(await supabase.from('list_items').insert(rows).select())
}

export const updateItem = async (id, patch) =>
  unwrapW(await supabase.from('list_items').update(patch).eq('id', id).select().single())

export const deleteItem = async (id) => unwrapW(await supabase.from('list_items').delete().eq('id', id))

export const reorderItems = async (listId, orderedIds) =>
  unwrapW(await supabase.rpc('reorder_list_items', { p_list_id: listId, p_item_ids: orderedIds }))

// ---------- Profiles ----------

export const getProfile = async (id, fresh = false) =>
  remember(`profile:${id}`, 60000, async () =>
  unwrap(await supabase.from('profiles').select('*').eq('id', id).maybeSingle()), fresh)

export const updateProfile = async (id, patch) =>
  unwrapW(await supabase.from('profiles').update(patch).eq('id', id).select().single())

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

export const getFriendships = async (myId, fresh = false) =>
  remember(`friendships:${myId}`, 30000, async () =>
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
  ), fresh)

export const sendFriendRequest = async (myId, otherId) =>
  unwrapW(await supabase.from('friendships').insert({ requester_id: myId, addressee_id: otherId }))

export const acceptFriendRequest = async (friendshipId) =>
  unwrapW(await supabase.rpc('accept_friend_request', { p_id: friendshipId }))

export const removeFriendship = async (friendshipId) =>
  unwrapW(await supabase.from('friendships').delete().eq('id', friendshipId))

// ---------- Phone push notifications ----------

export const savePushSubscription = async (endpoint, p256dh, auth) =>
  unwrap(await supabase.rpc('save_push_subscription', { p_endpoint: endpoint, p_p256dh: p256dh, p_auth: auth }))

export const deletePushSubscription = async (endpoint) =>
  unwrap(await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint))

// ---------- Private friend ranking (only you can see your own order) ----------

export const getFriendRanks = async (fresh = false) =>
  remember('ranks', 30000, async () =>
  unwrap(await supabase.from('friend_ranks').select('friend_id, position')), fresh)

// Save the whole order, best friend first.
export const saveFriendRanks = async (myId, orderedFriendIds) =>
  unwrapW(
    await supabase
      .from('friend_ranks')
      .upsert(orderedFriendIds.map((friend_id, position) => ({ user_id: myId, friend_id, position })), { onConflict: 'user_id,friend_id' }),
  )

// ---------- Friend suggestions and multi-friend compare ----------

export const getFriendSuggestions = async (fresh = false) =>
  remember('suggestions', 300000, async () => unwrap(await supabase.rpc('friend_suggestions', { p_limit: 12 })), fresh)

// Every list your friends share with you (titles only), for picking who to compare with.
export const getFriendsLists = async (myId) =>
  unwrap(
    await supabase
      .from('lists')
      .select('id, title, color, icon, icon_path, owner_id, owner:profiles!lists_owner_id_fkey(id, username, display_name, avatar_path), list_items(count)')
      .neq('owner_id', myId)
      .order('title'),
  )

// One request for everything on a list page: the list, its items, likes, favorites and reactions.
export const getListFull = async (id) =>
  unwrap(
    await supabase
      .from('lists')
      .select(
        '*, owner:profiles!lists_owner_id_fkey(id, username, display_name, avatar_path), list_items(*), list_likes(user_id), list_favorites(user_id), item_reactions(item_id, user_id, emoji)',
      )
      .eq('id', id)
      .order('position', { referencedTable: 'list_items', ascending: true })
      .maybeSingle(),
  )

// Delete several notifications in one request.
export const deleteNotifications = async (ids) => unwrap(await supabase.from('notifications').delete().in('id', ids))