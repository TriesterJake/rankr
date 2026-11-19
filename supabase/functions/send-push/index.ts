// RankR: sends a phone notification whenever a row is added to the notifications table.
// Supabase calls this through a Database Webhook (see the setup steps).
// It sends to both kinds of device:
//   * web push (browsers, Android, the home-screen web app): push_subscriptions
//   * the iPhone app, through Apple (APNs): apns_tokens. Only once the APNS_* secrets are set.
import { createClient } from 'npm:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

webpush.setVapidDetails(
  Deno.env.get('VAPID_SUBJECT') ?? 'mailto:admin@example.com',
  Deno.env.get('VAPID_PUBLIC_KEY')!,
  Deno.env.get('VAPID_PRIVATE_KEY')!,
)

// ---------- Apple (iPhone app) ----------
// Secrets: APNS_KEY_ID, APNS_TEAM_ID, APNS_PRIVATE_KEY (the whole .p8 file), APNS_BUNDLE_ID (store.rankr.app).
const APNS = {
  keyId: Deno.env.get('APNS_KEY_ID'),
  teamId: Deno.env.get('APNS_TEAM_ID'),
  key: Deno.env.get('APNS_PRIVATE_KEY'),
  topic: Deno.env.get('APNS_BUNDLE_ID') ?? 'store.rankr.app',
}
const apnsReady = Boolean(APNS.keyId && APNS.teamId && APNS.key)

const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const b64urlText = (text: string) => b64url(new TextEncoder().encode(text))

// Apple wants a signed token that is at most an hour old (and not remade more than every 20 minutes).
let apnsJwt: { token: string; made: number } | null = null
async function apnsToken(): Promise<string> {
  if (apnsJwt && Date.now() - apnsJwt.made < 40 * 60 * 1000) return apnsJwt.token
  const pem = APNS.key!.replace(/\\n/g, '\n').replace(/-----[^-]+-----/g, '').replace(/\s+/g, '')
  const der = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0))
  const key = await crypto.subtle.importKey('pkcs8', der, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'])
  const head = b64urlText(JSON.stringify({ alg: 'ES256', kid: APNS.keyId }))
  const claims = b64urlText(JSON.stringify({ iss: APNS.teamId, iat: Math.floor(Date.now() / 1000) }))
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, new TextEncoder().encode(`${head}.${claims}`))
  apnsJwt = { token: `${head}.${claims}.${b64url(new Uint8Array(sig))}`, made: Date.now() }
  return apnsJwt.token
}

// Apps installed from TestFlight / the App Store use Apple's main server; apps run from Xcode use the test
// ("sandbox") server. We don't know which a phone is, so try the main one and fall back to the test one.
const APNS_HOSTS = ['https://api.push.apple.com', 'https://api.sandbox.push.apple.com']

// 'sent' | 'dead' (the app was removed or the token is no good: forget it) | 'failed'
async function sendApns(token: string, body: string, tag: string): Promise<'sent' | 'dead' | 'failed'> {
  let reason = ''
  for (const host of APNS_HOSTS) {
    const res = await fetch(`${host}/3/device/${token}`, {
      method: 'POST',
      headers: {
        authorization: `bearer ${await apnsToken()}`,
        'apns-topic': APNS.topic,
        'apns-push-type': 'alert',
        'apns-priority': '10',
        'apns-expiration': String(Math.floor(Date.now() / 1000) + 60 * 60 * 24),
        // a newer notification with the same tag replaces the old one on the phone (like the web "tag")
        'apns-collapse-id': tag.slice(0, 64),
      },
      body,
    }).catch((err) => {
      reason = (err as Error).message
      return null
    })
    if (!res) continue
    if (res.ok) return 'sent'
    reason = ((await res.json().catch(() => ({}))) as { reason?: string }).reason ?? String(res.status)
    if (res.status === 410 || reason === 'Unregistered') return 'dead'
    if (reason !== 'BadDeviceToken') break // a real problem (bad key, etc.): the other server won't help
  }
  if (reason === 'BadDeviceToken') return 'dead'
  console.error('apns failed', reason)
  return 'failed'
}

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

  const [{ data: subs, error: subsError }, { data: phones }, { data: actor }, { count }] = await Promise.all([
    supabase.from('push_subscriptions').select('id, endpoint, p256dh, auth').eq('user_id', n.recipient_id),
    apnsReady ? supabase.from('apns_tokens').select('id, token').eq('user_id', n.recipient_id) : Promise.resolve({ data: [] }),
    n.actor_id
      ? supabase.from('profiles').select('username, display_name').eq('id', n.actor_id).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from('notifications').select('id', { count: 'exact', head: true }).eq('recipient_id', n.recipient_id).is('read_at', null),
  ])
  if (subsError) {
    console.error('could not read push_subscriptions', subsError.message)
    return new Response(`error reading devices: ${subsError.message}`)
  }
  const webSubs = subs ?? []
  const iphones = (phones ?? []) as { id: string; token: string }[]
  if (webSubs.length === 0 && iphones.length === 0) return new Response(`no devices for ${n.recipient_id}`)

  const { title, body, url, tag } = describe(n)
  const heading = title || actor?.display_name || actor?.username || 'RankR'
  const badge = count ?? 1
  const message = JSON.stringify({ title: heading, body, url, tag, badge })
  const appleMessage = JSON.stringify({
    aps: { alert: { title: heading, body }, badge, sound: 'default', 'thread-id': tag },
    url, // the app opens this page when the notification is tapped (src/push.js)
  })

  const dead: string[] = []
  const deadPhones: string[] = []
  let sent = 0
  await Promise.all([
    ...webSubs.map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, message, { TTL: 60 * 60 * 24 })
        sent++
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode
        if (status === 404 || status === 410) dead.push(s.id) // this phone unsubscribed
        else console.error('push failed', status, (err as Error).message)
      }
    }),
    ...iphones.map(async (p) => {
      const result = await sendApns(p.token, appleMessage, tag)
      if (result === 'sent') sent++
      else if (result === 'dead') deadPhones.push(p.id)
    }),
  ])
  if (dead.length) await supabase.from('push_subscriptions').delete().in('id', dead)
  if (deadPhones.length) await supabase.from('apns_tokens').delete().in('id', deadPhones)

  return new Response(`sent to ${sent}`)
})
