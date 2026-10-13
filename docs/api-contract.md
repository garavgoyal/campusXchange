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

---

# Verified-student gate

Every **action** route now requires `users.id_verified = 'verified'` (or `role = 'admin'`),
enforced by `VerifiedStudentGuard`. Unverified callers get **403** with a message
telling them to wait for / redo ID verification.

| Gated (verified only) | Open to any signed-in student |
|---|---|
| `POST /listings`, `POST /listings/images` | `GET /listings/mine`, `DELETE /listings/:id` |
| `POST /chats`, `POST /chats/:id/messages`, `POST /chats/:id/offers`, offer accept/reject | `GET /chats`, `GET` messages / offers |
| every `POST /transactions…` route | `GET /transactions…` |
| | `/profile/*`, `/notifications/*` |

`GET /listings/:id` now also returns a **non-live** listing to its owner and to anyone
who already has a chat on it (so the chat and deal screens keep working after the item
is reserved). Everyone else still gets 404.

`POST /chats` refuses to open a *new* thread on a listing that is not `live`.
Offers can only be made or accepted while the listing is `live`.
`DELETE /listings/:id` refuses while the listing is `reserved` (cancel the deal first).

---

# Deals (transactions) — all routes require auth

Payments are **simulated**: `escrow_holds` records holds, releases and refunds, but no
money moves. Needs migrations `004`, `005` and the private `condition-photos` bucket.

```
pending_payment ─pay─▶ escrow_held ─show QR─▶ qr_issued ─scan─▶ completed            (sell / exchange)
                                                       └─scan─▶ in_use ─return scan─▶ completed   (lend)
active ─dispute─▶ disputed ─admin─▶ completed | refunded
pending_payment / escrow_held / qr_issued ─cancel─▶ cancelled | refunded
```

The person **receiving** the item scans the QR shown by the person **handing it over**:
at handoff the buyer scans the seller's QR (this releases payment); at a lend return the
lender scans the borrower's QR.

| Route | Who | Does |
|---|---|---|
| `GET /transactions` | party | Your deals, newest first, with `my_role` and listing summary |
| `GET /transactions/by-chat/:chatId` | chat participant | `{ transaction: { id, status } \| null }` — latest deal from that chat |
| `GET /transactions/:id` | buyer / seller | Full deal: listing, names, escrow, lend terms, condition photos (signed URLs, 30 min), dispute, `stage`, `i_show_qr`, `i_scan_qr` |
| `POST /transactions` | seller (chat owner) | `{ chat_id, start_date?, end_date?, deposit_amount? }` — needs an **accepted offer** in that chat and a `live` listing. Lend needs both dates. Creates `pending_payment`, listing → `reserved`. One active deal per listing (unique index). |
| `POST /transactions/:id/pay` | buyer | Holds `agreed_price + deposit` in escrow → `escrow_held` |
| `POST /transactions/:id/qr` | giver | Fresh 8-char single-use code, valid **10 min**; older unused codes are expired. Returns `{ code, purpose, expires_at, payload }` where `payload = "CX:<txId>:<code>"` is what the QR encodes. |
| `POST /transactions/:id/photos` | buyer / seller | multipart: `file` (image ≤ 8 MB) + `stage` (`handoff` \| `return`). Stored privately at `condition-photos/<txId>/<stage>/…` |
| `POST /transactions/:id/scan` | receiver | `{ token }` — the scanned payload or the typed code. Requires **≥ 1 condition photo** for the current stage. Token must belong to this deal, match the stage, be unused and unexpired. |
| `POST /transactions/:id/cancel` | buyer / seller | Before handoff only. Refunds escrow if paid; listing back to `live`. |
| `POST /transactions/:id/dispute` | buyer / seller | `{ reason }` (10–1000 chars). Allowed in `escrow_held`, `qr_issued`, `in_use`. Freezes the deal (→ `disputed`), notifies the other party and all admins. One dispute per deal. |

Settlement on a successful scan:

| Type | Handoff scan | Return scan |
|---|---|---|
| sell / exchange | → `completed`; escrow released to seller; listing → `completed` | — |
| lend | → `in_use`; escrow stays held | → `completed`; rent to lender, deposit back to borrower; listing → `live` again |

# Admin — disputes (`AdminGuard`)

| Route | Does |
|---|---|
| `GET /admin/disputes` | Open + under-review disputes, each with the full deal and its before/after photos |
| `POST /admin/disputes/:id/review` | `{ note }` — status → `under_review`, both parties notified ("admin needs more information") |
| `POST /admin/disputes/:id/resolve` | `{ outcome: "release" \| "refund", resolution, penalty_amount?, penalty_party?: "buyer" \| "seller" }` |

`release` → all escrow to the seller, deal `completed`. `refund` → all escrow to the
buyer, deal `refunded`; listing back to `live` if the item never changed hands, else
`removed`. A penalty is added to that user's `users.penalty_total`.

---

# Notifications — all routes require auth

| Route | Does |
|---|---|
| `GET /notifications` | Latest 50 for the caller (also creates "borrowed item due" reminders on the fly) |
| `GET /notifications/unread-count` | `{ unread }` |
| `POST /notifications/:id/read` | Mark one read |
| `POST /notifications/read-all` | Mark all read |
| `GET /notifications/subscriptions` | `{ categories: [...] }` — category alerts |
| `PUT /notifications/subscriptions` | `{ categories: [...] }` — replaces the set (max 20) |

Created automatically for: listing approved/rejected, ID verified/rejected, new message
(collapsed per chat while unread), new offer, offer accepted/declined, deal created,
payment held, handoff complete, item returned, deal cancelled, lend due/overdue,
dispute opened/updated/resolved, and **category alerts** when a listing goes live in a
subscribed category.

Each notification's `payload` is `{ title, body, listing_id?, chat_id?, transaction_id?, dispute_id? }`.

# Realtime

After migration `006`, the app subscribes to row changes on `messages`, `offers`,
`transactions` and `notifications` (Supabase Realtime). Events are only a signal — the
app re-fetches through this API. RLS read policies limit each user to their own chats,
deals and inbox. Chat keeps a 15 s fallback poll in case realtime isn't connected.
