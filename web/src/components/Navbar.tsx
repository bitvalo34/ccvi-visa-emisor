import { useEffect, useMemo, useState } from 'react';
import { NavLink, Link, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { CreditCard, Sun, Moon, Plus, Link2, Gauge } from 'lucide-react';
import clsx from 'clsx';

export default function Navbar() {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const saved = localStorage.getItem('theme');
    return saved === 'dark' || saved === 'light' ? (saved as 'dark' | 'light') : 'light';
  });
  const API_BASE = (import.meta.env.VITE_API_BASE as string) || '';
  const location = useLocation();

  useEffect(() => {
    document.documentElement.setAttribute('data-bs-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  // Cerrar el menú al navegar
  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  const hostBadge = useMemo(() => {
    try {
      const u = new URL(API_BASE);
      return `${u.protocol}//${u.host}`;
    } catch {
      return API_BASE || '—';
    }
  }, [API_BASE]);

  const copyBase = async () => {
    try {
      await navigator.clipboard.writeText(API_BASE);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* noop */
    }
  };

  return (
    <nav className="navbar navbar-expand-lg navbar-dark bg-dark sticky-top shadow-sm">
      <div className="container">
        {/* Brand */}
        <Link to="/" className="navbar-brand d-flex align-items-center gap-2">
          <div
            className="rounded-circle bg-primary d-flex align-items-center justify-content-center"
            style={{ width: 36, height: 36 }}
          >
            <CreditCard size={18} className="text-white" />
          </div>
          <span className="fw-semibold">Visa Emisor · Admin</span>
        </Link>

        {/* Right quick actions (desktop) */}
        <div className="d-none d-lg-flex align-items-center gap-2">
          <span
            className="badge text-bg-secondary d-flex align-items-center"
            title="Host de la API"
          >
            <Link2 size={14} className="me-1" /> {hostBadge}
          </span>
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => setTheme((t) => (t === 'light' ? 'dark' : 'light'))}
            className="btn btn-outline-light btn-sm"
            title="Cambiar tema"
            aria-label="Cambiar tema"
          >
            {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
          </motion.button>
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.97 }}
            onClick={copyBase}
            className={clsx('btn btn-sm', copied ? 'btn-success' : 'btn-outline-light')}
            title="Copiar URL base"
          >
            <Link2 size={16} className="me-1" />
            {copied ? 'Copiado' : 'Copiar'}
          </motion.button>
          <Link to="/cards/new" className="btn btn-primary btn-sm d-flex align-items-center">
            <Plus size={16} className="me-1" /> Nueva tarjeta
          </Link>
        </div>

        {/* Toggler (mobile) */}
        <button
          className="navbar-toggler"
          type="button"
          aria-controls="nav"
          aria-expanded={open}
          aria-label="Toggle navigation"
          onClick={() => setOpen((v) => !v)}
        >
          <span className="navbar-toggler-icon"></span>
        </button>

        {/* Collapsable menu */}
        <div className={clsx('collapse navbar-collapse', open && 'show')} id="nav">
          <ul className="navbar-nav me-auto mt-2 mt-lg-0">
            <li className="nav-item">
              <NavLink
                end
                to="/"
                className={({ isActive }) =>
                  clsx('nav-link d-flex align-items-center', isActive && 'active')
                }
              >
                <Gauge size={16} className="me-2" /> Dashboard
              </NavLink>
            </li>
            <li className="nav-item">
              <NavLink
                to="/cards"
                className={({ isActive }) =>
                  clsx('nav-link d-flex align-items-center', isActive && 'active')
                }
              >
                <CreditCard size={16} className="me-2" /> Tarjetas
              </NavLink>
            </li>
          </ul>

          {/* Right quick actions (mobile) */}
          <div className="d-lg-none d-flex flex-column gap-2 pb-3">
            <span className="badge text-bg-secondary d-inline-flex align-items-center">
              <Link2 size={14} className="me-1" /> {hostBadge}
            </span>
            <div className="d-flex gap-2">
              <button
                onClick={() => setTheme((t) => (t === 'light' ? 'dark' : 'light'))}
                className="btn btn-outline-light btn-sm flex-fill"
                aria-label="Cambiar tema"
              >
                {theme === 'dark' ? (
                  <Sun size={16} className="me-1" />
                ) : (
                  <Moon size={16} className="me-1" />
                )}
                Tema
              </button>
              <button
                onClick={copyBase}
                className={clsx(
                  'btn btn-sm flex-fill',
                  copied ? 'btn-success' : 'btn-outline-light',
                )}
              >
                <Link2 size={16} className="me-1" /> {copied ? 'Copiado' : 'Copiar'}
              </button>
            </div>
            <Link
              to="/cards/new"
              className="btn btn-primary btn-sm d-flex align-items-center justify-content-center"
            >
              <Plus size={16} className="me-1" /> Nueva tarjeta
            </Link>
          </div>
        </div>
      </div>
    </nav>
  );
}
