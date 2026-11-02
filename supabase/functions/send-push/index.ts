// RankR: sends a phone notification whenever a row is added to the notifications table.
// Supabase calls this through a Database Webhook (see the setup steps).
import { createClient } from 'npm:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

webpush.setVapidDetails(
  Deno.env.get('VAPID_SUBJECT') ?? 'mailto:admin@example.com',
  Deno.env.get('VAPID_PUBLIC_KEY')!,
  Deno.env.get('VAPID_PRIVATE_KEY')!,
)

type Note = {
  recipient_id: string
  actor_id: string | null // null for announcements from RankR itself
  type: string
  list_id: string | null
  item_id: string | null
  list_title: string
  item_title: string
  emoji: string | null
  edit_kind?: string | null
  item_count?: number | null
  link?: string | null
}

function editBody(n: Note, list: string): string {
  const c = n.item_count ?? 1
  const items = `${c} ${c === 1 ? 'item' : 'items'}`
  switch (n.edit_kind) {
    case 'title':
      return n.item_title && n.item_title !== list ? `renamed ${n.item_title} to ${list}` : `renamed a list to ${list}`
    case 'icon':
      return `changed the icon of ${list}`
    case 'color':
      return `changed the color of ${list}`
    case 'items_added':
      return `added ${items} to ${list}`
    case 'items_removed':
      return `removed ${items} from ${list}`
    case 'items_edited':
      return `edited ${items} in ${list}`
    case 'reordered':
      return `changed the order of ${list}`
    default:
      return `updated ${list}`
  }
}

function describe(n: Note): { title?: string; body: string; url: string; tag: string } {
  const list = n.list_title || 'a list'
  switch (n.type) {
    case 'announcement':
      // headline in list_title, the message in item_title
      return { title: n.list_title || 'RankR', body: n.item_title, url: n.link || '/activity', tag: 'announcement' }
    case 'new_list':
      return { body: `made a new list: ${list}`, url: `/list/${n.list_id}`, tag: `new-${n.actor_id}` }
    case 'edited_list':
      return { body: editBody(n, list), url: `/list/${n.list_id}?changes=auto`, tag: `edit-${n.list_id}-${n.edit_kind ?? ''}` }
    case 'liked':
      return { body: `liked your list ${list}`, url: `/list/${n.list_id}`, tag: `like-${n.list_id}` }
    case 'favorited':
      return { body: `made ${list} their favorite of your lists`, url: `/list/${n.list_id}`, tag: `fav-${n.list_id}` }
    case 'reacted':
      return {
        body: `reacted ${n.emoji ?? ''} to ${n.item_title || 'an item'} in ${list}`,
        url: `/list/${n.list_id}${n.item_id ? `?item=${n.item_id}` : ''}`,
        tag: `react-${n.item_id ?? n.list_id}`,
      }
    case 'friend_request':
      return { body: 'sent you a friend request', url: '/activity', tag: `req-${n.actor_id}` }
    case 'friend_accepted':
      return { body: 'accepted your friend request', url: `/u/${n.actor_id}`, tag: `acc-${n.actor_id}` }
    default:
      return { body: 'did something on RankR', url: '/activity', tag: `misc-${n.actor_id}` }
  }
}

Deno.serve(async (req) => {
  if (req.headers.get('x-webhook-secret') !== Deno.env.get('WEBHOOK_SECRET')) {
    return new Response('Forbidden', { status: 403 })
  }

  const payload = await req.json().catch(() => null)
  if (!payload || payload.type !== 'INSERT' || payload.table !== 'notifications' || !payload.record) {
    return new Response('ignored')
  }
  const n = payload.record as Note

  const [{ data: subs, error: subsError }, { data: actor }, { count }] = await Promise.all([
    supabase.from('push_subscriptions').select('id, endpoint, p256dh, auth').eq('user_id', n.recipient_id),
    n.actor_id
      ? supabase.from('profiles').select('username, display_name').eq('id', n.actor_id).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from('notifications').select('id', { count: 'exact', head: true }).eq('recipient_id', n.recipient_id).is('read_at', null),
  ])
  if (subsError) {
    console.error('could not read push_subscriptions', subsError.message)
    return new Response(`error reading devices: ${subsError.message}`)
  }
  if (!subs || subs.length === 0) return new Response(`no devices for ${n.recipient_id}`)

  const { title, body, url, tag } = describe(n)
  const message = JSON.stringify({
    title: title || actor?.display_name || actor?.username || 'RankR',
    body,
    url,
    tag,
    badge: count ?? 1,
  })

  const dead: string[] = []
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, message, { TTL: 60 * 60 * 24 })
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode
        if (status === 404 || status === 410) dead.push(s.id) // this phone unsubscribed
        else console.error('push failed', status, (err as Error).message)
      }
    }),
  )
  if (dead.length) await supabase.from('push_subscriptions').delete().in('id', dead)

  return new Response(`sent to ${subs.length - dead.length}`)
})