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

### Rules for every endpoint

- **Photos** (`POST /profile/id-card`, `POST /listings/images`, `POST /transactions/:id/photos`):
  the file's own bytes must be a JPEG, PNG, WebP or HEIC image; the name and
  content type the client sends are ignored, and the server picks the stored name
  and type. SVG, GIF, PDF and anything else → **400**. Over 8 MB → **413**
  (cut off while uploading).
- **Photo links** in `images` (listings) and `item_images` (swap offers) must be
  URLs that `POST /listings/images` returned to *you*. Outside links and other
  students' photos → **400** "… must be photos you uploaded in the app". An edit may
  keep the photos the listing already has.
- **Rate limits** → **429** "Too many requests. Wait a minute and try again."
  Per signed-in session (guests: per IP), per endpoint: 120 requests a minute,
  30 writes a minute; `POST /listings` 20 an hour; photo uploads 40 per 10 minutes.
- Unknown fields in a body are dropped, never stored.

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

**400** — no file, not a JPEG/PNG/WebP/HEIC image, or storage/DB failure
**413** — over 8 MB
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

# Campus places

## GET /campus/locations — public (migration `008`)

```json
[{ "name": "Agira Hall", "kind": "hostel", "category": "Residential",
   "old_name": "Hostel-A", "description": "Boys", "lat": 30.3566, "lng": 76.361 }, …]
```

18 hostels (`kind: "hostel"`) and the campus meeting spots (`kind: "spot"`), taken
from the TIET campus map (loc8tiet.netlify.app). The app uses the hostels for the
profile picker and both lists for a listing's meeting point.

## PATCH /profile — `roll_number`

`{ "roll_number": "1024030098" }` — 9–10 digits. One account per roll number: if
another account already has it → 400 "This roll number is already registered to
another account…". Enforced in the backend and, after migration `010`, by a unique
index. The signup screen keeps the student on the page to correct it.

## PATCH /profile — `hostel`

`{ "hostel": "Agira Hall" }` saves the student's hostel; it must be one of the
`kind: "hostel"` names (anything else → 400). `{ "hostel": null }` clears it. Returned
by `GET /profile/me` as `hostel`. It only changes the order of the student's own feed,
so it isn't verified and can be changed any time.

# Listings

## GET /listings — public (guest browsing)

No token required. With a valid token the full row is returned; **without one the
backend replaces `meeting_location` with `null` and sets `location_hidden: true`**,
so guests can browse but never learn where a handoff happens.

| Query param | Required | Notes |
|---|---|---|
| `type` | no | `sell` \| `lend` \| `exchange` |
| `category` | no | e.g. `Books` |
| `search` | no | case-insensitive over `title` and `description`. Punctuation that is PostgREST filter syntax (`, ( ) . :` etc.) is stripped first, so a search can't alter the query |
| `limit` | no | page size, default **20**, max 50 |
| `offset` | no | rows to skip — the app passes `listings.length` to load the next page |
| `sort` | no | `newest` (default) or `nearest`. Needs migration `008` |

Only `status = 'live'` rows are returned, newest first (ties broken by `id`). A signed-in
student never sees their own listings in the feed (they're in `GET /listings/mine`).

**Nearest first** (`sort=nearest`): ordered by the straight-line distance between the
signed-in student's hostel (`users.hostel`, set via `PATCH /profile`) and each
listing's meeting point, using the map positions in `campus_locations`. No GPS is
involved. Meeting points with no known position come last, newest first. Older
meeting-point names ("Hostel Block A", "Library Foyer") match through aliases.
Guests and students without a hostel get the normal newest-first feed.

For a signed-in student with a hostel, every listing (in either sort, and in
`GET /listings/:id`) carries `distance_m` — metres, or `null` when unknown.

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
  "meeting_location": "Library"
}
```

Type-specific requirements: `price` for sell, `rent_amount` (+ optional
`rent_unit`) for lend, non-empty `want_tags` for exchange.

`meeting_location` must be a place from `GET /campus/locations`, by its name or an
older alias in any case; it is stored as the place's current name (`"hostel block b"`
→ `"Amritam Hall"`). Anything else → **400** "Choose a meeting point from the campus
list". Same rule on `PATCH /listings/:id`.

`images` holds up to 6 public URLs; the listing screen shows all of them in a
swipeable gallery (the first is the cover on feed cards).

Creates the listing with **`status = 'pending_review'`** and inserts a
`moderation_queue` row (`status = 'pending'`, `ai_flag_score = null`). Nothing goes
live directly — this is the proposal's Section 4.2 flow. If the queue insert fails
the listing is rolled back, so the two tables can never disagree.

## GET /listings/:id/matches — public

Exchange listings only (others return `[]`): other students' live listings that fit its
`want_tags`, each with `matched_tags`. A tag matches when a word in the title, description
or category starts with it ("headphone" fits "Boat headphones"; "phone" does not). The
same rule sends `exchange_match` notifications when listings are approved: to the
exchange owner, to owners of matching items, and to owners of exchanges a new listing fits.

## PATCH /listings/:id — verified owner only (needs migration `007`)

Any subset of the `POST /listings` fields **except `type`** (fixed after posting). Allowed
while the listing is `pending_review` or `live`, or `removed` **because an admin rejected
it** (fix and resubmit). Refused while `reserved` (deal in progress) or after completion.

Every edit sends the listing back to **`pending_review`** and queues a fresh moderation
row; any still-pending review of the old version is closed as "Superseded by an edit"
(excluded from clearance analytics). The status update is conditional on the status
that was read, so a deal starting at the same moment wins.

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
| `GET /admin/stats` | Analytics. `clearance` = **time-to-listing-clearance** over the last 30 days (median, p90, average minutes, % within 24 h, approval rate, sample size); `queue` = pending count + oldest wait; plus counts of listings, deals, disputes and users by status |

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

`multipart/form-data`, single field `file`. JPEG, PNG, WebP or HEIC, max 8 MB (see the rules at the top).
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
| `POST /chats/:chatId/offers` | `{ "offered_price": 300 }` — either party may propose. See below for what the number means per listing type |
| `POST /chats/offers/:offerId/accept` | Only the party who did *not* send it |
| `POST /chats/offers/:offerId/reject` | Same rule |

Rules enforced server-side:
- You cannot respond to your own offer.
- Accepting one offer auto-rejects every other pending offer in that thread.
- Once any offer is accepted, no further offers can be made in that thread.
- Non-participants get 403 on all four routes.

What `offered_price` means:

| Listing type | `offered_price` | Extra fields |
|---|---|---|
| sell | the price | — |
| lend | the **rate per `rent_unit`** (₹/day or ₹/week, as listed) | — the deal later multiplies it by the period |
| exchange | the cash **top-up** (0 = straight swap) | see below |

**Exchange offers** (migration `007`). The person who opened the chat must offer an
actual item:

```json
{
  "offered_price": 150,
  "item_title": "Nivia football, size 5",
  "item_description": "Used one season",
  "item_images": ["https://…/listing-images/…jpg"],
  "topup_payer": "initiator"
}
```

- `item_title` (3–120 chars) and at least one `item_images` URL (from
  `POST /listings/images`, max 4) are required; a plain price offer is refused.
- `topup_payer` is required when `offered_price > 0`: `initiator` (the person offering
  the item) or `owner` (the person who listed). Ignored for a straight swap.
- The listing owner can't open with an offer; they accept, decline, or **counter the
  top-up only** — the server copies the item from the latest item offer in the thread.

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
money moves. Needs migrations `004`, `005`, `007` and the private `condition-photos` bucket.

**Who pays** (`payer_id`): the buyer/borrower for sell and lend. For exchange, whoever
owes the top-up — which may be the listing owner. A **straight swap** (top-up 0) skips
payment entirely: the deal is created directly in `escrow_held` with a ₹0 hold, and
cancelling it gives `cancelled`, not `refunded`.

**Lend pricing:** `agreed_price` on the deal is the **total rent** =
agreed rate × units, where units = days between `start_date` and `end_date` (same day
counts as 1), or started weeks for a weekly rate. E.g. ₹40/day for 7 days = ₹280.

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
| `GET /transactions/:id` | buyer / seller | Full deal: listing, names, escrow, lend terms, condition photos (signed URLs, 30 min), dispute, `stage`, `i_show_qr`, `i_scan_qr`, `payer_id`, `i_pay`, `exchange_item` `{ title, description, images }`, `lend_rate` `{ amount, unit }` |
| `POST /transactions` | seller (chat owner) | `{ chat_id, start_date?, end_date?, deposit_amount? }` — needs an **accepted offer** in that chat and a `live` listing. Lend needs both dates. Creates `pending_payment`, listing → `reserved`. One active deal per listing (unique index). |
| `POST /transactions/:id/pay` | payer | Holds `agreed_price + deposit` in escrow → `escrow_held` |
| `POST /transactions` body `meeting_location` | listing owner | Optional on finalise: where to meet, a name from `/campus/locations`. Defaults to the listing's meeting point; required if the listing has none. Included in the buyer's notification |
| `POST /transactions/:id/qr` | giver | Fresh 8-char single-use code, valid **10 min**; older unused codes are expired. Returns `{ code, purpose, expires_at, payload }` where `payload = "CX:<txId>:<code>"` is what the QR encodes. |
| `POST /transactions/:id/photos` | buyer / seller | multipart: `file` (image ≤ 8 MB) + `stage` (`handoff` \| `return`). Stored privately at `condition-photos/<txId>/<stage>/…` |
| `POST /transactions/:id/scan` | receiver | `{ token }` — the scanned payload or the typed code. Requires **≥ 1 condition photo** for the current stage. Token must belong to this deal, match the stage, be unused and unexpired. |
| `POST /transactions/:id/cancel` | buyer / seller | Before handoff only. Refunds escrow if paid; listing back to `live`. |
| `POST /transactions/:id/dispute` | buyer / seller | `{ reason }` (10–1000 chars). Allowed in `escrow_held`, `qr_issued`, `in_use`. Freezes the deal (→ `disputed`), notifies the other party and all admins. One dispute per deal. |

`escrow_holds.released_to_seller` / `refunded_to_buyer` record how much ended up on the
seller side / buyer side. If any step of a scan, cancel or dispute resolution fails, the
earlier steps are undone (deal status, QR code, dispute) so it can simply be retried.

Settlement on a successful scan:

| Type | Handoff scan | Return scan |
|---|---|---|
| sell / exchange | → `completed`; escrow released to the side that didn't pay (seller, or for an owner-paid exchange top-up, the person who offered the item); listing → `completed` | — |
| lend | → `in_use`; escrow stays held | → `completed`; rent to lender, deposit back to borrower; listing → `live` again |

# Admin — disputes (`AdminGuard`)

| Route | Does |
|---|---|
| `GET /admin/disputes` | Open + under-review disputes, each with the full deal and its before/after photos |
| `POST /admin/disputes/:id/review` | `{ note }` — status → `under_review`, both parties notified ("admin needs more information") |
| `POST /admin/disputes/:id/resolve` | `{ outcome: "release" \| "refund", resolution, penalty_amount?, penalty_party?: "buyer" \| "seller" }` |

# Reports and takedown (migration `011`)

| Route | Who | What |
|---|---|---|
| `POST /reports` | any signed-in student | `{ listing_id?, user_id?, reason, details? }` — exactly one of `listing_id` / `user_id`. `reason`: `prohibited` \| `scam` \| `fake` \| `wrong_info` \| `offensive` \| `other`; `details` ≤ 1000 chars. A listing must be `live` or `reserved` and not yours; a person must share a chat with you (403 otherwise). A second open report on the same target → 400 "You already reported this…". All admins get a `report_opened` notification |
| `GET /admin/reports` | admin | Open reports, oldest first, each with `reason_label`, reporter, the listing (and its owner) or the reported student, and `open_reports_on_target` |
| `POST /admin/reports/:id/resolve` | admin | `{ outcome: "actioned" \| "dismissed", note }` (note 3–300 chars). `actioned` on a listing report = takedown (below). The reporter gets a `report_update` notification |
| `POST /admin/listings/:id/takedown` | admin | `{ reason }` (3–300 chars). For a `live`, `reserved` or `pending_review` listing: sets it `removed` for good (a trigger stops it coming back), cancels and refunds every deal on it that has not reached the handoff, closes its open reports as actioned, tells the owner (`listing_removed`, with the reason) and the reporters. Returns `{ id, status, cancelled_deals, open_deals, reports_closed }` |

The owner sees the reason as `taken_down_reason` on `GET /listings/mine` and `GET /listings/:id`.

**Penalty tiers** (`GET /admin/disputes/penalty-tiers`): `minor` ₹50, `moderate` ₹200,
`severe` ₹500 (edit `PENALTY_TIERS` in `disputes.service.ts`). Resolve with
`{ penalty_tier, penalty_party }`; a typed `penalty_amount` is ignored. The dispute queue
includes `buyer_record` / `seller_record` = `{ penalty_total, penalties }`.

**Photos before QR:** the person handing over must add a condition photo before
`POST /transactions/:id/qr`, and the person receiving must add their own before
`/scan`. `GET /transactions/:id` returns `photo_status: { stage, mine, theirs }`.

`release` → the deal stands: all escrow to the side that didn't pay, deal `completed`.
`refund` → all escrow back to whoever paid, deal `refunded`; listing back to `live` if the
item never changed hands, else `removed`. A penalty is added to that user's
`users.penalty_total` in one atomic update (`add_penalty`, migration `007`).

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
| `POST /notifications/push-token` | `{ token: "ExponentPushToken[…]", platform? }` — registers this phone for push (migration `008`). A token already registered to someone else moves to the caller |
| `DELETE /notifications/push-token` | `{ token }` — on sign-out |

Created automatically for: listing approved/rejected, ID verified/rejected, new message
(collapsed per chat while unread), new offer, offer accepted/declined, deal created,
payment held, handoff complete, item returned, deal cancelled, lend due/overdue,
dispute opened/updated/resolved, and **category alerts** when a listing goes live in a
subscribed category.

Each notification's `payload` is `{ title, body, listing_id?, chat_id?, transaction_id?, dispute_id? }`.

**Push:** every notification above is also sent to the recipient's registered
phones through Expo's push service (free), except lend-due reminders. The push
`data` carries `type` and the same ids, so tapping it opens the deal, chat or
listing. Pushing is fire-and-forget: it never slows down or fails the action that
caused it. Tokens Expo reports as `DeviceNotRegistered` (app uninstalled) are
deleted automatically.

# Realtime

After migration `006`, the app subscribes to row changes on `messages`, `offers`,
`transactions` and `notifications` (Supabase Realtime). Events are only a signal — the
app re-fetches through this API. RLS read policies limit each user to their own chats,
deals and inbox. Chat keeps a 15 s fallback poll in case realtime isn't connected.
