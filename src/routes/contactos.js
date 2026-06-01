import { Router } from 'express';
import { query } from '../config/database.js';

const router = Router();

// GET /api/contactos/stats  →  conteos por color de semáforo
router.get('/stats', async (req, res, next) => {
  try {
    const result = await query(`
      SELECT
        COUNT(*) FILTER (
          WHERE estado = 'completado'
        ) AS verde,
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
    `);
    const r = result.rows[0];
    res.json({
      verde:    parseInt(r.verde),
      amarillo: parseInt(r.amarillo),
      rojo:     parseInt(r.rojo),
      total:    parseInt(r.total),
      ts:       new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/contactos/recientes  →  últimos 20 sin teléfono
router.get('/recientes', async (req, res, next) => {
  try {
    const result = await query(`
      SELECT id, canal, estado, timer_expira_at, created_at
      FROM contactos
      ORDER BY created_at DESC
      LIMIT 20
    `);
    res.json({ contactos: result.rows });
  } catch (err) {
    next(err);
  }
});

export default router;
