// web/src/pages/CardsList.tsx
import { useMemo, useState } from 'react';
import type React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Search,
  Filter,
  RefreshCcw,
  ArrowUpDown,
  ArrowDownAZ,
  ArrowUpAZ,
  Download,
  Plus,
} from 'lucide-react';
import clsx from 'clsx';

import { api } from '../lib/api';
import type { Card } from '../types';
import FilaTarjeta from '../components/FilaTarjeta';

type Estado = 'todas' | 'activa' | 'bloqueada' | 'vencida';
type SortKey = 'monto_disponible' | 'monto_autorizado' | 'fecha_venc' | 'nombre_titular';

export default function CardsList() {
  const qc = useQueryClient();
  const { data, isLoading, isError, error, refetch, isFetching } = useQuery<Card[]>({
    queryKey: ['cards'],
    queryFn: api.listCards,
    staleTime: 10_000,
  });

  // ------------ Controles de UI ------------
  const [q, setQ] = useState('');
  const [estado, setEstado] = useState<Estado>('todas');
  const [sortKey, setSortKey] = useState<SortKey>('monto_disponible');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  // ------------ Mutación: cambiar estado ------------
  const mutEstado = useMutation({
    mutationFn: (args: { numero: string; estado: Exclude<Estado, 'todas'> }) =>
      api.updateCard(args.numero, { estado: args.estado }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cards'] }), // Invalida lista tras mutación
  });

  // ------------ Derivados: filtrar + ordenar ------------
  const list = useMemo(() => data ?? [], [data]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const byQuery = (c: Card) =>
      !needle || c.numero.includes(needle) || c.nombre_titular.toLowerCase().includes(needle);

    const byEstado = (c: Card) => estado === 'todas' || c.estado === estado;

    return list.filter((c) => byQuery(c) && byEstado(c));
  }, [list, q, estado]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      let va: string | number = '';
      let vb: string | number = '';
      switch (sortKey) {
        case 'monto_disponible':
          va = a.monto_disponible;
          vb = b.monto_disponible;
          break;
        case 'monto_autorizado':
          va = a.monto_autorizado;
          vb = b.monto_autorizado;
          break;
        case 'fecha_venc':
          va = a.fecha_venc;
          vb = b.fecha_venc;
          break;
        case 'nombre_titular':
          va = a.nombre_titular.toLowerCase();
          vb = b.nombre_titular.toLowerCase();
          break;
      }
      if (va < vb) return sortDir === 'asc' ? -1 : 1;
      if (va > vb) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return arr;
  }, [filtered, sortKey, sortDir]);

  // ------------ Exportar CSV ------------
  const exportCsv = () => {
    const rows = [
      ['numero', 'nombre_titular', 'fecha_venc', 'estado', 'monto_autorizado', 'monto_disponible'],
      ...sorted.map((c) => [
        c.numero,
        c.nombre_titular,
        c.fecha_venc,
        c.estado,
        String(c.monto_autorizado),
        String(c.monto_disponible),
      ]),
    ];
    const csv = rows
      .map((r) => r.map((val) => `"${String(val).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tarjetas_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // ------------ Loading / Error ------------
  if (isLoading) {
    return (
      <>
        <Header
          q={q}
          setQ={setQ}
          estado={estado}
          setEstado={setEstado}
          sortKey={sortKey}
          setSortKey={setSortKey}
          sortDir={sortDir}
          setSortDir={setSortDir}
          onRefresh={() => refetch()}
          onExport={exportCsv}
          fetching
        />
        <div className="card border-0 shadow-sm">
          <div className="card-body">
            <p className="placeholder-wave mb-2">
              <span className="placeholder col-12"></span>
            </p>
            <p className="placeholder-wave mb-2">
              <span className="placeholder col-10"></span>
            </p>
            <p className="placeholder-wave mb-0">
              <span className="placeholder col-8"></span>
            </p>
          </div>
        </div>
      </>
    );
  }
  if (isError) return <p className="text-danger">Error: {(error as Error).message}</p>;

  // ------------ Render ------------
  return (
    <>
      <Header
        q={q}
        setQ={setQ}
        estado={estado}
        setEstado={setEstado}
        sortKey={sortKey}
        setSortKey={setSortKey}
        sortDir={sortDir}
        setSortDir={setSortDir}
        onRefresh={() => refetch()}
        onExport={exportCsv}
        fetching={isFetching}
        total={list.length}
        showing={sorted.length}
      />

      <div className="card border-0 shadow-sm">
        <div className="card-body">
          <div className="table-responsive">
            <table className="table table-sm align-middle">
              <thead>
                <tr>
                  <th>Tarjeta</th>
                  <th>Titular</th>
                  <th>Vence</th>
                  <th>Estado</th>
                  <th className="text-nowrap">
                    Autorizado {sortKey === 'monto_autorizado' && <SortBadge dir={sortDir} />}
                  </th>
                  <th className="text-nowrap">
                    Disponible {sortKey === 'monto_disponible' && <SortBadge dir={sortDir} />}
                  </th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((card) => (
                  <FilaTarjeta
                    key={card.numero}
                    card={card}
                    onActivate={() => mutEstado.mutate({ numero: card.numero, estado: 'activa' })}
                    onBlock={() => mutEstado.mutate({ numero: card.numero, estado: 'bloqueada' })}
                    onMarkExpired={() =>
                      mutEstado.mutate({ numero: card.numero, estado: 'vencida' })
                    }
                  />
                ))}
              </tbody>
            </table>
          </div>

          {sorted.length === 0 && (
            <div className="text-center text-muted py-4">
              <p className="mb-1">No se encontraron tarjetas con los criterios actuales.</p>
              <small>Prueba cambiando el término de búsqueda o el filtro de estado.</small>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

/* ========= Subcomponentes UI ========= */

function Header(props: {
  q: string;
  setQ: (v: string) => void;
  estado: Estado;
  setEstado: (v: Estado) => void;
  sortKey: SortKey;
  setSortKey: (v: SortKey) => void;
  sortDir: 'asc' | 'desc';
  setSortDir: React.Dispatch<React.SetStateAction<'asc' | 'desc'>>;
  onRefresh: () => void;
  onExport: () => void;
  fetching?: boolean;
  total?: number;
  showing?: number;
}) {
  const {
    q,
    setQ,
    estado,
    setEstado,
    sortKey,
    setSortKey,
    sortDir,
    setSortDir,
    onRefresh,
    onExport,
    fetching,
    total,
    showing,
  } = props;

  return (
    <div className="d-flex flex-wrap gap-2 mb-3 align-items-end justify-content-between">
      {/* Título + métricas */}
      <div className="d-flex flex-column">
        <h3 className="m-0">Tarjetas</h3>
        <small className="text-muted">
          {typeof total === 'number' && typeof showing === 'number' ? (
            <>
              Mostrando {showing} de {total}
            </>
          ) : (
            'Gestión de tarjetas emitidas'
          )}
        </small>
      </div>

      {/* Controles */}
      <div className="d-flex flex-wrap gap-2 align-items-center">
        {/* Búsqueda */}
        <div className="input-group">
          <span className="input-group-text">
            <Search size={16} />
          </span>
          <input
            type="search"
            className="form-control"
            placeholder="Buscar por número o titular…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>

        {/* Filtro de estado */}
        <div className="input-group">
          <span className="input-group-text">
            <Filter size={16} />
          </span>
          <select
            className="form-select"
            value={estado}
            onChange={(e) => setEstado(e.target.value as Estado)}
            title="Estado"
          >
            <option value="todas">Todas</option>
            <option value="activa">Activas</option>
            <option value="bloqueada">Bloqueadas</option>
            <option value="vencida">Vencidas</option>
          </select>
        </div>

        {/* Orden */}
        <div className="input-group">
          <span className="input-group-text">
            <ArrowUpDown size={16} />
          </span>
          <select
            className="form-select"
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as SortKey)}
            title="Ordenar por"
          >
            <option value="monto_disponible">Disponible</option>
            <option value="monto_autorizado">Autorizado</option>
            <option value="fecha_venc">Fecha de vencimiento</option>
            <option value="nombre_titular">Nombre del titular</option>
          </select>
          <button
            className="btn btn-outline-secondary"
            type="button"
            title={sortDir === 'asc' ? 'Ascendente' : 'Descendente'}
            onClick={() => setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))}
          >
            {sortDir === 'asc' ? <ArrowUpAZ size={16} /> : <ArrowDownAZ size={16} />}
          </button>
        </div>

        {/* Acciones */}
        <motion.button
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
          className={clsx('btn', fetching ? 'btn-outline-secondary' : 'btn-outline-primary')}
          onClick={onRefresh}
          title="Refrescar datos"
        >
          <RefreshCcw size={16} className="me-1" /> {fetching ? 'Actualizando…' : 'Refrescar'}
        </motion.button>

        <motion.button
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
          className="btn btn-outline-secondary"
          onClick={onExport}
          title="Exportar listado a CSV"
        >
          <Download size={16} className="me-1" /> Exportar
        </motion.button>

        <Link to="/cards/new" className="btn btn-primary d-flex align-items-center">
          <Plus size={16} className="me-1" /> Nueva tarjeta
        </Link>
      </div>
    </div>
  );
}

function SortBadge({ dir }: { dir: 'asc' | 'desc' }) {
  return <span className="badge text-bg-light align-middle ms-1">{dir === 'asc' ? '↑' : '↓'}</span>;
}
