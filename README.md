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
| Payments, escrow, QR handoff, disputes | ⛔ not started |
| Ratings, notifications, proximity sorting | ⛔ not started |

Negotiation deliberately stops at **"both sides agreed a price."** No transaction
row, no escrow, no payment gateway — that's the next phase.

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
├── project-proposal/    The original submitted proposal
├── docs/ · journals/    Coursework documents
└── .github/workflows/   CI — typechecks the app, builds the backend
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

### 2. Storage buckets

Storage → New bucket. The access setting differs and it matters:

| Bucket | Public? | Holds |
|---|---|---|
| `id-cards` | **No — private** | Student ID photos. Only the backend reads them, via short-lived signed URLs shown to admins. |
| `listing-images` | **Yes — public** | Listing photos. Every browsing student must load these, guests included. |

### 3. Email delivery

Supabase's built-in mailer is rate-limited to a couple of emails per hour, and
**new free projects can't edit the auth email templates without custom SMTP.**
Connect your own SMTP under Project Settings → Authentication → SMTP Settings
(Gmail with an app password works), then edit **both** the *Confirm signup* and
*Magic Link* templates to send `{{ .Token }}` — the 6-digit code — instead of a link.

### 4. Environment files

Copy each `.env.example` to `.env` and fill it in. Both are git-ignored.

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
PORT=3000
```

Find your LAN IP with `ipconfig getifaddr en0`. Not `localhost` — to your phone,
localhost means the phone.

### 5. Run it

```bash
# terminal 1
cd code/backend
npm install --legacy-peer-deps      # see note below
npm run start:dev

# terminal 2
cd code/mobile
npm install
npx expo start --clear
```

Scan the QR code with **Expo Go**. Phone and laptop must be on the same Wi-Fi.

Check the connection first: open `http://YOUR_LAN_IP:3000/health` in your phone's
browser. If that doesn't respond, it's the network — not the code.

> `--legacy-peer-deps` is required in `backend/`. npm 10 throws
> `Cannot read properties of null (reading 'edgesOut')` resolving the generated
> `vitest@4` peer set otherwise.

### 6. Become an admin

Table Editor → `users` → set your row's `role` to `admin`, then reload the app.
A **Review** tab appears with the moderation and ID-verification queues. The tab
is only cosmetic — every `/admin/*` request is re-checked server-side by a guard.

---

## Documentation

- **[`docs/api-contract.md`](docs/api-contract.md)** — every endpoint, its rules and responses
- **`project-proposal/`** — the original submitted proposal

## Known gaps

- **RLS is disabled on all 13 tables.** The anon key ships inside the app, so
  anyone holding it can currently read and write every table directly. Enabling
  RLS with no policies is safe today — the app only calls `supabase.auth` and
  never queries tables, and the backend's `service_role` key bypasses RLS.
- Chat polls every 4 seconds; the proposal specifies Socket.io.
- AI moderation is deliberately not wired up. `ai_flag_score` stays null and a
  human decides, which is what proposal §5.1 describes.
- The backend runs locally only — nothing is deployed yet.

> **Note on the schema comments:** `000_initial_schema.sql` is preserved exactly as
> it was first run, so a couple of its inline comments have since gone stale —
> `roll_number` *is* now collected at signup, and Lend *is* wired up. The column
> definitions are all still accurate.
