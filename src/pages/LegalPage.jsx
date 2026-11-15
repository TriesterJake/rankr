import { Link, useNavigate } from 'react-router-dom'
import { Sheet, TopBar } from '../components/ui.jsx'

export const SUPPORT_EMAIL = 'support@rankr.store'
const UPDATED = 'November 12, 2026'

function Email() {
  return (
    <a href={`mailto:${SUPPORT_EMAIL}`} className="legal-email">
      {SUPPORT_EMAIL}
    </a>
  )
}

function Privacy() {
  return (
    <>
      <p className="muted small">Last updated {UPDATED}</p>
      <p>
        This policy explains what RankR collects, why, who can see it, and how to delete it. RankR doesn&rsquo;t show ads, doesn&rsquo;t sell
        your information, and doesn&rsquo;t use tracking or analytics tools.
      </p>

      <h2>What we collect</h2>
      <ul>
        <li>
          <b>Your account:</b> your email address and password (stored scrambled, so nobody can read it), your username, display name and
          profile picture if you add one.
        </li>
        <li>
          <b>What you make:</b> your lists, items, notes, photos and voice memos, plus your likes, favorites, reactions, friends, friend requests and
          your private friend ranking.
        </li>
        <li>
          <b>Safety tools:</b> reports you send, people you block, and ideas you hide.
        </li>
        <li>
          <b>Notifications:</b> if you turn on phone notifications, a token from your phone&rsquo;s notification service so we can send them.
        </li>
        <li>
          <b>Your age:</b> at sign-up we ask for your birthday only to check that you are 13 or older. Your birthday stays on your device and
          isn&rsquo;t saved. We save only the date you agreed to these terms.
        </li>
      </ul>

      <h2>Who can see what</h2>
      <ul>
        <li>Anyone signed in to RankR can find your username, display name and profile picture, so friends can add you.</li>
        <li>Lists set to <b>Friends</b> can be seen by your friends. Lists set to <b>Only me</b> can be seen by you alone.</li>
        <li>
          The <b>Ideas</b> tab may suggest the <i>titles</i> of your Friends lists to other people. Friends see your name next to the title.
          People you don&rsquo;t know see only the title, never your name or items. You can turn this off on the Me tab or for a single list.
        </li>
        <li>
          Photos and voice memos are stored at long, random web addresses. They aren&rsquo;t listed anywhere, but anyone who has a file&rsquo;s
          exact address could open it. The microphone is only used while you are recording a voice memo.
        </li>
      </ul>

      <h2>Companies that help run RankR</h2>
      <p>We share data only with the services RankR needs in order to work. They are not allowed to use it for anything else:</p>
      <ul>
        <li>
          <b>Supabase</b> stores the database, logins, photos and voice memos.
        </li>
        <li>
          <b>Vercel</b> hosts the website.
        </li>
        <li>
          <b>Resend</b> sends sign-up and password emails.
        </li>
        <li>
          <b>Apple or Google</b> deliver phone notifications if you turn them on.
        </li>
      </ul>
      <p>We may also share information if the law requires it, or to protect someone&rsquo;s safety.</p>

      <h2>Deleting your data</h2>
      <p>
        You can change your name, picture and lists at any time. To delete everything, go to <b>Me &rarr; Delete my account</b>. That
        permanently removes your login, profile, lists, items, photos, voice memos, likes, reactions and friendships. Reports about content that broke our
        rules may be kept for safety. You can also email us to ask for a copy of your data or to have it deleted.
      </p>

      <h2>Children</h2>
      <p>
        RankR is for people 13 and older. We don&rsquo;t knowingly collect information from children under 13. If we learn that an account belongs
        to a child under 13, we delete it. Parents who think their child signed up can email us.
      </p>

      <h2>Security</h2>
      <p>
        Data is sent over encrypted connections, and database rules decide who can see each list. No system is perfectly secure, so use a
        password you don&rsquo;t use anywhere else.
      </p>

      <h2>Changes</h2>
      <p>If we change this policy in a big way, we&rsquo;ll tell you in the app before the change takes effect.</p>

      <h2>Contact</h2>
      <p>
        Questions or requests: <Email />
      </p>
    </>
  )
}

function Terms() {
  return (
    <>
      <p className="muted small">Last updated {UPDATED}</p>
      <p>
        These terms are the rules for using RankR. By creating an account or using the app, you agree to them and to our{' '}
        <Link to="/privacy">Privacy Policy</Link>.
      </p>

      <h2>Who can use RankR</h2>
      <p>
        You must be <b>13 or older</b>. If you are under 18, you need a parent or guardian&rsquo;s permission. Keep your password private. You are
        responsible for what happens on your account.
      </p>

      <h2 id="guidelines">Community guidelines</h2>
      <p>
        RankR is meant to be fun and safe for everyone 13 and up. There is <b>no tolerance for objectionable content or abusive users</b>. Do not
        post lists, items, names, photos, voice memos or profile pictures that include:
      </p>
      <ul>
        <li>Sexual content or nudity</li>
        <li>Bullying, harassment or threats</li>
        <li>Hate speech, or attacks on people for who they are</li>
        <li>Violence, gore, or encouraging self-harm</li>
        <li>Illegal drugs or other illegal activity</li>
        <li>Spam, scams, or pretending to be someone else</li>
        <li>Someone else&rsquo;s private information</li>
        <li>Photos or other material you don&rsquo;t have the right to share</li>
      </ul>

      <h2>How we keep it safe</h2>
      <ul>
        <li>A word filter blocks inappropriate usernames and display names, and keeps inappropriate titles off the Ideas tab.</li>
        <li>
          Anyone can report a list, profile or idea from its <b>&middot;&middot;&middot;</b> menu. We review reports within 24 hours.
        </li>
        <li>You can block anyone from their profile or list. Blocking removes them as a friend and stops them from contacting you.</li>
        <li>
          We may remove any content that breaks these rules, and suspend or permanently ban accounts that break them, with or without warning.
        </li>
      </ul>

      <h2>Your content</h2>
      <p>
        You own what you post. You give RankR permission to store it and show it to the people you shared it with, and to suggest your list titles
        on the Ideas tab as described in the Privacy Policy. This permission ends when you delete the content or your account.
      </p>

      <h2>Ending your account</h2>
      <p>
        You can delete your account at any time from <b>Me &rarr; Delete my account</b>. We may close accounts that break these terms.
      </p>

      <h2>No guarantees</h2>
      <p>
        RankR is provided &ldquo;as is.&rdquo; We work to keep it running and safe, but we can&rsquo;t promise it will always be available, error free,
        or free of content other people post. To the fullest extent the law allows, RankR isn&rsquo;t liable for indirect or consequential damages
        from using the app. Some places don&rsquo;t allow these limits, so they may not apply to you.
      </p>

      <h2>Changes</h2>
      <p>We may update these terms. If we make a big change, we&rsquo;ll tell you in the app. Using RankR after that means you accept the new terms.</p>

      <h2>Contact</h2>
      <p>
        <Email />
      </p>
    </>
  )
}

function Support() {
  return (
    <>
      <p>
        Need help, found a bug, or want to report something? Email us at <Email /> and we&rsquo;ll get back to you, usually within a day.
      </p>

      <h2>Report something</h2>
      <p>
        Tap the <b>&middot;&middot;&middot;</b> button at the top of a list or profile, or next to an idea, then choose <b>Report</b>. Reports are
        private, and we review them within 24 hours. You can also email us.
      </p>

      <h2>Block someone</h2>
      <p>
        Tap <b>&middot;&middot;&middot;</b> on their profile or list and choose <b>Block</b>. You&rsquo;ll stop being friends, and they can&rsquo;t send you
        requests or see you in search. To unblock someone, go to <b>Me &rarr; Blocked people</b>.
      </p>

      <h2>Forgot your password</h2>
      <p>
        On the sign-in screen, tap <b>Forgot password?</b> and we&rsquo;ll email you a code.
      </p>

      <h2>Change your email</h2>
      <p>
        Go to <b>Me &rarr; Email</b>. Your lists and friends stay the same.
      </p>

      <h2>Delete your account</h2>
      <p>
        Go to <b>Me &rarr; Delete my account</b>. This permanently deletes your account and everything in it.
      </p>

      <h2>More</h2>
      <p>
        <Link to="/terms">Terms of Use and community guidelines</Link>
        <br />
        <Link to="/privacy">Privacy Policy</Link>
      </p>
    </>
  )
}

const PAGES = {
  privacy: { title: 'Privacy Policy', Body: Privacy },
  terms: { title: 'Terms of Use', Body: Terms },
  support: { title: 'Help & Support', Body: Support },
}

export const LEGAL_PATHS = { '/privacy': 'privacy', '/terms': 'terms', '/support': 'support' }

// Public pages: they open without signing in (Apple's review team visits them from the App Store listing).
// standalone: shown on its own (signed out), instead of inside the app with the tab bar.
export default function LegalPage({ page, standalone = false }) {
  const navigate = useNavigate()
  const { title, Body } = PAGES[page]

  if (!standalone) {
    return (
      <>
        <TopBar title={title} back />
        <article className="legal">
          <Body />
        </article>
      </>
    )
  }

  return (
    <div className="legal-wrap">
      <header className="legal-head">
        <button type="button" className="brand legal-brand" onClick={() => navigate('/')}>
          RankR
        </button>
        <h1>{title}</h1>
      </header>
      <article className="legal">
        <Body />
      </article>
      <LegalLinks />
    </div>
  )
}

// The same text in a sheet, so reading it doesn't lose a half-filled form.
export function LegalSheet({ page, onClose }) {
  if (!page) return null
  const { title, Body } = PAGES[page]
  return (
    <Sheet open onClose={onClose} title={title}>
      <article className="legal in-sheet">
        <Body />
      </article>
    </Sheet>
  )
}

// Small "Terms · Privacy · Support" row.
export function LegalLinks() {
  return (
    <nav className="legal-links small">
      <Link to="/terms">Terms</Link>
      <span aria-hidden="true">&middot;</span>
      <Link to="/privacy">Privacy</Link>
      <span aria-hidden="true">&middot;</span>
      <Link to="/support">Support</Link>
    </nav>
  )
}
