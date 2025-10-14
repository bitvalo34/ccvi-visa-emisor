// web/src/lib/api.ts
import { http } from './axios';
import type { Card, Tx } from '../types'; // <-- importa los tipos

export const api = {
  // tarjetas
  listCards: () => http.get<Card[]>('/api/v1/cards').then((r) => r.data),

  getCard: (n: string) => http.get<Card>(`/api/v1/cards/${n}`).then((r) => r.data),

  createCard: (body: Partial<Card> & { cvv?: string }) =>
    http.post<Card>('/api/v1/cards', body).then((r) => r.data),

  updateCard: (n: string, body: Partial<Card>) =>
    http.patch<Card>(`/api/v1/cards/${n}`, body).then((r) => r.data),

  // pagos (aumenta disponible) — usa Idempotency-Key automático desde el interceptor
  registerPayment: (n: string, monto: number) =>
    http
      .post<Tx>(
        `/api/v1/cards/${n}/payments`,
        { monto },
        { headers: { 'Idempotency-Key': 'auto' } },
      )
      .then((r) => r.data),

  // transacciones
  listTx: (n: string) => http.get<Tx[]>(`/api/v1/cards/${n}/transactions`).then((r) => r.data),

  // observabilidad
  metadata: () => http.get('/metadata').then((r) => r.data),
  healthz: () => http.get('/healthz').then((r) => r.data),
  readyz: () => http.get('/readyz').then((r) => r.data),
};
