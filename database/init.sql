-- ============================================================
-- Colegio Docksta - Fase Cero
-- Esquema inicial: contactos, interacciones, timers
-- ============================================================

-- ENUM: ciclo de vida del contacto
DO $$ BEGIN
  CREATE TYPE estado_contacto_enum AS ENUM (
    'en_curso',
    'completado',
    'intento_fallido',
    'abandonado'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================
-- TABLA: contactos
-- Captura inmediata (<100ms). Teléfono siempre cifrado AES-256-GCM.
-- ============================================================
CREATE TABLE IF NOT EXISTS contactos (
  id                SERIAL PRIMARY KEY,
  telefono_cifrado  TEXT        NOT NULL,           -- formato: iv:authTag:encrypted
  canal             VARCHAR(20) NOT NULL             -- 'voz' | 'whatsapp'
                    CHECK (canal IN ('voz', 'whatsapp')),
  estado            estado_contacto_enum NOT NULL
                    DEFAULT 'en_curso',
  timer_expira_at   TIMESTAMPTZ,                    -- deadline anti-arrepentimiento
  metadata          JSONB       NOT NULL DEFAULT '{}',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABLA: interacciones
-- Log de eventos por contacto (webhook, timer, IA, etc.)
-- ============================================================
CREATE TABLE IF NOT EXISTS interacciones (
  id           SERIAL PRIMARY KEY,
  contacto_id  INTEGER     NOT NULL
               REFERENCES contactos(id) ON DELETE CASCADE,
  tipo         VARCHAR(50) NOT NULL,               -- 'webhook_recibido', 'timer_expirado', ...
  payload      JSONB       NOT NULL DEFAULT '{}',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABLA: configuracion_timers
-- Timeouts diferenciados por canal (seed incluido abajo)
-- ============================================================
CREATE TABLE IF NOT EXISTS configuracion_timers (
  canal        VARCHAR(20) PRIMARY KEY,
  timeout_ms   INTEGER     NOT NULL CHECK (timeout_ms > 0),
  descripcion  TEXT,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO configuracion_timers (canal, timeout_ms, descripcion)
VALUES
  ('voz',      45000,  'Timer anti-arrepentimiento para llamadas Vapi'),
  ('whatsapp', 300000, 'Timer anti-arrepentimiento para chat WhatsApp')
ON CONFLICT (canal) DO UPDATE
  SET timeout_ms  = EXCLUDED.timeout_ms,
      descripcion = EXCLUDED.descripcion,
      updated_at  = NOW();

-- ============================================================
-- ÍNDICES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_contactos_estado
  ON contactos (estado);

CREATE INDEX IF NOT EXISTS idx_contactos_canal_estado
  ON contactos (canal, estado);

CREATE INDEX IF NOT EXISTS idx_contactos_created_at
  ON contactos (created_at DESC);

-- Índice parcial para búsqueda de timers vencidos (solo en_curso)
CREATE INDEX IF NOT EXISTS idx_contactos_timer_en_curso
  ON contactos (timer_expira_at)
  WHERE estado = 'en_curso';

CREATE INDEX IF NOT EXISTS idx_interacciones_contacto_id
  ON interacciones (contacto_id);

-- ============================================================
-- FUNCIÓN + TRIGGER: updated_at automático
-- ============================================================
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_contactos_updated_at ON contactos;
CREATE TRIGGER trg_contactos_updated_at
  BEFORE UPDATE ON contactos
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_timers_updated_at ON configuracion_timers;
CREATE TRIGGER trg_timers_updated_at
  BEFORE UPDATE ON configuracion_timers
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- VISTA: contactos_en_riesgo
-- Contactos en_curso cuyo timer ya expiró (deben marcarse intento_fallido)
-- ============================================================
CREATE OR REPLACE VIEW contactos_en_riesgo AS
  SELECT
    c.id,
    c.canal,
    c.estado,
    c.timer_expira_at,
    c.created_at,
    EXTRACT(EPOCH FROM (NOW() - c.timer_expira_at)) AS segundos_vencido
  FROM contactos c
  WHERE c.estado = 'en_curso'
    AND c.timer_expira_at IS NOT NULL
    AND c.timer_expira_at < NOW();
