import { Link } from 'react-router-dom';
import type { Card } from '../types';
import { motion } from 'framer-motion';
import {
  CreditCard,
  Lock,
  Unlock,
  ShieldAlert,
  ShieldCheck,
  CalendarDays,
  Ellipsis,
} from 'lucide-react';
import clsx from 'clsx';

type Props = {
  card: Card;
  onActivate: () => void;
  onBlock: () => void;
  onMarkExpired: () => void;
};

function maskCard(n: string) {
  const last4 = (n || '').slice(-4);
  return `•••• •••• •••• ${last4}`;
}

export default function FilaTarjeta({ card, onActivate, onBlock, onMarkExpired }: Props) {
  const estadoBadge =
    card.estado === 'activa' ? 'success' : card.estado === 'bloqueada' ? 'warning' : 'secondary';

  const pct = (() => {
    const a = Number(card.monto_autorizado || 0);
    const d = Number(card.monto_disponible || 0);
    return a > 0 ? Math.max(0, Math.min(100, (d / a) * 100)) : 0;
  })();

  return (
    <tr className="align-middle">
      {/* Tarjeta (mascarado) + barra de disponible */}
      <td style={{ minWidth: 220 }}>
        <div className="d-flex align-items-center gap-2">
          <div
            className="rounded-circle bg-primary bg-opacity-10 text-primary d-flex align-items-center justify-content-center"
            style={{ width: 34, height: 34 }}
          >
            <CreditCard size={16} />
          </div>
          <div className="lh-sm">
            <div className="fw-semibold">{maskCard(card.numero)}</div>
            <div className="text-muted small">PAN •••• {card.numero.slice(-4)}</div>
          </div>
        </div>
        <div
          className="progress mt-2"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
        >
          <div className="progress-bar bg-success" style={{ width: `${pct}%` }} />
        </div>
      </td>

      {/* Titular */}
      <td>
        <div className="fw-medium">{card.nombre_titular}</div>
      </td>

      {/* Vencimiento */}
      <td>
        <span className="d-inline-flex align-items-center text-muted">
          <CalendarDays size={16} className="me-1" /> {card.fecha_venc}
        </span>
      </td>

      {/* Estado con icono */}
      <td>
        <span className={clsx('badge text-uppercase', `text-bg-${estadoBadge}`)}>
          {card.estado === 'activa' && <ShieldCheck size={14} className="me-1" />}
          {card.estado === 'bloqueada' && <ShieldAlert size={14} className="me-1" />}
          {card.estado === 'vencida' && <ShieldAlert size={14} className="me-1" />}
          {card.estado}
        </span>
      </td>

      {/* Autorizado / Disponible */}
      <td>Q {Number(card.monto_autorizado).toFixed(2)}</td>
      <td className="fw-semibold">Q {Number(card.monto_disponible).toFixed(2)}</td>

      {/* Acciones */}
      <td className="text-nowrap">
        <div className="btn-group" role="group" aria-label="Acciones">
          <Link
            to={`/cards/${String(card.numero).replace(/\D+/g, '')}`}
            className="btn btn-outline-secondary btn-sm"
          >
            Ver
          </Link>

          {/* Botones contextuales (evitamos dropdown para no depender del JS de Bootstrap) */}
          {card.estado !== 'activa' && (
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.97 }}
              className="btn btn-success btn-sm"
              onClick={onActivate}
              title="Activar tarjeta"
            >
              <Unlock size={14} className="me-1" /> Activar
            </motion.button>
          )}
          {card.estado !== 'bloqueada' && (
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.97 }}
              className="btn btn-warning btn-sm"
              onClick={onBlock}
              title="Bloquear tarjeta"
            >
              <Lock size={14} className="me-1" /> Bloquear
            </motion.button>
          )}
          {card.estado !== 'vencida' && (
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.97 }}
              className="btn btn-outline-secondary btn-sm"
              onClick={onMarkExpired}
              title="Marcar como vencida"
            >
              <Ellipsis size={14} className="me-1" /> Vencida
            </motion.button>
          )}
        </div>
      </td>
    </tr>
  );
}
