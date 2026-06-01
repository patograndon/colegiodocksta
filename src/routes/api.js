import { Router } from 'express';
import { query } from '../config/database.js';
import { logger } from '../utils/logger.js';

const router = Router();

// ── GET /api/config ───────────────────────────────────────────────────────────
router.get('/config', async (_req, res, next) => {
  try {
    const result = await query(
      `SELECT id, telefono_asignado, nombre_encargado, rol_encargado, email_alertas, updated_at
       FROM configuracion_colegio
       ORDER BY id ASC LIMIT 1`
    );
    const config = result.rows[0] ?? {
      telefono_asignado: null,
      nombre_encargado:  'Orientador Docksta',
      rol_encargado:     'orientador',
      email_alertas:     null,
    };
    res.json({ success: true, config });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/config ──────────────────────────────────────────────────────────
router.post('/config', async (req, res, next) => {
  try {
    const { telefono_asignado, nombre_encargado, rol_encargado, email_alertas } = req.body ?? {};

    const ROLES_VALIDOS = ['psicologo', 'orientador', 'convivencia'];
    if (rol_encargado && !ROLES_VALIDOS.includes(rol_encargado)) {
      return res.status(400).json({ success: false, error: 'rol_encargado inválido' });
    }

    const result = await query(
      `INSERT INTO configuracion_colegio (id, telefono_asignado, nombre_encargado, rol_encargado, email_alertas)
       VALUES (1, $1, $2, $3, $4)
       ON CONFLICT (id) DO UPDATE
         SET telefono_asignado = EXCLUDED.telefono_asignado,
             nombre_encargado  = EXCLUDED.nombre_encargado,
             rol_encargado     = EXCLUDED.rol_encargado,
             email_alertas     = EXCLUDED.email_alertas,
             updated_at        = NOW()
       RETURNING *`,
      [
        telefono_asignado || null,
        nombre_encargado  || 'Orientador Docksta',
        rol_encargado     || 'orientador',
        email_alertas     || null,
      ]
    );

    logger.info('Configuración actualizada', { nombre: nombre_encargado, rol: rol_encargado });
    res.json({ success: true, config: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

export default router;
