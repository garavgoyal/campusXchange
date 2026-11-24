import { api, fileForm, JPEG, makeUser, msg, newRollNumber, ok, sessionFor, sql, sqlValue, type TestUser } from './e2e/helpers.js';

/** SRS §3.1 Account, Sign-up and Verification */
describe('FR-AUTH · Account, sign-up and verification', () => {
  let student: TestUser;
  let other: TestUser;
  let admin: TestUser;

  beforeAll(async () => {
    student = await makeUser('Asha');
    other = await makeUser('Bilal');
    admin = await makeUser('Admin', { admin: true });
  });

  describe('FR-AUTH-2 · only @thapar.edu addresses can sign up', () => {
    it('FR-AUTH-2 · the database refuses a non-college email', async () => {
      await expect(sql(`insert into auth.users (email) values ('someone@gmail.com')`)).rejects.toThrow();
    });

    it('FR-AUTH-2 · a look-alike domain is refused (thapar.edu.evil.com)', async () => {
      await expect(sql(`insert into auth.users (email) values ('x@thapar.edu.evil.com')`)).rejects.toThrow();
    });

    it('FR-AUTH-2 · the domain check ignores letter case', async () => {
      const rows = await sql<{ id: string }>(`insert into auth.users (email) values ('Mixed.Case@THAPAR.EDU') returning id`);
      expect(rows).toHaveLength(1);
    });
  });

  describe('FR-AUTH-3 · a profile is created with every account', () => {
    it('FR-AUTH-3 · new account gets a users row: role student, id_verified pending', async () => {
      const [{ id }] = await sql<{ id: string }>(
        `insert into auth.users (email, raw_user_meta_data) values ('fresh.${Date.now()}@thapar.edu', '{"name":"Fresh"}') returning id`,
      );
      const [profile] = await sql(`select role, id_verified from public.users where id = $1`, [id]);
      expect(profile).toEqual({ role: 'student', id_verified: 'pending' });
    });

    it('FR-AUTH-3 · the new session can read its own profile straight away', async () => {
      const email = `brandnew.${Date.now()}@thapar.edu`;
      const [{ id }] = await sql<{ id: string }>(`insert into auth.users (email) values ($1) returning id`, [email]);
      const r = await api(null, 'GET', '/profile/me', undefined, { token: sessionFor(id, email) });
      expect(r.status).toBe(200);
      expect(r.body.email).toBe(email);
    });
  });

  describe('FR-AUTH-4 · roll number of 9–10 digits', () => {
    it('FR-AUTH-4 · a 10-digit roll number is saved on the profile', async () => {
      const roll = newRollNumber();
      const r = await api(student, 'PATCH', '/profile', { roll_number: roll });
      expect(r.status, msg(r)).toBe(200);
      expect(await sqlValue(`select roll_number from users where id = $1`, [student.id])).toBe(roll);
    });

    it('FR-AUTH-4 · a 9-digit roll number is accepted', async () => {
      const r = await api(student, 'PATCH', '/profile', { roll_number: newRollNumber().slice(1) });
      expect(r.status, msg(r)).toBe(200);
    });

    it.each(['12345678', '12345678901', '10240a0098', '1024 30098', ''])(
      'FR-AUTH-4 · "%s" is refused',
      async (bad) => {
        const r = await api(student, 'PATCH', '/profile', { roll_number: bad });
        expect(r.status).toBe(400);
      },
    );

    it('FR-AUTH-4 · one account per roll number', async () => {
      const roll = newRollNumber();
      await ok(api(student, 'PATCH', '/profile', { roll_number: roll }));
      const r = await api(other, 'PATCH', '/profile', { roll_number: roll });
      expect(r.status).toBe(400);
      expect(msg(r)).toMatch(/already registered/);
      expect(await sqlValue(`select roll_number from users where id = $1`, [other.id])).not.toBe(roll);
    });

    it('FR-AUTH-4 · saving your own roll number again is fine', async () => {
      const roll = await sqlValue<string>(`select roll_number from users where id = $1`, [student.id]);
      const r = await api(student, 'PATCH', '/profile', { roll_number: roll, name: 'Asha K' });
      expect(r.status, msg(r)).toBe(200);
    });

    it('FR-AUTH-4 · the database itself refuses a duplicate roll number', async () => {
      const roll = await sqlValue<string>(`select roll_number from users where id = $1`, [student.id]);
      await expect(sql(`update users set roll_number = $1 where id = $2`, [roll, other.id])).rejects.toThrow(/unique/);
    });
  });

  describe('FR-AUTH-5 · ID card photo upload', () => {
    it('FR-AUTH-5 · uploading an ID card stores it privately and sets pending', async () => {
      const fresh = await makeUser('Chitra', { verified: false });
      const r = await api(fresh, 'POST', '/profile/id-card', undefined, { form: fileForm() });
      expect(r.status, msg(r)).toBe(201);
      expect(r.body.id_verified).toBe('pending');
      // Stored under the student's own folder in the private bucket, not as a public URL.
      expect(r.body.path).toMatch(new RegExp(`^${fresh.id}/\\d+\\.png$`));
      const [row] = await sql(`select id_card_image_url, id_verified from users where id = $1`, [fresh.id]);
      expect(row).toEqual({ id_card_image_url: r.body.path, id_verified: 'pending' });
    });

    it('FR-AUTH-5 · JPEG photos are accepted', async () => {
      const fresh = await makeUser('Dev', { verified: false });
      const r = await api(fresh, 'POST', '/profile/id-card', undefined, {
        form: fileForm({ bytes: JPEG, type: 'image/jpeg', name: 'card.jpg' }),
      });
      expect(r.status, msg(r)).toBe(201);
      expect(r.body.path).toMatch(/\.jpg$/);
    });

    it('FR-AUTH-5 · a file that is not a photo is refused', async () => {
      const r = await api(student, 'POST', '/profile/id-card', undefined, {
        form: fileForm({ bytes: Buffer.from('%PDF-1.7 not an image'), type: 'image/png', name: 'card.png' }),
      });
      expect(r.status).toBe(400);
    });

    it('FR-AUTH-5 · a photo over 8 MB is refused', async () => {
      const big = Buffer.concat([JPEG, Buffer.alloc(8 * 1024 * 1024)]);
      const r = await api(student, 'POST', '/profile/id-card', undefined, {
        form: fileForm({ bytes: big, type: 'image/jpeg', name: 'big.jpg' }),
      });
      expect(r.status).toBe(413);
    });

    it('FR-AUTH-5 · uploading needs a session', async () => {
      const r = await api(null, 'POST', '/profile/id-card', undefined, { form: fileForm() });
      expect(r.status).toBe(401);
    });
  });

  describe('FR-AUTH-6 · re-upload after a rejected ID card', () => {
    it('FR-AUTH-6 · a rejected student can upload a new photo and is pending again', async () => {
      const s = await makeUser('Esha', { verified: false });
      await ok(api(s, 'POST', '/profile/id-card', undefined, { form: fileForm() }));
      await ok(api(admin, 'POST', `/admin/id-verifications/${s.id}`, { decision: 'rejected' }));
      expect(await sqlValue(`select id_verified from users where id = $1`, [s.id])).toBe('rejected');

      const r = await api(s, 'POST', '/profile/id-card', undefined, { form: fileForm() });
      expect(r.status, msg(r)).toBe(201);
      expect(await sqlValue(`select id_verified from users where id = $1`, [s.id])).toBe('pending');
    });

    it('FR-AUTH-6 · while rejected, the student is told to re-upload when they try to act', async () => {
      const s = await makeUser('Farah', { verified: false });
      await sql(`update users set id_verified = 'rejected' where id = $1`, [s.id]);
      const r = await api(s, 'POST', '/listings', { type: 'sell', title: 'Blocked item', category: 'Books', price: 10 });
      expect(r.status).toBe(403);
      expect(msg(r)).toMatch(/rejected/i);
    });
  });

  describe('FR-AUTH-7 · profile screen data', () => {
    it('FR-AUTH-7 · /profile/me returns email, roll number, verification status and role', async () => {
      const me = await ok(api(student, 'GET', '/profile/me'));
      expect(me.email).toBe(student.email);
      expect(me.roll_number).toMatch(/^\d{9,10}$/);
      expect(me.id_verified).toBe('verified');
      expect(me.role).toBe('student');
    });

    it('FR-AUTH-7 · an admin sees role admin', async () => {
      expect((await ok(api(admin, 'GET', '/profile/me'))).role).toBe('admin');
    });

    it('FR-AUTH-7 · a student cannot promote themselves through PATCH /profile', async () => {
      await api(student, 'PATCH', '/profile', { role: 'admin', id_verified: 'verified', name: 'Asha' });
      expect(await sqlValue(`select role from users where id = $1`, [student.id])).toBe('student');
    });
  });
});
