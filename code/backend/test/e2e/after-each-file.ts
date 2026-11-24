import { closeDb } from './helpers.js';

// Each test file runs in its own worker: close its database pool at the end.
afterAll(async () => {
  await closeDb();
});
