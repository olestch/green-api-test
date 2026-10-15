import { useEffect, useRef, useState, type FormEvent } from 'react';
import { addIncoming, api, normalizePhone, parseIncoming } from './api';
import type { Chat, Credentials, Notification } from './types';
import './App.scss';

const errorText = (error: unknown) => error instanceof Error ? error.message : 'Ошибка сети. Повторите попытку.';
const time = (timestamp: number) => new Date(timestamp).toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' });

function Connection({ onConnect }: { onConnect: (value: Credentials) => void }) {
  const [credentials, setCredentials] = useState<Credentials>({ idInstance: '', apiTokenInstance: '', apiUrl: '' });
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  async function connect(event: FormEvent) {
    event.preventDefault();
    const value = Object.fromEntries(Object.entries(credentials).map(([key, item]) => [key, item.trim()])) as Credentials;
    if (!value.idInstance || !value.apiTokenInstance || !value.apiUrl) { setError('Заполните все поля.'); return; }
    setBusy(true); setError('');
    try {
      const result = await api<{ stateInstance: string }>(value, 'getStateInstance');
      const states: Record<string, string> = {
        notAuthorized: 'Авторизуйте MAX в кабинете GREEN-API.', starting: 'Инстанс запускается. Повторите через несколько минут.',
        blocked: 'Аккаунт MAX заблокирован.', suspended: 'Аккаунт MAX временно ограничен.', pendingPassword: 'Завершите двухфакторную авторизацию в GREEN-API.',
      };
      if (result.stateInstance !== 'authorized') throw new Error(states[result.stateInstance] || 'Инстанс не готов к работе.');
      onConnect(value);
    } catch (err) { setError(errorText(err)); } finally { setBusy(false); }
  }
  return <main className="connection">
    <div className="connection__intro"><span className="brand">м<span>а</span>кс</span><span className="connection__tag">GREEN-API CLIENT</span>
      <h1>Ближе.<br/>Одно сообщение<br/>за раз.</h1><p>Простой способ оставаться на связи<br/>через ваш инстанс GREEN-API.</p>
      <div className="connection__decoration" aria-hidden="true"><span>Привет!</span><span>Рад тебя слышать ♡</span></div>
    </div>
    <form className="connection__form" onSubmit={connect}>
      <span className="eyebrow">НАЧНЁМ ОБЩЕНИЕ</span><h2>Подключение к MAX</h2><p>Введите данные вашего инстанса из личного кабинета GREEN-API.</p>
      <label className="field">idInstance<input required autoComplete="off" inputMode="numeric" value={credentials.idInstance} onChange={e => setCredentials({ ...credentials, idInstance: e.target.value })} placeholder="Идентификатор инстанса" disabled={busy}/></label>
      <label className="field">apiTokenInstance<input required type="password" autoComplete="off" value={credentials.apiTokenInstance} onChange={e => setCredentials({ ...credentials, apiTokenInstance: e.target.value })} placeholder="Токен доступа" disabled={busy}/></label>
      <label className="field">apiUrl<input required type="url" value={credentials.apiUrl} onChange={e => setCredentials({ ...credentials, apiUrl: e.target.value })} placeholder="https://3100.api.green-api.com" disabled={busy}/></label>
      {error && <p className="error" role="alert">{error}</p>}
      <button className="button" disabled={busy}>{busy ? 'Подключаемся…' : 'Подключиться →'}</button>
      <p className="connection__note">Данные хранятся только в памяти этой вкладки.<br/>Включите входящие уведомления и очистите webhookUrl в кабинете.</p>
      <a href="https://console.green-api.com/" target="_blank" rel="noreferrer">Открыть кабинет GREEN-API ↗</a>
    </form>
  </main>;
}

function Messenger({ credentials, onDisconnect }: { credentials: Credentials; onDisconnect: () => void }) {
  const [chats, setChats] = useState<Chat[]>([]), [activeId, setActiveId] = useState<string | null>(null);
  const [search, setSearch] = useState(''), [creating, setCreating] = useState(false), [phone, setPhone] = useState('');
  const [createBusy, setCreateBusy] = useState(false), [createError, setCreateError] = useState('');
  const [drafts, setDrafts] = useState<Record<string, string>>({}), [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState(''), [receiveError, setReceiveError] = useState('');
  const bottom = useRef<HTMLDivElement>(null), sendLock = useRef(false);
  const lifecycle = useRef(new AbortController());
  const active = chats.find(chat => chat.id === activeId);
  const draft = activeId ? drafts[activeId] || '' : '';

  useEffect(() => {
    const controller = lifecycle.current;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      let delay = 700;
      try {
        const notification = await api<Notification | null>(credentials, 'receiveNotification', {}, controller.signal);
        if (controller.signal.aborted) return;
        if (notification) {
          if (!Number.isSafeInteger(notification.receiptId)) throw new Error('Некорректное уведомление GREEN-API.');
          const incoming = parseIncoming(notification.body);
          if (incoming) setChats(previous => addIncoming(previous, incoming));
          // Unsupported events are deliberately discarded so they cannot block the queue.
          const ack = await api<{ result: boolean }>(credentials, 'deleteNotification', { receiptId: notification.receiptId }, controller.signal);
          if (!ack.result) throw new Error('Не удалось подтвердить уведомление. Повторяем получение.');
        }
        setReceiveError('');
      } catch (error) {
        if (!controller.signal.aborted) setReceiveError('Получение: ' + errorText(error));
        delay = 5000;
      } finally {
        if (!controller.signal.aborted) timer = setTimeout(poll, delay);
      }
    }
    void poll();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [credentials]);

  useEffect(() => { bottom.current?.scrollIntoView({ behavior: 'smooth' }); }, [activeId, active?.messages.length]);

  async function createChat(event: FormEvent) {
    event.preventDefault(); setCreateError('');
    try {
      const normalized = normalizePhone(phone); setCreateBusy(true);
      const result = await api<{ exist: boolean; chatId: string }>(credentials, 'checkAccount', { phoneNumber: Number(normalized) }, lifecycle.current.signal);
      if (!result.exist || typeof result.chatId !== 'string' || !/^\d+$/.test(result.chatId)) throw new Error('Получатель не найден или недоступен для поиска по телефону.');
      setChats(previous => previous.some(chat => chat.id === result.chatId) ? previous : [...previous, { id: result.chatId, title: '+' + normalized, phone: normalized, messages: [] }]);
      setActiveId(result.chatId); setCreating(false); setPhone(''); setSendError('');
    } catch (error) { if (!lifecycle.current.signal.aborted) setCreateError(errorText(error)); }
    finally { setCreateBusy(false); }
  }

  async function send(event?: FormEvent) {
    event?.preventDefault();
    if (!activeId || !draft.trim() || draft.length > 4000 || sendLock.current) return;
    const chatId = activeId, text = draft, id = crypto.randomUUID();
    sendLock.current = true; setSending(true); setSendError('');
    setDrafts(previous => ({ ...previous, [chatId]: '' }));
    setChats(previous => previous.map(chat => chat.id === chatId ? { ...chat, messages: [...chat.messages, { id, text, outgoing: true, timestamp: Date.now(), status: 'pending' }] } : chat));
    try {
      const result = await api<{ idMessage: string }>(credentials, 'sendMessage', { chatId, message: text }, lifecycle.current.signal);
      if (!result.idMessage) throw new Error('Нет подтверждения от API. Проверьте MAX перед повторной отправкой.');
      setChats(previous => previous.map(chat => chat.id === chatId ? { ...chat, messages: chat.messages.map(message => message.id === id ? { ...message, id: result.idMessage, status: 'queued' } : message) } : chat));
    } catch (error) {
      if (!lifecycle.current.signal.aborted) {
        setSendError(errorText(error) + ' Доставка не подтверждена; проверьте MAX перед повтором.');
        setChats(previous => previous.map(chat => chat.id === chatId ? { ...chat, messages: chat.messages.map(message => message.id === id ? { ...message, status: 'failed' } : message) } : chat));
      }
    } finally { sendLock.current = false; setSending(false); }
  }

  return <main className={`messenger${active ? ' messenger--selected' : ''}`}>
    <aside className="sidebar">
      <div className="sidebar__brand"><span className="brand brand--small">макс</span><span className="sidebar__service">через GREEN-API</span></div>
      <header className="sidebar__header"><h1>Чаты</h1><button className="icon-button" aria-label="Создать чат" onClick={() => { setCreating(true); setCreateError(''); }}>＋</button></header>
      <div className="sidebar__search"><span aria-hidden="true">⌕</span><input aria-label="Поиск чатов" placeholder="Поиск" value={search} onChange={e => setSearch(e.target.value)}/></div>
      <div className="sidebar__list">
        {chats.filter(chat => `${chat.title} ${chat.phone || ''} ${chat.id}`.toLowerCase().includes(search.toLowerCase())).map(chat => <button key={chat.id} className={`chat-item${chat.id === activeId ? ' chat-item--active' : ''}`} onClick={() => { setActiveId(chat.id); setSendError(''); }}>
          <span className="avatar">{chat.title.startsWith('+') ? chat.title.slice(-2) : chat.title.slice(0, 2)}</span>
          <span className="chat-item__content"><span className="chat-item__top"><strong>{chat.title}</strong><time>{chat.messages.length ? time(chat.messages.at(-1)!.timestamp) : ''}</time></span><span className="chat-item__preview">{chat.messages.at(-1)?.text || 'Начните общение'}</span></span>
        </button>)}
        {!chats.length && <div className="sidebar__empty"><span>Ваши разговоры — здесь</span><p>Нажмите +, чтобы написать<br/>первое сообщение.</p></div>}
        {!!chats.length && !chats.some(chat => `${chat.title} ${chat.phone || ''} ${chat.id}`.toLowerCase().includes(search.toLowerCase())) && <p className="sidebar__empty">Чаты не найдены</p>}
      </div>
      <footer className="sidebar__footer"><span><i/> Подключено к MAX</span><button onClick={onDisconnect}>Сменить данные</button></footer>
    </aside>
    <section className="conversation" aria-label="Переписка">
      {receiveError && <div className="conversation__error error" role="alert">{receiveError}</div>}
      {active ? <>
        <header className="conversation__header"><button className="icon-button conversation__back" aria-label="Назад к чатам" onClick={() => setActiveId(null)}>←</button><span className="avatar">{active.title.slice(-2)}</span><div><h2>{active.title}</h2><p>MAX · Текстовые сообщения</p></div></header>
        <div className="conversation__messages" role="log" aria-label="Сообщения">
          <span className="conversation__hint">Начало вашей переписки</span>
          {active.messages.map(message => <article key={message.id} className={`message message--${message.outgoing ? 'outgoing' : 'incoming'}`}><p>{message.text}</p><footer><time dateTime={new Date(message.timestamp).toISOString()}>{time(message.timestamp)}</time>{message.status && <span>{({ pending: 'Отправка…', queued: 'В очереди API', failed: 'Не подтверждено' })[message.status]}</span>}</footer></article>)}
          <div ref={bottom}/>
        </div>
        <form className="composer" onSubmit={send}>
          {sendError && <p className="error" role="alert">{sendError}</p>}
          <div className="composer__row"><textarea aria-label="Сообщение" placeholder="Написать сообщение…" rows={2} maxLength={4000} value={draft} onChange={e => setDrafts(previous => ({ ...previous, [active.id]: e.target.value }))} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void send(); } }}/><button className="composer__send" disabled={sending || !draft.trim() || draft.length > 4000} aria-label="Отправить сообщение">{sending ? '…' : '↑'}</button></div>
          <div className="composer__hint"><span>Enter — отправить · Shift+Enter — новая строка</span><span>{draft.length} / 4000</span></div>
        </form>
      </> : <div className="conversation__empty"><div className="conversation__symbol" aria-hidden="true">↗</div><span className="eyebrow">ОБЩЕНИЕ НАЧИНАЕТСЯ С ПРИВЕТА</span><h2>Выберите, кому написать</h2><p>Откройте чат или начните новый разговор<br/>по номеру телефона.</p><button className="button" onClick={() => setCreating(true)}>＋ Новый чат</button></div>}
    </section>
    {creating && <div className="modal" onClick={e => { if (e.target === e.currentTarget && !createBusy) setCreating(false); }}><form className="modal__panel" role="dialog" aria-modal="true" aria-labelledby="new-chat-title" onSubmit={createChat} onKeyDown={e => { if (e.key === 'Escape' && !createBusy) setCreating(false); }}><button type="button" className="icon-button modal__close" aria-label="Закрыть" disabled={createBusy} onClick={() => setCreating(false)}>×</button><span className="eyebrow">НОВЫЙ РАЗГОВОР</span><h2 id="new-chat-title">Кому напишем?</h2><p>Введите номер телефона получателя в MAX.</p><label className="field">Номер телефона<input autoFocus required type="tel" placeholder="+7 999 123-45-67" value={phone} onChange={e => setPhone(e.target.value)} disabled={createBusy}/></label><p className="modal__note">Доступны номера России и Беларуси.</p>{createError && <p className="error" role="alert">{createError}</p>}<button className="button" disabled={createBusy}>{createBusy ? 'Ищем получателя…' : 'Начать общение →'}</button></form></div>}
  </main>;
}

export default function App() {
  const [credentials, setCredentials] = useState<Credentials | null>(null);
  return credentials ? <Messenger credentials={credentials} onDisconnect={() => setCredentials(null)}/> : <Connection onConnect={setCredentials}/>;
}
