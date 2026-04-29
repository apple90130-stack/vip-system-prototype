const test = require('node:test');
const assert = require('node:assert/strict');
const handler = require('../api/index');

function call(method, url, body = {}) {
  return new Promise((resolve) => {
    const req = { method, url, body, query: Object.fromEntries(new URL(`http://test.local${url}`).searchParams.entries()) };
    const res = {
      statusCode: 200,
      status(code) { this.statusCode = code; return this; },
      json(payload) { resolve({ status: this.statusCode, body: payload }); }
    };
    handler(req, res);
  });
}

test('member can login and load dashboard', async () => {
  const login = await call('POST', '/api/member/login', { name: '林芯妤', phone: '0912345678' });
  assert.equal(login.status, 200);
  const dashboard = await call('GET', '/api/member/dashboard?memberId=1');
  assert.equal(dashboard.status, 200);
  assert.ok(Array.isArray(dashboard.body.activities));
});

test('admin login rejects wrong password', async () => {
  const fail = await call('POST', '/api/admin/login', { account: 'admin', password: 'wrong' });
  assert.equal(fail.status, 401);
  const ok = await call('POST', '/api/admin/login', { account: 'admin', password: 'vip2026' });
  assert.equal(ok.status, 200);
});

test('task submission validates image url', async () => {
  const bad = await call('POST', '/api/member/tasks', { memberId: 1, title: '曬單', url: 'not-a-url' });
  assert.equal(bad.status, 422);
});
