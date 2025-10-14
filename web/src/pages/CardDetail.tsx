import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { Card, Tx } from '../types';
import { motion } from 'framer-motion';
import {
  CreditCard,
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  CalendarDays,
  DollarSign,
  User,
  RefreshCcw,
  CheckCircle2,
  Lock,
  Unlock,
  Landmark,
} from 'lucide-react';
import clsx from 'clsx';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';

/* ---------- helpers visuales ---------- */
const maskCard = (n: string) => (n ? `•••• •••• •••• ${n.slice(-4)}` : '');
const qt = (n: number) => `Q ${Number(n || 0).toFixed(2)}`;
const estadoBadge = (s: Card['estado']) =>
  s === 'activa' ? 'success' : s === 'bloqueada' ? 'warning' : 'secondary';

/* ---------- conversión fecha ---------- */
// <input type="month"> devuelve YYYY-MM (MDN). Lo convertimos a yyyymm. :contentReference[oaicite:1]{index=1}
const toYYYYMM = (yyyyDashMM: string) =>
  /^\d{4}-\d{2}$/.test(yyyyDashMM) ? yyyyDashMM.replace('-', '') : '';
const yyyymmToMonthInput = (yyyymm: string) =>
  /^\d{6}$/.test(yyyymm) ? `${yyyymm.slice(0, 4)}-${yyyymm.slice(4, 6)}` : '';

const isFutureOrCurrentYYYYMM = (yyyymm: string) => {
  const now = new Date();
  const cur = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
  return yyyymm >= cur;
};

/* ---------- schema de edición (RHF + Zod) ---------- */
// Patrón oficial: resolver con Zod + useForm. :contentReference[oaicite:2]{index=2}
const editSchema = z.object({
  nombre_titular: z
    .string()
    .min(3, 'Ingrese el nombre del titular')
    .transform((v) => v.trim().toUpperCase()),
  fecha_venc_input: z
    .string()
    .regex(/^\d{4}-\d{2}$/, 'Seleccione mes/año')
    .refine((v) => isFutureOrCurrentYYYYMM(toYYYYMM(v)), 'La fecha no puede ser pasada'),
});
type EditForm = z.infer<typeof editSchema>;

export default function CardDetail() {
  const { numero = '' } = useParams();
  const qc = useQueryClient();

  /* ---------- queries ---------- */
  const card = useQuery<Card>({ queryKey: ['card', numero], queryFn: () => api.getCard(numero) });
  const txs = useQuery<Tx[]>({ queryKey: ['tx', numero], queryFn: () => api.listTx(numero) });

  /* ---------- KPI y progreso ---------- */
  const kpi = useMemo(() => {
    const c = card.data;
    if (!c) return { pct: 0 };
    const a = Number(c.monto_autorizado || 0);
    const d = Number(c.monto_disponible || 0);
    return { pct: a > 0 ? Math.max(0, Math.min(100, (d / a) * 100)) : 0 };
  }, [card.data]);

  /* ---------- mutaciones: estado y pagos ---------- */
  const mutEstado = useMutation({
    mutationFn: (estado: Card['estado']) => api.updateCard(numero, { estado }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['card', numero] }), // patrón de invalidación recomendado. :contentReference[oaicite:3]{index=3}
  });

  const [montoPago, setMontoPago] = useState<number | ''>('');
  const mutPago = useMutation({
    mutationFn: () => api.registerPayment(numero, Number(montoPago || 0)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['card', numero] });
      qc.invalidateQueries({ queryKey: ['tx', numero] });
      setMontoPago('');
    },
  });

  /* ---------- RHF + Zod para EDITAR ---------- */
  const editForm = useForm<EditForm>({
    resolver: zodResolver(editSchema),
    mode: 'onChange',
    defaultValues: { nombre_titular: '', fecha_venc_input: '' },
  });

  useEffect(() => {
    if (card.data) {
      editForm.reset({
        nombre_titular: card.data.nombre_titular,
        fecha_venc_input: yyyymmToMonthInput(card.data.fecha_venc),
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card.data?.numero]);

  const mutEditar = useMutation({
    mutationFn: (payload: { nombre_titular: string; fecha_venc: string }) =>
      api.updateCard(numero, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['card', numero] });
      qc.invalidateQueries({ queryKey: ['cards'] });
    },
  });

  const submitEdit = (data: EditForm) => {
    mutEditar.mutate({
      nombre_titular: data.nombre_titular.trim().toUpperCase(),
      fecha_venc: toYYYYMM(data.fecha_venc_input),
    });
  };

  /* ---------- loading/error ---------- */
  if (card.isLoading) return <p>Cargando…</p>;
  if (card.isError) return <p className="text-danger">Error: {(card.error as Error).message}</p>;

  const c = card.data!;

  return (
    <div className="container-fluid">
      {/* Encabezado */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="d-flex flex-wrap justify-content-between align-items-center mb-4"
      >
        <div className="d-flex align-items-center gap-3">
          <div
            className="rounded-circle bg-primary text-white d-flex align-items-center justify-content-center"
            style={{ width: 44, height: 44 }}
          >
            <CreditCard size={20} />
          </div>
          <div>
            <h3 className="m-0">{maskCard(c.numero)}</h3>
            <small className="text-muted">PAN •••• {c.numero.slice(-4)}</small>
          </div>
        </div>
        <span
          className={clsx('badge rounded-pill text-uppercase', `text-bg-${estadoBadge(c.estado)}`)}
        >
          {c.estado === 'activa' ? (
            <ShieldCheck size={14} className="me-1" />
          ) : c.estado === 'bloqueada' ? (
            <ShieldAlert size={14} className="me-1" />
          ) : (
            <AlertTriangle size={14} className="me-1" />
          )}
          {c.estado}
        </span>
      </motion.div>

      {/* Tarjetas de info + acciones */}
      <div className="row g-3 mb-4">
        {/* Datos del titular */}
        <div className="col-12 col-xl-4">
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.35 }}
            className="card h-100"
          >
            <div className="card-body">
              <h6 className="text-muted">Titular</h6>
              <div className="fw-semibold d-flex align-items-center gap-2">
                <User size={16} /> {c.nombre_titular}
              </div>
              <div className="text-muted d-flex align-items-center gap-2 mt-2">
                <CalendarDays size={16} /> Vence: {c.fecha_venc}
              </div>
            </div>
          </motion.div>
        </div>

        {/* Límites */}
        <div className="col-12 col-xl-4">
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.35 }}
            className="card h-100"
          >
            <div className="card-body">
              <h6 className="text-muted">Límites</h6>
              <div className="d-flex flex-wrap gap-4">
                <div>
                  <div className="text-muted small">Autorizado</div>
                  <div className="fs-5 fw-semibold">{qt(c.monto_autorizado)}</div>
                </div>
                <div>
                  <div className="text-muted small">Disponible</div>
                  <div className="fs-5 fw-semibold">{qt(c.monto_disponible)}</div>
                </div>
              </div>
              <div
                className="progress mt-3"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={kpi.pct}
              >
                <div className="progress-bar bg-success" style={{ width: `${kpi.pct}%` }}>
                  {kpi.pct.toFixed(1)}%
                </div>
              </div>
            </div>
          </motion.div>
        </div>

        {/* Acciones rápidas */}
        <div className="col-12 col-xl-4">
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.35 }}
            className="card h-100"
          >
            <div className="card-body">
              <h6 className="text-muted">Acciones</h6>
              <div
                className="btn-group d-flex flex-wrap gap-2"
                role="group"
                aria-label="Acciones de estado"
              >
                {c.estado !== 'activa' && (
                  <motion.button
                    whileHover={{ scale: 1.03 }}
                    whileTap={{ scale: 0.97 }}
                    className="btn btn-outline-success flex-fill"
                    onClick={() => mutEstado.mutate('activa')}
                  >
                    <Unlock size={16} className="me-1" /> Activar
                  </motion.button>
                )}
                {c.estado !== 'bloqueada' && (
                  <motion.button
                    whileHover={{ scale: 1.03 }}
                    whileTap={{ scale: 0.97 }}
                    className="btn btn-outline-warning flex-fill"
                    onClick={() => mutEstado.mutate('bloqueada')}
                  >
                    <Lock size={16} className="me-1" /> Bloquear
                  </motion.button>
                )}
                {c.estado !== 'vencida' && (
                  <motion.button
                    whileHover={{ scale: 1.03 }}
                    whileTap={{ scale: 0.97 }}
                    className="btn btn-outline-secondary flex-fill"
                    onClick={() => mutEstado.mutate('vencida')}
                  >
                    <CalendarDays size={16} className="me-1" /> Vencida
                  </motion.button>
                )}
              </div>
              <hr />
              <form
                className="d-flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  mutPago.mutate();
                }}
              >
                <div className="input-group">
                  <span className="input-group-text">
                    <Landmark size={16} />
                  </span>
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    className="form-control"
                    placeholder="Monto de pago"
                    value={montoPago}
                    onChange={(e) =>
                      setMontoPago(e.target.value === '' ? '' : parseFloat(e.target.value))
                    }
                  />
                </div>
                <motion.button
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  className="btn btn-primary"
                >
                  <DollarSign size={16} className="me-1" /> Registrar pago
                </motion.button>
              </form>
              {(mutEstado.isError || mutPago.isError) && (
                <div className="text-danger mt-2 small">
                  {(mutEstado.error as Error)?.message || (mutPago.error as Error)?.message}
                </div>
              )}
            </div>
          </motion.div>
        </div>
      </div>

      {/* Bloque EDITAR con RHF + Zod */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.35 }}
        className="card border-0 shadow-sm mb-4"
      >
        <div className="card-body">
          <div className="d-flex justify-content-between align-items-center mb-3">
            <h5 className="card-title m-0 d-flex align-items-center gap-2">
              <RefreshCcw size={18} /> Editar tarjeta
            </h5>
            {mutEditar.isSuccess && (
              <span className="text-success small d-flex align-items-center">
                <CheckCircle2 size={16} className="me-1" /> Actualizado
              </span>
            )}
          </div>

          <form className="row g-3" onSubmit={editForm.handleSubmit(submitEdit)}>
            <div className="col-md-6">
              <label className="form-label d-flex align-items-center gap-2">
                <User size={16} /> Nombre del titular
              </label>
              <input
                className={clsx(
                  'form-control',
                  editForm.formState.errors.nombre_titular && 'is-invalid',
                )}
                placeholder="NOMBRE APELLIDO"
                {...editForm.register('nombre_titular')}
              />
              {editForm.formState.errors.nombre_titular && (
                <div className="invalid-feedback d-block">
                  {editForm.formState.errors.nombre_titular.message}
                </div>
              )}
            </div>

            <div className="col-md-6">
              <label className="form-label d-flex align-items-center gap-2">
                <CalendarDays size={16} /> Vencimiento (mes/año)
              </label>
              <input
                type="month"
                className={clsx(
                  'form-control',
                  editForm.formState.errors.fecha_venc_input && 'is-invalid',
                )}
                {...editForm.register('fecha_venc_input')}
              />
              {editForm.formState.errors.fecha_venc_input && (
                <div className="invalid-feedback d-block">
                  {editForm.formState.errors.fecha_venc_input.message}
                </div>
              )}
            </div>

            <div className="col-12 d-flex gap-2">
              <motion.button
                type="submit"
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                className="btn btn-success d-flex align-items-center gap-2"
                disabled={!editForm.formState.isValid || mutEditar.isPending}
              >
                <CheckCircle2 size={18} /> Guardar cambios
              </motion.button>
            </div>
          </form>
        </div>
      </motion.div>

      {/* Transacciones */}
      <h5 className="mb-3 d-flex align-items-center gap-2">
        <DollarSign size={18} /> Transacciones
      </h5>
      {txs.isLoading ? (
        <p>Cargando transacciones…</p>
      ) : txs.isError ? (
        <p className="text-danger">Error: {(txs.error as Error).message}</p>
      ) : (
        <div className="table-responsive">
          <table className="table table-sm align-middle">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Tipo</th>
                <th>Monto</th>
                <th>Comercio</th>
                <th>Status</th>
                <th>Autorización</th>
              </tr>
            </thead>
            <tbody>
              {txs.data!.map((t) => (
                <tr key={t.id}>
                  <td>{new Date(t.creada_en).toLocaleString()}</td>
                  <td>{t.tipo}</td>
                  <td>{qt(t.monto)}</td>
                  <td>{t.comercio}</td>
                  <td>
                    <span
                      className={clsx(
                        'badge',
                        t.status === 'APROBADO' ? 'text-bg-success' : 'text-bg-secondary',
                      )}
                    >
                      {t.status}
                    </span>
                  </td>
                  <td>{t.autorizacion_numero || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
