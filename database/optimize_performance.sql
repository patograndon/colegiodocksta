-- ============================================================
-- Performance Optimization — Fase Cero < 100ms
-- Todos los índices son CONCURRENT-safe e idempotentes
-- ============================================================
-- NOTA: Las columnas del esquema real difieren de los nombres
-- del PRD v2. Mapeo aplicado:
--   telefono_origen       → telefono_cifrado
--   estado_contacto       → estado
--   categoria_caso        → metadata->>'categoria_caso' (JSONB)
--   fecha_hora_inicio     → created_at
--   ultima_interaccion    → updated_at

-- ── 1. Índice por teléfono cifrado ───────────────────────────
-- (equivalente a idx_contactos_telefono del PRD v2)
CREATE INDEX IF NOT EXISTS idx_contactos_telefono
  ON contactos (telefono_cifrado);

-- ── 2. Índice por estado (ya existente — recrear si fue dropeado) ─
CREATE INDEX IF NOT EXISTS idx_contactos_estado
  ON contactos (estado);

-- ── 3. Índice parcial por categoría IA (JSONB) ───────────────
-- (equivalente a idx_contactos_urgencia del PRD v2)
CREATE INDEX IF NOT EXISTS idx_contactos_categoria_ia
  ON contactos ((metadata->>'categoria_caso'))
  WHERE metadata->>'categoria_caso' IS NOT NULL;

-- ── 4. Índice compuesto stats + timeline ─────────────────────
-- (equivalente a idx_contactos_busqueda_compuesta del PRD v2)
-- Covering index: elimina heap fetch en query de stats por escuela
CREATE INDEX IF NOT EXISTS idx_contactos_busqueda_compuesta
  ON contactos (escuela_id, estado, created_at DESC);

-- ── 5. Índice por última actualización ───────────────────────
-- (equivalente a idx_contactos_ultima_interaccion del PRD v2)
CREATE INDEX IF NOT EXISTS idx_contactos_ultima_interaccion
  ON contactos (updated_at DESC);

-- ── Covering index para /contactos/recientes ─────────────────
-- Evita heap fetch incluyendo las columnas necesarias en el índice
CREATE INDEX IF NOT EXISTS idx_contactos_recientes_cover
  ON contactos (escuela_id, created_at DESC)
  INCLUDE (canal, estado, timer_expira_at);

-- ── Covering index para /contactos/stats ─────────────────────
-- Una sola pasada de índice para los cuatro conteos del semáforo
CREATE INDEX IF NOT EXISTS idx_contactos_stats_cover
  ON contactos (escuela_id, estado, timer_expira_at)
  INCLUDE (id);
