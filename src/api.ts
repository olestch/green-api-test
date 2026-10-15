import type { Chat, Credentials, Message } from './types';

export async function api<T>(credentials: Credentials, action: string, data: Record<string, unknown> = {}, signal?: AbortSignal): Promise<T> {
  const { idInstance, apiTokenInstance, apiUrl } = credentials;
  if (!/^\d{1,20}$/.test(idInstance) || !/^[a-zA-Z0-9_-]{1,256}$/.test(apiTokenInstance)) {
    throw new Error('Проверьте idInstance и apiTokenInstance.');
  }
  if (!/^https:\/\/(?:\d+\.api|api)\.green-api\.com\/?$/.test(apiUrl)) {
    throw new Error('Скопируйте apiUrl из кабинета GREEN-API (https://…api.green-api.com).');
  }
  let method = 'GET', suffix = '', payload: object | undefined;
  switch (action) {
    case 'getStateInstance': break;
    case 'checkAccount':
      payload = { phoneNumber: Number(normalizePhone(String(data.phoneNumber))) };
      method = 'POST'; break;
    case 'sendMessage':
      if (typeof data.chatId !== 'string' || !/^-?\d+$/.test(data.chatId) || typeof data.message !== 'string' ||
          !data.message.trim() || data.message.length > 4000) throw new Error('Проверьте чат и текст (1–4000 символов).');
      method = 'POST'; payload = { chatId: data.chatId, message: data.message }; break;
    case 'receiveNotification': suffix = '?receiveTimeout=5'; break;
    case 'deleteNotification':
      if (!Number.isSafeInteger(data.receiptId) || Number(data.receiptId) < 0) throw new Error('Неверный receiptId.');
      method = 'DELETE'; suffix = '/' + data.receiptId; break;
    default: throw new Error('Неизвестный метод.');
  }
  let response: Response;
  try {
    // GREEN-API requires the token in its URL path. Never log this URL or raw fetch errors.
    response = await fetch(`${apiUrl.replace(/\/$/, '')}/waInstance${idInstance}/${action}/${apiTokenInstance}${suffix}`, {
      method, headers: { 'Content-Type': 'application/json' },
      body: payload ? JSON.stringify(payload) : undefined,
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(15_000)]) : AbortSignal.timeout(15_000),
      mode: 'cors', credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-store', redirect: 'error',
    });
  } catch {
    if (signal?.aborted) throw new DOMException('Запрос отменён.', 'AbortError');
    throw new Error('Не удалось связаться с GREEN-API. Проверьте apiUrl, соединение и доступность CORS.');
  }
  if (!response.ok) {
    // Upstream bodies may contain credentials, so use only the HTTP status.
    const errors: Record<number, string> = {
      400: 'GREEN-API отклонил запрос. Проверьте данные и очистите webhookUrl в кабинете.',
      401: 'Неверные учётные данные GREEN-API.', 403: 'Доступ запрещён. Проверьте токен, тариф и ограничения аккаунта.',
      404: 'Инстанс не найден. Проверьте apiUrl и учётные данные.',
      429: 'Слишком много запросов. Подождите немного.', 469: 'Лимит поиска получателей MAX. Повторите позже.',
    };
    throw new Error(errors[response.status] || 'Ошибка GREEN-API. Попробуйте позже.');
  }
  try { return await response.json() as T; }
  catch { throw new Error('Некорректный ответ GREEN-API. Повторите попытку.'); }
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
