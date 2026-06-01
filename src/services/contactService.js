import { query } from '../config/database.js';

// ── getStats ──────────────────────────────────────────────────────────────────
// Usa idx_contactos_stats_cover → una sola pasada de índice
export const getStats = async (escuelaId = null) => {
  const filtro = escuelaId ? 'AND escuela_id = $1' : '';
  const params = escuelaId ? [escuelaId] : [];

  const { rows } = await query(`
    SELECT
      COUNT(*) FILTER (
        WHERE estado = 'completado'
      )::int AS verde,
      COUNT(*) FILTER (
        WHERE estado = 'en_curso'
          AND (timer_expira_at IS NULL OR timer_expira_at > NOW())
      )::int AS amarillo,
      COUNT(*) FILTER (
        WHERE estado IN ('intento_fallido', 'abandonado')
           OR (estado = 'en_curso'
               AND timer_expira_at IS NOT NULL
               AND timer_expira_at <= NOW())
      )::int AS rojo,
      COUNT(*)::int AS total
    FROM contactos
    WHERE TRUE ${filtro}
  `, params);

  return rows[0];
};

// ── getRecientes ──────────────────────────────────────────────────────────────
// Usa idx_contactos_recientes_cover → evita heap fetch
export const getRecientes = async (escuelaId = null, limit = 20) => {
  const filtro = escuelaId ? 'AND c.escuela_id = $1' : '';
  const params = escuelaId ? [escuelaId] : [];

  const { rows } = await query(`
    SELECT c.id, c.canal, c.estado, c.timer_expira_at, c.created_at,
           e.nombre_escuela, e.id AS escuela_id
    FROM contactos c
    LEFT JOIN escuelas e ON e.id = c.escuela_id
    WHERE TRUE ${filtro}
    ORDER BY c.created_at DESC
    LIMIT ${parseInt(limit)}
  `, params);

  return rows;
};
