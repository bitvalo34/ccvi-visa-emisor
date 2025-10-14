export type CardEstado = 'activa' | 'bloqueada' | 'vencida';

export interface Card {
  numero: string;
  nombre_titular: string;
  nombre_titular_normalizado?: string;
  fecha_venc: string; // yyyymm
  monto_autorizado: number;
  monto_disponible: number;
  estado: CardEstado;
  creada_en?: string;
  actualizada_en?: string;
}

export type TxTipo = 'consumo' | 'pago';
export type TxStatus = 'APROBADO' | 'DENEGADO';

export interface Tx {
  id: string;
  tarjeta_numero: string;
  tipo: TxTipo;
  monto: number;
  comercio: string;
  idempotency_key?: string;
  autorizacion_numero?: string;
  status: TxStatus;
  detalle_denegacion?: string;
  creada_en: string;
}
