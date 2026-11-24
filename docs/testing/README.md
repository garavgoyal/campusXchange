# Testing

How the SRS's 81 functional requirements and 37 non-functional requirements are tested, and where to find the results.

| File | What it is |
|---|---|
| [`TEST-CASES.md`](TEST-CASES.md) | Every requirement, the tests that cover it, and their result. Generated, so don't edit it by hand. |
| `coverage.csv`, `test-cases.csv`, `nfr-coverage.csv` | The same tables as CSV, to open in Excel or Google Sheets. `test-cases.csv` has Tester and Date columns: CI for automated tests, filled in by the team for manual ones. |
| `manual-test-cases.json` | The manual test cases: what only a person with a phone can check. Edit these by hand. |
| `build-test-cases.mjs` | Builds the files above from the test results. To record a manual result, add `"status": "Pass"`, `"tester"` and `"date"` to that case in `manual-test-cases.json` and run it again. |

## Kinds of test

1. **End-to-end API tests** (`code/backend/test/*.e2e-spec.ts`). These are most of
   the tests. Each one signs in as real test users and calls the built backend
   over HTTP, the same way the app does. The backend runs against a real Postgres
   with every migration and Row-Level Security policy. One file per SRS feature
   group, plus `nfr-security.e2e-spec.ts` for the security and privacy
   requirements.
2. **Unit tests** of small pieces: backend helpers (`code/backend/src/**/*.spec.ts`)
   and app helpers (`code/mobile/src/utils/__tests__`).
3. **Manual test cases** for what software can't check by itself: an OTP email
   arriving, the camera scanning a QR code, a message appearing live on a second
   phone, and what the screens show.

Every automated test name starts with the requirement it checks:

```
FR-HND-2 · an expired code is refused
NFR-SEC-5 · anon key reads nothing from users
```

That's how `build-test-cases.mjs` matches each result to its requirement.

## Updating TEST-CASES.md

```bash
cd code/backend && npm test && npm run test:e2e   # writes code/backend/test-results/*.json
cd ../mobile   && npm test                         # writes code/mobile/test-results/unit.json
cd ../..       && node docs/testing/build-test-cases.mjs
```

GitHub Actions runs the same tests on every push and keeps the end-to-end
results as a downloadable `e2e-results` artifact on each run.

## Before the demo

Run the manual cases in `TEST-CASES.md` (section "Manual test steps") on two
phones, and tick Pass or Fail next to each one.
