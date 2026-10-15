import { test } from 'node:test';
import assert from 'node:assert/strict';
import handler from '../netlify/functions/api';

const credentials = { idInstance: '3100000001', apiTokenInstance: 'test-token', apiUrl: 'https://3100.api.green-api.com' };
const request = (action: string, data = {}, overrides = {}) => new Request('https://client.example/.netlify/functions/api', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...credentials, action, data, ...overrides }) });

test('proxy allowlist rejects unknown endpoints, hosts, empty/oversized messages', async () => {
  assert.equal((await handler(request('logout'))).status, 400);
  assert.equal((await handler(request('getStateInstance', {}, { apiUrl: 'https://evil.example' }))).status, 400);
  assert.equal((await handler(request('getStateInstance', {}, { apiUrl: 'https://3100.api.green-api.com/evil' }))).status, 400);
  for (const message of ['', ' ', 'x'.repeat(4001)]) assert.equal((await handler(request('sendMessage', { chatId: '10000000', message }))).status, 400);
});

test('proxy uses documented methods and keeps upstream secrets out of errors', async () => {
  const original = globalThis.fetch;
  const calls: { url: string; init?: RequestInit }[] = [];
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return Response.json({ result: true });
  }) as typeof fetch;
  try {
    await handler(request('checkAccount', { phoneNumber: 79991234567 }));
    assert.equal(calls[0].init?.method, 'POST');
    assert.equal(calls[0].init?.body, '{"phoneNumber":79991234567}');
    await handler(request('receiveNotification'));
    assert.ok(calls[1].url.endsWith('/receiveNotification/test-token?receiveTimeout=5'));
    await handler(request('deleteNotification', { receiptId: 42 }));
    assert.equal(calls[2].init?.method, 'DELETE');
    assert.ok(calls[2].url.endsWith('/deleteNotification/test-token/42'));
    globalThis.fetch = (async () => new Response('https://secret/token', { status: 401 })) as typeof fetch;
    const error = await handler(request('getStateInstance'));
    assert.equal(error.status, 401);
    assert.ok(!(await error.text()).includes('secret'));
  } finally { globalThis.fetch = original; }
});
