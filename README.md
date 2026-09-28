# RankR

A phone-friendly web app for making ranked lists (favorite songs, movies, funniest people you know...),
dragging items into order, and comparing lists with friends. It installs on an iPhone home screen and opens
full screen like a regular app.

**What it does**

- Accounts with username, email and password
- Create any number of lists, with starter ideas (favorite songs, movies, TV shows, funniest people, ...)
- 24 bright and pastel list colors, plus a custom color picker
- Add items to the end of a list, or type a rank number next to the Add button to insert an item at that spot
- Drag the handle to reorder, tap an item to rename it, add a note, jump it to a specific rank, or delete it
- Paste a whole list (one item per line, numbers and bullets are stripped) to add many items at once
- "Copy as text" turns a list back into a numbered note
- Friends: search by username, send/accept requests, browse each other's lists
- Compare: match percentage, items you both ranked with each person's rank, closest call, biggest disagreement, side-by-side view
- Smart matching when comparing: ignores capitalization and punctuation, forgives small spelling mistakes
  ("Spiderman" = "Spider-Man"), and spots items with a similar meaning ("eating" and "food" count as a partial match)
- Each list can be shared with friends or kept private

**How the match percentage works:** it combines how much two lists overlap with how close the shared items sit
in each ranking (measured by position, so a list of 9 and a list of 5 compare fairly). Sharing an item always
earns something, even if you rank it very differently. A "similar" item counts for partial credit (roughly a quarter
to two thirds of a real match, depending on how close the meanings are).

**Similar-vibe matching** uses a small bundled word file (`public/vibes/`, about 2 MB, only downloaded when a
comparison needs it). It works well for everyday words and concepts. Names and titles (songs, people, movies)
usually aren't in it, so those only match by spelling. To make it stricter or looser, change `SIMILAR_THRESHOLD`
at the top of `src/compare.js`.

**Stack:** React + Vite (installable PWA), Supabase (login, database, row-level security).

---

## 1. Set up Supabase

1. In the [Supabase dashboard](https://supabase.com/dashboard), create a project for this app.
   (This app has its own `profiles` table, so a separate project is the cleanest choice. If your other project
   already has a table with that name, don't run the schema there.)
2. Open **SQL Editor -> New query**, paste all of `supabase/schema.sql`, and click **Run**.
   This creates the tables, the friend-only visibility rules, and the security policies.
3. Go to **Project Settings -> API** (or the **Connect** button) and copy the **Project URL** and the
   **anon / publishable key**.
4. Optional but recommended for a friends-only app: **Authentication -> Providers -> Email -> turn off
   "Confirm email"** so friends can sign up and get straight in. If you leave it on, new users have to click
   a link in their email before their first sign-in.

## 2. Run it on your computer

Requires [Node.js](https://nodejs.org) 20 or newer.

```bash
npm install
cp .env.example .env.local     # on Windows: copy .env.example .env.local
# open .env.local and paste in your Project URL and key
npm run dev
```

Open the address it prints. To try it on your phone while developing, use the "Network" address it prints
(both devices on the same Wi-Fi).

## 3. Put it online (free)

Any static host works. Vercel and Netlify are the easiest, and both config files are already included.

**Vercel**
1. Push this folder to a GitHub repository.
2. On vercel.com choose **Add New -> Project**, import the repo. The defaults (Vite, `npm run build`, `dist`) are right.
3. Under **Environment Variables** add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` with the same values as `.env.local`.
4. Deploy.

**Then, back in Supabase:** **Authentication -> URL Configuration**, set **Site URL** to your deployed address
(for example `https://rankr-yourname.vercel.app`). This is what makes password-reset and confirmation
emails link to the right place.

## 4. Install it on an iPhone

1. Open the deployed address in **Safari** (it has to be Safari for this).
2. Tap the **Share** button, then **Add to Home Screen**.
3. It now has its own icon and opens full screen. The **Me** tab shows this tip until it's installed.

## The App Store (later, if you want it)

This code can be wrapped as a native iOS app with [Capacitor](https://capacitorjs.com). Building and
submitting that needs Xcode (a Mac, or a cloud Mac service) plus an Apple Developer account ($99/year),
so the home-screen install above is the easiest way to start.

## Project layout

```
supabase/schema.sql      database tables, security rules, helper functions
src/api.js               all Supabase calls in one place
src/compare.js           how two lists are compared (matching, spelling tolerance, match %)
src/vibes.js             loads the word data and finds items with similar meanings
src/pages/               screens: lists, list editor, friends, profile, compare, account
src/components/          shared pieces: top bar, bottom sheet, list card, list form
src/styles.css           all styling (dark by default, light theme follows the phone)
public/vibes/            word data for similar-vibe matching (built by scripts/build-vibes.py)
vite.config.js           PWA settings (name, icons, offline caching)
```

## Ideas for later

- Public share links for lists
- Reactions or comments on a friend's list
- "Head to head" rounds that build a ranking by picking between two items at a time
- Notifications for friend requests

