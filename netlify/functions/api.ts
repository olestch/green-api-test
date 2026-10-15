import { normalizePhone } from '../../src/api';

const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), {
  status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') return json({ error: 'Используйте POST.' }, 405);
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) return json({ error: 'Недопустимый источник.' }, 403);
  if (!request.headers.get('content-type')?.startsWith('application/json')) return json({ error: 'Нужен JSON.' }, 415);
  let input;
  try { input = await request.json(); } catch { return json({ error: 'Некорректный JSON.' }, 400); }
  if (!input || typeof input !== 'object') return json({ error: 'Некорректный запрос.' }, 400);
  const { idInstance, apiTokenInstance, apiUrl, action } = input;
  const data = input.data && typeof input.data === 'object' ? input.data : {};
  if (typeof idInstance !== 'string' || !/^\d{1,20}$/.test(idInstance) ||
      typeof apiTokenInstance !== 'string' || !/^[a-zA-Z0-9_-]{1,256}$/.test(apiTokenInstance)) {
    return json({ error: 'Проверьте idInstance и apiTokenInstance.' }, 400);
  }
  // Only GREEN-API HTTPS hosts; never accept arbitrary proxy destinations or paths.
  if (typeof apiUrl !== 'string' || !/^https:\/\/(?:\d+\.api|api)\.green-api\.com\/?$/.test(apiUrl)) {
    return json({ error: 'Скопируйте apiUrl из кабинета GREEN-API (https://…api.green-api.com).' }, 400);
  }
  let method = 'GET', suffix = '', payload: object | undefined;
  switch (action) {
    case 'getStateInstance': break;
    case 'checkAccount':
      try { payload = { phoneNumber: Number(normalizePhone(String(data.phoneNumber))) }; }
      catch { return json({ error: 'Неверный номер телефона.' }, 400); }
      method = 'POST'; break;
    case 'sendMessage':
      if (typeof data.chatId !== 'string' || !/^-?\d+$/.test(data.chatId) || typeof data.message !== 'string' ||
          !data.message.trim() || data.message.length > 4000) return json({ error: 'Проверьте чат и текст (1–4000 символов).' }, 400);
      method = 'POST'; payload = { chatId: data.chatId, message: data.message }; break;
    case 'receiveNotification': suffix = '?receiveTimeout=5'; break;
    case 'deleteNotification':
      if (!Number.isSafeInteger(data.receiptId) || data.receiptId < 0) return json({ error: 'Неверный receiptId.' }, 400);
      method = 'DELETE'; suffix = '/' + data.receiptId; break;
    default: return json({ error: 'Неизвестный метод.' }, 400);
  }
  try {
    // GREEN-API requires the token in its upstream path. It never appears in browser URLs or logs.
    const upstream = await fetch(`${apiUrl.replace(/\/$/, '')}/waInstance${idInstance}/${action}/${apiTokenInstance}${suffix}`, {
      method, headers: { 'Content-Type': 'application/json' },
      body: payload ? JSON.stringify(payload) : undefined,
      signal: AbortSignal.timeout(15_000), redirect: 'error',
    });
    if (!upstream.ok) {
      // Never forward upstream bodies: these can contain request URLs/credentials.
      const errors: Record<number, string> = {
        400: 'GREEN-API отклонил запрос. Проверьте данные и очистите webhookUrl в кабинете.',
        401: 'Неверные учётные данные GREEN-API.', 403: 'Доступ запрещён. Проверьте токен, тариф и ограничения аккаунта.',
        429: 'Слишком много запросов. Подождите немного.', 469: 'Лимит поиска получателей MAX. Повторите позже.',
      };
      return json({ error: errors[upstream.status] || 'Ошибка GREEN-API. Попробуйте позже.' }, upstream.status >= 500 ? 502 : upstream.status);
    }
    return json(await upstream.json());
  } catch { return json({ error: 'Не удалось связаться с GREEN-API. Проверьте apiUrl и соединение.' }, 502); }
}
