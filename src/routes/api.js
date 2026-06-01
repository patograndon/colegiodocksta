import { Router } from 'express';
import { query } from '../config/database.js';
import { logger } from '../utils/logger.js';

const router = Router();

// ── RBAC: extrae escuela_id del request ───────────────────────────────────────
// Header X-Escuela-ID:
//   - número  → filtra por esa escuela
//   - "admin" → ve toda la red (Fundación)
//   - ausente → admin (dev/localhost)
const getEscuelaFiltro = (req) => {
  const header = req.headers['x-escuela-id'];
  if (!header || header === 'admin') return null; // sin filtro → ve todo
  const id = parseInt(header);
  return isNaN(id) ? null : id;
};

// ── GET /api/escuelas ─────────────────────────────────────────────────────────
router.get('/escuelas', async (req, res, next) => {
  try {
    const escuelaId = getEscuelaFiltro(req);
    const { rows } = escuelaId
      ? await query(`SELECT id, nombre_escuela, comuna, rbd, whatsapp_oficial, vapi_phone_id, activa FROM escuelas WHERE id = $1`, [escuelaId])
      : await query(`SELECT id, nombre_escuela, comuna, rbd, whatsapp_oficial, vapi_phone_id, activa FROM escuelas ORDER BY id`);
    res.json({ success: true, escuelas: rows });
  } catch (err) { next(err); }
});

// ── GET /api/contactos/stats ──────────────────────────────────────────────────
// Reemplaza la ruta en contactos.js con soporte multi-tenant
router.get('/contactos/stats', async (req, res, next) => {
  try {
    const escuelaId = getEscuelaFiltro(req);
    const filtro    = escuelaId ? 'AND escuela_id = $1' : '';
    const params    = escuelaId ? [escuelaId] : [];

    const { rows } = await query(`
      SELECT
        COUNT(*) FILTER (WHERE estado = 'completado') AS verde,
        COUNT(*) FILTER (
          WHERE estado = 'en_curso'
            AND (timer_expira_at IS NULL OR timer_expira_at > NOW())
        ) AS amarillo,
        COUNT(*) FILTER (
          WHERE estado IN ('intento_fallido', 'abandonado')
             OR (estado = 'en_curso' AND timer_expira_at IS NOT NULL AND timer_expira_at <= NOW())
        ) AS rojo,
        COUNT(*) AS total
      FROM contactos
      WHERE TRUE ${filtro}
    `, params);

    res.json({ success: true, ...rows[0], escuela_id: escuelaId, ts: new Date().toISOString() });
  } catch (err) { next(err); }
});

// ── GET /api/contactos/recientes ─────────────────────────────────────────────
router.get('/contactos/recientes', async (req, res, next) => {
  try {
    const escuelaId = getEscuelaFiltro(req);
    const filtro    = escuelaId ? 'AND c.escuela_id = $1' : '';
    const params    = escuelaId ? [escuelaId] : [];

    const { rows } = await query(`
      SELECT c.id, c.canal, c.estado, c.timer_expira_at, c.created_at,
             e.nombre_escuela, e.id AS escuela_id
      FROM contactos c
      LEFT JOIN escuelas e ON e.id = c.escuela_id
      WHERE TRUE ${filtro}
      ORDER BY c.created_at DESC
      LIMIT 20
    `, params);

    res.json({ success: true, contactos: rows });
  } catch (err) { next(err); }
});

// ── GET /api/config ───────────────────────────────────────────────────────────
router.get('/config', async (req, res, next) => {
  try {
    const escuelaId = getEscuelaFiltro(req) ?? 1;

    // Intenta configuracion_escuelas primero, fallback a configuracion_colegio
    let config = null;
    try {
      const r = await query(
        `SELECT ce.id, ce.escuela_id, ce.nombre_encargado, ce.rol_encargado, ce.email_alertas,
                ce.updated_at, e.nombre_escuela, e.whatsapp_oficial AS telefono_asignado
         FROM configuracion_escuelas ce
         JOIN escuelas e ON e.id = ce.escuela_id
         WHERE ce.escuela_id = $1`,
        [escuelaId]
      );
      config = r.rows[0];
    } catch {
      // tabla aún no existe → fallback a configuracion_colegio
      const r = await query(
        `SELECT id, telefono_asignado, nombre_encargado, rol_encargado, email_alertas, updated_at
         FROM configuracion_colegio ORDER BY id ASC LIMIT 1`
      );
      config = r.rows[0];
    }

    res.json({ success: true, config: config ?? {
      nombre_encargado: 'Orientador Docksta', rol_encargado: 'orientador',
      email_alertas: null, telefono_asignado: null,
    }});
  } catch (err) { next(err); }
});

// ── POST /api/config ──────────────────────────────────────────────────────────
router.post('/config', async (req, res, next) => {
  try {
    const escuelaId = getEscuelaFiltro(req) ?? 1;
    const { nombre_encargado, rol_encargado, email_alertas } = req.body ?? {};

    const ROLES = ['psicologo', 'orientador', 'convivencia'];
    if (rol_encargado && !ROLES.includes(rol_encargado)) {
      return res.status(400).json({ success: false, error: 'rol_encargado inválido' });
    }

    let result;
    try {
      result = await query(
        `INSERT INTO configuracion_escuelas (escuela_id, nombre_encargado, rol_encargado, email_alertas)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (escuela_id) DO UPDATE
           SET nombre_encargado = EXCLUDED.nombre_encargado,
               rol_encargado    = EXCLUDED.rol_encargado,
               email_alertas    = EXCLUDED.email_alertas,
               updated_at       = NOW()
         RETURNING *`,
        [escuelaId, nombre_encargado || 'Orientador', rol_encargado || 'orientador', email_alertas || null]
      );
    } catch {
      // Fallback: actualiza configuracion_colegio si la nueva tabla no existe aún
      result = await query(
        `INSERT INTO configuracion_colegio (id, nombre_encargado, rol_encargado, email_alertas)
         VALUES (1, $1, $2, $3)
         ON CONFLICT (id) DO UPDATE
           SET nombre_encargado = EXCLUDED.nombre_encargado,
               rol_encargado    = EXCLUDED.rol_encargado,
               email_alertas    = EXCLUDED.email_alertas,
               updated_at       = NOW()
         RETURNING *`,
        [nombre_encargado || 'Orientador', rol_encargado || 'orientador', email_alertas || null]
      );
    }

    logger.info('Config actualizada', { escuelaId, nombre: nombre_encargado });
    res.json({ success: true, config: result.rows[0] });
  } catch (err) { next(err); }
});

export default router;
