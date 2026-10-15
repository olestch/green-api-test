import { test } from 'node:test';
import assert from 'node:assert/strict';
import { api } from '../src/api';

const credentials = { idInstance: '3100000001', apiTokenInstance: 'test-token', apiUrl: 'https://3100.api.green-api.com' };

test('rejects invalid credentials, hosts, actions and payloads without making requests', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = (async () => { assert.fail('Invalid requests must not reach fetch'); }) as typeof fetch;
  try {
    await assert.rejects(api(credentials, 'logout'));
    await assert.rejects(api({ ...credentials, apiUrl: 'https://evil.example' }, 'getStateInstance'));
    await assert.rejects(api({ ...credentials, apiUrl: credentials.apiUrl + '/evil' }, 'getStateInstance'));
    await assert.rejects(api({ ...credentials, apiTokenInstance: '' }, 'getStateInstance'));
    for (const message of ['', ' ', 'x'.repeat(4001)]) await assert.rejects(api(credentials, 'sendMessage', { chatId: '10000000', message }));
    await assert.rejects(api(credentials, 'checkAccount', { phoneNumber: 'bad' }));
    await assert.rejects(api(credentials, 'deleteNotification', { receiptId: -1 }));
  } finally { globalThis.fetch = original; }
});

test('calls all five documented endpoints directly with the correct HTTP contracts', async () => {
  const original = globalThis.fetch;
  const calls: { url: string; init?: RequestInit }[] = [];
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return Response.json({ result: true });
  }) as typeof fetch;
  try {
    await api(credentials, 'getStateInstance');
    await api(credentials, 'checkAccount', { phoneNumber: '8 (999) 123-45-67' });
    await api(credentials, 'sendMessage', { chatId: '10000000', message: 'Привет' });
    await api(credentials, 'receiveNotification');
    await api(credentials, 'deleteNotification', { receiptId: 42 });
    assert.deepEqual(calls.map(call => [call.url, call.init?.method, call.init?.body]), [
      [credentials.apiUrl + '/waInstance3100000001/getStateInstance/test-token', 'GET', undefined],
      [credentials.apiUrl + '/waInstance3100000001/checkAccount/test-token', 'POST', '{"phoneNumber":79991234567}'],
      [credentials.apiUrl + '/waInstance3100000001/sendMessage/test-token', 'POST', '{"chatId":"10000000","message":"Привет"}'],
      [credentials.apiUrl + '/waInstance3100000001/receiveNotification/test-token?receiveTimeout=5', 'GET', undefined],
      [credentials.apiUrl + '/waInstance3100000001/deleteNotification/test-token/42', 'DELETE', undefined],
    ]);
    for (const call of calls) {
      assert.equal(call.init?.credentials, 'omit');
      assert.equal(call.init?.mode, 'cors');
      assert.equal(call.init?.referrerPolicy, 'no-referrer');
      assert.equal(call.init?.cache, 'no-store');
    }
  } finally { globalThis.fetch = original; }
});

test('sanitizes HTTP/network/JSON errors and forwards caller cancellation', async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = (async () => new Response('secret URL test-token', { status: 401 })) as typeof fetch;
    await assert.rejects(api(credentials, 'getStateInstance'), { message: 'Неверные учётные данные GREEN-API.' });
    globalThis.fetch = (async () => { throw new Error('fetch failed: secret URL test-token'); }) as typeof fetch;
    await assert.rejects(api(credentials, 'getStateInstance'), error => error instanceof Error && !error.message.includes('test-token'));
    globalThis.fetch = (async () => new Response('not JSON')) as typeof fetch;
    await assert.rejects(api(credentials, 'getStateInstance'), { message: 'Некорректный ответ GREEN-API. Повторите попытку.' });
    const controller = new AbortController();
    globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
      controller.abort();
      assert.equal(init?.signal?.aborted, true);
      throw new DOMException('secret URL', 'AbortError');
    }) as typeof fetch;
    await assert.rejects(api(credentials, 'receiveNotification', {}, controller.signal), { name: 'AbortError' });
  } finally { globalThis.fetch = original; }
});
