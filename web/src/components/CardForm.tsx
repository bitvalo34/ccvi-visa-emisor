import { useMemo, useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { motion } from 'framer-motion';
import clsx from 'clsx';
import {
  CreditCard,
  User,
  CalendarDays,
  Shield,
  Eye,
  EyeOff,
  DollarSign,
  CheckCircle2,
  XCircle,
} from 'lucide-react';

/** ========== Tipos que espera tu API al enviar ========== */
type FormValues = {
  numero: string;
  nombre_titular: string;
  fecha_venc: string; // yyyymm
  cvv: string;
  monto_autorizado: number;
};

type Props = {
  onSubmit: (values: FormValues) => void;
};

/** ========== Utilidades de formato/validación ========== */
const onlyDigits = (s: string) => s.replace(/\D/g, '');
const group4 = (digits: string) => digits.replace(/(.{4})/g, '$1 ').trim();

function luhnOk(pan: string): boolean {
  // Algoritmo de Luhn (PAN sin espacios)
  // Duplicar cada 2º dígito desde la derecha, si >9 restar 9; sumar y validar múltiplo de 10
  let sum = 0;
  let shouldDouble = false;
  for (let i = pan.length - 1; i >= 0; i--) {
    let d = pan.charCodeAt(i) - 48;
    if (shouldDouble) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    shouldDouble = !shouldDouble;
  }
  return sum % 10 === 0;
}

function toYYYYMMFromMonth(value: string): string {
  // value viene como "YYYY-MM" desde <input type="month">
  if (!/^\d{4}-\d{2}$/.test(value)) return '';
  return value.replace('-', '');
}
function isFutureOrCurrentYYYYMM(yyyymm: string): boolean {
  const now = new Date();
  const cur = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
  return yyyymm >= cur;
}

/** ========== Schema Zod (runtime + TS types) ========== */
const schema = z.object({
  numero: z
    .string()
    .min(16, 'La tarjeta debe tener 16 dígitos')
    .max(16, 'La tarjeta debe tener 16 dígitos')
    .regex(/^\d{16}$/, 'Solo dígitos')
    .refine(luhnOk, 'El número no supera la validación Luhn'),
  nombre_titular: z
    .string()
    .min(3, 'Ingresa el nombre del titular')
    .transform((v) => v.trim().toUpperCase()),
  // Mantendremos en el form el control como YYYY-MM y lo mapeamos a yyyymm al enviar
  fecha_venc_input: z
    .string()
    .regex(/^\d{4}-\d{2}$/, 'Selecciona mes y año')
    .refine((v) => isFutureOrCurrentYYYYMM(toYYYYMMFromMonth(v)), 'La fecha no puede ser pasada'),
  cvv: z.string().regex(/^\d{3}$/, 'CVV de 3 dígitos'),
  monto_autorizado: z
    .number({ message: 'Ingresa un monto' })
    .positive('Debe ser un monto positivo'),
});

type UiForm = z.infer<typeof schema>;

/** ========== Componente ========== */
export default function CardForm({ onSubmit }: Props) {
  const [showCVV, setShowCVV] = useState(false);

  const {
    handleSubmit,
    control,
    register,
    watch,
    formState: { errors, isValid, isSubmitting },
  } = useForm<UiForm>({
    mode: 'onChange',
    resolver: zodResolver(schema),
    defaultValues: {
      numero: '',
      nombre_titular: '',
      fecha_venc_input: '',
      cvv: '',
      monto_autorizado: 0,
    },
  });

  const numero = watch('numero');
  const nombre = watch('nombre_titular');
  const fechaInput = watch('fecha_venc_input');

  const masked = useMemo(() => group4(numero), [numero]);
  const yyyymm = useMemo(() => toYYYYMMFromMonth(fechaInput), [fechaInput]);

  const submit = (data: UiForm) => {
    const payload: FormValues = {
      numero: data.numero,
      nombre_titular: data.nombre_titular,
      fecha_venc: toYYYYMMFromMonth(data.fecha_venc_input),
      cvv: data.cvv,
      monto_autorizado: data.monto_autorizado,
    };
    onSubmit(payload);
  };

  return (
    <div className="row g-4">
      {/* Columna izquierda: formulario */}
      <div className="col-12 col-xl-7">
        <motion.form
          onSubmit={handleSubmit(submit)}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="card border-0 shadow-sm"
        >
          <div className="card-body">
            <div className="d-flex align-items-center gap-2 mb-3">
              <div
                className="rounded-circle bg-primary text-white d-flex align-items-center justify-content-center"
                style={{ width: 36, height: 36 }}
              >
                <CreditCard size={18} />
              </div>
              <h5 className="m-0">Nueva tarjeta Visa</h5>
            </div>

            {/* Número de tarjeta */}
            <div className="mb-3">
              <label className="form-label d-flex align-items-center gap-2">
                <CreditCard size={16} /> Número de tarjeta
              </label>

              <Controller
                name="numero"
                control={control}
                render={({ field }) => (
                  <input
                    {...field}
                    value={masked}
                    onChange={(e) => {
                      const digits = onlyDigits(e.target.value).slice(0, 16);
                      // Guardamos como dígitos puros en el estado del form
                      field.onChange(digits);
                    }}
                    inputMode="numeric"
                    autoComplete="cc-number"
                    className={clsx('form-control', errors.numero && 'is-invalid')}
                    placeholder="•••• •••• •••• ••••"
                  />
                )}
              />
              {errors.numero ? (
                <div className="invalid-feedback d-block">{errors.numero.message}</div>
              ) : (
                <div className="form-text">Se validará automáticamente (Luhn).</div>
              )}
            </div>

            {/* Nombre del titular */}
            <div className="mb-3">
              <label className="form-label d-flex align-items-center gap-2">
                <User size={16} /> Nombre del titular
              </label>
              <input
                {...register('nombre_titular')}
                className={clsx('form-control', errors.nombre_titular && 'is-invalid')}
                placeholder="NOMBRE APELLIDO"
                autoComplete="cc-name"
              />
              {errors.nombre_titular ? (
                <div className="invalid-feedback d-block">{errors.nombre_titular.message}</div>
              ) : (
                <div className="form-text">Se normaliza a MAYÚSCULAS.</div>
              )}
            </div>

            {/* Fecha de vencimiento + CVV */}
            <div className="row g-3">
              <div className="col-sm-6">
                <label className="form-label d-flex align-items-center gap-2">
                  <CalendarDays size={16} /> Vencimiento (mes/año)
                </label>
                <input
                  type="month"
                  {...register('fecha_venc_input')}
                  className={clsx('form-control', errors.fecha_venc_input && 'is-invalid')}
                  autoComplete="cc-exp"
                />
                {errors.fecha_venc_input ? (
                  <div className="invalid-feedback d-block">{errors.fecha_venc_input.message}</div>
                ) : (
                  <div className="form-text">
                    Se enviará como <code>yyyymm</code>.
                  </div>
                )}
              </div>

              <div className="col-sm-6">
                <label className="form-label d-flex align-items-center gap-2">
                  <Shield size={16} /> CVV (3)
                </label>
                <div className="input-group">
                  <input
                    {...register('cvv')}
                    type={showCVV ? 'text' : 'password'}
                    inputMode="numeric"
                    autoComplete="cc-csc"
                    className={clsx('form-control', errors.cvv && 'is-invalid')}
                    placeholder="•••"
                    maxLength={3}
                  />
                  <button
                    type="button"
                    className="btn btn-outline-secondary"
                    onClick={() => setShowCVV((v) => !v)}
                    aria-label={showCVV ? 'Ocultar CVV' : 'Mostrar CVV'}
                  >
                    {showCVV ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                {errors.cvv && <div className="invalid-feedback d-block">{errors.cvv.message}</div>}
              </div>
            </div>

            {/* Monto autorizado */}
            <div className="mt-3">
              <label className="form-label d-flex align-items-center gap-2">
                <DollarSign size={16} /> Límite autorizado
              </label>
              <Controller
                name="monto_autorizado"
                control={control}
                render={({ field }) => (
                  <input
                    type="number"
                    min={0.01}
                    step={0.01}
                    className={clsx('form-control', errors.monto_autorizado && 'is-invalid')}
                    placeholder="0.00"
                    value={Number.isFinite(field.value as number) ? field.value : ''}
                    onChange={(e) => field.onChange(parseFloat(e.target.value))}
                  />
                )}
              />
              {errors.monto_autorizado ? (
                <div className="invalid-feedback d-block">{errors.monto_autorizado.message}</div>
              ) : (
                <div className="form-text">Debe ser positivo.</div>
              )}
            </div>
          </div>

          {/* Barra de envío sticky */}
          <div className="card-footer bg-body-tertiary d-flex flex-wrap gap-2 justify-content-between align-items-center">
            <div className="text-muted small">
              <span className="me-3">
                <strong>PAN:</strong> {masked || '—'}
              </span>
              <span className="me-3">
                <strong>Vence:</strong> {yyyymm || '—'}
              </span>
              <span>
                <strong>Nombre:</strong> {nombre || '—'}
              </span>
            </div>
            <div className="d-flex gap-2">
              <motion.button
                type="submit"
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                className={clsx(
                  'btn btn-primary d-flex align-items-center gap-2',
                  (!isValid || isSubmitting) && 'disabled',
                )}
                disabled={!isValid || isSubmitting}
              >
                <CheckCircle2 size={18} />
                {isSubmitting ? 'Creando…' : 'Crear tarjeta'}
              </motion.button>
            </div>
          </div>
        </motion.form>
      </div>

      {/* Columna derecha: preview / estado */}
      <div className="col-12 col-xl-5">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.35 }}
          className="card border-0 shadow-sm h-100"
        >
          <div className="card-body">
            <h6 className="text-muted mb-3">Previsualización</h6>
            <div
              className="rounded-4 p-4 text-white"
              style={{
                background: 'linear-gradient(135deg, #0ea5e9 0%, #2563eb 50%, #1e293b 100%)',
              }}
            >
              <div className="d-flex justify-content-between align-items-center mb-4">
                <div className="d-flex align-items-center gap-2">
                  <CreditCard /> <span className="fw-semibold">VISA • EMISOR</span>
                </div>
                <img
                  src="https://upload.wikimedia.org/wikipedia/commons/4/41/Visa_Logo.png"
                  height={20}
                  alt="VISA"
                  style={{ filter: 'brightness(0) invert(1)' }}
                />
              </div>
              <div
                className="fs-5 fw-semibold tracking-widest mb-3"
                style={{ letterSpacing: '0.12em' }}
              >
                {masked || '•••• •••• •••• ••••'}
              </div>
              <div className="d-flex justify-content-between text-uppercase">
                <div>
                  <div className="small text-white-50">Titular</div>
                  <div className="fw-semibold">{nombre || 'NOMBRE APELLIDO'}</div>
                </div>
                <div className="text-end">
                  <div className="small text-white-50">Vence</div>
                  <div className="fw-semibold">
                    {yyyymm ? `${yyyymm.slice(4, 6)}/${yyyymm.slice(0, 4)}` : 'MM/AAAA'}
                  </div>
                </div>
              </div>
            </div>

            {/* Alertas inline */}
            <div className="mt-3">
              {Object.keys(errors).length > 0 ? (
                <div className="alert alert-warning d-flex align-items-center gap-2 mb-0">
                  <XCircle size={18} /> Revisa los campos marcados en rojo.
                </div>
              ) : (
                <div className="alert alert-success d-flex align-items-center gap-2 mb-0">
                  <CheckCircle2 size={18} /> Todo listo para crear la tarjeta.
                </div>
              )}
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
