export type Credentials = { idInstance: string; apiTokenInstance: string; apiUrl: string };
export type Message = { id: string; text: string; timestamp: number; outgoing: boolean; status?: 'pending' | 'queued' | 'failed' };
export type Chat = { id: string; title: string; phone?: string; messages: Message[] };
export type Notification = { receiptId: number; body: unknown };
