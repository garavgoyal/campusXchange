import crypto from 'node:crypto';
import fs from 'node:fs';
import pg from 'pg';
import { campusDay } from '../../src/common/dates/campus-day.js';
import { signJwt } from '../stack/gateway.mjs';
import { API, config, PUSH_LOG } from './config.js';

// ---------------------------------------------------------------------------
// Database (direct access, for setting up a scene and checking stored rows)
// ---------------------------------------------------------------------------

let pool: pg.Pool | null = null;
const db = () => (pool ??= new pg.Pool({ connectionString: config.databaseUrl, max: 2 }));

export async function sql<T = Record<string, any>>(text: string, params: unknown[] = []): Promise<T[]> {
  return (await db().query(text, params)).rows as T[];
}

/** The first column of the first row, or null. */
export async function sqlValue<T = any>(text: string, params: unknown[] = []): Promise<T | null> {
  const rows = await sql(text, params);
  return rows.length ? (Object.values(rows[0])[0] as T) : null;
}

export async function closeDb() {
  await pool?.end();
  pool = null;
}

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

export type TestUser = { id: string; email: string; name: string; token: string };

/** A signed-in session for an existing auth user, like Supabase would issue. */
export function sessionFor(id: string, email: string): string {
  return signJwt(config.jwtSecret, { role: 'authenticated', sub: id, email, aud: 'authenticated' });
}

const rand = () => crypto.randomBytes(4).toString('hex');
/** A random 10-digit roll number (starts with 9, so it never clashes with real ones). */
export function newRollNumber(): string {
  return '9' + String(crypto.randomInt(0, 1_000_000_000)).padStart(9, '0');
}

/**
 * Creates a student the way sign-up does (an auth.users row; the database
 * trigger makes the profile), then sets their verification and role.
 */
export async function makeUser(
  name: string,
  { verified = true, admin = false, roll = true }: { verified?: boolean; admin?: boolean; roll?: boolean } = {},
): Promise<TestUser> {
  const email = `${name.toLowerCase().replace(/[^a-z]/g, '')}.${rand()}@thapar.edu`;
  const [{ id }] = await sql<{ id: string }>(
    `insert into auth.users (email, raw_user_meta_data) values ($1, $2) returning id`,
    [email, { name }],
  );
  await sql(`update public.users set id_verified = $2, role = $3, roll_number = $4, name = $5 where id = $1`, [
    id,
    verified ? 'verified' : 'pending',
    admin ? 'admin' : 'student',
    roll ? newRollNumber() : null,
    name,
  ]);
  return { id, email, name, token: sessionFor(id, email) };
}

// ---------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------

export type ApiResult = { status: number; body: any; headers: Headers };

export async function api(
  user: TestUser | null,
  method: string,
  path: string,
  body?: unknown,
  { form, base = API, token }: { form?: FormData; base?: string; token?: string } = {},
): Promise<ApiResult> {
  const headers: Record<string, string> = {};
  const bearer = token ?? user?.token;
  if (bearer) headers.Authorization = `Bearer ${bearer}`;
  let payload: BodyInit | undefined;
  if (form) payload = form;
  else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const res = await fetch(base + path, { method, headers, body: payload });
  const text = await res.text();
  let parsed: any = text;
  try {
    parsed = JSON.parse(text);
  } catch {
    /* plain text */
  }
  return { status: res.status, body: parsed, headers: res.headers };
}

/** The error message of a failed call, for assertion messages. */
export const msg = (r: ApiResult) =>
  (typeof r.body === 'object' && r.body ? JSON.stringify(r.body.message ?? r.body) : String(r.body)).slice(0, 200);

/** Fails with the server's message when a call that should work doesn't. */
export async function ok(promise: Promise<ApiResult>): Promise<any> {
  const r = await promise;
  if (r.status >= 300) throw new Error(`expected success, got ${r.status}: ${msg(r)}`);
  return r.body;
}

// ---------------------------------------------------------------------------
// Files
// ---------------------------------------------------------------------------

/** A real 1×1 PNG. */
export const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);
/** The first bytes of a JPEG — enough for the type check. */
export const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]), Buffer.from('JFIF\0'), Buffer.alloc(64)]);

export function fileForm(
  { bytes = PNG, type = 'image/png', name = 'photo.png' }: { bytes?: Buffer | Uint8Array; type?: string; name?: string } = {},
  fields: Record<string, string> = {},
): FormData {
  const form = new FormData();
  form.append('file', new Blob([new Uint8Array(bytes)], { type }), name);
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  return form;
}

/** Uploads a listing/swap photo and returns its public URL. */
export async function uploadPhoto(user: TestUser): Promise<string> {
  return (await ok(api(user, 'POST', '/listings/images', undefined, { form: fileForm() }))).url;
}

// ---------------------------------------------------------------------------
// Scenes
// ---------------------------------------------------------------------------

/** Posts a listing and has an admin approve it. */
export async function liveListing(owner: TestUser, admin: TestUser, body: Record<string, unknown>) {
  const listing = await ok(api(owner, 'POST', '/listings', { meeting_location: 'Library', category: 'Books', ...body }));
  await ok(api(admin, 'POST', `/admin/moderation/${listing.id}/approve`));
  return listing;
}

/**
 * Buyer opens a chat and offers `price`, owner accepts and finalises. Returns
 * the chat and the new deal (pending payment).
 */
export async function agreedDeal(
  owner: TestUser,
  buyer: TestUser,
  listingId: string,
  price: number,
  finalise: Record<string, unknown> = {},
) {
  const chat = await ok(api(buyer, 'POST', '/chats', { listing_id: listingId }));
  const offer = await ok(api(buyer, 'POST', `/chats/${chat.id}/offers`, { offered_price: price }));
  await ok(api(owner, 'POST', `/chats/offers/${offer.id}/accept`));
  const deal = await ok(api(owner, 'POST', '/transactions', { chat_id: chat.id, ...finalise }));
  return { chat, deal };
}

/** A sell deal that is paid and waiting for the meetup. */
export async function paidSellDeal(owner: TestUser, buyer: TestUser, admin: TestUser, price = 500) {
  const listing = await liveListing(owner, admin, {
    type: 'sell', title: `Item ${rand()}`, category: 'Electronics', price,
  });
  const { chat, deal } = await agreedDeal(owner, buyer, listing.id, price);
  const paid = await ok(api(buyer, 'POST', `/transactions/${deal.id}/pay`));
  return { listing, chat, deal: paid };
}

/**
 * The meetup: the giver photographs the item and shows the QR, the receiver
 * photographs it and scans. Returns the scan response.
 */
export async function handoff(dealId: string, giver: TestUser, receiver: TestUser, stage: 'handoff' | 'return' = 'handoff') {
  await ok(api(giver, 'POST', `/transactions/${dealId}/photos`, undefined, { form: fileForm({}, { stage }) }));
  const qr = await ok(api(giver, 'POST', `/transactions/${dealId}/qr`));
  await ok(api(receiver, 'POST', `/transactions/${dealId}/photos`, undefined, { form: fileForm({}, { stage }) }));
  return api(receiver, 'POST', `/transactions/${dealId}/scan`, { token: qr.payload });
}

/** YYYY-MM-DD, `n` days from today on campus (India), like the backend and the app use. */
export function day(n: number): string {
  return campusDay(n);
}

/** A user's notifications (newest first). */
export async function inbox(user: TestUser): Promise<any[]> {
  const body = await ok(api(user, 'GET', '/notifications'));
  return body.items ?? body;
}

// ---------------------------------------------------------------------------
// Push (fake Expo service)
// ---------------------------------------------------------------------------

export function pushesReceived(): any[] {
  if (!fs.existsSync(PUSH_LOG)) return [];
  return fs
    .readFileSync(PUSH_LOG, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l));
}

/** Waits until `check` returns a truthy value (push is sent in the background). */
export async function eventually<T>(check: () => T | Promise<T>, timeoutMs = 4000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await check();
    if (value) return value;
    if (Date.now() > deadline) return value;
    await new Promise((r) => setTimeout(r, 100));
  }
}

export const uniqueToken = (label: string) => `ExponentPushToken[${label}${rand()}]`;
