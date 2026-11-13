# Getting ready for the App Store

Do these in order. Each takes about 5 to 15 minutes.

## 1. Update the database, then the app

1. Supabase -> **SQL Editor** -> New query -> paste all of `supabase/update-17.sql` -> **Run**.
2. Make yourself the admin who hears about reports (put in your username):
   ```sql
   insert into public.app_admins (user_id) select id from public.profiles where username = 'your_username' on conflict do nothing;
   ```
3. Push the code to GitHub. Vercel deploys it.

When existing users next open the app, they see a one-time screen asking for their birthday and their agreement to the Terms.

## 2. Point rankr.store at the app (Vercel + Squarespace)

1. **Vercel** -> your rankr project -> **Settings -> Domains** -> add `rankr.store`. When Vercel offers to add `www.rankr.store`
   and redirect it, say yes.
2. Vercel then shows the DNS records it needs, usually an **A** record for `@` and a **CNAME** for `www`. Keep that page open.
3. **Squarespace** -> **Domains** -> `rankr.store` -> **DNS** (or DNS Settings).
   - Delete the **Squarespace Defaults** records (the preset A records and the `www` CNAME). They conflict with Vercel's.
   - **Don't delete** the records you added for **Resend** (the TXT/MX records on names like `send` or `resend._domainkey`). They
     are what let your code emails send.
   - Add the A record and the CNAME exactly as Vercel shows them.
4. Wait until Vercel shows **Valid Configuration**. That's often 10 minutes, and can take a few hours.
5. Supabase -> **Authentication -> URL Configuration** -> set **Site URL** to `https://rankr.store`.

`https://rankr-omega.vercel.app` keeps working too.

Then check that these open without being signed in:
- https://rankr.store/privacy
- https://rankr.store/terms
- https://rankr.store/support

## 3. support@rankr.store: receive in Gmail, reply as support@

**Receive (Squarespace forwarding, free):**
1. Squarespace -> **Domains** -> `rankr.store` -> **Email** -> **Email Forwarding** -> add a rule: `support` -> your Gmail address.
2. Squarespace adds the MX records it needs. Send a test email to support@rankr.store from another account and check that it arrives.

**Reply as support@ (Gmail + Resend SMTP):**
1. **Resend** -> **Domains**: make sure `rankr.store` shows **Verified**. It should already, if your code emails come from an @rankr.store
   address.
2. **Resend** -> **API Keys** -> create a key named "Gmail" with **Sending access**. Copy it.
3. **Gmail** (on a computer) -> Settings (gear) -> **See all settings** -> **Accounts and Import** -> **Send mail as** -> **Add another email
   address**:
   - Name: `RankR Support`, Email: `support@rankr.store`. **Untick** "Treat as an alias".
   - SMTP server: `smtp.resend.com`, Port: `465` (SSL). Username: `resend`. Password: the API key from step 2.
4. Gmail emails a confirmation code to support@rankr.store. Squarespace forwards it back to your Gmail. Enter the code.
5. Still in **Accounts and Import**, choose **"Reply from the same address the message was sent to."** Replies to support emails will then
   come from support@rankr.store automatically.

On your phone's Gmail app, tap the **From** line when writing an email to pick support@rankr.store.

## 4. In App Store Connect

- **Privacy Policy URL:** `https://rankr.store/privacy`
- **Support URL:** `https://rankr.store/support`
- **Age rating:** answer the questions truthfully. RankR has user-generated content (lists, names, photos) that friends can see, but
  no chat. Expect a rating of 13+ or higher. Don't choose the Kids category.
- **App Privacy** ("nutrition label"): you collect **Email address**, **Photos**, **Other user content** and a **User ID**. All of it is
  linked to the user and used for app functionality. None of it is used for tracking.
- **App Review notes:** give the reviewer a test account (email + password) that already has a friend with a few lists. Mention:
  "Report and block: tap ··· at the top of a friend's list or profile, or next to an idea. Account deletion: Me -> Delete my account.
  Reports are reviewed within 24 hours."

## 5. After launch

Check reports daily. See `supabase/moderation.md`.

*Not legal advice. The Privacy Policy and Terms in `src/pages/LegalPage.jsx` are a solid start written for how RankR actually works,
but having a lawyer read them is the way to real protection.*
