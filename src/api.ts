import type { Chat, Credentials, Message } from './types';

export async function api<T>(credentials: Credentials, action: string, data: Record<string, unknown> = {}, signal?: AbortSignal): Promise<T> {
  const response = await fetch('/.netlify/functions/api', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...credentials, action, data }), signal,
  });
  const result = await response.json().catch(() => null);
  if (!response.ok) throw new Error(result?.error || 'Сервис недоступен. Повторите попытку.');
  return result as T;
}

export function normalizePhone(value: string): string {
  if (!/^[+\d\s().-]+$/.test(value.trim())) throw new Error('Введите номер РФ или РБ в международном формате.');
  let phone = value.replace(/\D/g, '');
  if (phone.length === 11 && phone.startsWith('8')) phone = '7' + phone.slice(1);
  if (!/^(7\d{10}|375\d{9})$/.test(phone)) throw new Error('Нужен номер РФ (+7) или РБ (+375).');
  return phone;
}

// Validate external data before reading it; unsupported notifications are intentionally ignored.
function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' ? value as Record<string, unknown> : {};
}
export function parseIncoming(value: unknown): { chatId: string; title: string; message: Message } | null {
  const body = record(value);
  if (body.typeWebhook !== 'incomingMessageReceived') return null;
  const sender = record(body.senderData), data = record(body.messageData);
  const text = data.typeMessage === 'textMessage' ? record(data.textMessageData).textMessage
    : data.typeMessage === 'extendedTextMessage' ? record(data.extendedTextMessageData).text : undefined;
  if (typeof sender.chatId !== 'string' || !sender.chatId || typeof body.idMessage !== 'string' || !body.idMessage ||
      typeof text !== 'string' || typeof body.timestamp !== 'number' || !Number.isFinite(body.timestamp)) return null;
  return {
    chatId: sender.chatId,
    title: typeof sender.chatName === 'string' && sender.chatName ? sender.chatName : sender.chatId,
    message: { id: body.idMessage, text, timestamp: body.timestamp * 1000, outgoing: false },
  };
}
export function addIncoming(chats: Chat[], incoming: NonNullable<ReturnType<typeof parseIncoming>>): Chat[] {
  const chat = chats.find(item => item.id === incoming.chatId);
  if (chat?.messages.some(message => message.id === incoming.message.id)) return chats;
  if (!chat) return [...chats, { id: incoming.chatId, title: incoming.title, messages: [incoming.message] }];
  return chats.map(item => item.id === chat.id ? { ...item, messages: [...item.messages, incoming.message] } : item);
}
