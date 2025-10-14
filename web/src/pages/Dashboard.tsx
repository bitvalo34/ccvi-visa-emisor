import { useMemo, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { Card } from '../types';
import { motion } from 'framer-motion';
import {
  CreditCard,
  ShieldCheck,
  AlertTriangle,
  Activity,
  Server,
  Database,
  Link2,
} from 'lucide-react';
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip as ReTooltip,
  Legend,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from 'recharts';
import CountUp from 'react-countup';
import dayjs from 'dayjs';
import clsx from 'clsx';

const COLORS = ['#22c55e', '#f59e0b', '#6b7280']; // activa, bloqueada, vencida

function maskCard(n: string) {
  // 16 dígitos → **** **** **** 1234
  if (!n) return '';
  const last4 = n.slice(-4);
  return `•••• •••• •••• ${last4}`;
}

function qt(n: number) {
  return `Q ${n.toFixed(2)}`;
}

export default function Dashboard() {
  // Base y salud del servicio
  const API_BASE = (import.meta.env.VITE_API_BASE as string) || '';
  useQuery({ queryKey: ['metadata'], queryFn: api.metadata, staleTime: 30_000 });
  const health = useQuery({ queryKey: ['healthz'], queryFn: api.healthz, staleTime: 15_000 });
  const ready = useQuery({ queryKey: ['readyz'], queryFn: api.readyz, staleTime: 15_000 });

  // Tarjetas para KPIs y gráficos
  const cards = useQuery<Card[]>({
    queryKey: ['cards'],
    queryFn: api.listCards,
    staleTime: 10_000,
  });

  const {
    total,
    activas,
    bloqueadas,
    vencidas,
    sumAutorizado,
    sumDisponible,
    pctDisponible,
    statusData,
    topDisponibles,
  } = useMemo(() => {
    const list = cards.data ?? [];
    const total = list.length;
    const activas = list.filter((c) => c.estado === 'activa').length;
    const bloqueadas = list.filter((c) => c.estado === 'bloqueada').length;
    const vencidas = list.filter((c) => c.estado === 'vencida').length;
    const sumAutorizado = list.reduce((a, c) => a + Number(c.monto_autorizado || 0), 0);
    const sumDisponible = list.reduce((a, c) => a + Number(c.monto_disponible || 0), 0);
    const pctDisponible = sumAutorizado > 0 ? (sumDisponible / sumAutorizado) * 100 : 0;

    const statusData = [
      { name: 'Activas', value: activas },
      { name: 'Bloqueadas', value: bloqueadas },
      { name: 'Vencidas', value: vencidas },
    ];

    const topDisponibles = [...list]
      .sort((a, b) => b.monto_disponible - a.monto_disponible)
      .slice(0, 5)
      .map((c) => ({ tarjeta: maskCard(c.numero), disponible: Number(c.monto_disponible) }));

    return {
      total,
      activas,
      bloqueadas,
      vencidas,
      sumAutorizado,
      sumDisponible,
      pctDisponible,
      statusData,
      topDisponibles,
    };
  }, [cards.data]);

  const [copied, setCopied] = useState(false);
  const copyBase = async () => {
    try {
      await navigator.clipboard.writeText(API_BASE);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* Clipboard API retorna Promise; manejar errores si hace falta */
    }
  };

  return (
    <div className="container-fluid">
      {/* Encabezado */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="d-flex flex-wrap align-items-center justify-content-between mb-4"
      >
        <div className="d-flex align-items-center gap-3">
          <div
            className="rounded-circle bg-dark text-white d-flex align-items-center justify-content-center"
            style={{ width: 48, height: 48 }}
          >
            <CreditCard size={24} />
          </div>
          <div>
            <h2 className="mb-0">Visa · Emisor — Panel</h2>
            <small className="text-muted">
              Base API: <code>{API_BASE || '—'}</code> • {dayjs().format('YYYY-MM-DD HH:mm')}
            </small>
          </div>
        </div>
        <div className="d-flex align-items-center gap-2">
          <span className={clsx('badge rounded-pill', ready.data ? 'bg-success' : 'bg-secondary')}>
            <Server size={14} className="me-1" /> ready
          </span>
          <span className={clsx('badge rounded-pill', health.data ? 'bg-success' : 'bg-secondary')}>
            <Activity size={14} className="me-1" /> health
          </span>
          <button
            className={clsx('btn btn-sm', copied ? 'btn-success' : 'btn-outline-secondary')}
            onClick={copyBase}
            title="Copiar URL base"
          >
            <Link2 size={16} className="me-1" /> {copied ? 'Copiado' : 'Copiar host'}
          </button>
        </div>
      </motion.div>

      {/* KPIs */}
      <div className="row g-3 mb-3">
        <KpiCard
          title="Tarjetas"
          icon={<Database />}
          color="primary"
          value={total}
          subtitle="emitidas"
          loading={cards.isLoading}
        />
        <KpiCard
          title="Activas"
          icon={<ShieldCheck />}
          color="success"
          value={activas}
          subtitle="operativas"
          loading={cards.isLoading}
        />
        <KpiCard
          title="Bloqueadas"
          icon={<AlertTriangle />}
          color="warning"
          value={bloqueadas}
          subtitle="en revisión"
          loading={cards.isLoading}
        />
        <KpiCard
          title="Vencidas"
          icon={<CreditCard />}
          color="secondary"
          value={vencidas}
          subtitle="fuera de servicio"
          loading={cards.isLoading}
        />
      </div>

      {/* Límites globales */}
      <div className="row g-3 mb-4">
        <div className="col-12 col-xl-6">
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4 }}
            className="card h-100"
          >
            <div className="card-body">
              <div className="d-flex justify-content-between align-items-center mb-2">
                <h5 className="card-title mb-0">Capacidad de crédito</h5>
                <span className="text-muted small">global</span>
              </div>
              <div className="d-flex flex-wrap gap-4 align-items-center">
                <div>
                  <div className="text-muted small">Autorizado total</div>
                  <div className="fs-4 fw-semibold">{qt(sumAutorizado)}</div>
                </div>
                <div>
                  <div className="text-muted small">Disponible total</div>
                  <div className="fs-4 fw-semibold">{qt(sumDisponible)}</div>
                </div>
                <div className="flex-grow-1">
                  <div
                    className="progress"
                    role="progressbar"
                    aria-label="Porcentaje disponible"
                    aria-valuenow={pctDisponible}
                    aria-valuemin={0}
                    aria-valuemax={100}
                  >
                    <div className="progress-bar bg-success" style={{ width: `${pctDisponible}%` }}>
                      {pctDisponible.toFixed(1)}%
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </div>

        <div className="col-12 col-xl-6">
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4 }}
            className="card h-100"
          >
            <div className="card-body">
              <h5 className="card-title">Distribución por estado</h5>
              <div style={{ width: '100%', height: 280 }}>
                <ResponsiveContainer>
                  <PieChart>
                    <Pie
                      data={statusData}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={60}
                      outerRadius={100}
                    >
                      {statusData.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Legend />
                    <ReTooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          </motion.div>
        </div>
      </div>

      {/* Top disponibles */}
      <div className="row g-3">
        <div className="col-12">
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4 }}
            className="card"
          >
            <div className="card-body">
              <h5 className="card-title">Top 5 tarjetas con mayor disponible</h5>
              <div style={{ width: '100%', height: 320 }}>
                <ResponsiveContainer>
                  <BarChart data={topDisponibles}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="tarjeta" />
                    <YAxis />
                    <ReTooltip formatter={(v: number) => qt(Number(v))} />
                    <Bar dataKey="disponible" fill="#0ea5e9" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}

/** ---------- UI: KPI Card ---------- */
type KpiProps = {
  title: string;
  value: number;
  subtitle?: string;
  icon: ReactNode;
  color?: 'primary' | 'success' | 'warning' | 'secondary';
  loading?: boolean;
};
function KpiCard({ title, value, subtitle, icon, color = 'primary', loading }: KpiProps) {
  return (
    <div className="col-12 col-sm-6 col-xl-3">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.35 }}
        className={clsx('card shadow-sm border-0 h-100', `text-${color}`)}
      >
        <div className="card-body">
          <div className="d-flex align-items-center gap-3">
            <div
              className={clsx(
                'rounded-circle d-flex align-items-center justify-content-center',
                `bg-${color} bg-opacity-10 text-${color}`,
              )}
              style={{ width: 44, height: 44 }}
            >
              {icon}
            </div>
            <div className="flex-grow-1">
              <div className="text-muted small">{title}</div>
              <div className="fs-3 fw-semibold">
                {loading ? '—' : <CountUp end={value} duration={0.6} separator="," />}
              </div>
              {subtitle && <div className="small text-muted">{subtitle}</div>}
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
