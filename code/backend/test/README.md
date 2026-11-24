# Backend tests

| Command | What runs |
|---|---|
| `npm test` | Unit tests in `src/**/*.spec.ts`. They need nothing else running. |
| `npm run test:e2e` | Builds the backend, then runs `test/*.e2e-spec.ts` against it, over HTTP, on a real test database. |

CI runs both on every push (`.github/workflows/ci.yml`, jobs **backend** and **e2e**).

## How the end-to-end tests run

No Supabase project and no internet are needed. `test/stack/` gives the tests a
small stand-in for Supabase:

- **Postgres**, set up by `stack/setup-db.sh`: Supabase's roles and `auth` schema
  (`supabase-shim.sql`), every file in `supabase/migrations` in order, then
  Supabase's default table grants (`supabase-grants.sql`). The RLS tests therefore
  check the real policies.
- **PostgREST**, the same REST server Supabase uses, pointed at that database.
- **`stack/gateway.mjs`**: the parts of Supabase's HTTP API the backend uses.
  `/rest/v1` goes to PostgREST, `/auth/v1/user` checks the tests' signed sessions,
  and `/storage/v1` keeps files in a temp folder.
- **`stack/push-stub.mjs`**: a fake Expo push service that records every
  notification it receives.

`e2e/global-setup.ts` starts the gateway and the push stub, wipes the test data,
then starts `dist/main.js` twice:
- once with the rate limits multiplied by 1000, so the tests can run fast;
- once with the real limits, for the rate-limit tests.

## Running the end-to-end tests on your laptop

You need PostgreSQL 16 and the PostgREST binary
([releases](https://github.com/PostgREST/postgrest/releases), v12.2.3).

```bash
cd code/backend
# 1. a fresh test database (safe: it only touches the database named cx_test)
PGHOST=127.0.0.1 PGUSER=postgres PGPASSWORD=postgres TEST_DB=cx_test bash ./test/stack/setup-db.sh

# 2. PostgREST, in another terminal
PGRST_DB_URI=postgres://authenticator:authenticator@127.0.0.1:5432/cx_test \
PGRST_DB_SCHEMAS=public PGRST_DB_ANON_ROLE=anon PGRST_SERVER_PORT=3001 \
PGRST_JWT_SECRET=campusxchange-test-only-secret-0123456789abcdef ./postgrest

# 3. the tests
TEST_DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5432/cx_test npm run test:e2e
```

Never point `TEST_DATABASE_URL` at the real Supabase database: the tests delete
all users when they start.

## Writing a test

Start the test name with the requirement it checks, then say what should happen:

```ts
it('FR-LST-5 · a new listing is saved as pending_review', async () => { … });
```

`e2e/helpers.ts` has what most tests need:
- `makeUser`: a signed-in test student or admin;
- `api`: make a request;
- `liveListing`: a listing that has been approved;
- `agreedDeal` and `paidSellDeal`: a deal at the stage you need;
- `handoff`: the photo + QR + scan meetup;
- `sql`: read or set up rows directly.
