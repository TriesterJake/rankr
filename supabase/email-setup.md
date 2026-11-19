# Email verification setup (do once in the Supabase dashboard)

The app now confirms emails with a short code that people type in (no links, so it works inside the iPhone app).

## 1. Settings
- Authentication -> Sign In / Providers -> Email:
  - **Confirm email: ON** (new accounts must enter a code before they can use the app)
  - **Secure email change: OFF** (so moving to a new email only needs a code sent to the NEW address; with it on, the old address must also confirm, which defeats the point for dead or fake emails)
- Authentication -> Emails -> SMTP Settings: **turn on custom SMTP** (Resend, Postmark, SendGrid, etc.).
  Supabase's built-in email sender is limited to a couple of emails per hour and is for testing only.

## 2. Email templates (Authentication -> Emails -> Templates)
Paste this body into **Confirm signup**, **Reset password** and **Change email address**:

```html
<h2>Your RankR code</h2>
<p>Enter this code in the app:</p>
<h1 style="letter-spacing:4px">{{ slice .Token 0 3 }}&#8203;{{ slice .Token 3 }}</h1>
<p>If you didn't ask for this, you can ignore this email.</p>
```

The `&#8203;` is an invisible character in the middle of the code. Without it, the iPhone Mail app thinks the code is a
phone number and turns it into a "call" link. The app ignores it if someone copies and pastes the code.

Suggested subjects: "Your RankR code" for all three.

## 3. Existing accounts
Accounts made while "Confirm email" was off are already marked confirmed, so nobody is locked out.
Anyone who signed up with a wrong or old address can sign in with their password, then use
Me -> Email -> "Move my account to a new email".

## 4. If someone can't sign in at all (lost password AND dead email)
Supabase dashboard -> Authentication -> Users -> open the user -> change the email, then have them use "Forgot password?".
