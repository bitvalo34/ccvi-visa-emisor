// web/src/pages/CardNew.tsx
import { useNavigate, Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { CreditCard, Plus, Link2, ArrowLeft, CheckCircle2, AlertTriangle } from 'lucide-react';
import clsx from 'clsx';

import { api } from '../lib/api';
import CardForm from '../components/CardForm';

export default function CardNew() {
  const qc = useQueryClient();
  const nav = useNavigate();
  const API_BASE = (import.meta.env.VITE_API_BASE as string) || ''; // Vite expone VITE_* en import.meta.env. :contentReference[oaicite:1]{index=1}

  const mut = useMutation({
    mutationFn: api.createCard,
    onSuccess(card) {
      // invalidar listado y llevar al detalle (flujo ideal post-creación)
      qc.invalidateQueries({ queryKey: ['cards'] });
      nav(`/cards/${String(card.numero).replace(/\D+/g, '')}`);
    },
  });

  return (
    <div className="container-fluid">
      {/* Encabezado */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="d-flex flex-wrap align-items-center justify-content-between mb-4"
      >
        <div className="d-flex align-items-center gap-3">
          <div
            className="rounded-circle bg-primary text-white d-flex align-items-center justify-content-center"
            style={{ width: 44, height: 44 }}
          >
            <CreditCard size={20} />
          </div>
          <div>
            <h3 className="m-0">Registrar nueva tarjeta</h3>
            <small className="text-muted">Completa los datos y confirma la emisión</small>
          </div>
        </div>

        <div className="d-flex align-items-center gap-2">
          <span
            className="badge text-bg-secondary d-flex align-items-center"
            title="Host de la API"
          >
            <Link2 size={14} className="me-1" /> {API_BASE || '—'}
          </span>
          <Link to="/cards" className="btn btn-outline-secondary btn-sm d-flex align-items-center">
            <ArrowLeft size={16} className="me-1" /> Volver al listado
          </Link>
          <motion.button
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }} // micro-interacciones (Motion). :contentReference[oaicite:2]{index=2}
            className="btn btn-primary btn-sm d-flex align-items-center"
            onClick={() => {
              const form = document.querySelector('form');
              if (form) (form as HTMLFormElement).requestSubmit();
            }}
            title="Crear"
          >
            <Plus size={16} className="me-1" /> Crear
          </motion.button>
        </div>
      </motion.div>

      {/* Estado del envío */}
      {mut.isPending && (
        <div className="alert alert-info d-flex align-items-center gap-2">
          <CheckCircle2 size={18} /> Creando tarjeta… por favor espera.
        </div>
      )}

      {mut.isError && (
        <div className="alert alert-warning d-flex align-items-center gap-2">
          <AlertTriangle size={18} /> {(mut.error as Error).message}
        </div>
      )}

      {/* Formulario (ya con UI avanzada en CardForm) */}
      <CardForm onSubmit={(v) => mut.mutate(v)} />

      {/* Pie con CTA redundante (accesible) */}
      <div className="d-flex justify-content-between align-items-center mt-3">
        <Link to="/cards" className="btn btn-outline-secondary d-flex align-items-center">
          <ArrowLeft size={16} className="me-1" /> Cancelar
        </Link>
        <motion.button
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
          className={clsx('btn btn-primary d-flex align-items-center', mut.isPending && 'disabled')}
          onClick={() => {
            const form = document.querySelector('form');
            if (form) (form as HTMLFormElement).requestSubmit();
          }}
          disabled={mut.isPending}
        >
          <Plus size={16} className="me-1" /> Crear tarjeta
        </motion.button>
      </div>
    </div>
  );
}
