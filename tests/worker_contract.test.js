import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import worker, { sendAdminContactEmail, sendReplyEmail } from '../cloudflare/src/index.js';

const origin = 'https://renaud-ist.github.io';
const source = readFileSync(new URL('../cloudflare/src/index.js', import.meta.url), 'utf8');

function fakeDatabase() {
  const batches = [];
  const statements = [];
  let notificationReadCount = 2;
  return {
    batches,
    statements,
    prepare(sql) {
      const statement = {
        sql,
        values: [],
        bind(...values) {
          statement.values = values;
          return statement;
        },
        async first() {
          if (sql.includes('COUNT(*) AS total') && sql.includes('read_at IS NULL')) {
            return { total: notificationReadCount };
          }
          if (sql.includes('FROM admin_tokens')) {
            return {
              token_id: 9,
              admin_user_id: 4,
              id: 4,
              email: 'admin@example.test',
              username: 'admin',
              role: 'admin',
              is_active: 1,
            };
          }
          if (sql.includes('FROM conversations')) {
            return { id: 12 };
          }
          return null;
        },
        async all() {
          return { results: [] };
        },
        async run() {
          statements.push(statement);
          if (sql.includes('UPDATE notifications') && sql.includes('read_at IS NULL')) {
            const changes = notificationReadCount;
            notificationReadCount = 0;
            return { success: true, meta: { changes } };
          }
          return { success: true, meta: { changes: 1 } };
        },
      };
      statements.push(statement);
      return statement;
    },
    async batch(statements) {
      batches.push(statements);
      return statements.map((statement, index) => ({
        success: true,
        meta: { changes: 1, ...(index === 3 ? { last_row_id: 21 } : {}) },
      }));
    },
  };
}

test('contact email helper sends a Brevo notification to the administrator', async () => {
  let request;
  const result = await sendAdminContactEmail({
    BREVO_API_KEY: 'test-only-key',
    REPLY_FROM_EMAIL: 'verified@example.test',
  }, {
    name: 'Visitor',
    email: 'visitor@example.test',
    subject: 'Project enquiry',
    message: 'Please contact me.',
  }, async (url, options) => {
    request = { url, options };
    return { ok: true, status: 201 };
  });

  assert.deepEqual(result, { enabled: true, sent: true, status: 'sent' });
  assert.equal(request.url, 'https://api.brevo.com/v3/smtp/email');
  assert.equal(request.options.headers['api-key'], 'test-only-key');
  const payload = JSON.parse(request.options.body);
  assert.deepEqual(payload.to, [{ email: 'yangdarenaud893@gmail.com' }]);
  assert.deepEqual(payload.replyTo, { email: 'visitor@example.test', name: 'Visitor' });
  assert.match(payload.textContent, /Please contact me\./);
});

test('contact submission persists D1 records, dispatches email, and reports all outcomes', async () => {
  const db = fakeDatabase();
  let sentPayload;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    sentPayload = { url, payload: JSON.parse(options.body) };
    return { ok: true, status: 201 };
  };
  let response;
  try {
    response = await worker.fetch(new Request('https://example.test/api/contact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: origin },
      body: JSON.stringify({
        name: 'Visitor',
        email: 'visitor@example.test',
        subject: 'Project enquiry',
        message: 'A test contact message',
      }),
    }), {
      DB: db,
      BREVO_API_KEY: 'test-only-key',
      REPLY_FROM_EMAIL: 'verified@example.test',
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(response.status, 201);
  assert.deepEqual(await response.json(), {
    ok: true,
    saved: true,
    notificationCreated: true,
    emailSent: true,
    message: 'Your message has been successfully sent.',
  });
  assert.equal(db.batches.length, 1);
  assert.match(db.batches[0][1].sql, /INSERT INTO conversations/);
  assert.match(db.batches[0][2].sql, /INSERT INTO conversation_messages/);
  assert.match(db.batches[0][3].sql, /INSERT INTO notifications/);
  assert.equal(sentPayload.url, 'https://api.brevo.com/v3/smtp/email');
  assert.deepEqual(sentPayload.payload.to, [{ email: 'yangdarenaud893@gmail.com' }]);
});

test('contact submission reports emailSent false when Brevo fails after D1 save', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: false, status: 503 });
  let response;
  try {
    response = await worker.fetch(new Request('https://example.test/api/contact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Visitor',
        email: 'visitor@example.test',
        subject: 'Project enquiry',
        message: 'A test contact message',
      }),
    }), {
      DB: fakeDatabase(),
      BREVO_API_KEY: 'test-only-key',
      REPLY_FROM_EMAIL: 'verified@example.test',
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(response.status, 201);
  const payload = await response.json();
  assert.equal(payload.saved, true);
  assert.equal(payload.notificationCreated, true);
  assert.equal(payload.emailSent, false);
});

test('notification read routes require authentication and persist D1 read state', async () => {
  const db = fakeDatabase();
  const unauthorized = await worker.fetch(new Request('https://example.test/api/notifications/read-all', {
    method: 'POST',
  }), { DB: db });
  assert.equal(unauthorized.status, 401);

  const one = await worker.fetch(new Request('https://example.test/api/notifications?id=8', {
    method: 'PATCH',
    headers: { Authorization: 'Bearer test-token' },
  }), { DB: db });
  assert.equal(one.status, 200);
  assert.deepEqual(await one.json(), { ok: true, data: { id: '8', is_read: true } });
  assert.match(db.statements.find((statement) => statement.sql.includes('UPDATE notifications') && statement.sql.includes('COALESCE')).sql, /read_at/);

  const all = await worker.fetch(new Request('https://example.test/api/notifications/read-all', {
    method: 'POST',
    headers: { Authorization: 'Bearer test-token' },
  }), { DB: db });
  assert.equal(all.status, 200);
  assert.deepEqual(await all.json(), { ok: true, data: { marked_read: 2 } });
  assert.ok(db.statements.some((statement) => statement.sql.includes('UPDATE notifications') && statement.sql.includes('read_at IS NULL')));

  const list = await worker.fetch(new Request('https://example.test/api/notifications', {
    headers: { Authorization: 'Bearer test-token' },
  }), { DB: db });
  assert.equal(list.status, 200);
  const listed = await list.json();
  assert.equal(listed.read_state_supported, true);
  assert.equal(listed.unread_count, 0);
  assert.ok(db.statements.some((statement) => statement.sql.includes('notifications.read_at')));
});

test('allowed DELETE preflight returns 204 with DELETE CORS permission', async () => {
  const response = await worker.fetch(new Request('https://example.test/api/conversation', {
    method: 'OPTIONS',
    headers: { Origin: origin },
  }), { DB: fakeDatabase() });

  assert.equal(response.status, 204);
  assert.equal(response.headers.get('access-control-allow-origin'), origin);
  assert.match(response.headers.get('access-control-allow-methods'), /DELETE/);
});

test('conversation DELETE requires authentication', async () => {
  const response = await worker.fetch(new Request('https://example.test/api/conversation?id=12', {
    method: 'DELETE',
  }), { DB: fakeDatabase() });

  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), {
    ok: false,
    error: 'Authentication required.',
  });
});

test('authenticated conversation DELETE is explicit and audited', async () => {
  const db = fakeDatabase();
  const response = await worker.fetch(new Request('https://example.test/api/conversation?id=12', {
    method: 'DELETE',
    headers: {
      Authorization: 'Bearer test-token',
      Origin: origin,
      'CF-Connecting-IP': '192.0.2.10',
      'User-Agent': 'worker-contract-test',
    },
  }), { DB: db });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    ok: true,
    data: { id: '12', deleted: true },
  });
  assert.equal(db.batches.length, 1);
  assert.equal(db.batches[0][0].values[1], 'conversation.delete');
  assert.match(db.batches[0][1].sql, /DELETE FROM conversations/);
});

test('email helper reports not configured without making a request', async () => {
  let called = false;
  const result = await sendReplyEmail({}, { contact_email: 'visitor@example.test' }, 'reply', async () => {
    called = true;
  });

  assert.deepEqual(result, { enabled: false, sent: false, status: 'not_configured' });
  assert.equal(called, false);
});

test('email helper sends only to the stored visitor address', async () => {
  let request;
  const result = await sendReplyEmail({
    BREVO_API_KEY: 'test-only-key',
    REPLY_FROM_EMAIL: 'verified@example.test',
    REPLY_FROM_NAME: 'Configured Sender',
  }, { contact_email: 'visitor@example.test', subject: 'Subject' }, 'Reply body', async (url, options) => {
    request = { url, options };
    return { ok: true, status: 201 };
  });

  assert.deepEqual(result, { enabled: true, sent: true, status: 'sent' });
  assert.equal(request.url, 'https://api.brevo.com/v3/smtp/email');
  assert.equal(request.options.method, 'POST');
  assert.equal(request.options.headers.accept, 'application/json');
  assert.equal(request.options.headers['api-key'], 'test-only-key');
  assert.equal(request.options.headers['content-type'], 'application/json');

  const payload = JSON.parse(request.options.body);
  assert.deepEqual(payload.sender, {
    email: 'verified@example.test',
    name: 'Configured Sender',
  });
  assert.deepEqual(payload.to, [{ email: 'visitor@example.test' }]);
  assert.equal(payload.subject, 'Subject');
  assert.equal(payload.textContent, 'Reply body');
});

test('email helper reports provider failures without exposing details', async () => {
  const result = await sendReplyEmail({
    BREVO_API_KEY: 'test-only-key',
    REPLY_FROM_EMAIL: 'verified@example.test',
  }, { contact_email: 'visitor@example.test' }, 'Reply body', async () => ({
    ok: false,
    status: 400,
  }));

  assert.deepEqual(result, { enabled: true, sent: false, status: 'provider_error' });
});

test('email helper reports network failures without exposing details', async () => {
  const result = await sendReplyEmail({
    BREVO_API_KEY: 'test-only-key',
    REPLY_FROM_EMAIL: 'verified@example.test',
  }, { contact_email: 'visitor@example.test' }, 'Reply body', async () => {
    throw new Error('synthetic provider failure');
  });

  assert.deepEqual(result, { enabled: true, sent: false, status: 'network_error' });
});

test('Worker source preserves reply notification and existing route contracts', () => {
  assert.match(source, /new_admin_reply/);
  assert.match(source, /INSERT INTO conversation_messages/);
  assert.match(source, /read_at = CURRENT_TIMESTAMP/);
  assert.match(source, /archived_at = CURRENT_TIMESTAMP/);
  assert.match(source, /SET updated_at = CURRENT_TIMESTAMP/);
  assert.match(source, /url\.pathname === '\/api\/contact'/);
  assert.match(source, /url\.pathname === '\/api\/auth\/login'/);
  assert.match(source, /url\.pathname === '\/api\/auth\/logout'/);
  assert.match(source, /url\.pathname === '\/api\/auth\/me'/);
  assert.match(source, /url\.pathname === '\/api\/conversations'/);
  assert.match(source, /url\.pathname === '\/api\/conversation'/);
});
