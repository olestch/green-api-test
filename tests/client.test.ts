import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizePhone, parseIncoming, addIncoming } from '../src/api';

test('normalizes supported MAX phone numbers, rejects invalid input', () => {
  assert.equal(normalizePhone('+7 (999) 123-45-67'), '79991234567');
  assert.equal(normalizePhone('8 999 123 45 67'), '79991234567');
  assert.equal(normalizePhone('+375 (29) 123-45-67'), '375291234567');
  for (const value of ['', '123', '+1 202 555 0123', '7abc9991234567', '+37529123456']) assert.throws(() => normalizePhone(value));
});

const body = {
  typeWebhook: 'incomingMessageReceived', idMessage: 'msg-1', timestamp: 1763115112,
  senderData: { chatId: '10000000', chatName: 'Получатель' },
  messageData: { typeMessage: 'textMessage', textMessageData: { textMessage: 'Привет' } },
};
test('parses MAX text and extended text, ignores unsupported/malformed events', () => {
  assert.equal(parseIncoming(body)?.message.text, 'Привет');
  assert.equal(parseIncoming(body)?.message.timestamp, 1763115112000);
  assert.equal(parseIncoming({ ...body, messageData: { typeMessage: 'extendedTextMessage', extendedTextMessageData: { text: 'https://example.com' } } })?.message.text, 'https://example.com');
  for (const value of [null, {}, { ...body, senderData: {} }, { ...body, timestamp: 'bad' }, { ...body, typeWebhook: 'outgoingAPIMessageReceived' }, { ...body, messageData: { typeMessage: 'imageMessage' } }]) assert.equal(parseIncoming(value), null);
});
test('deduplicates redeliveries and isolates message IDs per chat', () => {
  const incoming = parseIncoming(body)!;
  const once = addIncoming([], incoming);
  assert.equal(addIncoming(once, incoming), once);
  const twice = addIncoming(once, { ...incoming, chatId: '20000000' });
  assert.equal(twice.length, 2);
  assert.equal(twice[0].messages.length, 1);
  assert.equal(twice[1].messages.length, 1);
});
