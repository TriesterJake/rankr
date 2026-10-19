# RankR

A phone-friendly web app for making ranked lists (favorite songs, movies, funniest people you know...),
dragging items into order, and comparing lists with friends. It installs on an iPhone or Android home screen,
opens full screen like a regular app, and can send phone notifications when friends do things.

## What it does

**Lists**
- Accounts with username, email and password, plus a profile picture
- Create any number of lists, with starter ideas (favorite songs, movies, TV shows, funniest people, ...)
- Give a list an emoji/letter or a picture as its icon, and pick from 24 bright and pastel colors or a custom color
- Drag lists on your profile into any order
- Add items to the end of a list, or type a rank number next to the Add button to insert an item at that spot
- Drag the handle to reorder, tap an item to rename it, add a note, add a photo, jump it to a specific rank, or delete it
- Paste a whole list (one item per line, numbers and bullets are stripped) to add many items at once
- Search inside a list; "Copy as text" turns a list into a numbered note
- Each list can be shared with friends or kept private
- Copy a friend's list to your own account, then change it however you like

**Friends**
- Search by username, send/accept requests, browse each other's lists
- Friend suggestions (friends of your friends)
- Rank your friends. This order is private: only you can see it
- Like a list, pick one **favorite** list per friend, and react to individual items with an emoji
  (the owner can tap a reaction to see who left it)

**Comparing**
- Compare one of your lists with a friend's: match percentage, items you both ranked with each person's rank,
  closest call, biggest disagreement, and a side-by-side view
- Compare the same list across several friends at once, as a table or side by side
- Smart matching: ignores capitalization and punctuation, forgives small spelling mistakes
  ("Spiderman" = "Spider-Man"), and spots items with a similar meaning ("eating" and "food" count as a partial match)

**Activity and notifications**
- An Activity tab with a red badge shows what your friends did: new lists, edits, likes, favorites, reactions,
  and accepted friend requests. Friend requests have their own tab and keep the red number until you answer them
- Messages are specific ("Jerry added 3 items to Pizza", "Bob changed the icon of Pizza", "Henry changed the order of Pizza")
- Related updates are grouped into one row while they happen within 30 minutes of each other. A combined row about
  several lists opens up to show each list and what changed
- Tapping an update opens the list with the new and edited items highlighted
- Opening the Activity tab marks updates as read and clears the notifications from your phone
- Optional phone notifications (iPhone from the Home Screen, iOS 16.4 or newer; Android in Chrome) using Web Push
- Private lists never create notifications

**How the match percentage works:** it combines how much two lists overlap with how close the shared items sit
in each ranking (measured by position, so a list of 9 and a list of 5 compare fairly). Sharing an item always
earns something, even if you rank it very differently. A "similar" item counts for partial credit (roughly a quarter
to two thirds of a real match, depending on how close the meanings are).

**Similar-vibe matching** uses a small bundled word file (`public/vibes/`, about 2 MB, only downloaded when a
comparison needs it). It works well for everyday words and concepts. Names and titles (songs, people, movies)
usually aren't in it, so those only match by spelling. To make it stricter or looser, change `SIMILAR_THRESHOLD`
at the top of `src/compare.js`.

**Stack:** React + Vite (installable PWA), Supabase (login, Postgres database with row-level security, file storage,
a small Edge Function for push), hosted on Vercel.

---

## 1. Set up Supabase

1. In the [Supabase dashboard](https://supabase.com/dashboard), create a project for this app.
   (This app has its own `profiles` table, so a separate project is the cleanest choice. If your other project
   already has a table with that name, don't run the schema there.)
2. Open **SQL Editor -> New query**, paste all of `supabase/schema.sql`, and click **Run**.
   This creates the tables, the friend-only visibility rules, the notification triggers, and the security
   policies. `schema.sql` already includes every update (`update-2.sql` to `update-12.sql`), so a new project
   only needs this one file.
3. Go to **Project Settings -> API** (or the **Connect** button) and copy the **Project URL** and the
   **anon / publishable key**.
4. Optional but recommended for a friends-only app: **Authentication -> Providers -> Email -> turn off
   "Confirm email"** so friends can sign up and get straight in. If you leave it on, new users have to click
   a link in their email before their first sign-in.

**Already running an older version?** Don't re-run `schema.sql`. Run only the `supabase/update-N.sql` files
you haven't run yet, in order, each once, before deploying the matching code.

## 2. Run it on your computer

Requires [Node.js](https://nodejs.org) 20 or newer.

```bash
npm install
cp .env.example .env.local     # on Windows: copy .env.example .env.local
# open .env.local and paste in your Project URL and key
npm run dev
```

Open the address it prints. To try it on your phone while developing, use the "Network" address it prints
(both devices on the same Wi-Fi). Phone notifications need the deployed (HTTPS) app.

## 3. Put it online (free)

Any static host works. Vercel and Netlify are the easiest, and both config files are already included.

**Vercel**
1. Push this folder to a GitHub repository.
2. On vercel.com choose **Add New -> Project**, import the repo. The defaults (Vite, `npm run build`, `dist`) are right.
3. Under **Environment Variables** add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` with the same values as
   `.env.local` (and `VITE_VAPID_PUBLIC_KEY` if you set up phone notifications below).
4. Deploy. Later pushes to GitHub deploy automatically.

**Then, back in Supabase:** **Authentication -> URL Configuration**, set **Site URL** to your deployed address
(for example `https://rankr-yourname.vercel.app`). This is what makes password-reset and confirmation
emails link to the right place.

## 4. Install it on a phone

**iPhone:** open the deployed address in **Safari**, tap **Share**, then **Add to Home Screen**. It now has its own
icon and opens full screen. The **Me** tab shows this tip until it's installed.
**Android:** open it in Chrome and choose **Install app** (or **Add to Home screen**).

## 5. Phone notifications (optional)

Notifications are created by the database. A small Edge Function then pushes them to people's phones.

1. Make a VAPID key pair: `npx web-push generate-vapid-keys`. Put the **public** key in
   `VITE_VAPID_PUBLIC_KEY` (`.env.local` and Vercel). Keep the private key secret.
2. Make a random secret for the webhook, for example
   `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`.
3. Deploy `supabase/functions/send-push/index.ts` as an Edge Function named `send-push`
   (Supabase dashboard -> **Edge Functions**, or the Supabase CLI), with these secrets:
   `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (like `mailto:you@example.com`), and `WEBHOOK_SECRET`.
4. Open `supabase/push-trigger.sql`, put in your project's function URL, your anon key, and the same webhook secret,
   then run it in the SQL Editor. Don't commit your real keys.
5. In the app, open the **Activity** tab and tap **Turn on** (on iPhone this only appears once the app is installed
   on the Home Screen).

## Keeping it inside the free tier

The app is built to make few requests: lists load in one request, reads are cached for about 30 seconds, reordering
saves in one request, and the badge count is checked only when you open or return to the app. Friends' updates can
take up to about 30 seconds to appear.

## The App Store (later, if you want it)

This code can be wrapped as a native iOS app with [Capacitor](https://capacitorjs.com). Building and
submitting that needs Xcode (a Mac, or a cloud Mac service) plus an Apple Developer account ($99/year),
so the home-screen install above is the easiest way to start.

## Project layout

```
supabase/schema.sql          everything for a fresh database (tables, security rules, triggers, functions)
supabase/update-N.sql        the same changes as separate steps, for upgrading an existing database
supabase/push-trigger.sql    tells the push function when a notification is created (fill in your keys)
supabase/functions/send-push the Edge Function that sends phone notifications
src/api.js                   all Supabase calls in one place (with a small read cache)
src/compare.js               how two lists are compared (matching, spelling tolerance, match %)
src/compareMany.js           comparing one list across several friends
src/vibes.js                 loads the word data and finds items with similar meanings
src/activityGroups.js        groups notifications and writes the specific messages
src/changeHighlights.js      works out which items to highlight when you open an update
src/push.js                  turning phone notifications on and off
src/NotificationsContext.jsx the red badge and notification taps
src/pages/                   screens: lists, list editor, friends, profile, compare, activity, account
src/components/              shared pieces: top bar, bottom sheet, list card, list form, reactions, favorites
src/styles.css               all styling (dark by default, light theme follows the phone)
public/push-sw.js            service worker code that shows push notifications
public/vibes/                word data for similar-vibe matching (built by scripts/build-vibes.py)
vite.config.js               PWA settings (name, icons, offline caching)
```

## Ideas for later

- Public share links for lists
- Comments on a friend's list
- "Head to head" rounds that build a ranking by picking between two items at a time