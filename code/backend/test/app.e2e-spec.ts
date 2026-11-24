import { api } from './e2e/helpers.js';

describe('Backend is up', () => {
  it('GET /health answers 200', async () => {
    const r = await api(null, 'GET', '/health');
    expect(r.status).toBe(200);
    expect(r.body.status).toBe('ok');
  });
});
