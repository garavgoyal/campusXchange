# CampusXchange

A verified, college-only marketplace for Thapar students — buy, lend and barter
textbooks, lab gear, cycles and electronics with people on your own campus.

Built as a semester project at Thapar Institute of Engineering & Technology.

---

## What works today

| Area | Status |
|---|---|
| Passwordless signup (college email + OTP), roll number, ID card upload | ✅ |
| Guest browsing — no account needed to look, meeting points hidden until sign-in | ✅ |
| Feed with Sell / Lend / Barter, category filters and search | ✅ |
| Create listing with photos, condition and campus pickup point | ✅ |
| Admin moderation — nothing goes live without human review | ✅ |
| Admin ID-card verification | ✅ |
| Chat with price negotiation: offer → counter → accept | ✅ |
| Delete your own listings | ✅ |
| Verified-student gate — only ID-approved students can list, chat or trade | ✅ |
| Row-Level Security on every table | ✅ (run `003`) |
| Seller picks a buyer and finalises the deal | ✅ |
| Escrow payment (**simulated** — no real money) | ✅ |
| QR-verified handoff with mandatory condition photos | ✅ |
| Lend return cycle: dates, deposit, return QR, due reminders | ✅ |
| Lend pricing: agreed **rate** × days/weeks = total rent | ✅ |
| Exchange: offer your own item with photos, optional top-up either way | ✅ (run `007`) |
| Photo gallery on listings (swipe, thumbnails, full-screen viewer) | ✅ |
| Edit a listing (goes back to moderation) | ✅ (run `007`) |
| Feed pagination (20 per page) | ✅ |
| Admin analytics: time-to-listing-clearance | ✅ |
| Disputes: report, admin review with photos, refund/release, penalties | ✅ |
| In-app notifications + category alerts | ✅ |
| Realtime chat, offers, deals and notification badge | ✅ (run `006`) |
| Nearest-first feed from your hostel (18 TIET hostels + campus spots from the campus map) | ✅ (run `008`) |
| Phone push notifications (Expo push, free) | ✅ needs a development build — see step 7 |
| Calendar date picker for lend dates | ✅ |
| Meeting point chosen with the deal (searchable campus list) | ✅ |
| QR shown / scanned only after your own condition photo | ✅ |
| Exchange want-tags matched to listings (alerts + "fits what you want") | ✅ |
| Dispute penalty tiers (₹50 / ₹200 / ₹500) and each side's penalty record | ✅ (run `009`) |
| Admin dashboard: TLC vs 4 h target, completion rate, lend share, on-time returns, dispute rate | ✅ |
| Your own listings hidden from Home (they're under My listings) | ✅ (run `009`) |
| One account per roll number | ✅ (run `010`) |
| Report a listing or a student; admins take down live listings | ✅ (run `011`) |
| Ratings, real payment gateway | ⛔ not started |

## Stack

- **Mobile** — React Native (Expo SDK 57), Expo Router, TypeScript
- **Backend** — NestJS (Node.js, ESM), TypeScript
- **Database & auth** — Supabase (PostgreSQL + Supabase Auth + Storage)

## Repository layout

```
campusXchange/
├── code/
│   ├── mobile/          Expo app — app/ holds screens, src/ holds logic
│   └── backend/         NestJS API — modules/ per feature, common/ for guards
├── supabase/migrations/ SQL to run, in order, in the Supabase SQL editor
├── docs/api-contract.md Every endpoint: params, rules, responses
├── docs/testing/        Test cases for every SRS requirement (generated from the test runs)
├── project-proposal/    The original submitted proposal
├── docs/ · journals/    Coursework documents
└── .github/workflows/   CI — tests the app and the backend on every push
```

In the mobile app, `app/` is **screens** (the folder structure *is* the
navigation) and `src/` is **logic** — API calls, hooks, reusable components.

---

## Setup

### 1. Database

In the Supabase dashboard → **SQL Editor**, run these **in order**:

| File | What it does |
|---|---|
| `supabase/migrations/000_initial_schema.sql` | All 13 tables, 11 enums, and the trigger that mirrors `auth.users` into `public.users` |
| `supabase/migrations/001_restrict_signup_domain.sql` | Rejects non-`@thapar.edu` signups **in the database**, not just in the app |
| `supabase/migrations/002_offers_sender.sql` | Adds `offers.sender_id` so both sides can negotiate |
| `supabase/migrations/003_enable_rls.sql` | Turns on Row-Level Security for all 13 tables (no policies = the public anon key can't touch any table) |
| `supabase/migrations/004_transaction_enums.sql` | Adds the `in_use` and `cancelled` deal states. **Run on its own, before 005.** |
| `supabase/migrations/005_transaction_core.sql` | Deal ↔ chat links, escrow breakdown, QR purpose, dispute outcome/penalty, `users.penalty_total`, `category_subscriptions` |
| `supabase/migrations/006_realtime.sql` | Participant-only read policies + adds `messages`, `offers`, `transactions`, `notifications` to Supabase Realtime |
| `supabase/migrations/007_exchange_offers_and_edits.sql` | Exchange item offers (`offers.item_*`, `topup_payer`), `transactions.payer_id`, `listings.updated_at`, atomic `add_penalty()`. **The backend needs this — run it before starting the new version.** |
| `supabase/migrations/008_campus_hostels_and_push.sql` | `campus_locations` (18 hostels + meeting spots with map positions, from [loc8tiet](https://loc8tiet.netlify.app/)), `users.hostel`, `push_tokens`, and `cx_feed_nearest()` for the nearest-first feed. **Run after 007.** |
| `supabase/migrations/009_feed_excludes_own_and_penalty_tiers.sql` | Nearest-first feed skips your own listings; `disputes.penalty_tier`. **Run after 008.** |
| `supabase/migrations/010_unique_roll_number.sql` | One account per roll number. If duplicates already exist it lists them and skips the rule — fix those rows, then run it again. **Run after 009.** |
| `supabase/migrations/011_reports_and_takedown.sql` | `reports` table (one open report per student per listing or person), `listings.taken_down_at / taken_down_reason / taken_down_by`, and a trigger that keeps a taken-down listing off the feed for good. **The backend needs this — run it after 010.** |

### 2. Storage buckets

Storage → New bucket. The access setting differs and it matters:

| Bucket | Public? | Holds |
|---|---|---|
| `id-cards` | **No — private** | Student ID photos. Only the backend reads them, via short-lived signed URLs shown to admins. |
| `listing-images` | **Yes — public** | Listing photos. Every browsing student must load these, guests included. |
| `condition-photos` | **No — private** | Before/after photos taken at handoff and return — dispute evidence. Shown via 30-minute signed URLs. |

### 3. Email delivery

Supabase's built-in mailer is rate-limited to a couple of emails per hour, and
**new free projects can't edit the auth email templates without custom SMTP.**
Connect your own SMTP under Project Settings → Authentication → SMTP Settings
(Gmail with an app password works), then edit **both** the *Confirm signup* and
*Magic Link* templates to send `{{ .Token }}` — the 6-digit code — instead of a link.

### 4. Environment files

Copy each `.env.example` to `.env` (`code/backend/.env.example`, `code/mobile/.env.example`)
and fill it in. Both `.env` files are git-ignored.

**`code/mobile/.env`**
```
EXPO_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=...        # anon / public key
EXPO_PUBLIC_API_URL=http://YOUR_LAN_IP:3000
```

**`code/backend/.env`**
```
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_SERVICE_ROLE_KEY=...            # secret — never put this in the app
SUPABASE_ID_CARD_BUCKET=id-cards
SUPABASE_CONDITION_PHOTO_BUCKET=condition-photos   # optional, this is the default
PORT=3000
# Optional — push notifications
# EXPO_ACCESS_TOKEN=...   only if you turn on "enhanced push security" in Expo
# PUSH_DISABLED=1         turn phone pushes off
# Optional — when you deploy
# CORS_ORIGINS=https://your-admin-site.example   browser sites allowed to call the API (not needed for the phone app)
# TRUST_PROXY=1           behind a hosting proxy, so rate limits see the student's IP
```

Find your LAN IP with `ipconfig getifaddr en0`. Not `localhost` — to your phone,
localhost means the phone.

### 5. Run it

```bash
# terminal 1
cd code/backend
npm ci                # installs exactly what package-lock.json lists
npm run start:dev

# terminal 2
cd code/mobile
npm ci
npx expo start --clear
```

Scan the QR code with **Expo Go**. Phone and laptop must be on the same Wi-Fi.

Check the connection first: open `http://YOUR_LAN_IP:3000/health` in your phone's
browser. If that doesn't respond, it's the network — not the code.

> Use `npm ci`, not `npm install`. npm 10's `npm install` can fail with
> `Cannot read properties of null (reading 'edgesOut')` when it re-resolves
> vitest's optional peers; `npm ci` never re-resolves. To add a package, use
> npm 11: `npx npm@11 install <package>`. Don't use `--legacy-peer-deps` in
> `mobile/`: it drops packages Expo needs (gesture handler, the Babel preset).

### 6. Become an admin

Table Editor → `users` → set your row's `role` to `admin`, then reload the app.
A **Review** tab appears with the moderation and ID-verification queues. The tab
is only cosmetic — every `/admin/*` request is re-checked server-side by a guard.

### 7. Phone push notifications (one-time setup, all free)

Expo Go can't receive remote push notifications on Android, so push needs a
**development build** — your own copy of the app instead of Expo Go. Everything
else keeps working in Expo Go; push is simply skipped there.

1. `npm install -g eas-cli`, then in `code/mobile`: `eas login` and `eas init`.
   This adds `extra.eas.projectId` to `app.json` — the app needs it to get a push token.
2. Create a free Firebase project → add an Android app with package
   `com.campusxchange.app` → download `google-services.json` into `code/mobile/`
   and add `"googleServicesFile": "./google-services.json"` under `expo.android` in `app.json`.
3. Firebase → Project settings → Service accounts → generate a private key, then
   `eas credentials` → Android → upload it as the **FCM V1** key.
4. `eas build --profile development --platform android` (or build locally with
   `npx expo run:android`) and install the result on your phone.
5. Start the dev server with `npx expo start --dev-client`, open the app, sign in
   and allow notifications.

iPhones additionally need a paid Apple Developer account; without it, iPhone users
still get every notification in the in-app inbox.

---

## Tests and CI

Every push runs three jobs in GitHub Actions (`.github/workflows/ci.yml`):

| Job | What it checks |
|---|---|
| Mobile app | TypeScript, and unit tests of the app's helpers (email check, dates, distances) |
| Backend | Lint, TypeScript, unit tests, build, and `npm audit` (fails on a high or critical vulnerability in a production package) |
| End-to-end | 310 tests that call the real backend over HTTP, on a real Postgres with every migration and RLS policy. Each test name starts with the SRS requirement it checks, e.g. `FR-LST-5 · a new listing is saved as pending_review` |

**Test cases for the SRS:** [`docs/testing/TEST-CASES.md`](docs/testing/TEST-CASES.md)
lists every one of the 74 functional requirements, the tests that cover it and
their result, plus the manual test cases for what needs a phone (OTP email,
camera scan, live chat, screens). It is generated from the real test results:
see [`docs/testing/README.md`](docs/testing/README.md).

Run the tests yourself:

```bash
cd code/mobile  && npm test          # app unit tests
cd code/backend && npm test          # backend unit tests
cd code/backend && npm run test:e2e  # end-to-end: needs Postgres + PostgREST, see code/backend/test/README.md
```

## Security

- Row-Level Security is on for every table; the app's public key can read or write nothing directly (tested).
- Every request's session is checked by the backend; admin rights, ID verification, listing ownership and chat/deal membership are re-checked from the database each time.
- Photos are checked by their contents (JPEG, PNG, WebP or HEIC only; SVG and anything else refused), capped at 8 MB while uploading, and stored under names the server chooses. Listings and swap offers can only use photos the student uploaded.
- Rate limits: 120 requests a minute per endpoint, 30 writes a minute per endpoint (messages, offers…), 20 new listings an hour, 40 photo uploads per 10 minutes, counted per signed-in session (so a shared campus Wi-Fi IP doesn't matter). Over the limit → `429`.
- Security headers (helmet), no `X-Powered-By`, CORS limited by `CORS_ORIGINS` once deployed.
- ID cards and condition photos are private; admins and the two parties see them through links that expire.

## Documentation

- **[`docs/api-contract.md`](docs/api-contract.md)** — every endpoint, its rules and responses
- **[`docs/testing/TEST-CASES.md`](docs/testing/TEST-CASES.md)** — test cases for every SRS requirement
- **`project-proposal/`** — the original submitted proposal

## Known gaps

- **Payments are simulated.** `escrow_holds` records holds, releases and refunds
  but no real money moves. A real gateway would only replace `pay()`, `settle()`
  and `refund()` in `transactions.service.ts`.
- Realtime uses Supabase Realtime rather than Socket.io — same effect, no extra
  server. Chat keeps a 15 s fallback poll.
- Phone push needs a development build (step 7); in Expo Go notifications are
  in-app only. "Borrowed item due" reminders are not pushed, because they're
  created when the student opens their inbox (there's no scheduler).
- Campus positions come from the campus map site at 4-decimal precision, and a few
  buildings share one point, so distances are approximate ("~280 m"). The Sports
  Complex isn't on that map yet — add its `lat`/`lng` in `campus_locations`.
- Deal and notification side-effects (e.g. listing → reserved) are sequenced with
  conditional updates rather than database transactions. Scan, cancel and dispute
  resolution now undo their earlier steps if a later one fails, but a crash mid-way
  (server killed between two writes) can still leave a half-finished deal. Moving those
  flows into Postgres functions would make them fully atomic.
- AI moderation is deliberately not wired up. `ai_flag_score` stays null and a
  human decides, which is what proposal §5.1 describes.
- The backend runs locally only — nothing is deployed yet.

> **Note on the schema comments:** `000_initial_schema.sql` is preserved exactly as
> it was first run, so a couple of its inline comments have since gone stale —
> `roll_number` *is* now collected at signup, and Lend *is* wired up. The column
> definitions are all still accurate.
