# API Contract — Login / Profile

Base URL: `http://<backend-host>:3000` (local dev: your Mac's LAN IP, so a phone
on the same Wi-Fi can reach it).

Auth: every `/profile/*` route requires the Supabase session access token:

```
Authorization: Bearer <supabase access_token>
```

The mobile app gets that token from `supabase.auth.getSession()` after the user
verifies their emailed OTP. The backend validates it with
`supabase.auth.getUser(token)` (see `common/guards/supabase-auth.guard.ts`).

---

## GET /health

No auth. Use it to confirm the phone can reach the backend.

**200**
```json
{ "status": "ok", "service": "campusxchange-backend", "time": "2026-09-06T17:11:54.325Z" }
```

---

## POST /profile/id-card

Uploads the student's ID card photo for manual admin review.

**Request** — `multipart/form-data`, single field:

| Field | Type | Notes |
|---|---|---|
| `file` | image | JPEG/PNG/HEIC/WebP, max 8 MB |

Stored privately at `id-cards/<user_id>/<timestamp>.<ext>`. The path (not a
public URL) is written to `users.id_card_image_url`, and `users.id_verified`
is set to `pending`.

**200**
```json
{ "ok": true, "path": "9f1c.../1788714745978.jpg", "id_verified": "pending" }
```

**400** — no file, unsupported type, over 8 MB, or storage/DB failure
**401** — missing/invalid/expired bearer token

---

## GET /profile/me

Returns the caller's row from `public.users`. That row is created automatically
by the `on_auth_user_created` trigger the moment Supabase Auth creates the
account, so it always exists for an authenticated caller.

**200**
```json
{
  "id": "9f1c8e1a-...",
  "name": "",
  "email": "student@thapar.edu",
  "roll_number": null,
  "id_card_image_url": "9f1c.../1788714745978.jpg",
  "id_verified": "pending",
  "role": "student"
}
```

**400** — profile row not found
**401** — missing/invalid/expired bearer token

---

## Auth screens (no backend involved)

Email entry and OTP entry talk to Supabase directly from the app — there is no
backend endpoint for them:

| Step | Call |
|---|---|
| Send code | `supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true } })` |
| Verify code | `supabase.auth.verifyOtp({ email, token, type: 'email' })` |
| Sign out | `supabase.auth.signOut()` |

Signup is gated to `@thapar.edu` addresses client-side
(`src/utils/validateEmail.ts`). To enforce it server-side as well, restrict
allowed email domains in the Supabase dashboard under Authentication → Providers → Email.

---

# Listings

## GET /listings — public (guest browsing)

No token required. With a valid token the full row is returned; **without one the
backend replaces `meeting_location` with `null` and sets `location_hidden: true`**,
so guests can browse but never learn where a handoff happens.

| Query param | Required | Notes |
|---|---|---|
| `type` | no | `sell` \| `lend` \| `exchange` |
| `category` | no | e.g. `Books` |
| `search` | no | case-insensitive over `title` and `description` |

Only `status = 'live'` rows are returned, newest first, capped at 100.

## GET /listings/:id — public
Same location rule. 404 if the listing isn't `live`.

## GET /listings/mine — auth required
The caller's own listings at **every** status, so they can see `pending_review`.

## POST /listings — auth required

```json
{
  "type": "sell",
  "title": "Physics Textbook",
  "description": "No markings inside",
  "category": "Books",
  "condition": "Good",
  "price": 350,
  "meeting_location": "Hostel Block C"
}
```

Type-specific requirements: `price` for sell, `rent_amount` (+ optional
`rent_unit`) for lend, non-empty `want_tags` for exchange.

Creates the listing with **`status = 'pending_review'`** and inserts a
`moderation_queue` row (`status = 'pending'`, `ai_flag_score = null`). Nothing goes
live directly — this is the proposal's Section 4.2 flow. If the queue insert fails
the listing is rolled back, so the two tables can never disagree.

---

# Admin — all routes require `users.role = 'admin'`

Non-admins get 403. Make yourself an admin: Table Editor → `users` → set `role` to `admin`.

| Route | Does |
|---|---|
| `GET /admin/moderation` | Pending queue rows with the full listing joined in |
| `POST /admin/moderation/:listingId/approve` | queue → `approved` (+ reviewer, timestamp); listing → `live` |
| `POST /admin/moderation/:listingId/reject` | queue → `rejected` (+ `reason`); listing → `removed` |
| `GET /admin/id-verifications` | Users with `id_verified = 'pending'` and an uploaded card, each with a **10-minute signed URL** for the private image |
| `POST /admin/id-verifications/:userId` | `{ "decision": "verified" \| "rejected" }` |

`ai_flag_score` is always null — moderation is human-only, per proposal Section 5.1.

---

# Chat — all routes require auth

| Route | Does |
|---|---|
| `GET /chats` | The caller's threads, each with its listing and last message |
| `POST /chats` | `{ "listing_id": "uuid" }` — idempotent, returns the existing thread if there is one. Rejects chatting on your own listing |
| `GET /chats/:chatId/messages` | Messages oldest-first, capped at 200. 403 if not a participant |
| `POST /chats/:chatId/messages` | `{ "content": "..." }` |

The app polls `GET messages` every 4s while a thread is open. Socket.io real-time is
the later upgrade — the REST shape stays the same.

---

# PATCH /profile/roll-number — auth required

`{ "roll_number": "1024030098" }` — must be 9–10 digits. Writes `users.roll_number`.

---

# Listing photos

## POST /listings/images — auth required

`multipart/form-data`, single field `file`. Images only, max 8 MB.
Stored at `listing-images/<user id>/<timestamp>-<rand>.<ext>` in a **public**
bucket (unlike `id-cards`, which is private — everyone browsing must be able to
load these, guests included).

**200** → `{ "url": "https://...supabase.co/storage/v1/object/public/listing-images/...", "path": "..." }`

Upload each photo first, then pass the returned URLs as `images` on `POST /listings`.

---

# Negotiation (offers)

Price haggling inside a chat thread. Deliberately stops at "both sides agreed on a
number" — **no transaction row, no escrow, no payment**.

| Route | Does |
|---|---|
| `GET /chats/:chatId/offers` | All offers on the thread, oldest first |
| `POST /chats/:chatId/offers` | `{ "offered_price": 300 }` — either party may propose |
| `POST /chats/offers/:offerId/accept` | Only the party who did *not* send it |
| `POST /chats/offers/:offerId/reject` | Same rule |

Rules enforced server-side:
- You cannot respond to your own offer.
- Accepting one offer auto-rejects every other pending offer in that thread.
- Once any offer is accepted, no further offers can be made in that thread.
- Non-participants get 403 on all four routes.

Requires `offers.sender_id`, added by `supabase/migrations/002_offers_sender.sql`.
The app merges messages and offers into a single timeline ordered by timestamp.
